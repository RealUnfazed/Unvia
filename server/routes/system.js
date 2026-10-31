// Health check.
const { app } = require('../app');
const { PUSH } = require('../config');
const { mailReady } = require('../lib/mail');

// Open /api/health to check routing and the database: {"ok":true} means requests reach the server and MongoDB answered.
app.get('/api/health', (_q, res) => res.json({ ok: true, push: PUSH, mail: mailReady() }));
