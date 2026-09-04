/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Waypoint Badges — centralized badge configuration.
 * This is the ONLY place badge conditions/thresholds should live. Nothing else
 * in the codebase should hardcode a badge threshold — badgeService.js reads
 * from here and evaluates every condition generically.
 */

export const TIERS = {
  COMMON: 'Common',
  RARE: 'Rare',
  EPIC: 'Epic',
  LEGENDARY: 'Legendary'
};

export const TIER_EMOJI = {
  Common: '⚪',
  Rare: '🔵',
  Epic: '🟣',
  Legendary: '🟡'
};

// condition.type values and what `value` means for each:
//   'auto_join'        — awarded automatically when someone joins a group (no threshold)
//   'message_count'     — community_stats.message_count >= value
//   'distinct_helped'   — count of distinct people this user has helped (via !thanks) >= value
//   'helpful_received'  — community_stats.helpful_received_count (total !thanks received) >= value
//   'resources_qualified' — community_stats.resources_shared_qualified_count >= value
//   'resources_shared'  — community_stats.resources_shared_count >= value
//   'active_days'       — community_stats.streak_days >= value (distinct days active, see statsService)
//   'challenges'        — community_stats.challenges_completed >= value
//   'bugs_validated'    — community_stats.bugs_validated >= value
//   'xp_threshold'      — community_stats.xp >= value
//   'admin_warnings'    — community_stats.warnings_issued_as_admin >= value
//   'manual'            — never auto-awarded; admin-only via !awardbadge

export const BADGES = [
  // --- Activity ---
  {
    key: 'newcomer',
    name: 'Newcomer',
    emoji: '🌱',
    category: 'Activity',
    tier: TIERS.COMMON,
    description: 'Welcome to Waypoint! Awarded automatically when you join.',
    condition: { type: 'auto_join' },
    xpReward: 0
  },
  {
    key: 'active_member',
    name: 'Active Member',
    emoji: '🔥',
    category: 'Activity',
    tier: TIERS.COMMON,
    description: 'Sent 100 meaningful messages in the community.',
    condition: { type: 'message_count', value: 100 },
    xpReward: 25
  },
  {
    key: 'consistent_contributor',
    name: 'Consistent Contributor',
    emoji: '⚡',
    category: 'Activity',
    tier: TIERS.RARE,
    description: 'Active on 7 different days.',
    condition: { type: 'active_days', value: 7 },
    xpReward: 40
  },
  {
    key: 'waypoint_legend',
    name: 'Waypoint Legend',
    emoji: '🏆',
    category: 'Activity',
    tier: TIERS.LEGENDARY,
    description: 'Reached 1000 XP — a true pillar of the community.',
    condition: { type: 'xp_threshold', value: 1000 },
    xpReward: 100
  },

  // --- Contribution ---
  {
    key: 'helpful_member',
    name: 'Helpful Member',
    emoji: '🤝',
    category: 'Contribution',
    tier: TIERS.COMMON,
    description: 'Helped 5 different members (thanked via !thanks).',
    condition: { type: 'distinct_helped', value: 5 },
    xpReward: 20
  },
  {
    key: 'problem_solver',
    name: 'Problem Solver',
    emoji: '💡',
    category: 'Contribution',
    tier: TIERS.RARE,
    description: 'Received 20 helpful answers/replies from the community.',
    condition: { type: 'helpful_received', value: 20 },
    xpReward: 50
  },
  {
    key: 'knowledge_sharer',
    name: 'Knowledge Sharer',
    emoji: '🧠',
    category: 'Contribution',
    tier: TIERS.RARE,
    description: 'Shared 10 resources that received positive reactions.',
    condition: { type: 'resources_qualified', value: 10 },
    xpReward: 50
  },
  {
    key: 'top_contributor',
    name: 'Top Contributor',
    emoji: '⭐',
    category: 'Contribution',
    tier: TIERS.EPIC,
    description: 'Reached 500 XP through consistent contribution.',
    condition: { type: 'xp_threshold', value: 500 },
    xpReward: 60
  },

  // --- Technical ---
  {
    key: 'code_helper',
    name: 'Code Helper',
    emoji: '💻',
    category: 'Technical',
    tier: TIERS.RARE,
    description: 'Recognized for helping others with code (admin-awarded).',
    condition: { type: 'manual' },
    xpReward: 30
  },
  {
    key: 'bug_hunter',
    name: 'Bug Hunter',
    emoji: '🐛',
    category: 'Technical',
    tier: TIERS.EPIC,
    description: 'Reported 5 valid bugs/issues.',
    condition: { type: 'bugs_validated', value: 5 },
    xpReward: 60
  },
  {
    key: 'open_source_contributor',
    name: 'Open Source Contributor',
    emoji: '🚀',
    category: 'Technical',
    tier: TIERS.EPIC,
    description: 'Shared or contributed to an open-source project (admin-awarded).',
    condition: { type: 'manual' },
    xpReward: 60
  },

  // --- Community ---
  {
    key: 'challenge_master',
    name: 'Challenge Master',
    emoji: '🎯',
    category: 'Community',
    tier: TIERS.RARE,
    description: 'Completed 10 Waypoint challenges.',
    condition: { type: 'challenges', value: 10 },
    xpReward: 50
  },
  {
    key: 'discussion_starter',
    name: 'Discussion Starter',
    emoji: '🗣️',
    category: 'Community',
    tier: TIERS.COMMON,
    description: 'Sparked great community discussions (admin-awarded).',
    condition: { type: 'manual' },
    xpReward: 20
  },
  {
    key: 'resource_sharer',
    name: 'Resource Sharer',
    emoji: '📚',
    category: 'Community',
    tier: TIERS.COMMON,
    description: 'Shared 5 resources with the community.',
    condition: { type: 'resources_shared', value: 5 },
    xpReward: 20
  },
  {
    key: 'community_guardian',
    name: 'Community Guardian',
    emoji: '🛡️',
    category: 'Community',
    tier: TIERS.EPIC,
    description: 'Issued 10 warnings as an admin, keeping the community safe.',
    condition: { type: 'admin_warnings', value: 10 },
    xpReward: 60
  }
];

export function getBadgeByKey(key) {
  return BADGES.find((b) => b.key === key);
}

// XP reward table (spec section 3) — used by xpService when logging a reason.
export const XP_REWARDS = {
  helpful_answer: 10,
  useful_resource: 5,
  daily_challenge: 15,
  valid_bug_report: 20,
  positive_contribution: 5,
  daily_activity: 2,
  quiz_correct: 15
};
