import { config } from '../config.js';
import {
  getOrCreateCommunityStats,
  getCommunityStats,
  getUserBadges,
  getAllBadgeDefinitions,
  getCommunityLeaderboard,
  getCommunityRank,
  alreadyThankedMessage,
  recordHelped,
  incrementCommunityStat,
  recordResourceShare,
  addBugReport,
  addChallengeCompletion,
  hasCompletedChallengeToday
} from '../db.js';
import { awardXp } from '../services/xpService.js';
import { checkAndAwardBadges, formatUnlockNotification } from '../services/badgeService.js';
import { TIER_EMOJI, BADGES } from '../badges/badgeDefinitions.js';
import { countDistinctHelped } from '../db.js';

async function sendUnlockNotifications(ctx, jid, unlocked) {
  for (const badge of unlocked) {
    await ctx.sock.sendMessage(
      ctx.chatJid,
      { text: formatUnlockNotification(jid, badge), mentions: [jid] },
      { quoted: ctx.msg }
    );
  }
}

function progressLine(badge, stats, jid, extra) {
  const cond = badge.condition;
  let current = 0;
  let target = cond.value;
  switch (cond.type) {
    case 'message_count': current = stats.message_count; break;
    case 'distinct_helped': current = extra.distinctHelped; break;
    case 'helpful_received': current = stats.helpful_received_count; break;
    case 'resources_qualified': current = stats.resources_shared_qualified_count; break;
    case 'resources_shared': current = stats.resources_shared_count; break;
    case 'active_days': current = stats.streak_days; break;
    case 'challenges': current = stats.challenges_completed; break;
    case 'bugs_validated': current = stats.bugs_validated; break;
    case 'xp_threshold': current = stats.xp; break;
    case 'admin_warnings': current = stats.warnings_issued_as_admin; break;
    default: return `${badge.emoji} ${badge.name}`;
  }
  return `${badge.emoji} ${badge.name} — ${current}/${target}`;
}

export const commands = [
  {
    names: ['badges'],
    description: "Show your (or another member's) earned Waypoint badges",
    usage: 'badges [@user]',
    category: 'Badges',
    async run(ctx) {
      const targetJid = ctx.mentionedJids[0] || ctx.senderJid;
      const stats = getOrCreateCommunityStats(targetJid, ctx.msg.pushName);
      const earned = getUserBadges(targetJid);
      const earnedKeys = new Set(earned.map((b) => b.badge_key));
      const distinctHelped = countDistinctHelped(targetJid);

      const locked = BADGES.filter((b) => !earnedKeys.has(b.key) && b.condition.type !== 'auto_join' && b.condition.type !== 'manual');

      let text = `🏅 *${targetJid === ctx.senderJid ? 'YOUR' : "@" + targetJid.split('@')[0] + "'s"} WAYPOINT BADGES*\n\n`;
      if (earned.length === 0) {
        text += '_No badges earned yet._\n';
      } else {
        for (const b of earned) text += `${b.emoji} ${b.name} ${TIER_EMOJI[b.tier] || ''}\n`;
      }

      if (locked.length > 0) {
        text += `\n🔒 *Locked:*\n`;
        for (const b of locked) {
          text += `${progressLine(b, stats, targetJid, { distinctHelped })}\n`;
        }
      }

      return ctx.sock.sendMessage(ctx.chatJid, { text: text.trim(), mentions: [targetJid] }, { quoted: ctx.msg });
    }
  },
  {
    names: ['profile'],
    description: 'Show your Waypoint profile: XP, badges, streak, rank',
    usage: 'profile [@user]',
    category: 'Badges',
    async run(ctx) {
      const targetJid = ctx.mentionedJids[0] || ctx.senderJid;
      const stats = getOrCreateCommunityStats(targetJid, ctx.msg.pushName);
      const badgeCount = getUserBadges(targetJid).length;
      const rank = getCommunityRank(targetJid);
      const name = stats.push_name || targetJid.split('@')[0];

      const text =
        `👤 *${name}*\n` +
        `⭐ ${stats.xp} XP\n` +
        `🏅 ${badgeCount} Badge${badgeCount === 1 ? '' : 's'}\n` +
        `🔥 ${stats.streak_days} day streak\n` +
        `🏆 Rank #${rank || '—'}`;

      return ctx.sock.sendMessage(ctx.chatJid, { text, mentions: [targetJid] }, { quoted: ctx.msg });
    }
  },
  {
    names: ['leaderboard', 'lb'],
    description: 'Show the community-wide Waypoint XP leaderboard',
    usage: 'leaderboard',
    category: 'Badges',
    async run(ctx) {
      const top = getCommunityLeaderboard(10);
      if (top.length === 0) return ctx.reply('No one has earned XP yet — be the first!');

      const medals = ['🥇', '🥈', '🥉'];
      const lines = top.map((row, i) => {
        const label = medals[i] || `${i + 1}️⃣`;
        const name = row.push_name || row.jid.split('@')[0];
        return `${label} ${name} — ${row.xp.toLocaleString()} XP`;
      });

      const mentions = top.map((r) => r.jid);
      return ctx.sock.sendMessage(
        ctx.chatJid,
        { text: `🏆 *WAYPOINT LEADERBOARD*\n\n${lines.join('\n')}`, mentions },
        { quoted: ctx.msg }
      );
    }
  },
  {
    names: ['thanks', 'thankyou'],
    description: "Give someone credit for helping you (reply to their message)",
    usage: 'thanks (reply to the helpful message)',
    category: 'Badges',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('This only works in groups.');
      if (!ctx.quotedSender) return ctx.reply(`Reply to the message that helped you, then send ${config.prefix}thanks.`);
      if (ctx.quotedSender === ctx.senderJid) return ctx.reply("You can't thank yourself.");

      const quotedMsgId = ctx.msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
      if (quotedMsgId && alreadyThankedMessage(ctx.senderJid, quotedMsgId)) {
        return ctx.reply("You've already thanked them for that message.");
      }

      getOrCreateCommunityStats(ctx.quotedSender, null);
      recordHelped(ctx.quotedSender, ctx.senderJid, ctx.chatJid, quotedMsgId);
      incrementCommunityStat(ctx.quotedSender, 'helpful_received_count', 1);
      incrementCommunityStat(ctx.senderJid, 'helpful_given_count', 1);
      awardXp(ctx.quotedSender, ctx.chatJid, 'helpful_answer');

      await ctx.sock.sendMessage(
        ctx.chatJid,
        { text: `🙏 @${ctx.senderNumber} thanked @${ctx.quotedSender.split('@')[0]} for being helpful! (+10 XP)`, mentions: [ctx.senderJid, ctx.quotedSender] },
        { quoted: ctx.msg }
      );

      const unlocked = checkAndAwardBadges(ctx.quotedSender);
      await sendUnlockNotifications(ctx, ctx.quotedSender, unlocked);
    }
  },
  {
    names: ['share'],
    description: 'Share a resource with the community (link/text)',
    usage: 'share <link or description>',
    category: 'Badges',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('This only works in groups.');
      if (!ctx.fullTextAfterCommand) return ctx.reply(`Usage: ${config.prefix}share <link or description>`);

      getOrCreateCommunityStats(ctx.senderJid, ctx.msg.pushName);
      incrementCommunityStat(ctx.senderJid, 'resources_shared_count', 1);
      recordResourceShare(ctx.senderJid, ctx.chatJid, ctx.msg.key.id);
      const { awarded } = awardXp(ctx.senderJid, ctx.chatJid, 'useful_resource');

      await ctx.reply(
        `📚 Resource shared! ${awarded > 0 ? `+${awarded} XP. ` : ''}If others react positively to this message it'll count toward Knowledge Sharer too.`
      );

      const unlocked = checkAndAwardBadges(ctx.senderJid);
      await sendUnlockNotifications(ctx, ctx.senderJid, unlocked);
    }
  },
  {
    names: ['challenge'],
    description: 'Mark a Waypoint challenge as completed',
    usage: 'challenge <challenge name>',
    category: 'Badges',
    async run(ctx) {
      if (!ctx.fullTextAfterCommand) return ctx.reply(`Usage: ${config.prefix}challenge <challenge name>`);
      const name = ctx.fullTextAfterCommand.trim();

      getOrCreateCommunityStats(ctx.senderJid, ctx.msg.pushName);
      if (hasCompletedChallengeToday(ctx.senderJid, name)) {
        return ctx.reply("You've already logged that challenge today.");
      }

      addChallengeCompletion(ctx.senderJid, name);
      incrementCommunityStat(ctx.senderJid, 'challenges_completed', 1);
      const { awarded } = awardXp(ctx.senderJid, ctx.isGroup ? ctx.chatJid : null, 'daily_challenge');

      await ctx.reply(`🎯 Challenge "${name}" completed!${awarded > 0 ? ` +${awarded} XP` : ''}`);

      const unlocked = checkAndAwardBadges(ctx.senderJid);
      await sendUnlockNotifications(ctx, ctx.senderJid, unlocked);
    }
  },
  {
    names: ['bugreport', 'reportbug'],
    description: 'Report a bug — pending admin validation before it counts',
    usage: 'bugreport <description>',
    category: 'Badges',
    async run(ctx) {
      if (!ctx.fullTextAfterCommand) return ctx.reply(`Usage: ${config.prefix}bugreport <description>`);
      getOrCreateCommunityStats(ctx.senderJid, ctx.msg.pushName);
      const id = addBugReport(ctx.senderJid, ctx.isGroup ? ctx.chatJid : 'dm', ctx.fullTextAfterCommand.trim());
      return ctx.reply(
        `🐛 Bug report #${id} logged. An admin will validate it with ${config.prefix}validatebug ${id} — you'll get +20 XP once confirmed.`
      );
    }
  }
];
