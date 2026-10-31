// Everything that runs before the routes: security headers, JSON/CORS, database + login binding, rate limiting.
const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const { app } = require('./app');
const { JWT_SECRET, PROD } = require('./config');
const { db } = require('./db');
const { RULES, clientIp, dbStore, hit, memAllow, tooMany } = require('./lib/ratelimit');
const { User } = require('./models');

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'", ...(PROD && { 'Strict-Transport-Security': 'max-age=15552000; includeSubDomains' }) });
  next();
});

app.use(cors(), express.json());

app.use('/api', async (req, _s, next) => {
  await db();
  try { const p = jwt.verify((req.headers.authorization || '').slice(7), JWT_SECRET), u = p.t ? null : await User.findById(p.id); if (u && (u.sv || 0) === (p.sv || 0)) req.me = u; } catch {}
  const ow = (process.env.OWNER_USERNAME || '').toLowerCase();
  if (req.me && ow && !req.me.admin && req.me.username === ow) { req.me.admin = true; req.me.badge = 'owner'; await req.me.save(); }
  next();
});

app.use('/api', async (req, res, next) => {
  try {
    const ip = clientIp(req), path = req.originalUrl.split('?')[0];
    if (!memAllow(ip)) return tooMany(res, 30);
    for (const [m, re, name, max, sec, by] of RULES) {
      if (m !== req.method || !re.test(path)) continue;
      const r = await hit(dbStore, { name, max, sec }, by === 'user' && req.me ? req.me.id : ip);
      if (!r.ok) return tooMany(res, r.retry);
    }
  } catch { /* never let the limiter itself break the site */ }
  next();
});
