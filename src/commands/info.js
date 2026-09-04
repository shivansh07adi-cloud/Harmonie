import { config } from '../config.js';
import { getWeather } from '../utils/weather.js';
import { getWikiSummary } from '../utils/wiki.js';
import { searchWithGemini } from '../utils/gemini.js';
import { translateText } from '../utils/translate.js';
import { textToSpeechOgg } from '../utils/ttsMaker.js';
import { friendlyApiError } from '../utils/friendlyError.js';

export const commands = [
  {
    names: ['weather'],
    description: 'Get current weather for a city',
    usage: 'weather <city>',
    category: 'Info',
    async run(ctx) {
      if (!ctx.fullTextAfterCommand) return ctx.reply(`Usage: ${config.prefix}weather <city>`);
      try {
        const w = await getWeather(ctx.fullTextAfterCommand);
        return ctx.reply(
          `*${w.place}*\n${w.condition}\n` +
            `Temp: ${w.temperature}${w.units.temperature_2m} (feels like ${w.feelsLike}${w.units.apparent_temperature})\n` +
            `Humidity: ${w.humidity}${w.units.relative_humidity_2m}\n` +
            `Wind: ${w.windSpeed}${w.units.wind_speed_10m}`
        );
      } catch (e) {
        return ctx.reply(e.message);
      }
    }
  },
  {
    names: ['wiki', 'wikipedia'],
    description: 'Get Wikipedia summary for a topic',
    usage: 'wiki <query>',
    category: 'Info',
    async run(ctx) {
      if (!ctx.fullTextAfterCommand) return ctx.reply(`Usage: ${config.prefix}wiki <query>`);
      try {
        const w = await getWikiSummary(ctx.fullTextAfterCommand);
        return ctx.reply(`*${w.title}*\n\n${w.extract}\n\n${w.url || ''}`);
      } catch (e) {
        return ctx.reply(e.message);
      }
    }
  },
  {
    names: ['search', 'gs', 'google', 'googlesearch'],
    description: 'Search on Google (via Gemini, with live web grounding)',
    usage: 'search | gs <query>',
    category: 'Info',
    async run(ctx) {
      if (!ctx.fullTextAfterCommand) return ctx.reply(`Usage: ${config.prefix}search <query>`);
      try {
        const answer = await searchWithGemini(ctx.fullTextAfterCommand);
        return ctx.reply(answer);
      } catch (e) {
        console.error('[!search] raw error:', e); // TEMP debug logging — remove once diagnosed
        return ctx.reply(`Search failed: ${friendlyApiError(e)}`);
      }
    }
  },
  {
    names: ['tr', 'translate'],
    description: 'Translate text to any language',
    usage: 'tr <lang_code> <text> | reply to a message',
    category: 'Info',
    async run(ctx) {
      const langCode = ctx.args[0];
      let text = ctx.args.slice(1).join(' ');
      if (!text && ctx.quotedMessage) {
        text = ctx.quotedMessage.conversation || ctx.quotedMessage.extendedTextMessage?.text || '';
      }
      if (!langCode || !text) {
        return ctx.reply(`Usage: ${config.prefix}tr <lang_code> <text>  (or reply to a message with ${config.prefix}tr <lang_code>)`);
      }
      // A real language code/name is at least 2 letters — catches cases like
      // "!tr I am shivansh" where the first word of a sentence gets mistaken
      // for the language, which otherwise silently mistranslates.
      if (!/^[a-z]{2,}(-[a-z]{2,4})?$/i.test(langCode)) {
        return ctx.reply(
          `"${langCode}" doesn't look like a language. Usage: ${config.prefix}tr <lang> <text> — e.g. ${config.prefix}tr hindi I am shivansh`
        );
      }
      try {
        const { translated, detectedLang } = await translateText(text, langCode);
        return ctx.reply(`(${detectedLang} → ${langCode})\n${translated}`);
      } catch (e) {
        return ctx.reply(`Translation failed: ${friendlyApiError(e)}`);
      }
    }
  },
  {
    names: ['say', 'tts_voice'],
    description: 'Convert text to speech (supports English and Hindi)',
    usage: 'say <text> | say hin <hindi text> | reply to message with say',
    category: 'Info',
    async run(ctx) {
      let lang = 'en';
      let text = ctx.fullTextAfterCommand;

      if (/^hin\s+/i.test(text)) {
        lang = 'hi';
        text = text.replace(/^hin\s+/i, '');
      }
      if (!text && ctx.quotedMessage) {
        text = ctx.quotedMessage.conversation || ctx.quotedMessage.extendedTextMessage?.text || '';
      }
      if (!text) {
        return ctx.reply(`Usage: ${config.prefix}say <text> | ${config.prefix}say hin <hindi text> | reply to a message with ${config.prefix}say`);
      }

      try {
        const ogg = await textToSpeechOgg(text, lang);
        return ctx.replyVoiceNote(ogg);
      } catch (e) {
        return ctx.reply(`TTS failed: ${e.message}`);
      }
    }
  }
];
