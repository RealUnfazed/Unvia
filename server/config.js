// Environment settings, production safety checks and push-notification setup.

require('dotenv').config();

const { MONGODB_URI, JWT_SECRET = 'dev-secret', POSTFILE_API_KEY } = process.env;

let webpush; try { webpush = require('web-push'); } catch { /* optional: push stays off without it */ }

const PUSH = !!(webpush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

if (PUSH) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

const PROD = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

// A guessable secret lets anyone forge login tokens, so production refuses to start without a real one.
if (PROD && (JWT_SECRET === 'dev-secret' || String(JWT_SECRET).length < 24)) throw new Error('JWT_SECRET must be set to a long random value (24+ characters) in production.');

const PF = 'https://postfile.net/v1', pfH = { 'X-API-Key': POSTFILE_API_KEY };

module.exports = { JWT_SECRET, MONGODB_URI, PF, POSTFILE_API_KEY, PROD, PUSH, pfH, webpush };
