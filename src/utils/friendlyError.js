/**
 * Collapse a raw SDK/HTTP error (often a huge JSON blob, e.g. Gemini's
 * RESOURCE_EXHAUSTED quota errors) into a short, clean message safe to send
 * straight to a chat, instead of dumping the raw error text at the user.
 */
export function friendlyApiError(e) {
  const msg = e?.message || String(e);

  if (/UNAUTHENTICATED|ACCESS_TOKEN_TYPE_UNSUPPORTED|API key not valid|invalid authentication credentials/i.test(msg)) {
    return "The bot's Gemini API key isn't being accepted — the bot owner needs to check GEMINI_API_KEY in .env (this is an auth/key problem, not usage running out).";
  }
  if (/RESOURCE_EXHAUSTED|exceeded your current quota/i.test(msg)) {
    return "This is out of API quota for now — try again later, or ask the bot owner to check the plan/billing.";
  }
  if (/is no longer available|NOT_FOUND/i.test(msg) && /model/i.test(msg)) {
    return "The AI model backing this command needs to be updated on the bot's end — please let the bot owner know.";
  }
  if (/\b429\b/.test(msg)) {
    return "Getting rate-limited right now — please try again in a minute.";
  }
  if (/\b(500|502|503|504)\b/.test(msg)) {
    return "The upstream service is having trouble right now — please try again shortly.";
  }
  return msg;
}
