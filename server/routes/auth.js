// Sign-up, login, two-factor, password reset, email verification.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { app } = require('../app');
const { JWT_SECRET } = require('../config');
const { APP, mailHtml, sendMail } = require('../lib/mail');
const { failLogin, okLogin, sign, useSecondFactor } = require('../lib/security');
const { mine } = require('../lib/shape');
const { User } = require('../models');

app.post('/api/auth/register', async (req, res) => {
  const { username, password, name } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password needs 8+ characters' });
  try {
    const owner = !(await User.exists({})) || String(username).toLowerCase() === (process.env.OWNER_USERNAME || '').toLowerCase();
    const u = await User.create({ username, name: (name || username).slice(0, 30), hash: await bcrypt.hash(password, 10), admin: owner, badge: owner ? 'owner' : '' });
    res.json({ token: sign(u), user: mine(u) });
  } catch (e) {
    res.status(400).json({ error: e.code === 11000 ? 'Username taken' : 'Username: 3-15 letters, numbers or _' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const u = await User.findOne({ username: String(req.body.username || '').toLowerCase() });
  if (u && u.lockUntil > new Date()) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.hash))) { if (u) await failLogin(u); return res.status(401).json({ error: 'Wrong username or password' }); }
  if (u.twofa?.enabled) return res.json({ needs2fa: true, ticket: jwt.sign({ id: u.id, t: '2fa' }, JWT_SECRET, { expiresIn: '5m' }) });
  await okLogin(u); res.json({ token: sign(u), user: mine(u) });
});

app.post('/api/auth/2fa', async (req, res) => {
  let p; try { p = jwt.verify(String(req.body.ticket || ''), JWT_SECRET); } catch { return res.status(401).json({ error: 'That sign-in expired. Start again.' }); }
  const u = p.t === '2fa' && (await User.findById(p.id));
  if (!u?.twofa?.enabled) return res.status(401).json({ error: 'That sign-in expired. Start again.' });
  if (u.lockUntil > new Date()) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  if (!(await useSecondFactor(u, req.body.code))) { await failLogin(u); return res.status(401).json({ error: 'That code didn’t work' }); }
  await okLogin(u); res.json({ token: sign(u), user: mine(u) });
});

// password reset and email verification use short-lived signed links (`t` marks them so they can never act as login tokens)
app.post('/api/auth/forgot', async (req, res) => {
  const id = String(req.body.identifier || '').trim().toLowerCase().slice(0, 120);
  const u = id ? await User.findOne(id.includes('@') ? { email: id, emailVerified: true } : { username: id }) : null;
  if (u?.email && u.emailVerified && !(u.resetAt && Date.now() - u.resetAt < 60000)) {
    const link = `${APP(req)}/#/reset/${jwt.sign({ id: u.id, t: 'reset', ph: u.hash.slice(-12) }, JWT_SECRET, { expiresIn: '1h' })}`;
    await User.updateOne({ _id: u._id }, { resetAt: new Date() });
    await sendMail(u.email, 'Reset your Unvia password', `Reset your password (valid for 1 hour): ${link}\n\nIf you didn’t ask for this, you can ignore this email.`, mailHtml('Reset your password', 'Use the button below within the next hour. If you didn’t ask for this, you can ignore this email.', link, 'Choose a new password'));
  } else if (u && !u.emailVerified) console.log(`[forgot] @${u.username} has no verified email; owner can generate a reset link in the admin panel`);
  res.json({ ok: true }); // same answer whether or not the account exists
});

app.post('/api/auth/reset', async (req, res) => {
  let p; try { p = jwt.verify(String(req.body.token || ''), JWT_SECRET); } catch { return res.status(400).json({ error: 'This link has expired or was already used' }); }
  const u = p.t === 'reset' && (await User.findById(p.id));
  if (!u || u.hash.slice(-12) !== p.ph) return res.status(400).json({ error: 'This link has expired or was already used' });
  if (String(req.body.password || '').length < 8) return res.status(400).json({ error: 'Password needs 8+ characters' });
  u.hash = await bcrypt.hash(req.body.password, 10); u.sv = (u.sv || 0) + 1; u.fails = undefined; u.lockUntil = undefined; await u.save(); // other devices are signed out; 2FA (if on) is still required to log in
  res.json({ ok: true });
});

app.post('/api/auth/verify', async (req, res) => {
  let p; try { p = jwt.verify(String(req.body.token || ''), JWT_SECRET); } catch { return res.status(400).json({ error: 'This link has expired' }); }
  const u = p.t === 'verify' && (await User.findById(p.id));
  if (!u || u.pendingEmail !== p.e) return res.status(400).json({ error: 'This link has expired' });
  if (await User.exists({ email: p.e, _id: { $ne: u._id } })) return res.status(409).json({ error: 'That email is already in use' });
  u.email = p.e; u.emailVerified = true; u.pendingEmail = undefined; await u.save();
  res.json({ ok: true, email: p.e });
});
