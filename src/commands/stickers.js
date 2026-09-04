import { config } from '../config.js';
import { imageToWebp, videoToWebp, addStickerMetadata } from '../utils/stickerMaker.js';
import { textToAnimatedSticker } from '../utils/attpMaker.js';
import { setStealSettings, getStealSettings } from '../db.js';

function parsePackAuthorArgs(args) {
  let pack = null;
  let author = null;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].toLowerCase() === 'pack') {
      pack = args[i + 1];
      i++;
    } else if (args[i].toLowerCase() === 'author') {
      author = args[i + 1];
      i++;
    } else {
      rest.push(args[i]);
    }
  }
  return { pack, author, rest };
}

export const commands = [
  {
    names: ['sticker', 's'],
    description: 'Convert image or video to sticker',
    usage: 'sticker | s [pack <packname>] [author <authorname>]',
    category: 'Stickers',
    async run(ctx) {
      const media = await ctx.downloadMedia();
      if (!media || (media.type !== 'image' && media.type !== 'video')) {
        return ctx.reply('Reply to an image or short video/gif with this command.');
      }

      const { pack, author } = parsePackAuthorArgs(ctx.args);
      const saved = getStealSettings(ctx.senderJid);
      const packName = pack || saved?.pack_name || '';
      const authorName = author || saved?.author_name || '';

      let webp;
      if (media.type === 'image') webp = await imageToWebp(media.buffer);
      else webp = await videoToWebp(media.buffer);

      const withMeta = await addStickerMetadata(webp, { packName, authorName });
      return ctx.replySticker(withMeta);
    }
  },
  {
    names: ['steal', 'stealn'],
    description: 'Steal stickers with custom pack and author names or default ones',
    usage: 'steal | steal pack <name> author <name>',
    category: 'Stickers',
    async run(ctx) {
      const media = await ctx.downloadMedia();
      if (!media) return ctx.reply('Reply to a sticker, image, or video with this command.');

      const { pack, author } = parsePackAuthorArgs(ctx.args);
      const saved = getStealSettings(ctx.senderJid);
      const packName = pack || saved?.pack_name || '';
      const authorName = author || saved?.author_name || '';

      let webp;
      if (media.type === 'sticker') webp = media.buffer;
      else if (media.type === 'image') webp = await imageToWebp(media.buffer);
      else webp = await videoToWebp(media.buffer);

      const withMeta = await addStickerMetadata(webp, { packName, authorName });
      return ctx.replySticker(withMeta);
    }
  },
  {
    names: ['sets', 'stealtext'],
    description: 'Set custom steal pack/author text',
    usage: 'sets pack <name> author <name>',
    category: 'Stickers',
    async run(ctx) {
      const { pack, author, rest } = parsePackAuthorArgs(ctx.args);
      if (!pack && !author) {
        return ctx.reply(`Usage: ${config.prefix}sets pack <name> author <name>`);
      }
      const existing = getStealSettings(ctx.senderJid);
      const packName = pack || existing?.pack_name || '';
      const authorName = author || existing?.author_name || '';
      setStealSettings(ctx.senderJid, packName, authorName);
      return ctx.reply(`Saved. Pack: "${packName || '(none)'}", Author: "${authorName || '(none)'}"`);
    }
  },
  {
    names: ['tts', 'attp'],
    description: 'Convert text to an animated sticker',
    usage: 'tts <text>',
    category: 'Stickers',
    async run(ctx) {
      if (!ctx.fullTextAfterCommand) return ctx.reply(`Usage: ${config.prefix}tts <text>`);
      const webp = await textToAnimatedSticker(ctx.fullTextAfterCommand);
      return ctx.replySticker(webp);
    }
  }
];
