import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

const dir = path.dirname(config.dbPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

/** Adds a column to an existing table only if it doesn't already exist — safe to call every startup. */
function ensureColumn(table, column, definition) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (existing.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

db.exec(`
CREATE TABLE IF NOT EXISTS ranks (
  jid TEXT NOT NULL,
  group_jid TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  messages INTEGER NOT NULL DEFAULT 0,
  last_message_at INTEGER,
  PRIMARY KEY (jid, group_jid)
);

CREATE TABLE IF NOT EXISTS steal_settings (
  jid TEXT PRIMARY KEY,
  pack_name TEXT,
  author_name TEXT
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT NOT NULL,
  chat_jid TEXT NOT NULL,
  message TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  repeat TEXT,
  created_at INTEGER NOT NULL,
  fired INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT NOT NULL,
  group_jid TEXT NOT NULL,
  reason TEXT,
  issued_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_settings (
  group_jid TEXT PRIMARY KEY,
  spam_protection INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_jid TEXT NOT NULL,
  jid TEXT NOT NULL,
  push_name TEXT,
  text TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_message_log_group_time ON message_log (group_jid, created_at);

-- Badge & Achievement System (Waypoint Badges) --

CREATE TABLE IF NOT EXISTS community_stats (
  jid TEXT PRIMARY KEY,
  push_name TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  helpful_given_count INTEGER NOT NULL DEFAULT 0,
  helpful_received_count INTEGER NOT NULL DEFAULT 0,
  resources_shared_count INTEGER NOT NULL DEFAULT 0,
  resources_shared_qualified_count INTEGER NOT NULL DEFAULT 0,
  challenges_completed INTEGER NOT NULL DEFAULT 0,
  bugs_validated INTEGER NOT NULL DEFAULT 0,
  warnings_issued_as_admin INTEGER NOT NULL DEFAULT 0,
  joined_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS badges (
  badge_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  category TEXT NOT NULL,
  tier TEXT NOT NULL,
  description TEXT NOT NULL,
  xp_reward INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_badges (
  jid TEXT NOT NULL,
  badge_key TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  awarded_by TEXT NOT NULL DEFAULT 'system',
  PRIMARY KEY (jid, badge_key)
);

CREATE TABLE IF NOT EXISTS xp_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT NOT NULL,
  group_jid TEXT,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_xp_tx_jid_reason_time ON xp_transactions (jid, reason, created_at);

CREATE TABLE IF NOT EXISTS helped_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  helper_jid TEXT NOT NULL,
  helped_by_jid TEXT NOT NULL,
  group_jid TEXT NOT NULL,
  message_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT NOT NULL,
  group_jid TEXT NOT NULL,
  message_id TEXT NOT NULL,
  reaction_count INTEGER NOT NULL DEFAULT 0,
  qualified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resource_shares_message ON resource_shares (message_id);

CREATE TABLE IF NOT EXISTS bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT NOT NULL,
  group_jid TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  validated_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS challenge_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT NOT NULL,
  challenge_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_jid TEXT NOT NULL,
  action TEXT NOT NULL,
  target_jid TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_state (
  group_jid TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  question_key TEXT NOT NULL,
  posted_at INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_jid TEXT NOT NULL,
  question_key TEXT NOT NULL,
  asked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quiz_history_group ON quiz_history (group_jid, question_key);
`);

// Safe migrations for columns added after initial release (won't touch existing data)
ensureColumn('group_settings', 'welcome_enabled', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('group_settings', 'welcome_message', 'TEXT');
ensureColumn('group_settings', 'quiz_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('group_settings', 'last_daily_quiz_date', 'TEXT');
ensureColumn('group_settings', 'analytics_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('group_settings', 'last_daily_analytics_date', 'TEXT');
ensureColumn('community_stats', 'quizzes_correct', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('community_stats', 'quizzes_attempted', 'INTEGER NOT NULL DEFAULT 0');

export function touchRank(jid, groupJid, xpGain = 1) {
  const now = Date.now();
  const existing = db
    .prepare('SELECT * FROM ranks WHERE jid = ? AND group_jid = ?')
    .get(jid, groupJid);
  if (existing) {
    db.prepare(
      'UPDATE ranks SET xp = xp + ?, messages = messages + 1, last_message_at = ? WHERE jid = ? AND group_jid = ?'
    ).run(xpGain, now, jid, groupJid);
  } else {
    db.prepare(
      'INSERT INTO ranks (jid, group_jid, xp, messages, last_message_at) VALUES (?, ?, ?, 1, ?)'
    ).run(jid, groupJid, xpGain, now);
  }
}

export function getRank(jid, groupJid) {
  return db.prepare('SELECT * FROM ranks WHERE jid = ? AND group_jid = ?').get(jid, groupJid);
}

export function getGroupLeaderboardPosition(jid, groupJid) {
  const rows = db
    .prepare('SELECT jid, xp FROM ranks WHERE group_jid = ? ORDER BY xp DESC')
    .all(groupJid);
  const idx = rows.findIndex((r) => r.jid === jid);
  return { position: idx === -1 ? null : idx + 1, total: rows.length };
}

export function setStealSettings(jid, packName, authorName) {
  db.prepare(
    `INSERT INTO steal_settings (jid, pack_name, author_name) VALUES (?, ?, ?)
     ON CONFLICT(jid) DO UPDATE SET pack_name = excluded.pack_name, author_name = excluded.author_name`
  ).run(jid, packName, authorName);
}

export function getStealSettings(jid) {
  return db.prepare('SELECT * FROM steal_settings WHERE jid = ?').get(jid);
}

export function addReminder(jid, chatJid, message, dueAt, repeat) {
  const info = db
    .prepare(
      'INSERT INTO reminders (jid, chat_jid, message, due_at, repeat, created_at, fired) VALUES (?, ?, ?, ?, ?, ?, 0)'
    )
    .run(jid, chatJid, message, dueAt, repeat || null, Date.now());
  return info.lastInsertRowid;
}

export function listActiveReminders(jid) {
  return db
    .prepare('SELECT * FROM reminders WHERE jid = ? AND fired = 0 ORDER BY due_at ASC')
    .all(jid);
}

export function cancelReminder(jid, id) {
  const info = db.prepare('DELETE FROM reminders WHERE id = ? AND jid = ?').run(id, jid);
  return info.changes > 0;
}

export function getDueReminders() {
  return db.prepare('SELECT * FROM reminders WHERE fired = 0 AND due_at <= ?').all(Date.now());
}

export function markReminderFired(id) {
  db.prepare('UPDATE reminders SET fired = 1 WHERE id = ?').run(id);
}

export function rescheduleReminder(id, newDueAt) {
  db.prepare('UPDATE reminders SET due_at = ?, fired = 0 WHERE id = ?').run(newDueAt, id);
}

export function addWarning(jid, groupJid, reason, issuedBy) {
  db.prepare(
    'INSERT INTO warnings (jid, group_jid, reason, issued_by, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(jid, groupJid, reason || null, issuedBy, Date.now());
  return db.prepare('SELECT COUNT(*) AS n FROM warnings WHERE jid = ? AND group_jid = ?').get(jid, groupJid).n;
}

export function listWarnings(jid, groupJid) {
  return db
    .prepare('SELECT * FROM warnings WHERE jid = ? AND group_jid = ? ORDER BY created_at ASC')
    .all(jid, groupJid);
}

export function removeLatestWarning(jid, groupJid) {
  const row = db
    .prepare('SELECT id FROM warnings WHERE jid = ? AND group_jid = ? ORDER BY created_at DESC LIMIT 1')
    .get(jid, groupJid);
  if (!row) return null;
  db.prepare('DELETE FROM warnings WHERE id = ?').run(row.id);
  const remaining = db.prepare('SELECT COUNT(*) AS n FROM warnings WHERE jid = ? AND group_jid = ?').get(jid, groupJid).n;
  return { remaining };
}

export function clearWarnings(jid, groupJid) {
  db.prepare('DELETE FROM warnings WHERE jid = ? AND group_jid = ?').run(jid, groupJid);
}

export function getSpamProtection(groupJid) {
  const row = db.prepare('SELECT spam_protection FROM group_settings WHERE group_jid = ?').get(groupJid);
  return !!row?.spam_protection;
}

export function setSpamProtection(groupJid, enabled) {
  db.prepare(
    `INSERT INTO group_settings (group_jid, spam_protection) VALUES (?, ?)
     ON CONFLICT(group_jid) DO UPDATE SET spam_protection = excluded.spam_protection`
  ).run(groupJid, enabled ? 1 : 0);
}

export function getWelcomeEnabled(groupJid) {
  const row = db.prepare('SELECT welcome_enabled FROM group_settings WHERE group_jid = ?').get(groupJid);
  return row ? !!row.welcome_enabled : true; // default ON for groups with no row yet
}

export function setWelcomeEnabled(groupJid, enabled) {
  db.prepare(
    `INSERT INTO group_settings (group_jid, welcome_enabled) VALUES (?, ?)
     ON CONFLICT(group_jid) DO UPDATE SET welcome_enabled = excluded.welcome_enabled`
  ).run(groupJid, enabled ? 1 : 0);
}

export function getWelcomeMessage(groupJid) {
  const row = db.prepare('SELECT welcome_message FROM group_settings WHERE group_jid = ?').get(groupJid);
  return row?.welcome_message || null;
}

export function setWelcomeMessage(groupJid, template) {
  db.prepare(
    `INSERT INTO group_settings (group_jid, welcome_message) VALUES (?, ?)
     ON CONFLICT(group_jid) DO UPDATE SET welcome_message = excluded.welcome_message`
  ).run(groupJid, template);
}

export function getQuizEnabled(groupJid) {
  const row = db.prepare('SELECT quiz_enabled FROM group_settings WHERE group_jid = ?').get(groupJid);
  return !!row?.quiz_enabled; // default OFF — opt-in feature
}

export function setQuizEnabled(groupJid, enabled) {
  db.prepare(
    `INSERT INTO group_settings (group_jid, quiz_enabled) VALUES (?, ?)
     ON CONFLICT(group_jid) DO UPDATE SET quiz_enabled = excluded.quiz_enabled`
  ).run(groupJid, enabled ? 1 : 0);
}

export function getGroupsWithQuizEnabled() {
  return db.prepare('SELECT group_jid, last_daily_quiz_date FROM group_settings WHERE quiz_enabled = 1').all();
}

export function setLastDailyQuizDate(groupJid, dateStr) {
  db.prepare(
    `INSERT INTO group_settings (group_jid, last_daily_quiz_date) VALUES (?, ?)
     ON CONFLICT(group_jid) DO UPDATE SET last_daily_quiz_date = excluded.last_daily_quiz_date`
  ).run(groupJid, dateStr);
}

export function getAnalyticsEnabled(groupJid) {
  const row = db.prepare('SELECT analytics_enabled FROM group_settings WHERE group_jid = ?').get(groupJid);
  return !!row?.analytics_enabled; // default OFF — opt-in feature
}

export function setAnalyticsEnabled(groupJid, enabled) {
  db.prepare(
    `INSERT INTO group_settings (group_jid, analytics_enabled) VALUES (?, ?)
     ON CONFLICT(group_jid) DO UPDATE SET analytics_enabled = excluded.analytics_enabled`
  ).run(groupJid, enabled ? 1 : 0);
}

export function getGroupsWithAnalyticsEnabled() {
  return db.prepare('SELECT group_jid, last_daily_analytics_date FROM group_settings WHERE analytics_enabled = 1').all();
}

export function setLastDailyAnalyticsDate(groupJid, dateStr) {
  db.prepare(
    `INSERT INTO group_settings (group_jid, last_daily_analytics_date) VALUES (?, ?)
     ON CONFLICT(group_jid) DO UPDATE SET last_daily_analytics_date = excluded.last_daily_analytics_date`
  ).run(groupJid, dateStr);
}

export function wasQuestionAskedRecently(groupJid, questionKey) {
  return !!db
    .prepare('SELECT 1 FROM quiz_history WHERE group_jid = ? AND question_key = ?')
    .get(groupJid, questionKey);
}

export function recordQuestionAsked(groupJid, questionKey) {
  db.prepare('INSERT INTO quiz_history (group_jid, question_key, asked_at) VALUES (?, ?, ?)').run(
    groupJid,
    questionKey,
    Date.now()
  );
}

export function setActiveQuiz(groupJid, { question, options, correctIndex, questionKey }) {
  db.prepare(
    `INSERT INTO quiz_state (group_jid, question, options, correct_index, question_key, posted_at, resolved)
     VALUES (?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(group_jid) DO UPDATE SET
       question = excluded.question, options = excluded.options, correct_index = excluded.correct_index,
       question_key = excluded.question_key, posted_at = excluded.posted_at, resolved = 0`
  ).run(groupJid, question, JSON.stringify(options), correctIndex, questionKey, Date.now());
}

export function getActiveQuiz(groupJid) {
  const row = db.prepare('SELECT * FROM quiz_state WHERE group_jid = ?').get(groupJid);
  if (!row) return null;
  return { ...row, options: JSON.parse(row.options) };
}

export function resolveQuiz(groupJid) {
  db.prepare('UPDATE quiz_state SET resolved = 1 WHERE group_jid = ?').run(groupJid);
}

export function getQuizLeaderboard(limit = 10) {
  return db
    .prepare('SELECT jid, push_name, quizzes_correct FROM community_stats WHERE quizzes_correct > 0 ORDER BY quizzes_correct DESC LIMIT ?')
    .all(limit);
}

export function logGroupMessage(groupJid, jid, pushName, text) {
  db.prepare(
    'INSERT INTO message_log (group_jid, jid, push_name, text, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(groupJid, jid, pushName || null, text || '', Date.now());
}

export function getRecentGroupMessages(groupJid, sinceMs) {
  return db
    .prepare('SELECT * FROM message_log WHERE group_jid = ? AND created_at >= ? ORDER BY created_at ASC')
    .all(groupJid, sinceMs);
}

export function pruneOldMessageLogs(olderThanMs) {
  db.prepare('DELETE FROM message_log WHERE created_at < ?').run(olderThanMs);
}

// --- Badge & Achievement System ---

export function getOrCreateCommunityStats(jid, pushName) {
  const existing = db.prepare('SELECT * FROM community_stats WHERE jid = ?').get(jid);
  if (existing) return existing;
  const now = Date.now();
  db.prepare(
    `INSERT INTO community_stats (jid, push_name, joined_at, updated_at) VALUES (?, ?, ?, ?)`
  ).run(jid, pushName || null, now, now);
  return db.prepare('SELECT * FROM community_stats WHERE jid = ?').get(jid);
}

export function getCommunityStats(jid) {
  return db.prepare('SELECT * FROM community_stats WHERE jid = ?').get(jid);
}

export function updateCommunityStats(jid, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  db.prepare(`UPDATE community_stats SET ${setClause}, updated_at = ? WHERE jid = ?`).run(
    ...values,
    Date.now(),
    jid
  );
}

export function incrementCommunityStat(jid, column, amount = 1) {
  db.prepare(`UPDATE community_stats SET ${column} = ${column} + ?, updated_at = ? WHERE jid = ?`).run(
    amount,
    Date.now(),
    jid
  );
}

export function getCommunityLeaderboard(limit = 10) {
  return db.prepare('SELECT * FROM community_stats ORDER BY xp DESC LIMIT ?').all(limit);
}

export function getCommunityRank(jid) {
  const rows = db.prepare('SELECT jid FROM community_stats ORDER BY xp DESC').all();
  const idx = rows.findIndex((r) => r.jid === jid);
  return idx === -1 ? null : idx + 1;
}

export function upsertBadgeDefinition(badge) {
  db.prepare(
    `INSERT INTO badges (badge_key, name, emoji, category, tier, description, xp_reward)
     VALUES (@badge_key, @name, @emoji, @category, @tier, @description, @xp_reward)
     ON CONFLICT(badge_key) DO UPDATE SET
       name = excluded.name, emoji = excluded.emoji, category = excluded.category,
       tier = excluded.tier, description = excluded.description, xp_reward = excluded.xp_reward`
  ).run(badge);
}

export function getAllBadgeDefinitions() {
  return db.prepare('SELECT * FROM badges').all();
}

export function getBadgeDefinition(badgeKey) {
  return db.prepare('SELECT * FROM badges WHERE badge_key = ?').get(badgeKey);
}

export function hasBadge(jid, badgeKey) {
  return !!db.prepare('SELECT 1 FROM user_badges WHERE jid = ? AND badge_key = ?').get(jid, badgeKey);
}

export function awardBadge(jid, badgeKey, awardedBy = 'system') {
  db.prepare(
    `INSERT OR IGNORE INTO user_badges (jid, badge_key, earned_at, awarded_by) VALUES (?, ?, ?, ?)`
  ).run(jid, badgeKey, Date.now(), awardedBy);
}

export function removeBadge(jid, badgeKey) {
  const info = db.prepare('DELETE FROM user_badges WHERE jid = ? AND badge_key = ?').run(jid, badgeKey);
  return info.changes > 0;
}

export function getUserBadges(jid) {
  return db
    .prepare(
      `SELECT b.* , ub.earned_at, ub.awarded_by FROM user_badges ub
       JOIN badges b ON b.badge_key = ub.badge_key
       WHERE ub.jid = ? ORDER BY ub.earned_at ASC`
    )
    .all(jid);
}

export function countBadgeHolders(badgeKey) {
  return db.prepare('SELECT COUNT(*) AS n FROM user_badges WHERE badge_key = ?').get(badgeKey).n;
}

export function recordXpTransaction(jid, groupJid, amount, reason) {
  db.prepare(
    'INSERT INTO xp_transactions (jid, group_jid, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(jid, groupJid || null, amount, reason, Date.now());
}

export function getLastXpTransaction(jid, reason) {
  return db
    .prepare('SELECT * FROM xp_transactions WHERE jid = ? AND reason = ? ORDER BY created_at DESC LIMIT 1')
    .get(jid, reason);
}

export function getXpEarnedSince(jid, sinceMs) {
  const row = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM xp_transactions WHERE jid = ? AND created_at >= ? AND amount > 0')
    .get(jid, sinceMs);
  return row.total;
}

export function recordHelped(helperJid, helpedByJid, groupJid, messageId) {
  db.prepare(
    'INSERT INTO helped_records (helper_jid, helped_by_jid, group_jid, message_id, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(helperJid, helpedByJid, groupJid, messageId || null, Date.now());
}

export function alreadyThankedMessage(helpedByJid, messageId) {
  return !!db
    .prepare('SELECT 1 FROM helped_records WHERE helped_by_jid = ? AND message_id = ?')
    .get(helpedByJid, messageId);
}

export function countDistinctHelped(helperJid) {
  return db
    .prepare('SELECT COUNT(DISTINCT helped_by_jid) AS n FROM helped_records WHERE helper_jid = ?')
    .get(helperJid).n;
}

export function recordResourceShare(jid, groupJid, messageId) {
  db.prepare(
    'INSERT INTO resource_shares (jid, group_jid, message_id, created_at) VALUES (?, ?, ?, ?)'
  ).run(jid, groupJid, messageId, Date.now());
}

export function getResourceShareByMessageId(messageId) {
  return db.prepare('SELECT * FROM resource_shares WHERE message_id = ?').get(messageId);
}

export function incrementResourceReaction(messageId, qualifyThreshold = 3) {
  const row = getResourceShareByMessageId(messageId);
  if (!row) return null;
  const newCount = row.reaction_count + 1;
  const nowQualifies = !row.qualified && newCount >= qualifyThreshold;
  db.prepare('UPDATE resource_shares SET reaction_count = ?, qualified = ? WHERE id = ?').run(
    newCount,
    nowQualifies ? 1 : row.qualified,
    row.id
  );
  return { ...row, reaction_count: newCount, qualified: row.qualified || nowQualifies ? 1 : 0, justQualified: nowQualifies };
}

export function addBugReport(jid, groupJid, description) {
  const info = db
    .prepare('INSERT INTO bug_reports (jid, group_jid, description, status, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(jid, groupJid, description, 'pending', Date.now());
  return info.lastInsertRowid;
}

export function getBugReport(id) {
  return db.prepare('SELECT * FROM bug_reports WHERE id = ?').get(id);
}

export function validateBugReport(id, validatedBy) {
  db.prepare('UPDATE bug_reports SET status = ?, validated_by = ? WHERE id = ?').run('validated', validatedBy, id);
}

export function addChallengeCompletion(jid, challengeName) {
  db.prepare('INSERT INTO challenge_completions (jid, challenge_name, created_at) VALUES (?, ?, ?)').run(
    jid,
    challengeName,
    Date.now()
  );
}

export function hasCompletedChallengeToday(jid, challengeName) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return !!db
    .prepare(
      'SELECT 1 FROM challenge_completions WHERE jid = ? AND challenge_name = ? AND created_at >= ?'
    )
    .get(jid, challengeName, startOfDay.getTime());
}

export function logAdminAction(adminJid, action, targetJid, detail) {
  db.prepare(
    'INSERT INTO admin_action_log (admin_jid, action, target_jid, detail, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(adminJid, action, targetJid || null, detail || null, Date.now());
}
