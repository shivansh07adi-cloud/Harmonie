import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import qrcode from 'qrcode-terminal';

import { config } from './config.js';
import { buildContext } from './context.js';
import { findCommand } from './commandRegistry.js';
import {
  touchRank,
  logGroupMessage,
  pruneOldMessageLogs,
  getSpamProtection,
  addWarning,
  clearWarnings,
  getOrCreateCommunityStats,
  incrementCommunityStat,
  getResourceShareByMessageId,
  incrementResourceReaction,
  getWelcomeEnabled,
  getWelcomeMessage
} from './db.js';
import { trackPendingSticker, cancelIfPending, STICKER_GRACE_MS } from './utils/stickerBan.js';
import { awardXp, trackDailyActivity, isDuplicateSpam } from './services/xpService.js';
import { checkAndAwardBadges, awardNewcomerBadge, formatUnlockNotification, seedBadgeDefinitions } from './services/badgeService.js';
import { askAssistant } from './utils/gemini.js';
import { composeWelcomeMessage } from './utils/welcomeMessage.js';
import { startQuiz, formatQuizMessage } from './quiz/quizService.js';
import { getGroupsWithQuizEnabled, setLastDailyQuizDate, getGroupsWithAnalyticsEnabled, setLastDailyAnalyticsDate } from './db.js';
import { commandStarted, commandFinished } from './services/commandQueue.js';
import { generateAnalyticsReport } from './services/analyticsService.js';

const POSITIVE_REACTION_EMOJIS = new Set(['👍', '❤️', '🔥', '🎉', '👏', '💯', '✅', '😍', '💪', '🙌']);
const ASSISTANT_COOLDOWN_MS = 5_000;
const lastAssistantReplyAt = new Map(); // chatJid -> timestamp, basic anti-spam for the AI feature

seedBadgeDefinitions();

if (!fs.existsSync(config.sessionDir)) fs.mkdirSync(config.sessionDir, { recursive: true });

const logger = pino({ level: 'warn' });

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: [config.botName, 'Chrome', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('Scan this QR code with WhatsApp (Linked Devices):');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed.', shouldReconnect ? 'Reconnecting...' : 'Logged out — delete the session folder and re-scan to log in again.');
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log(`${config.botName} is connected. Prefix: "${config.prefix}"`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg);
      } catch (err) {
        console.error('Error handling message:', err);
      }
    }
  });

  // Detect message deletions — if a flagged sticker gets deleted in time, cancel its warning.
  sock.ev.on('messages.update', (updates) => {
    for (const u of updates) {
      const isRevoke = u.update?.messageStubType === 1 || u.update?.message === null;
      if (isRevoke && u.key?.id) {
        cancelIfPending(u.key.id);
      }
    }
  });

  // Welcome System + Newcomer badge: fires when someone joins a group the bot is in.
  sock.ev.on('group-participants.update', async (event) => {
    if (event.action !== 'add') return;

    let groupName = 'the group';
    let memberCount = null;
    try {
      const meta = await sock.groupMetadata(event.id);
      groupName = meta.subject || groupName;
      memberCount = meta.participants?.length ?? null;
    } catch (err) {
      console.error('Error fetching group metadata for welcome message:', err);
    }

    for (const jid of event.participants) {
      try {
        getOrCreateCommunityStats(jid, null);

        if (getWelcomeEnabled(event.id)) {
          const text = composeWelcomeMessage(getWelcomeMessage(event.id), {
            userMention: `@${jid.split('@')[0]}`,
            groupName,
            memberCount: memberCount ?? '?',
            prefix: config.prefix
          });

          // Best-effort: attach their profile picture if it's public. Falls back to plain text.
          let sent = false;
          try {
            const picUrl = await sock.profilePictureUrl(jid, 'image');
            if (picUrl) {
              const res = await fetch(picUrl);
              if (res.ok) {
                const buffer = Buffer.from(await res.arrayBuffer());
                await sock.sendMessage(event.id, { image: buffer, caption: text, mentions: [jid] });
                sent = true;
              }
            }
          } catch {
            // no public profile picture, or fetch failed — fall through to text-only
          }
          if (!sent) {
            await sock.sendMessage(event.id, { text, mentions: [jid] });
          }
        }

        const badge = awardNewcomerBadge(jid);
        if (badge) {
          await sock.sendMessage(event.id, { text: formatUnlockNotification(jid, badge), mentions: [jid] });
        }
      } catch (err) {
        console.error('Error in welcome/Newcomer flow:', err);
      }
    }
  });

  // Reactions: count toward "positive contribution" XP and Knowledge Sharer resource qualification.
  sock.ev.on('messages.reaction', async (updates) => {
    for (const u of updates) {
      try {
        const emoji = u.reaction?.text;
        if (!emoji) continue; // empty text = reaction removed, not added
        const targetMessageId = u.key?.id;
        const authorJid = u.key?.participant; // author of the message that got reacted to
        const reactorJid = u.reaction?.key?.participant || (u.reaction?.key?.fromMe ? sock.user?.id : null);
        if (!targetMessageId || !reactorJid) continue;
        if (!POSITIVE_REACTION_EMOJIS.has(emoji)) continue;

        // General positive-contribution XP (not self-reactions, not reactions to the bot's own messages)
        if (authorJid && !u.key?.fromMe && reactorJid !== authorJid) {
          getOrCreateCommunityStats(authorJid, null);
          const { awarded } = awardXp(authorJid, null, 'positive_contribution');
          if (awarded > 0) {
            const unlocked = checkAndAwardBadges(authorJid);
            for (const badge of unlocked) {
              await sock.sendMessage(u.key.remoteJid, { text: formatUnlockNotification(authorJid, badge), mentions: [authorJid] });
            }
          }
        }

        // Resource-share qualification (Knowledge Sharer)
        const share = getResourceShareByMessageId(targetMessageId);
        if (share && reactorJid !== share.jid) {
          const result = incrementResourceReaction(targetMessageId);
          if (result?.justQualified) {
            getOrCreateCommunityStats(share.jid, null);
            incrementCommunityStat(share.jid, 'resources_shared_qualified_count', 1);
            const unlocked = checkAndAwardBadges(share.jid);
            for (const badge of unlocked) {
              await sock.sendMessage(share.group_jid, { text: formatUnlockNotification(share.jid, badge), mentions: [share.jid] });
            }
          }
        }
      } catch (err) {
        console.error('Error processing reaction:', err);
      }
    }
  });

  return sock;
}

async function handleMessage(sock, msg) {
  if (!msg.message || msg.key.fromMe) return;
  if (msg.key.remoteJid === 'status@broadcast') return;

  const ctx = await buildContext(sock, msg);
  const isSticker = !!msg.message.stickerMessage;

  // --- Sticker-ban: flag stickers in groups with spam protection on ---
  if (ctx.isGroup && isSticker && getSpamProtection(ctx.chatJid) && !ctx.isSenderAdmin) {
    await sock.sendMessage(
      ctx.chatJid,
      {
        text: `🕐 @${ctx.senderNumber} sticker spotted, delete it within ${STICKER_GRACE_MS / 1000}s or you'll catch a spam warning.`,
        mentions: [ctx.senderJid]
      },
      { quoted: msg }
    );

    trackPendingSticker(msg.key.id, ctx.chatJid, ctx.senderJid, async () => {
      const count = addWarning(ctx.senderJid, ctx.chatJid, 'Sticker spam', 'system');

      if (count >= 3) {
        await sock.sendMessage(ctx.chatJid, {
          text: `@${ctx.senderNumber} has been removed after 3 sticker spam warnings.`,
          mentions: [ctx.senderJid]
        });
        clearWarnings(ctx.senderJid, ctx.chatJid);
        if (ctx.isBotAdmin) await ctx.removeFromGroup(ctx.senderJid).catch(() => {});
      } else {
        await sock.sendMessage(ctx.chatJid, {
          text:
            `⚠️ Sticker Spam Warning ${count}/3 @${ctx.senderNumber}\n\n` +
            `Please stop sending stickers. You will be removed from the group on your 3rd warning.`,
          mentions: [ctx.senderJid]
        });
      }
    });
  }

  if (!ctx.fullText) return;

  // --- Group message logging (for !analytics) + XP tracking + badge stats ---
  if (ctx.isGroup) {
    touchRank(ctx.senderJid, ctx.chatJid, 1);
    logGroupMessage(ctx.chatJid, ctx.senderJid, msg.pushName, ctx.fullText);

    getOrCreateCommunityStats(ctx.senderJid, msg.pushName);
    if (!isDuplicateSpam(ctx.senderJid, ctx.fullText)) {
      incrementCommunityStat(ctx.senderJid, 'message_count', 1);
      trackDailyActivity(ctx.senderJid);
      const unlocked = checkAndAwardBadges(ctx.senderJid);
      for (const badge of unlocked) {
        await sock
          .sendMessage(ctx.chatJid, { text: formatUnlockNotification(ctx.senderJid, badge), mentions: [ctx.senderJid] })
          .catch(() => {});
      }
    }
  }

  // --- Command dispatch ---
  if (ctx.fullText.startsWith(config.prefix)) {
    const withoutPrefix = ctx.fullText.slice(config.prefix.length).trim();
    if (!withoutPrefix) return;

    const [commandName, ...args] = withoutPrefix.split(/\s+/);
    const command = findCommand(commandName);
    if (command) {
      ctx.args = args;
      ctx.fullTextAfterCommand = args.join(' ');
      commandStarted();
      try {
        await command.run(ctx);
      } catch (err) {
        console.error(`Error running command "${commandName}":`, err);
        await ctx.reply(`Something went wrong running that command: ${err.message}`).catch(() => {});
      } finally {
        commandFinished();
      }
      return;
    }
    // Unrecognized command starting with the prefix — fall through, don't treat as an AI question.
    return;
  }

  // --- AI Assistant: answer questions when @-mentioned in a group, or messaged directly ---
  const botNumber = sock.user?.id?.split(':')[0];
  const botIsMentioned = ctx.isGroup && botNumber && ctx.mentionedJids.some((j) => j.split('@')[0] === botNumber);
  const shouldAnswer = botIsMentioned || !ctx.isGroup;
  if (!shouldAnswer) return;
  if (!config.geminiApiKey) return; // silently no-op if no key configured

  let question = ctx.fullText;
  if (botNumber) question = question.replace(new RegExp(`@${botNumber}\\b`, 'g'), '').trim();
  if (!question) return;

  const lastReply = lastAssistantReplyAt.get(ctx.chatJid) || 0;
  if (Date.now() - lastReply < ASSISTANT_COOLDOWN_MS) return;
  lastAssistantReplyAt.set(ctx.chatJid, Date.now());

  try {
    const answer = await askAssistant(question, config.botName);
    await ctx.reply(answer);
  } catch (err) {
    console.error('AI assistant error:', err);
    await ctx.reply("Sorry, I couldn't answer that right now.").catch(() => {});
  }
}

// --- Reminder scheduler: checks every 30s for due reminders ---
function startReminderScheduler(sock) {
  setInterval(async () => {
    const { getDueReminders, markReminderFired, rescheduleReminder } = await import('./db.js');
    const { nextRepeatDueAt } = await import('./utils/reminder.js');
    const due = getDueReminders();
    for (const r of due) {
      try {
        await sock.sendMessage(r.chat_jid, { text: `⏰ Reminder: ${r.message}` });
      } catch (err) {
        console.error('Failed to send reminder:', err);
      }
      const next = nextRepeatDueAt(r.due_at, r.repeat);
      if (next) rescheduleReminder(r.id, next);
      else markReminderFired(r.id);
    }
  }, 30_000);
}

// --- Periodic cleanup of old message logs (keep only last 48h) ---
function startLogPruner() {
  setInterval(() => {
    pruneOldMessageLogs(Date.now() - 48 * 60 * 60 * 1000);
  }, 60 * 60 * 1000);
}

// --- Daily quiz scheduler: checks every minute if it's quiz time (IST) for any opted-in group ---
function nowInIst() {
  const IST_OFFSET_MIN = 5 * 60 + 30;
  return new Date(Date.now() + IST_OFFSET_MIN * 60_000);
}

function startDailyQuizScheduler(sock) {
  setInterval(async () => {
    const ist = nowInIst();
    const hh = String(ist.getUTCHours()).padStart(2, '0');
    const mm = String(ist.getUTCMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    if (currentTime !== config.dailyQuizTime) return;

    const today = ist.toISOString().slice(0, 10);
    const groups = getGroupsWithQuizEnabled();

    for (const g of groups) {
      if (g.last_daily_quiz_date === today) continue; // already posted today
      try {
        const picked = await startQuiz(g.group_jid, 'random');
        const text = formatQuizMessage(picked.category, picked.question, picked.options, config.prefix);
        await sock.sendMessage(g.group_jid, { text: `📅 *Daily Quiz!*\n\n${text}` });
        setLastDailyQuizDate(g.group_jid, today);
      } catch (err) {
        console.error(`Failed to post daily quiz to ${g.group_jid}:`, err);
      }
    }
  }, 60_000);
}

// --- Daily group analytics scheduler: checks every minute if it's report time (IST) for any opted-in group ---
function startDailyAnalyticsScheduler(sock) {
  setInterval(async () => {
    const ist = nowInIst();
    const hh = String(ist.getUTCHours()).padStart(2, '0');
    const mm = String(ist.getUTCMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;
    if (currentTime !== config.dailyAnalyticsTime) return;

    const today = ist.toISOString().slice(0, 10);
    const groups = getGroupsWithAnalyticsEnabled();

    for (const g of groups) {
      if (g.last_daily_analytics_date === today) continue; // already posted today
      try {
        const report = await generateAnalyticsReport(g.group_jid);
        if (report) {
          await sock.sendMessage(g.group_jid, { text: report.text, mentions: report.mentions });
        }
        setLastDailyAnalyticsDate(g.group_jid, today); // mark done for today even if there was nothing to report
      } catch (err) {
        console.error(`Failed to post daily analytics to ${g.group_jid}:`, err);
      }
    }
  }, 60_000);
}

startBot().then((sock) => {
  startReminderScheduler(sock);
  startLogPruner();
  startDailyQuizScheduler(sock);
  startDailyAnalyticsScheduler(sock);
});
