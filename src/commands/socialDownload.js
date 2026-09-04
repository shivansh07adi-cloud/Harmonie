import { config } from '../config.js';
import { downloadSocialPost } from '../utils/socialDownload.js';

async function fetchBuffer(url, referer) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        ...(referer ? { Referer: referer, Origin: new URL(referer).origin } : {})
      }
    });
    if (!res.ok) throw new Error(`Media download failed (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    // Node's fetch throws a generic "fetch failed" with the real reason
    // nested in e.cause (TLS/DNS/connection-reset/etc.) — surface that
    // instead of the useless top-level message.
    const detail = e?.cause?.message || e?.cause?.code || e.message;
    console.error('[save] fetchBuffer failed for', url, '| detail:', detail);
    throw new Error(detail);
  }
}

export const commands = [
  {
    names: ['save', 'dl', 'download', 'insta', 'i', 'tw', 'tt', 'fb'],
    description: 'Download a post, reel, photo, or video from Instagram, Twitter/X, TikTok, or Facebook and send it here',
    usage: 'save <link>',
    category: 'Media',
    async run(ctx) {
      const link = ctx.args[0] || ctx.fullTextAfterCommand;
      if (!link || !/^https?:\/\//i.test(link)) {
        return ctx.reply(`Usage: ${config.prefix}save <Instagram / Twitter / TikTok link>`);
      }

      let result;
      try {
        result = await downloadSocialPost(link);
      } catch (e) {
        return ctx.reply(e.message);
      }

      const caption = result.caption ? result.caption.slice(0, 900) : '';
      const referer =
        result.platform === 'instagram'
          ? 'https://www.instagram.com/'
          : result.platform === 'facebook'
            ? 'https://www.facebook.com/'
            : result.platform === 'tiktok'
              ? 'https://www.tiktok.com/'
              : undefined;

      for (const item of result.media) {
        let buffer;
        try {
          buffer = await fetchBuffer(item.url, referer);
        } catch (e) {
          await ctx.reply(`Couldn't download one of the media files: ${e.message}`);
          continue;
        }

        if (item.type === 'image') {
          await ctx.replyImage(buffer, caption);
        } else {
          await ctx.sock.sendMessage(ctx.chatJid, { video: buffer, caption }, { quoted: ctx.msg });
        }
      }
    }
  }
];
