import { Type } from '@google/genai';
import { getRecentGroupMessages } from '../db.js';
import { friendlyApiError } from '../utils/friendlyError.js';
import { generateContentWithFallback } from '../utils/geminiClient.js';

function computeMostActive(rows) {
  const counts = new Map();
  for (const r of rows) counts.set(r.jid, (counts.get(r.jid) || 0) + 1);
  let topJid = null;
  let topCount = 0;
  for (const [jid, count] of counts.entries()) {
    if (count > topCount) {
      topJid = jid;
      topCount = count;
    }
  }
  const pushName = rows.find((r) => r.jid === topJid)?.push_name || topJid?.split('@')[0];
  return { jid: topJid, pushName, count: topCount, totalMessages: rows.length, participants: counts.size };
}

/** Find the jid whose push_name best matches a name Gemini mentioned in its narrative. */
function findJidByName(rows, name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  const exact = rows.find((r) => (r.push_name || '').toLowerCase() === lower);
  if (exact) return exact.jid;
  const partial = rows.find((r) => (r.push_name || '').toLowerCase().includes(lower) || lower.includes((r.push_name || '').toLowerCase()));
  return partial?.jid || null;
}

/** Turn any exact push_name occurrences in text into @mentions, collecting the jids used. */
function mentionify(text, rows) {
  const uniqueNames = [...new Set(rows.map((r) => r.push_name).filter((n) => n && n.length > 2))];
  const mentions = new Set();
  let out = text;
  for (const name of uniqueNames) {
    const jid = rows.find((r) => r.push_name === name)?.jid;
    if (!jid) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![\\w@])${escaped}(?!\\w)`, 'g');
    if (re.test(out)) {
      out = out.replace(re, `@${jid.split('@')[0]}`);
      mentions.add(jid);
    }
  }
  return { text: out, mentions: [...mentions] };
}

/**
 * Build the full analytics report for a group's last 24h of tracked messages.
 * Returns null if there's nothing to report on. Used by both the manual
 * !analytics command and the daily auto-post scheduler.
 */
export async function generateAnalyticsReport(groupJid) {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const rows = getRecentGroupMessages(groupJid, since);
  if (rows.length === 0) return null;

  const mostActive = computeMostActive(rows);
  const transcript = rows
    .slice(-500)
    .map((r) => `${r.push_name || r.jid.split('@')[0]}: ${r.text}`)
    .join('\n');

  let mvpName = null, mvpReason = 'No standout MVP today.';
  let topicName = null, topicStory = '';
  let groupStory = '';

  try {
    const response = await generateContentWithFallback((model) => ({
      model,
      contents:
        `Here is a WhatsApp group chat transcript from the last 24 hours. Analyze it and return:\n` +
        `- mvp_name: the person who added the most genuine value (helpful advice, useful info) — use their exact name as it appears in the transcript\n` +
        `- mvp_reason: 1-2 sentences why, specific to what they actually said\n` +
        `- overblown_topic_name: a short punchy title for whatever topic got dragged out way longer than it needed to be\n` +
        `- overblown_topic_story: 2-3 witty sentences recapping that topic, naming the people involved by their exact transcript names\n` +
        `- group_story_bullets: 4-7 SEPARATE array entries, each one a self-contained witty sentence or two recapping one beat of the day's conversation, naming people by their exact transcript names, written like a gossipy narrator\n\n` +
        `Transcript:\n${transcript}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mvp_name: { type: Type.STRING },
            mvp_reason: { type: Type.STRING },
            overblown_topic_name: { type: Type.STRING },
            overblown_topic_story: { type: Type.STRING },
            group_story_bullets: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['mvp_name', 'mvp_reason', 'overblown_topic_name', 'overblown_topic_story', 'group_story_bullets']
        }
      }
    }));
    const parsed = JSON.parse(response.text);
    mvpName = parsed.mvp_name;
    mvpReason = parsed.mvp_reason;
    topicName = parsed.overblown_topic_name;
    topicStory = parsed.overblown_topic_story;
    groupStory = (parsed.group_story_bullets || []).map((b) => `• ${b}`).join('\n\n');
  } catch (e) {
    groupStory = `(AI narrative unavailable: ${friendlyApiError(e)})`;
  }

  const mvpJid = findJidByName(rows, mvpName);
  const topicJid = findJidByName(rows, topicName?.split(' by ')[0]) || findJidByName(rows, topicName);
  const { text: storyText, mentions: storyMentions } = mentionify(groupStory, rows);
  const { text: mvpReasonText } = mentionify(mvpReason, rows);
  const { text: topicStoryText } = mentionify(topicStory, rows);

  const allMentions = new Set(storyMentions);
  if (mvpJid) allMentions.add(mvpJid);
  if (mostActive.jid) allMentions.add(mostActive.jid);
  if (topicJid) allMentions.add(topicJid);

  const parts = [`📊 *Daily Group Analytics (Past 24 Hours)* 📊`, ''];

  if (mvpJid) {
    parts.push(`🏆 *Today's MVP:*`, `👉 @${mvpJid.split('@')[0]} (${mvpName}) - ${mvpReasonText}`, '');
  }

  parts.push(
    `📈 *Most Active Today:*`,
    `👉 @${mostActive.jid.split('@')[0]} (${mostActive.count} messages out of ${mostActive.totalMessages} total from ${mostActive.participants} participants)`,
    ''
  );

  if (topicName) {
    parts.push(
      `😩 *Most Overblown Topic:*`,
      `👉 *${topicName}*${topicJid ? ` by @${topicJid.split('@')[0]}` : ''} - ${topicStoryText}`,
      ''
    );
  }

  parts.push(`📖 *Today's Group Story:*`, '', storyText);

  return { text: parts.join('\n'), mentions: [...allMentions] };
}
