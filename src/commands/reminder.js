import { config } from '../config.js';
import { addReminder, listActiveReminders, cancelReminder } from '../db.js';
import { parseReminderTime } from '../utils/reminder.js';

export const commands = [
  {
    names: ['remind', 'reminder'],
    description: 'Set a timed reminder (max 1 week). Supports repeat & specific times (IST).',
    usage: 'remind <10m|2h|1:30PM> <message> [repeat daily|weekly] | remind list | remind cancel <n>',
    category: 'Utility',
    async run(ctx) {
      const sub = ctx.args[0]?.toLowerCase();

      if (sub === 'list') {
        const rows = listActiveReminders(ctx.senderJid);
        if (rows.length === 0) return ctx.reply('You have no active reminders.');
        const lines = rows.map(
          (r, i) => `${i + 1}. [id ${r.id}] ${new Date(r.due_at).toLocaleString()} — ${r.message}${r.repeat ? ` (repeats ${r.repeat})` : ''}`
        );
        return ctx.reply(`*Your reminders:*\n\n${lines.join('\n')}`);
      }

      if (sub === 'cancel') {
        const id = parseInt(ctx.args[1], 10);
        if (!id) return ctx.reply(`Usage: ${config.prefix}remind cancel <id>`);
        const ok = cancelReminder(ctx.senderJid, id);
        return ctx.reply(ok ? `Cancelled reminder ${id}.` : `No reminder with id ${id} found for you.`);
      }

      const timeToken = ctx.args[0];
      let repeat = null;
      let messageWords = ctx.args.slice(1);
      const repeatIdx = messageWords.findIndex((w) => w.toLowerCase() === 'repeat');
      if (repeatIdx !== -1) {
        repeat = messageWords[repeatIdx + 1]?.toLowerCase();
        if (repeat !== 'daily' && repeat !== 'weekly') repeat = null;
        messageWords = messageWords.slice(0, repeatIdx);
      }
      const message = messageWords.join(' ');

      if (!timeToken || !message) {
        return ctx.reply(`Usage: ${config.prefix}remind <10m|2h|1:30PM> <message> [repeat daily|weekly]`);
      }

      try {
        const dueAt = parseReminderTime(timeToken);
        const id = addReminder(ctx.senderJid, ctx.chatJid, message, dueAt, repeat);
        return ctx.reply(
          `Reminder set for ${new Date(dueAt).toLocaleString()}${repeat ? ` (repeats ${repeat})` : ''}. (id ${id})`
        );
      } catch (e) {
        return ctx.reply(e.message);
      }
    }
  }
];
