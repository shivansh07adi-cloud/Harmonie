import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

let client = null;
export function getGeminiClient() {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is not set in .env');
  if (!client) client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  return client;
}

// Tried in order. Different models can independently be unavailable on a
// given key/project (NOT_FOUND) or have separate daily-request budgets
// (RESOURCE_EXHAUSTED) — either failure mode means "try the next model",
// not "give up". Only genuinely fatal errors (bad key, malformed request)
// should stop the chain immediately.
export const GEMINI_FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];

function isRetryableOnNextModel(e) {
  const msg = e?.message || String(e);
  return /RESOURCE_EXHAUSTED|exceeded your current quota|\b429\b|NOT_FOUND|is no longer available|not found for API version|not supported/i.test(msg);
}

/**
 * Calls ai.models.generateContent(buildParams(model)) for each model in
 * `models`, in order, moving to the next whenever the failure looks like
 * that particular model being unavailable or out of quota on this key.
 * Genuinely fatal errors (auth/key problems, bad request) are thrown
 * immediately instead of retried across every model.
 */
export async function generateContentWithFallback(buildParams, models = GEMINI_FALLBACK_MODELS) {
  const ai = getGeminiClient();
  let lastError;
  for (const model of models) {
    try {
      return await ai.models.generateContent(buildParams(model));
    } catch (e) {
      lastError = e;
      console.error(`[gemini] model "${model}" failed:`, e?.message || e); // TEMP debug — remove once diagnosed
      if (!isRetryableOnNextModel(e)) throw e;
    }
  }
  throw lastError;
}