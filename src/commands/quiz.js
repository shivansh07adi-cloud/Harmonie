import { config } from '../config.js';
import {
  getOrCreateCommunityStats,
  getActiveQuiz,
  resolveQuiz,
  incrementCommunityStat,
  getQuizEnabled,
  setQuizEnabled,
  getQuizLeaderboard
} from '../db.js';
import { startQuiz, formatQuizMessage, OPTION_LABELS } from '../quiz/quizService.js';
import { awardXp } from '../services/xpService.js';
import { checkAndAwardBadges, formatUnlockNotification } from '../services/badgeService.js';

export const commands = [
  {
    names: ['quiz'],
    description: 'Get a coding/tech/general knowledge quiz question',
    usage: 'quiz [coding|tech|general]',
    category: 'Quiz',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('Quizzes only work in groups.');
      const type = ['coding', 'tech', 'general'].includes(ctx.args[0]?.toLowerCase())
        ? ctx.args[0].toLowerCase()
        : 'random';

      const picked = await startQuiz(ctx.chatJid, type);
      const text = formatQuizMessage(picked.category, picked.question, picked.options, config.prefix);
      return ctx.reply(text);
    }
  },
  {
    names: ['answer', 'ans'],
    description: "Answer the group's active quiz question",
    usage: 'answer <A|B|C|D>',
    category: 'Quiz',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('Quizzes only work in groups.');
      const active = getActiveQuiz(ctx.chatJid);
      if (!active) return ctx.reply(`No active quiz here. Start one with ${config.prefix}quiz.`);
      if (active.resolved) return ctx.reply('That quiz has already been answered — try a new one!');

      const letter = ctx.args[0]?.toUpperCase();
      const chosenIndex = OPTION_LABELS.indexOf(letter);
      if (chosenIndex === -1) return ctx.reply(`Usage: ${config.prefix}answer <A|B|C|D>`);

      getOrCreateCommunityStats(ctx.senderJid, ctx.msg.pushName);
      incrementCommunityStat(ctx.senderJid, 'quizzes_attempted', 1);

      if (chosenIndex !== active.correct_index) {
        return ctx.reply(`❌ Not quite. Try again — ${config.prefix}answer <letter>`);
      }

      resolveQuiz(ctx.chatJid);
      incrementCommunityStat(ctx.senderJid, 'quizzes_correct', 1);
      const { awarded } = awardXp(ctx.senderJid, ctx.chatJid, 'quiz_correct', 15);

      await ctx.sock.sendMessage(
        ctx.chatJid,
        {
          text: `✅ *Correct!* @${ctx.senderNumber} got it — the answer was ${OPTION_LABELS[active.correct_index]}. ${active.options[active.correct_index]}${awarded > 0 ? ` (+${awarded} XP)` : ''}`,
          mentions: [ctx.senderJid]
        },
        { quoted: ctx.msg }
      );

      const unlocked = checkAndAwardBadges(ctx.senderJid);
      for (const badge of unlocked) {
        await ctx.sock
          .sendMessage(ctx.chatJid, { text: formatUnlockNotification(ctx.senderJid, badge), mentions: [ctx.senderJid] })
          .catch(() => {});
      }
    }
  },
  {
    names: ['quizzes', 'dailyquiz'],
    description: 'Admin: toggle the daily auto-posted quiz for this group',
    usage: 'quizzes on|off',
    category: 'Group Admin',
    async run(ctx) {
      if (!ctx.isGroup) return ctx.reply('This only works in groups.');
      if (!ctx.isSenderAdmin) return ctx.reply('Only group admins can use this.');

      const arg = ctx.args[0]?.toLowerCase();
      if (arg !== 'on' && arg !== 'off') {
        const current = getQuizEnabled(ctx.chatJid);
        return ctx.reply(
          `Daily quizzes are currently *${current ? 'ON' : 'OFF'}* (posted around ${config.dailyQuizTime} IST). Usage: ${config.prefix}quizzes on|off`
        );
      }
      setQuizEnabled(ctx.chatJid, arg === 'on');
      return ctx.reply(`Daily quizzes turned *${arg.toUpperCase()}*.`);
    }
  },
  {
    names: ['quizleaderboard', 'quizlb'],
    description: 'Top members by quizzes answered correctly',
    usage: 'quizleaderboard',
    category: 'Quiz',
    async run(ctx) {
      const top = getQuizLeaderboard(10);
      if (top.length === 0) return ctx.reply('No one has answered a quiz correctly yet — be the first!');

      const medals = ['🥇', '🥈', '🥉'];
      const lines = top.map((row, i) => {
        const label = medals[i] || `${i + 1}️⃣`;
        const name = row.push_name || row.jid.split('@')[0];
        return `${label} ${name} — ${row.quizzes_correct} correct`;
      });

      return ctx.sock.sendMessage(
        ctx.chatJid,
        { text: `🧠 *QUIZ LEADERBOARD*\n\n${lines.join('\n')}`, mentions: top.map((r) => r.jid) },
        { quoted: ctx.msg }
      );
    }
  }
];
