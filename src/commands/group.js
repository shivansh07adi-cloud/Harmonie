import { config } from '../config.js';
import { touchRank, getRank, getGroupLeaderboardPosition, addWarning, listWarnings, removeLatestWarning, clearWarnings, getOrCreateCommunityStats, incrementCommunityStat, getWelcomeEnabled, setWelcomeEnabled, getWelcomeMessage, setWelcomeMessage } from '../db.js';
import { xpToLevel } from '../utils/rank.js';
import { checkAndAwardBadges, formatUnlockNotification } from '../services/badgeService.js';
import { composeWelcomeMessage, DEFAULT_TEMPLATE } from '../utils/welcomeMessage.js';

export const commands = [
  {
    names: ['rank', 'level', 'xp'],
    description: 'Check your rank in this group. Tag someone to check theirs.',
    usage: 'rank [@user]',
    category: 'Group',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('Rank tracking only applies inside groups.');
      const targetJid = ctx.mentionedJids[0] || ctx.senderJid;
      const row = getRank(targetJid, ctx.chatJid);
      if (!row) return ctx.replyMention(`@${targetJid.split('@')[0]} hasn't sent any tracked messages here yet.`, [targetJid]);

      const { level, xpIntoLevel, xpForNextLevel } = xpToLevel(row.xp);
      const { position, total } = getGroupLeaderboardPosition(targetJid, ctx.chatJid);
      const text =
        `@${targetJid.split('@')[0]}\n` +
        `Level ${level} — ${xpIntoLevel}/${xpForNextLevel} XP\n` +
        `Messages: ${row.messages}\n` +
        `Rank: #${position} of ${total} in this group`;
      return ctx.sock.sendMessage(ctx.chatJid, { text, mentions: [targetJid] }, { quoted: ctx.msg });
    }
  },
  {
    names: ['delete', 'd', 'dd'],
    description: 'Delete a message',
    usage: 'delete (reply to message)',
    category: 'Group',
    async run(ctx) {
      const key = ctx.getDeletableKey();
      if (!key) return ctx.reply('Reply to the message you want deleted.');
      if (!key.fromMe && !ctx.isBotAdmin) {
        return ctx.reply("I need to be an admin to delete other people's messages.");
      }
      return ctx.deleteMessage(key);
    }
  },
  {
    names: ['warn', 'warning', 'w'],
    description: 'Warns a member. Removes them from the group on the 3rd warning.',
    usage: 'warn @user [reason]',
    category: 'Group Admin',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('This only works in groups.');
      if (!ctx.isSenderAdmin) return ctx.reply('Only group admins can use this.');
      const target = ctx.mentionedJids[0];
      if (!target) return ctx.reply(`Usage: ${config.prefix}warn @user [reason]`);

      const targetIsAdmin = ctx.groupParticipants.some(
        (p) => p.id === target && (p.admin === 'admin' || p.admin === 'superadmin')
      );
      if (targetIsAdmin) return ctx.reply("Can't warn a group admin.");

      const reason = ctx.args.slice(1).join(' ') || null;
      const count = addWarning(target, ctx.chatJid, reason, ctx.senderJid);

      getOrCreateCommunityStats(ctx.senderJid, ctx.msg.pushName);
      incrementCommunityStat(ctx.senderJid, 'warnings_issued_as_admin', 1);
      const unlockedForAdmin = checkAndAwardBadges(ctx.senderJid);
      for (const badge of unlockedForAdmin) {
        await ctx.sock
          .sendMessage(ctx.chatJid, { text: formatUnlockNotification(ctx.senderJid, badge), mentions: [ctx.senderJid] })
          .catch(() => {});
      }

      if (count >= 3) {
        await ctx.sock.sendMessage(
          ctx.chatJid,
          { text: `@${target.split('@')[0]} hit 3 warnings and has been removed.`, mentions: [target] },
          { quoted: ctx.msg }
        );
        if (ctx.isBotAdmin) {
          clearWarnings(target, ctx.chatJid);
          return ctx.removeFromGroup(target);
        }
        return ctx.reply("(I'm not an admin here, so I can't actually remove them.)");
      }

      return ctx.sock.sendMessage(
        ctx.chatJid,
        { text: `@${target.split('@')[0]} warned (${count}/3)${reason ? `: ${reason}` : ''}`, mentions: [target] },
        { quoted: ctx.msg }
      );
    }
  },
  {
    names: ['unwarn', 'clearwarn', 'removewarn', 'unwarning'],
    description: 'Removes the most recent warning (or all warnings) from a member',
    usage: 'unwarn @user [all]',
    category: 'Group Admin',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('This only works in groups.');
      if (!ctx.isSenderAdmin) return ctx.reply('Only group admins can use this.');
      const target = ctx.mentionedJids[0];
      if (!target) return ctx.reply(`Usage: ${config.prefix}unwarn @user [all]`);

      if (ctx.args[1]?.toLowerCase() === 'all') {
        clearWarnings(target, ctx.chatJid);
        return ctx.replyMention(`✅ Cleared all warnings for @${target.split('@')[0]}`, [target]);
      }
      const removed = removeLatestWarning(target, ctx.chatJid);
      return ctx.replyMention(
        removed
          ? `✅ Removed last warning for @${target.split('@')[0]}. Remaining warnings: ${removed.remaining}/3`
          : `@${target.split('@')[0]} has no warnings.`,
        [target]
      );
    }
  },
  {
    names: ['check-warn', 'check_warn', 'warnings', 'warns'],
    description: 'Checks the number of warnings a user has and lists the reasons',
    usage: 'check-warn @user',
    category: 'Group Admin',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('This only works in groups.');
      const target = ctx.mentionedJids[0] || ctx.senderJid;
      const warnings = listWarnings(target, ctx.chatJid);
      if (warnings.length === 0) return ctx.replyMention(`@${target.split('@')[0]} has no warnings.`, [target]);
      const lines = warnings.map((w, i) => `${i + 1}. ${w.reason || '(no reason given)'} — ${new Date(w.created_at).toLocaleDateString()}`);
      return ctx.sock.sendMessage(
        ctx.chatJid,
        { text: `@${target.split('@')[0]} — ${warnings.length}/3 warnings:\n\n${lines.join('\n')}`, mentions: [target] },
        { quoted: ctx.msg }
      );
    }
  },
  {
    names: ['welcome'],
    description: 'Admin: toggle the welcome message for new members on/off',
    usage: 'welcome on|off',
    category: 'Group Admin',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('This only works in groups.');
      if (!ctx.isSenderAdmin) return ctx.reply('Only group admins can use this.');

      const arg = ctx.args[0]?.toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        const current = getWelcomeEnabled(ctx.chatJid);
        return ctx.reply(`Welcome messages are currently *${current ? 'ON' : 'OFF'}*. Usage: ${config.prefix}welcome on|off`);
      }
      setWelcomeEnabled(ctx.chatJid, arg === 'on');
      return ctx.reply(`Welcome messages turned *${arg.toUpperCase()}*.`);
    }
  },
  {
    names: ['setwelcome'],
    description: 'Admin: customize the welcome message template for this group',
    usage: 'setwelcome <message with {user} {group} {count} {prefix}> | setwelcome reset',
    category: 'Group Admin',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('This only works in groups.');
      if (!ctx.isSenderAdmin) return ctx.reply('Only group admins can use this.');

      if (!ctx.fullTextAfterCommand) {
        const current = getWelcomeMessage(ctx.chatJid);
        return ctx.reply(
          `Current template:\n${current || DEFAULT_TEMPLATE}\n\n` +
            `Usage: ${config.prefix}setwelcome <message> — use {user}, {group}, {count}, {prefix} as placeholders.\n` +
            `${config.prefix}setwelcome reset — go back to the default.`
        );
      }

      if (ctx.fullTextAfterCommand.trim().toLowerCase() === 'reset') {
        setWelcomeMessage(ctx.chatJid, null);
        return ctx.reply('Welcome message reset to the default.');
      }

      setWelcomeMessage(ctx.chatJid, ctx.fullTextAfterCommand);
      const preview = composeWelcomeMessage(ctx.fullTextAfterCommand, {
        userMention: `@${ctx.senderNumber}`,
        groupName: 'This Group',
        memberCount: 42,
        prefix: config.prefix
      });
      return ctx.reply(`Saved. Preview:\n\n${preview}`);
    }
  }
];
