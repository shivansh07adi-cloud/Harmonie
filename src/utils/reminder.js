/**
 * Parse a reminder time token: either a relative duration ("10m", "2h", "1d")
 * or a clock time in IST ("1:30PM", "13:30").
 * Returns an absolute epoch-ms timestamp for the next occurrence.
 */
export function parseReminderTime(token) {
  const durationMatch = token.match(/^(\d+)(m|h|d)$/i);
  if (durationMatch) {
    const amount = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2].toLowerCase();
    const ms = unit === 'm' ? amount * 60_000 : unit === 'h' ? amount * 3_600_000 : amount * 86_400_000;
    if (ms > 7 * 86_400_000) throw new Error('Reminders can be at most 1 week out.');
    return Date.now() + ms;
  }

  const clockMatch = token.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (clockMatch) {
    let hour = parseInt(clockMatch[1], 10);
    const minute = parseInt(clockMatch[2], 10);
    const meridiem = clockMatch[3]?.toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;

    // Interpret as IST (UTC+5:30) wall-clock time, next occurrence from now.
    const IST_OFFSET_MIN = 5 * 60 + 30;
    const nowUtcMs = Date.now();
    const nowIst = new Date(nowUtcMs + IST_OFFSET_MIN * 60_000);
    const targetIst = new Date(nowIst);
    targetIst.setUTCHours(hour, minute, 0, 0);
    if (targetIst.getTime() <= nowIst.getTime()) {
      targetIst.setUTCDate(targetIst.getUTCDate() + 1);
    }
    const targetUtcMs = targetIst.getTime() - IST_OFFSET_MIN * 60_000;
    return targetUtcMs;
  }

  throw new Error('Time must be like "10m", "2h", "1d", or "1:30PM".');
}

export function nextRepeatDueAt(currentDueAt, repeat) {
  if (repeat === 'daily') return currentDueAt + 86_400_000;
  if (repeat === 'weekly') return currentDueAt + 7 * 86_400_000;
  return null;
}
