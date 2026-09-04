import os from 'os';
import fs from 'fs';
import { config } from '../config.js';
import { safeCalculate } from '../utils/calc.js';
import { listCommands } from '../commandRegistry.js';
import { getQueueDepth } from '../services/commandQueue.js';

const startedAt = Date.now();

function formatUptimeLong(ms) {
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);

  const parts = [];
  if (months > 0) parts.push(`${months}mo`);
  if (remDays > 0 || months > 0) parts.push(`${remDays}d`);
  parts.push(`${hours}h`);
  return parts.join(' ');
}

function getCpuModel() {
  const cpus = os.cpus();
  return cpus?.[0]?.model?.trim() || 'Unknown CPU';
}

export const commands = [
  {
    names: ['help', 'menu', 'h', 'commands'],
    description: 'Shows what this bot does, how to use it, and all available commands',
    usage: 'help [command]',
    category: 'General',
    async run(ctx) {
      const arg = ctx.args[0]?.toLowerCase();
      const all = listCommands();

      if (arg) {
        const cmd = all.find((c) => c.names.includes(arg));
        if (!cmd) return ctx.reply(`No command called "${arg}".`);
        return ctx.reply(
          `*${config.prefix}${cmd.names[0]}*\n${cmd.description}\nUsage: ${config.prefix}${cmd.usage}\nAliases: ${cmd.names.map((n) => config.prefix + n).join(', ')}`
        );
      }

      const byCategory = {};
      for (const cmd of all) {
        byCategory[cmd.category] = byCategory[cmd.category] || [];
        byCategory[cmd.category].push(cmd);
      }

      const divider = '──────────────────────';
      let text = `─「 *${config.botName} Commands* 」─\n${divider}\n      ~ *Welcome to ${config.botName}* ~\n${divider}\n`;
      for (const [category, cmds] of Object.entries(byCategory)) {
        text += `\n_${category}_\n`;
        for (const cmd of cmds) {
          text += `*${config.prefix}${cmd.names.join(`, ${config.prefix}`)}* — ${cmd.description}\n`;
          text += `Usage: ${config.prefix}${cmd.usage}\n\n`;
        }
      }
      text += divider;
      text += `\n✦ made with 🖤 by ${config.devName} ✦`;
      if (config.portfolioLink) text += `\n✦ ${config.portfolioLink}`;
      if (config.devGithub) text += `\n✦ ${config.devGithub}`;
      return ctx.reply(text.trim());
    }
  },
  {
    names: ['alive', 'ping', 'a', 'latency', 'speed'],
    description: 'Measures bot response latency and prints a neofetch-style system report',
    usage: 'alive | ping',
    category: 'General',
    async run(ctx) {
      const start = Date.now();
      const sent = await ctx.reply('🔍 Pinging...');
      const latency = Date.now() - start;

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const usedGb = (usedMem / 1024 ** 3).toFixed(2);
      const totalGb = (totalMem / 1024 ** 3).toFixed(2);
      const usedPct = ((usedMem / totalMem) * 100).toFixed(1);

      const queueDepth = getQueueDepth();

      const report =
        `🔍 *Pong!*\n\n` +
        ` /\\_/\\   *OS:* ${os.type()}\n` +
        `( o.o )  *CPU:* ${getCpuModel()}\n` +
        ` > ^ <   *Memory:* ${usedGb} GB / ${totalGb} GB (${usedPct}% used)\n` +
        `         *Uptime:* ${formatUptimeLong(Date.now() - startedAt)}\n` +
        `         *Latency:* ${latency}ms\n` +
        `         *Queue Status:* ${queueDepth > 0 ? 'Processing 🚀' : 'Idle ✅'} (${queueDepth} in queue)\n` +
        `         *Connection:* Active ✅`;

      return ctx.sock.sendMessage(ctx.chatJid, { text: report, edit: sent.key });
    }
  },
  {
    names: ['dev', 'developer', 'src', 'source'],
    description: 'Displays developer and repository source information',
    usage: 'dev',
    category: 'General',
    async run(ctx) {
      const lines = [
        '🤖 *Developer & Source Info*',
        '─────────────────',
        '',
        `👤 *Developer:* ${config.devName}`,
        ''
      ];
      if (config.devLinkedin) lines.push(`🔗 *LinkedIn:*`, config.devLinkedin, '');
      if (config.devGithub) lines.push(`🐙 *GitHub:* ${config.devGithub}`, '');
      if (config.repoLink) lines.push(`📦 *Repository:*`, config.repoLink, '');
      if (config.devContact) lines.push(`📞 *Contact:* ${config.devContact}`, '');
      lines.push('─────────────────', `⚡ _Powered by ${config.botName} Bot Core_`);

      const caption = lines.join('\n');

      if (config.devPhotoPath && fs.existsSync(config.devPhotoPath)) {
        const buffer = fs.readFileSync(config.devPhotoPath);
        return ctx.replyImage(buffer, caption);
      }
      return ctx.reply(caption);
    }
  },
  {
    names: ['donate', 'donation'],
    description: 'Donate to keep this bot alive',
    usage: 'donate',
    category: 'General',
    async run(ctx) {
      const caption = '☕ Keep Harmonie alive!\nScan above or pay via UPI: 7087331803@ptaxis\nThanks for the support 💜';
      if (config.donateQrPath && fs.existsSync(config.donateQrPath)) {
        const buffer = fs.readFileSync(config.donateQrPath);
        return ctx.replyImage(buffer, caption);
      }
      if (config.donateLink) return ctx.reply(`Keep this bot running: ${config.donateLink}`);
      return ctx.reply('No donation link set up yet.');
    }
  },
  {
    names: ['calc', 'calculate'],
    description: 'Evaluate a math expression',
    usage: 'calc <expression>',
    category: 'General',
    async run(ctx) {
      if (!ctx.fullTextAfterCommand) return ctx.reply(`Usage: ${config.prefix}calc <expression>`);
      try {
        const result = safeCalculate(ctx.fullTextAfterCommand);
        return ctx.reply(`${ctx.fullTextAfterCommand} = ${result}`);
      } catch (e) {
        return ctx.reply(`Couldn't evaluate that: ${e.message}`);
      }
    }
  }
];
