import { config } from '../config.js';
import { getFreeEpicGames } from '../utils/epicGames.js';
import { fetchRedditPost } from '../utils/reddit.js';
import { getInstagramProfilePic } from '../utils/instagram.js';

export const commands = [
  {
    names: ['epicgames', 'epic', 'freegames'],
    description: 'Get current free games on Epic Games Store',
    usage: 'epicgames | epic | freegames',
    category: 'Media',
    async run(ctx) {
      const games = await getFreeEpicGames();
      if (games.length === 0) return ctx.reply('No free games on Epic Games Store right now.');
      const text = games
        .map((g) => `*${g.title}*\nFree until: ${new Date(g.endDate).toLocaleDateString()}\n${g.url}`)
        .join('\n\n');
      return ctx.reply(`*Currently free on Epic Games:*\n\n${text}`);
    }
  },
  {
    names: ['reddit'],
    description: 'Download post from reddit',
    usage: 'reddit <post link>',
    category: 'Media',
    async run(ctx) {
      const link = ctx.args[0];
      if (!link || !link.includes('reddit.com')) {
        return ctx.reply(`Usage: ${config.prefix}reddit <reddit post link>`);
      }
      const post = await fetchRedditPost(link);
      const caption = `*${post.title}*\n${post.subreddit} · u/${post.author}`;

      if (post.media.length === 0) {
        return ctx.reply(`${caption}\n\n${post.selftext || '(no media found in this post)'}`);
      }

      for (const m of post.media) {
        const res = await fetch(m.url, { headers: { 'User-Agent': 'WhatsAppBot/1.0' } });
        const buffer = Buffer.from(await res.arrayBuffer());
        if (m.type === 'image') {
          await ctx.replyImage(buffer, caption);
        } else {
          await ctx.sock.sendMessage(ctx.chatJid, { video: buffer, caption }, { quoted: ctx.msg });
        }
      }
    }
  },
  {
    names: ['idp', 'dp'],
    description: 'Get Instagram Profile Picture',
    usage: 'idp | dp <username>',
    category: 'Media',
    async run(ctx) {
      const username = ctx.args[0];
      if (!username) return ctx.reply(`Usage: ${config.prefix}idp <username>`);
      const profile = await getInstagramProfilePic(username);
      const res = await fetch(profile.picUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const buffer = Buffer.from(await res.arrayBuffer());
      const caption = profile.fullName ? `${profile.fullName} (@${profile.username})` : `@${profile.username}`;
      return ctx.replyImage(buffer, caption);
    }
  }
];
