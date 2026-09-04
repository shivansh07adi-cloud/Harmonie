import { generateContentWithFallback } from './geminiClient.js';

/**
 * Answer a search-style query using Gemini with Google Search grounding enabled,
 * so it behaves like a real search command rather than a plain chat reply.
 */
export async function searchWithGemini(query) {
  const response = await generateContentWithFallback((model) => ({
    model,
    contents: query,
    config: {
      tools: [{ googleSearch: {} }]
    }
  }));
  return response.text?.trim() || 'No answer found.';
}

/**
 * Answer a question as the bot's assistant persona when someone @-mentions it
 * in a group, or messages it directly. Keeps Google Search grounding on so
 * factual/current questions are actually accurate, but frames the response
 * as a concise chat reply rather than a search-result dump.
 */
export async function askAssistant(question, botName) {
  const response = await generateContentWithFallback((model) => ({
    model,
    contents: question,
    config: {
      systemInstruction:
        `You are ${botName || 'the bot'}, a helpful assistant answering questions inside a WhatsApp ` +
        `group chat. Keep replies concise and conversational — a few sentences, not an essay, ` +
        `unless the question genuinely needs more detail. No markdown headers or bullet-heavy ` +
        `formatting; write like a knowledgeable person texting back, not a report.`,
      tools: [{ googleSearch: {} }]
    }
  }));
  return response.text?.trim() || "I couldn't come up with an answer for that.";
}
