import 'dotenv/config';

export const config = {
  prefix: process.env.PREFIX || '!',
  botName: process.env.BOT_NAME || 'Bot',
  devName: process.env.DEV_NAME || 'Shivansh Kumar',
  devContact: process.env.DEV_CONTACT || '',
  devLinkedin: process.env.DEV_LINKEDIN || '',
  devGithub: process.env.DEV_GITHUB || '',
  portfolioLink: process.env.PORTFOLIO_LINK || '',
  devPhotoPath: process.env.DEV_PHOTO_PATH || '',
  repoLink: process.env.REPO_LINK || '',
  donateLink: process.env.DONATE_LINK || '',
  donateQrPath: process.env.DONATE_QR_PATH || './assets/donate/qr.png',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  sessionDir: process.env.SESSION_DIR || './store/session',
  dbPath: process.env.DB_PATH || './store/bot.db',
  ownerNumbers: (process.env.OWNER_NUMBERS || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean),
  dailyQuizTime: process.env.DAILY_QUIZ_TIME || '10:00', // HH:MM in IST
  dailyAnalyticsTime: process.env.DAILY_ANALYTICS_TIME || '23:00' // HH:MM in IST
};
