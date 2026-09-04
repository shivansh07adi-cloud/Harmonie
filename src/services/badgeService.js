import { BADGES, getBadgeByKey } from '../badges/badgeDefinitions.js';
import {
  getCommunityStats,
  hasBadge,
  awardBadge,
  countDistinctHelped,
  upsertBadgeDefinition
} from '../db.js';
import { awardXp } from './xpService.js';

/** Seed the badges table from the centralized definitions. Call once at startup. */
export function seedBadgeDefinitions() {
  for (const b of BADGES) {
    upsertBadgeDefinition({
      badge_key: b.key,
      name: b.name,
      emoji: b.emoji,
      category: b.category,
      tier: b.tier,
      description: b.description,
      xp_reward: b.xpReward
    });
  }
}

function conditionMet(condition, stats, jid) {
  switch (condition.type) {
    case 'auto_join':
    case 'manual':
      return false; // never auto-evaluated here — handled by dedicated call sites
    case 'message_count':
      return stats.message_count >= condition.value;
    case 'distinct_helped':
      return countDistinctHelped(jid) >= condition.value;
    case 'helpful_received':
      return stats.helpful_received_count >= condition.value;
    case 'resources_qualified':
      return stats.resources_shared_qualified_count >= condition.value;
    case 'resources_shared':
      return stats.resources_shared_count >= condition.value;
    case 'active_days':
      return stats.streak_days >= condition.value;
    case 'challenges':
      return stats.challenges_completed >= condition.value;
    case 'bugs_validated':
      return stats.bugs_validated >= condition.value;
    case 'xp_threshold':
      return stats.xp >= condition.value;
    case 'admin_warnings':
      return stats.warnings_issued_as_admin >= condition.value;
    default:
      return false;
  }
}

/**
 * Re-evaluate every auto-checkable badge for a user and award any newly-qualified ones.
 * Returns the list of badge definitions that were newly unlocked (for sending notifications).
 */
export function checkAndAwardBadges(jid) {
  const stats = getCommunityStats(jid);
  if (!stats) return [];

  const newlyUnlocked = [];
  for (const badge of BADGES) {
    if (badge.condition.type === 'auto_join' || badge.condition.type === 'manual') continue;
    if (hasBadge(jid, badge.key)) continue;
    if (conditionMet(badge.condition, stats, jid)) {
      awardBadge(jid, badge.key, 'system');
      if (badge.xpReward > 0) awardXp(jid, null, `badge:${badge.key}`, badge.xpReward);
      newlyUnlocked.push(badge);
    }
  }
  return newlyUnlocked;
}

/** Award the auto-join Newcomer badge. Safe to call multiple times (no-ops if already held). */
export function awardNewcomerBadge(jid) {
  if (hasBadge(jid, 'newcomer')) return null;
  awardBadge(jid, 'newcomer', 'system');
  return getBadgeByKey('newcomer');
}

export function formatUnlockNotification(jid, badge) {
  const number = jid.split('@')[0];
  return (
    `🎉 *BADGE UNLOCKED!*\n\n` +
    `Congratulations @${number}!\n\n` +
    `You earned:\n\n` +
    `${badge.emoji} *${badge.name.toUpperCase()}*\n\n` +
    `${badge.description}\n\n` +
    (badge.xpReward > 0 ? `+${badge.xpReward} XP\n\n` : '') +
    `Keep contributing! 🚀`
  );
}
