// Tracks stickers that were flagged and are waiting out their 30s grace period.
// Keyed by the message id so a later delete-detection can cancel the pending warning.
const pending = new Map(); // messageId -> { timeout, groupJid, jid }

export const STICKER_GRACE_MS = 30_000;

export function trackPendingSticker(messageId, groupJid, jid, onExpire) {
  const timeout = setTimeout(() => {
    pending.delete(messageId);
    onExpire();
  }, STICKER_GRACE_MS);
  pending.set(messageId, { timeout, groupJid, jid });
}

/**
 * Call when a message gets deleted. If it was a pending flagged sticker,
 * cancel its warning timer and report true (caller can skip issuing a warning).
 */
export function cancelIfPending(messageId) {
  const entry = pending.get(messageId);
  if (!entry) return false;
  clearTimeout(entry.timeout);
  pending.delete(messageId);
  return true;
}
