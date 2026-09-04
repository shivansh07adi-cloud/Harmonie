import {
  recordXpTransaction,
  getLastXpTransaction,
  getXpEarnedSince,
  incrementCommunityStat,
  updateCommunityStats,
  getCommunityStats
} from '../db.js';
import { XP_REWARDS } from '../badges/badgeDefinitions.js';

// Cooldown per (jid, reason) — prevents rapid-fire repeats of the same action.
const COOLDOWNS_MS = {
  helpful_answer: 0, // naturally rate-limited by needing a distinct !thanks each time
  useful_resource: 5 * 60_000, // 5 min between resource-share XP
  daily_challenge: 0, // naturally limited to once/day per challenge via hasCompletedChallengeToday
  valid_bug_report: 0, // admin-validated, naturally rate-limited
  positive_contribution: 30_000, // 30s between counting reactions as XP
  daily_activity: 0 // naturally limited to once/day via last_active_date check
};

const DAILY_XP_CAP = 200; // hard ceiling per user per day across all reasons, prevents farming

/**
 * Award XP for a specific reason, applying cooldowns and a daily cap.
 * Returns { awarded: number, reason } — awarded may be 0 if blocked by a guard.
 */
export function awardXp(jid, groupJid, reason, amountOverride) {
  const amount = amountOverride ?? XP_REWARDS[reason];
  if (!amount) return { awarded: 0, reason };

  const cooldown = COOLDOWNS_MS[reason] || 0;
  if (cooldown > 0) {
    const last = getLastXpTransaction(jid, reason);
    if (last && Date.now() - last.created_at < cooldown) {
      return { awarded: 0, reason, blockedBy: 'cooldown' };
    }
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const earnedToday = getXpEarnedSince(jid, startOfDay.getTime());
  if (earnedToday >= DAILY_XP_CAP) {
    return { awarded: 0, reason, blockedBy: 'daily_cap' };
  }
  const cappedAmount = Math.min(amount, DAILY_XP_CAP - earnedToday);
  if (cappedAmount <= 0) return { awarded: 0, reason, blockedBy: 'daily_cap' };

  recordXpTransaction(jid, groupJid, cappedAmount, reason);
  incrementCommunityStat(jid, 'xp', cappedAmount);
  return { awarded: cappedAmount, reason };
}

/**
 * Award daily-activity XP + update streak. Call once per tracked group message;
 * internally no-ops if the user was already credited today.
 */
export function trackDailyActivity(jid) {
  const stats = getCommunityStats(jid);
  if (!stats) return;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  if (stats.last_active_date === today) return; // already credited today

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const newStreak = stats.last_active_date === yesterday ? stats.streak_days + 1 : 1;

  updateCommunityStats(jid, { last_active_date: today, streak_days: newStreak });
  awardXp(jid, null, 'daily_activity');
}

/**
 * Simple duplicate-message spam guard: rejects if the user's last few messages
 * were identical text sent within a short window. Caller decides what to skip
 * (e.g. message-count increment, daily activity) when this returns true.
 */
const recentMessages = new Map(); // jid -> { text, count, firstAt }
const DUPLICATE_WINDOW_MS = 60_000;
const DUPLICATE_THRESHOLD = 3;

export function isDuplicateSpam(jid, text) {
  const normalized = (text || '').trim().toLowerCase();
  if (!normalized) return false;

  const entry = recentMessages.get(jid);
  const now = Date.now();

  if (!entry || now - entry.firstAt > DUPLICATE_WINDOW_MS || entry.text !== normalized) {
    recentMessages.set(jid, { text: normalized, count: 1, firstAt: now });
    return false;
  }

  entry.count += 1;
  return entry.count >= DUPLICATE_THRESHOLD;
}
