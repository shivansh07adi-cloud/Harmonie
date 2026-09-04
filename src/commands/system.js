import { config } from '../config.js';
import { getSpamProtection, setSpamProtection, getAnalyticsEnabled, setAnalyticsEnabled } from '../db.js';
import { generateAnalyticsReport } from '../services/analyticsService.js';

export const commands = [
  {
    names: ['analytics', 'stats', 'summary'],
    description: 'Generate Gemini analytics for the past 24 hours of group chat',
    usage: 'analytics',
    category: 'System',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('This only works in groups.');
      const report = await generateAnalyticsReport(ctx.chatJid);
      if (!report) return ctx.reply('No tracked messages in the last 24 hours.');
      return ctx.sock.sendMessage(ctx.chatJid, { text: report.text, mentions: report.mentions }, { quoted: ctx.msg });
    }
  },
  {
    names: ['dailyanalytics'],
    description: 'Admin: toggle the automatic daily analytics report for this group',
    usage: 'dailyanalytics on|off',
    category: 'System',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('This only works in groups.');
      if (!ctx.isSenderAdmin) return ctx.reply('Only group admins can use this.');

      const arg = ctx.args[0]?.toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        const current = getAnalyticsEnabled(ctx.chatJid);
        return ctx.reply(
          `Daily analytics are currently *${current ? 'ON' : 'OFF'}* (posted around ${config.dailyAnalyticsTime} IST). Usage: ${config.prefix}dailyanalytics on|off`
        );
      }
      setAnalyticsEnabled(ctx.chatJid, arg === 'on');
      return ctx.reply(`Daily analytics turned *${arg.toUpperCase()}*.`);
    }
  },
  {
    names: ['spam', 'antispam', 'spamprotection'],
    description: 'Toggle automatic sticker-spam protection on/off',
    usage: 'spam on|off',
    category: 'System',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('This only works in groups.');
      if (!ctx.isSenderAdmin) return ctx.reply('Only group admins can use this.');

      const arg = ctx.args[0]?.toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        const current = getSpamProtection(ctx.chatJid);
        return ctx.reply(`Spam protection is currently *${current ? 'ON' : 'OFF'}*. Usage: ${config.prefix}spam on|off`);
      }
      setSpamProtection(ctx.chatJid, arg === 'on');
      return ctx.reply(`Spam protection turned *${arg.toUpperCase()}*.`);
    }
  }
];
