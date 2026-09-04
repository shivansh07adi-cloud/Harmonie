import { config } from '../config.js';
import {
  getOrCreateCommunityStats,
  getCommunityStats,
  hasBadge,
  awardBadge,
  removeBadge,
  getAllBadgeDefinitions,
  getBadgeDefinition,
  countBadgeHolders,
  getUserBadges,
  incrementCommunityStat,
  recordXpTransaction,
  logAdminAction,
  getBugReport,
  validateBugReport,
  updateCommunityStats
} from '../db.js';
import { checkAndAwardBadges, formatUnlockNotification } from '../services/badgeService.js';
import { awardXp } from '../services/xpService.js';
import { getBadgeByKey, TIER_EMOJI } from '../badges/badgeDefinitions.js';

function requireAdmin(ctx) {
  if (ctx.isGroup) return ctx.isSenderAdmin || ctx.isOwner;
  return ctx.isOwner;
}

export const commands = [
  {
    names: ['awardbadge'],
    description: 'Admin: manually award a badge to a member',
    usage: 'awardbadge @user <badge_key>',
    category: 'Badge Admin',
    async run(ctx) {
      if (!requireAdmin(ctx)) return ctx.reply('Admin only.');
      const target = ctx.mentionedJids[0];
      const badgeKey = ctx.args[ctx.mentionedJids.length]?.toLowerCase();
      if (!target || !badgeKey) return ctx.reply(`Usage: ${config.prefix}awardbadge @user <badge_key>`);

      const badge = getBadgeDefinition(badgeKey);
      if (!badge) return ctx.reply(`No badge with key "${badgeKey}". Use ${config.prefix}badgestats to see all keys.`);

      getOrCreateCommunityStats(target, null);
      if (hasBadge(target, badgeKey)) return ctx.reply(`@${target.split('@')[0]} already has that badge.`, );

      awardBadge(target, badgeKey, ctx.senderJid);
      if (badge.xp_reward > 0) {
        recordXpTransaction(target, ctx.isGroup ? ctx.chatJid : null, badge.xp_reward, `badge:${badgeKey}`);
        incrementCommunityStat(target, 'xp', badge.xp_reward);
      }
      logAdminAction(ctx.senderJid, 'award_badge', target, badgeKey);

      await ctx.sock.sendMessage(
        ctx.chatJid,
        { text: formatUnlockNotification(target, getBadgeByKey(badgeKey)), mentions: [target] },
        { quoted: ctx.msg }
      );
    }
  },
  {
    names: ['removebadge'],
    description: "Admin: remove a badge from a member",
    usage: 'removebadge @user <badge_key>',
    category: 'Badge Admin',
    async run(ctx) {
      if (!requireAdmin(ctx)) return ctx.reply('Admin only.');
      const target = ctx.mentionedJids[0];
      const badgeKey = ctx.args[ctx.mentionedJids.length]?.toLowerCase();
      if (!target || !badgeKey) return ctx.reply(`Usage: ${config.prefix}removebadge @user <badge_key>`);

      const removed = removeBadge(target, badgeKey);
      logAdminAction(ctx.senderJid, 'remove_badge', target, badgeKey);
      return ctx.reply(removed ? `Removed ${badgeKey} from @${target.split('@')[0]}` : `@${target.split('@')[0]} didn't have that badge.`);
    }
  },
  {
    names: ['addxp'],
    description: 'Admin: add XP to a member',
    usage: 'addxp @user <amount>',
    category: 'Badge Admin',
    async run(ctx) {
      if (!requireAdmin(ctx)) return ctx.reply('Admin only.');
      const target = ctx.mentionedJids[0];
      const amount = parseInt(ctx.args[ctx.mentionedJids.length], 10);
      if (!target || !amount || amount <= 0) return ctx.reply(`Usage: ${config.prefix}addxp @user <amount>`);

      getOrCreateCommunityStats(target, null);
      recordXpTransaction(target, ctx.isGroup ? ctx.chatJid : null, amount, 'admin_grant');
      incrementCommunityStat(target, 'xp', amount);
      logAdminAction(ctx.senderJid, 'add_xp', target, String(amount));

      await ctx.reply(`Added ${amount} XP to @${target.split('@')[0]}.`);
      const unlocked = checkAndAwardBadges(target);
      for (const badge of unlocked) {
        await ctx.sock.sendMessage(
          ctx.chatJid,
          { text: formatUnlockNotification(target, badge), mentions: [target] },
          { quoted: ctx.msg }
        );
      }
    }
  },
  {
    names: ['removexp'],
    description: 'Admin: remove XP from a member',
    usage: 'removexp @user <amount>',
    category: 'Badge Admin',
    async run(ctx) {
      if (!requireAdmin(ctx)) return ctx.reply('Admin only.');
      const target = ctx.mentionedJids[0];
      const amount = parseInt(ctx.args[ctx.mentionedJids.length], 10);
      if (!target || !amount || amount <= 0) return ctx.reply(`Usage: ${config.prefix}removexp @user <amount>`);

      getOrCreateCommunityStats(target, null);
      const stats = getCommunityStats(target);
      const newXp = Math.max(0, stats.xp - amount);
      updateCommunityStats(target, { xp: newXp });
      recordXpTransaction(target, ctx.isGroup ? ctx.chatJid : null, -(stats.xp - newXp), 'admin_deduct');
      logAdminAction(ctx.senderJid, 'remove_xp', target, String(amount));

      return ctx.reply(`Removed ${stats.xp - newXp} XP from @${target.split('@')[0]}. New total: ${newXp} XP.`);
    }
  },
  {
    names: ['validatebug'],
    description: 'Admin: validate a bug report, awarding the reporter +20 XP',
    usage: 'validatebug <id>',
    category: 'Badge Admin',
    async run(ctx) {
      if (!requireAdmin(ctx)) return ctx.reply('Admin only.');
      const id = parseInt(ctx.args[0], 10);
      if (!id) return ctx.reply(`Usage: ${config.prefix}validatebug <id>`);

      const report = getBugReport(id);
      if (!report) return ctx.reply(`No bug report with id ${id}.`);
      if (report.status === 'validated') return ctx.reply('Already validated.');

      validateBugReport(id, ctx.senderJid);
      getOrCreateCommunityStats(report.jid, null);
      incrementCommunityStat(report.jid, 'bugs_validated', 1);
      awardXp(report.jid, report.group_jid, 'valid_bug_report');
      logAdminAction(ctx.senderJid, 'validate_bug', report.jid, String(id));

      await ctx.sock.sendMessage(
        ctx.chatJid,
        { text: `✅ Bug report #${id} validated. @${report.jid.split('@')[0]} +20 XP`, mentions: [report.jid] },
        { quoted: ctx.msg }
      );

      const unlocked = checkAndAwardBadges(report.jid);
      for (const badge of unlocked) {
        await ctx.sock.sendMessage(
          ctx.chatJid,
          { text: formatUnlockNotification(report.jid, badge), mentions: [report.jid] },
          { quoted: ctx.msg }
        );
      }
    }
  },
  {
    names: ['memberstats'],
    description: "Admin: view a member's full Waypoint stats",
    usage: 'memberstats @user',
    category: 'Badge Admin',
    async run(ctx) {
      if (!requireAdmin(ctx)) return ctx.reply('Admin only.');
      const target = ctx.mentionedJids[0] || ctx.senderJid;
      const stats = getOrCreateCommunityStats(target, null);
      const badges = getUserBadges(target);

      const text =
        `📊 *Stats for @${target.split('@')[0]}*\n\n` +
        `XP: ${stats.xp}\n` +
        `Streak: ${stats.streak_days} days\n` +
        `Messages: ${stats.message_count}\n` +
        `Helpful given: ${stats.helpful_given_count} · received: ${stats.helpful_received_count}\n` +
        `Resources shared: ${stats.resources_shared_count} (qualified: ${stats.resources_shared_qualified_count})\n` +
        `Challenges: ${stats.challenges_completed}\n` +
        `Bugs validated: ${stats.bugs_validated}\n` +
        `Admin warnings issued: ${stats.warnings_issued_as_admin}\n` +
        `Badges: ${badges.map((b) => b.emoji).join(' ') || 'none'}`;

      return ctx.sock.sendMessage(ctx.chatJid, { text, mentions: [target] }, { quoted: ctx.msg });
    }
  },
  {
    names: ['badgestats'],
    description: 'Admin: view stats on all badges (holder counts, keys)',
    usage: 'badgestats',
    category: 'Badge Admin',
    async run(ctx) {
      if (!requireAdmin(ctx)) return ctx.reply('Admin only.');
      const defs = getAllBadgeDefinitions();
      const lines = defs.map(
        (b) => `${b.emoji} ${TIER_EMOJI[b.tier] || ''} *${b.name}* (\`${b.badge_key}\`) — ${countBadgeHolders(b.badge_key)} holders`
      );
      return ctx.reply(`🏅 *Badge Stats*\n\n${lines.join('\n')}`);
    }
  }
];
