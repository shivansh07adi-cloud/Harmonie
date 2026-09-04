import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { config } from './config.js';

function extractText(message) {
  if (!message) return '';
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.stickerMessage?.caption ||
    ''
  );
}

function getContextInfo(message) {
  return (
    message?.extendedTextMessage?.contextInfo ||
    message?.imageMessage?.contextInfo ||
    message?.videoMessage?.contextInfo ||
    message?.stickerMessage?.contextInfo ||
    message?.conversation?.contextInfo ||
    null
  );
}

/** Strip the ":device" suffix WhatsApp sometimes appends before the @ (e.g. "123:45@s.whatsapp.net"). */
function normalizeJid(jid) {
  if (!jid) return null;
  const [user, server] = jid.split('@');
  if (!server) return jid;
  return `${user.split(':')[0]}@${server}`;
}

/**
 * Recent WhatsApp/Baileys groups can address participants by phone-number JID
 * (@s.whatsapp.net) OR by anonymous LID (@lid) depending on the group's
 * addressingMode — so the bot's own identity has to be checked against both,
 * not built by hand from sock.user.id alone (which was the root cause of the
 * bot never recognizing its own admin status in "lid" groups).
 */
function getSelfJids(sock) {
  return new Set(
    [sock.user?.id, sock.user?.lid, sock.user?.jid].filter(Boolean).map(normalizeJid)
  );
}

/**
 * Build a normalized, easy-to-use context object for a single incoming Baileys message.
 */
export async function buildContext(sock, msg) {
  const chatJid = msg.key.remoteJid;
  const isGroup = chatJid.endsWith('@g.us');
  const senderJid = isGroup ? msg.key.participant || msg.participant : chatJid;
  const message = msg.message;
  const fullText = extractText(message).trim();

  const ctxInfo = getContextInfo(message);
  const quotedMessage = ctxInfo?.quotedMessage || null;
  const quotedSender = ctxInfo?.participant || null;
  const mentionedJids = ctxInfo?.mentionedJid || [];

  const senderNumber = senderJid?.split('@')[0]?.split(':')[0];
  const isOwner = config.ownerNumbers.includes(senderNumber);

  let groupParticipants = [];
  let isSenderAdmin = false;
  let isBotAdmin = false;
  if (isGroup) {
    try {
      const meta = await sock.groupMetadata(chatJid);
      groupParticipants = meta.participants;
      const selfJids = getSelfJids(sock);
      isSenderAdmin = groupParticipants.some((p) => p.id === senderJid && (p.admin === 'admin' || p.admin === 'superadmin'));
      isBotAdmin = groupParticipants.some((p) => {
        if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
        return [p.id, p.jid, p.lid].filter(Boolean).map(normalizeJid).some((id) => selfJids.has(id));
      });
    } catch {
      // group metadata fetch can fail transiently; leave defaults
    }
  }

  return {
    sock,
    msg,
    chatJid,
    isGroup,
    senderJid,
    senderNumber,
    isOwner,
    fullText,
    quotedMessage,
    quotedSender,
    mentionedJids,
    groupParticipants,
    isSenderAdmin,
    isBotAdmin,

    async reply(text) {
      return sock.sendMessage(chatJid, { text }, { quoted: msg });
    },

    /** Like reply(), but for text containing @mentions — WhatsApp only renders
     * a proper clickable/named mention when the jid is also passed here; without
     * it, "@number" shows up as the raw literal digits instead of a resolved tag. */
    async replyMention(text, mentionJids) {
      return sock.sendMessage(chatJid, { text, mentions: mentionJids }, { quoted: msg });
    },

    async replySticker(webpBuffer) {
      return sock.sendMessage(chatJid, { sticker: webpBuffer }, { quoted: msg });
    },

    async replyImage(buffer, caption) {
      return sock.sendMessage(chatJid, { image: buffer, caption }, { quoted: msg });
    },

    async replyVoiceNote(oggBuffer) {
      return sock.sendMessage(
        chatJid,
        { audio: oggBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true },
        { quoted: msg }
      );
    },

    /**
     * Download media from the quoted message if present, otherwise from this message itself.
     * Returns { buffer, type: 'image'|'video'|'sticker' } or null if no media found.
     */
    async downloadMedia() {
      const source = quotedMessage || message;
      let type = null;
      if (source?.imageMessage) type = 'image';
      else if (source?.videoMessage) type = 'video';
      else if (source?.stickerMessage) type = 'sticker';
      if (!type) return null;

      const fakeMsg = quotedMessage
        ? { key: { remoteJid: chatJid, id: ctxInfo.stanzaId, participant: quotedSender }, message: quotedMessage }
        : msg;

      const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
      return { buffer, type };
    },

    /** Build the WAMessageKey needed to delete a message (own or, if admin, others' in a group). */
    getDeletableKey() {
      if (quotedMessage && ctxInfo?.stanzaId) {
        const selfJids = getSelfJids(sock);
        const quotedNorm = normalizeJid(quotedSender);
        return {
          remoteJid: chatJid,
          id: ctxInfo.stanzaId,
          participant: quotedSender,
          fromMe: quotedNorm ? selfJids.has(quotedNorm) : false
        };
      }
      return null;
    },

    async removeFromGroup(jid) {
      return sock.groupParticipantsUpdate(chatJid, [jid], 'remove');
    },

    async deleteMessage(key) {
      return sock.sendMessage(chatJid, { delete: key });
    }
  };
}
