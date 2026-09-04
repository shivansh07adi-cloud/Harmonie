import { Type } from '@google/genai';
import { generateContentWithFallback } from './geminiClient.js';

/**
 * Translation via Gemini rather than the free translate.googleapis.com
 * endpoint — that endpoint's auto-detect is unreliable on short text
 * containing names (e.g. "I am shivansh" gets misdetected as Hindi, so a
 * "hi" target matches the "detected" source and it silently skips
 * translating). Gemini handles short/ambiguous text detection far better,
 * and this project already has a Gemini key wired up for !search/!analytics.
 */
export async function translateText(text, targetLang) {
  const response = await generateContentWithFallback((model) => ({
    model,
    contents:
      `Detect the language of this text, then translate it into "${targetLang}" ` +
      `(a language code or name). Return only the translation itself in translated_text — ` +
      `no notes, no quotes, no explanation.\n\nText:\n${text}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detected_lang: { type: Type.STRING, description: 'Short ISO 639-1 code or language name of the input text' },
          translated_text: { type: Type.STRING }
        },
        required: ['detected_lang', 'translated_text']
      }
    }
  }));

  const parsed = JSON.parse(response.text);
  return { translated: parsed.translated_text, detectedLang: parsed.detected_lang };
}
