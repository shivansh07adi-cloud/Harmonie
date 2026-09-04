import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchTriviaQuestion } from './openTrivia.js';
import { wasQuestionAskedRecently, recordQuestionAsked, setActiveQuiz } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODING_QUESTIONS = JSON.parse(readFileSync(path.join(__dirname, 'codingQuestions.json'), 'utf-8'));

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function pickLocalQuestion(groupJid) {
  const unseen = CODING_QUESTIONS.filter((q) => !wasQuestionAskedRecently(groupJid, q.key));
  const pool = unseen.length > 0 ? unseen : CODING_QUESTIONS; // if all seen, allow repeats rather than failing
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get a fresh quiz question for a group, preferring live trivia (for variety)
 * with the local coding bank as a reliable fallback if the API fails or the
 * type is explicitly 'coding'. Persists it as the group's active quiz.
 */
export async function startQuiz(groupJid, type = 'random') {
  let picked;

  if (type === 'coding') {
    picked = pickLocalQuestion(groupJid);
  } else {
    try {
      const triviaType = type === 'random' ? (Math.random() < 0.5 ? 'tech' : 'general') : type;
      let attempt = await fetchTriviaQuestion(triviaType);
      let tries = 0;
      while (wasQuestionAskedRecently(groupJid, attempt.key) && tries < 3) {
        attempt = await fetchTriviaQuestion(triviaType);
        tries++;
      }
      picked = attempt;
    } catch {
      picked = pickLocalQuestion(groupJid); // API unavailable — fall back to local bank
    }
  }

  recordQuestionAsked(groupJid, picked.key);
  setActiveQuiz(groupJid, {
    question: picked.question,
    options: picked.options,
    correctIndex: picked.correctIndex,
    questionKey: picked.key
  });

  return picked;
}

export function formatQuizMessage(category, question, options, prefix) {
  const lines = options.map((opt, i) => `${OPTION_LABELS[i]}. ${opt}`);
  return (
    `🧠 *Quiz Time!* (${category})\n\n` +
    `${question}\n\n` +
    `${lines.join('\n')}\n\n` +
    `Reply with ${prefix}answer <letter> — first correct answer wins!`
  );
}

export { OPTION_LABELS };
