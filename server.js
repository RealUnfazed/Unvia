require('dotenv').config();
const express = require('express'), cors = require('cors'), mongoose = require('mongoose'), bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'), multer = require('multer'), path = require('path');
const dns = require('dns').promises, net = require('net'), crypto = require('crypto');

const { MONGODB_URI, JWT_SECRET = 'dev-secret', POSTFILE_API_KEY } = process.env;
const PF = 'https://postfile.net/v1', pfH = { 'X-API-Key': POSTFILE_API_KEY };

let conn; // cached so serverless invocations reuse the connection
const db = () => (conn ||= mongoose.connect(MONGODB_URI));
const Id = mongoose.Schema.Types.ObjectId;
const M = (n, s) => mongoose.models[n] || mongoose.model(n, new mongoose.Schema(s, { timestamps: true }));
const User = M('User', {
  username: { type: String, unique: true, lowercase: true, trim: true, match: /^[a-z0-9_]{3,15}$/ },
  name: String, bio: { type: String, default: '', maxlength: 160 }, hash: String,
  following: [Id], bookmarks: [Id], blocked: [Id], muted: [Id], pinned: Id, protected: Boolean, followRequests: [Id], mutedWords: [String], location: String, website: String, birthday: Date, birthdayVisible: String,
  email: { type: String, lowercase: true, trim: true, unique: true, sparse: true }, emailVerified: Boolean, pendingEmail: String, resetAt: Date,
  twofa: { secret: String, enabled: Boolean, backup: [String] }, sv: { type: Number, default: 0 }, fails: Number, lockUntil: Date, avatar: String, banner: String, badge: { type: String, default: '' }, admin: Boolean, banned: Boolean,
  ghost: Boolean, fake: mongoose.Schema.Types.Mixed, // { target, mode: 'instant'|'gradual', startAt, endAt, startVal }
});
const Post = M('Post', {
  author: { type: Id, ref: 'User', index: true }, text: { type: String, maxlength: 280, default: '' },
  media: { url: String, fileId: String }, likes: [Id], reposts: [Id], replies: { type: Number, default: 0 }, saves: { type: Number, default: 0 },
  parent: { type: Id, index: true }, repostOf: { type: Id, ref: 'Post' }, quoteOf: { type: Id, ref: 'Post' }, quoteDeleted: Boolean, quotes: { type: Number, default: 0 }, visibleAt: Date, scheduled: Boolean, editedAt: Date, replyLimit: String,
  images: [{ _id: false, url: String, fileId: String }],
  poll: { options: [{ _id: false, text: String, votes: [Id] }], endsAt: Date },
  preview: { url: String, title: String, description: String, image: String, site: String },
  fake: { likes: mongoose.Schema.Types.Mixed, reposts: mongoose.Schema.Types.Mixed, saves: mongoose.Schema.Types.Mixed },
});

const Report = M('Report', { by: { type: Id, ref: 'User' }, post: { type: Id, ref: 'Post' }, user: { type: Id, ref: 'User' }, reason: String, status: { type: String, default: 'open' } });
const Notif = M('Notif', { to: { type: Id, index: true }, from: { type: Id, ref: 'User' }, type: String, post: { type: Id, ref: 'Post' }, read: { type: Boolean, default: false }, visibleAt: Date });
const Draft = M('Draft', { user: { type: Id, index: true }, text: String });
// Direct messages. `reads` holds each member's last-read time (read receipts) and `clr` (when they cleared the chat).
// `requestFor` is set while a 1:1 chat from someone the recipient doesn't follow waits for acceptance.
const Conv = M('Conv', { members: [{ type: Id, ref: 'User' }], group: Boolean, name: String, owner: Id, requestFor: Id, lastAt: Date, lastText: String, lastFrom: Id, reads: [{ _id: false, u: Id, at: Date, clr: Date }] });
const Msg = M('Msg', { conv: { type: Id, index: true }, from: { type: Id, ref: 'User' }, text: String, image: { url: String, fileId: String }, deleted: Boolean });
const has = (a, id) => a.some((x) => String(x) === String(id));
// Users whose content I shouldn't see: ones I blocked or muted, plus ones who blocked me.
const hiddenFor = async (me) => (me ? [...new Set([...me.blocked, ...me.muted, ...(await User.distinct('_id', { blocked: me._id }))].map(String))] : []);
const hiddenPosts = async (me) => {
  const base = await hiddenFor(me);
  const prot = await User.distinct('_id', { protected: true, ...(me ? { _id: { $nin: [me._id, ...me.following] } } : {}) });
  return [...new Set([...base, ...prot.map(String)])];
};
// One notification per (recipient, sender, type, post); upsert makes repeat likes/follows idempotent.
async function notify(to, from, type, post, at) {
  if (!to || String(to) === String(from)) return;
  await Notif.updateOne({ to, from, type, post: post || null }, { $setOnInsert: { read: false, ...(at && { visibleAt: at }) } }, { upsert: true });
}
const unnotify = (to, from, type, post) => Notif.deleteOne({ to, from, type, post: post || null });
// Interpolates a fake count between startVal and target as `now` moves from startAt to endAt; no background job needed.
function fakeVal(f) {
  if (!f || !f.target) return 0;
  if (f.mode !== 'gradual') return f.target;
  const now = Date.now(), s = +new Date(f.startAt), e = +new Date(f.endAt);
  if (!s || !e || now >= e) return f.target;
  if (now <= s) return f.startVal || 0;
  return Math.round((f.startVal || 0) + (f.target - (f.startVal || 0)) * (now - s) / (e - s));
}
// Posts scheduled to appear later (fake replies spread over time) are hidden from lists until their moment arrives.
const visible = () => ({ $or: [{ visibleAt: null }, { visibleAt: { $exists: false } }, { visibleAt: { $lte: new Date() } }] });
const pub = (u) => ({ id: u.id, username: u.username, name: u.name, bio: u.bio, avatar: u.avatar, banner: u.banner, badge: u.badge, admin: !!u.admin, pinned: u.pinned ? String(u.pinned) : null, protected: !!u.protected });
const pop = (q) => q.populate('author').populate({ path: 'repostOf', populate: { path: 'author' } }).populate({ path: 'quoteOf', populate: { path: 'author' } });
const replyMsg = (o) => (o.replyLimit === 'following' ? `Only accounts @${o.author?.username} follows can reply` : 'Only people mentioned in this post can reply');
const canReplyTo = (o, me) => {
  const rl = o.replyLimit || 'all';
  if (rl === 'all' || !me || !o.author || String(o.author._id ?? o.author) === me.id) return true;
  if (rl === 'following') return has(o.author.following || [], me.id);
  return new RegExp(`(^|\\s)@${me.username}\\b`, 'i').test(o.text || '');
};
const pollShape = (o, me) => {
  const q = o.poll; if (!q?.options?.length) return null;
  const total = q.options.reduce((a, x) => a + x.votes.length, 0);
  return { options: q.options.map((x) => ({ text: x.text, votes: x.votes.length })), total, endsAt: q.endsAt, ended: q.endsAt < new Date(), voted: me ? q.options.findIndex((x) => has(x.votes, me.id)) : -1 };
};
const shape = (p, me) => {
  const o = p.repostOf?.author ? p.repostOf : p;
  return {
    id: o.id, text: o.text, media: o.media?.url, images: (o.images?.length ? o.images : o.media?.url ? [o.media] : []).map((i) => i.url), at: o.createdAt, author: o.author && pub(o.author),
    edited: !!o.editedAt, replyLimit: o.replyLimit || 'all', canReply: canReplyTo(o, me), poll: pollShape(o, me), scheduled: !!(o.scheduled && o.visibleAt && o.visibleAt > new Date()),
    preview: o.preview?.title ? { url: o.preview.url, title: o.preview.title, description: o.preview.description, image: o.preview.image, site: o.preview.site } : null,
    likes: o.likes.length + fakeVal(o.fake?.likes), liked: !!me && has(o.likes, me.id),
    reposts: o.reposts.length + (o.quotes || 0) + fakeVal(o.fake?.reposts), reposted: !!me && has(o.reposts, me.id),
    replies: o.replies, reply: !!o.parent, bookmarked: !!me && has(me.bookmarks, o.id), saves: (o.saves || 0) + fakeVal(o.fake?.saves),
    quoted: o.quoteOf ? { id: o.quoteOf.id, text: o.quoteOf.text, media: o.quoteOf.media?.url, at: o.quoteOf.createdAt, author: o.quoteOf.author && pub(o.quoteOf.author) } : (o.quoteDeleted ? { deleted: true } : null),
    repostBy: p === o ? null : pub(p.author), feedAt: p.createdAt,
  };
};

const app = express();
app.use(cors(), express.json());
app.use('/api', async (req, _s, next) => {
  await db();
  try { const p = jwt.verify((req.headers.authorization || '').slice(7), JWT_SECRET), u = p.t ? null : await User.findById(p.id); if (u && (u.sv || 0) === (p.sv || 0)) req.me = u; } catch {}
  const ow = (process.env.OWNER_USERNAME || '').toLowerCase();
  if (req.me && ow && !req.me.admin && req.me.username === ow) { req.me.admin = true; req.me.badge = 'owner'; await req.me.save(); }
  next();
});
const auth = (req, res, next) => (req.me && !req.me.banned ? next() : res.status(req.me ? 403 : 401).json({ error: req.me ? 'Account suspended' : 'Log in first' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
// `sv` (session version) is bumped on password change / reset / 2FA changes / "log out everywhere", which invalidates older tokens.
const sign = (u) => jwt.sign({ id: u.id, sv: u.sv || 0 }, JWT_SECRET, { expiresIn: '30d' });
const mine = (u) => ({ ...pub(u), mutedWords: u.mutedWords || [], email: u.email || null, emailVerified: !!u.emailVerified, pendingEmail: u.pendingEmail || null, twofa: !!u.twofa?.enabled,
  requests: (u.followRequests || []).length, location: u.location || '', website: u.website || '', birthday: u.birthday ? u.birthday.toISOString().slice(0, 10) : '', birthdayVisible: u.birthdayVisible || 'none' });
const bornText = (u) => (!u.birthday || !['monthday', 'full'].includes(u.birthdayVisible) ? '' : u.birthday.toLocaleDateString('en-US', u.birthdayVisible === 'full' ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' } : { month: 'long', day: 'numeric', timeZone: 'UTC' }));
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
// TOTP (RFC 6238) with Node's crypto, so no extra dependency
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32enc = (buf) => { let bits = '', out = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; };
const b32dec = (str) => { let bits = ''; for (const c of str.replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(c); if (v >= 0) bits += v.toString(2).padStart(5, '0'); } const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const hotp = (secret, counter) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(counter)); const h = crypto.createHmac('sha1', b32dec(secret)).update(b).digest(), o = h[19] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const totpOk = (secret, code) => /^\d{6}$/.test(String(code).trim()) && [-1, 0, 1].some((d) => safeEq(hotp(secret, Math.floor(Date.now() / 30000) + d), String(code).trim()));
// Repeated wrong passwords/codes lock the account for 15 minutes (per-IP limits come in the production phase)
async function failLogin(u) { const n = (u.fails || 0) + 1; await User.updateOne({ _id: u._id }, n >= 10 ? { fails: 0, lockUntil: new Date(Date.now() + 15 * 60000) } : { fails: n }); }
const okLogin = async (u) => { if (u.fails || u.lockUntil) await User.updateOne({ _id: u._id }, { $unset: { fails: 1, lockUntil: 1 } }); };
async function useSecondFactor(u, raw) { // authenticator code, or a one-time backup code
  const code = String(raw || '').trim();
  if (/^\d{6}$/.test(code)) return totpOk(u.twofa.secret, code);
  const h = sha(code.replace(/[^a-f0-9]/gi, '').toLowerCase());
  return (await User.updateOne({ _id: u._id, 'twofa.backup': h }, { $pull: { 'twofa.backup': h } })).modifiedCount === 1;
}
// Email via Resend's HTTP API. Without RESEND_API_KEY the message is logged instead (and the owner can use admin reset links).
const mailReady = () => !!process.env.RESEND_API_KEY;
async function sendMail(to, subject, text, html) {
  if (!mailReady()) { console.log(`[mail not configured] To: ${to}\nSubject: ${subject}\n${text}`); return false; }
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.MAIL_FROM || 'Unvia <onboarding@resend.dev>', to: [to], subject, text, html }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) console.log('[mail failed]', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) { console.log('[mail error]', e.message); return false; }
}
const mailHtml = (title, body, link, cta) => `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px"><h2>${title}</h2><p>${body}</p><p><a href="${link}" style="display:inline-block;background:#0ea5e9;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700">${cta}</a></p><p style="color:#71717a;font-size:13px">If the button doesn’t work, paste this into your browser:<br>${link}</p></div>`;
const APP = (req) => process.env.APP_URL || `${/^(localhost|127\.)/.test(req.headers.host || '') ? 'http' : 'https'}://${req.headers.host}`;

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

app.get('/api/me', auth, (req, res) => res.json({ user: mine(req.me) }));
app.patch('/api/me', auth, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), async (req, res) => {
  req.me.name = String(req.body.name || req.me.name).slice(0, 30);
  req.me.bio = String(req.body.bio || '').slice(0, 160);
  for (const k of ['avatar', 'banner']) {
    const f = req.files?.[k]?.[0];
    if (f?.mimetype.startsWith('image/')) { const r = await pfUpload(f); if (!r) return res.status(502).json({ error: 'Image upload failed' }); req.me[k] = r.url; }
  }
  if ('location' in req.body) req.me.location = String(req.body.location).trim().slice(0, 30);
  if ('website' in req.body) {
    const w = String(req.body.website).trim();
    if (!w) req.me.website = '';
    else { try { const url = new URL(/^https?:\/\//i.test(w) ? w : 'https://' + w); if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) throw 0; req.me.website = url.href.slice(0, 100); } catch { return res.status(400).json({ error: 'That website doesn’t look right' }); } }
  }
  if ('birthday' in req.body) {
    if (!req.body.birthday) req.me.birthday = undefined;
    else { const d = new Date(req.body.birthday + 'T00:00:00Z'), yrs = (Date.now() - d) / 31557600000; if (isNaN(d) || yrs < 13 || yrs > 120) return res.status(400).json({ error: 'Enter a valid birthday (you must be at least 13)' }); req.me.birthday = d; }
  }
  if (['none', 'monthday', 'full'].includes(req.body.birthdayVisible)) req.me.birthdayVisible = req.body.birthdayVisible;
  await req.me.save();
  res.json({ user: mine(req.me) });
});

// feed = all | following | bookmarks | user:<name> | replies:<name> | media:<name> | likes:<name> (own only); paginated by `before`
app.get('/api/posts', async (req, res) => {
  const { feed = 'all', before } = req.query, me = req.me, f = { parent: null }, hidden = await hiddenPosts(me);
  let pinnedUser;
  if (feed === 'following') { if (!me) return res.json([]); f.author = { $in: [...me.following, me.id].filter((x) => !hidden.includes(String(x))) }; }
  else if (feed === 'bookmarks') { if (!me) return res.json([]); delete f.parent; f._id = { $in: me.bookmarks }; if (hidden.length) f.author = { $nin: hidden }; }
  else if (/^(user|replies|media|likes):/.test(feed)) {
    const [kind, name] = [feed.split(':')[0], feed.slice(feed.indexOf(':') + 1).toLowerCase()];
    const u = await User.findOne({ username: name });
    if (!u || (me && (u.blocked || []).some((x) => String(x) === me.id))) return res.json([]); // they blocked me
    if (u.protected && me?.id !== u.id && !has(me?.following || [], u.id)) return res.json([]); // protected: followers only
    if (kind === 'likes') { if (me?.id !== u.id) return res.json([]); delete f.parent; f.likes = u._id; if (hidden.length) f.author = { $nin: hidden }; }
    else { f.author = u._id; if (kind === 'replies') f.parent = { $ne: null }; if (kind === 'media') { f['media.url'] = { $exists: true, $ne: null }; f.repostOf = null; } if (kind === 'user') pinnedUser = u; }
  } else if (hidden.length) f.author = { $nin: hidden };
  if (before) f.createdAt = { $lt: new Date(before) };
  let out = (await pop(Post.find({ ...f, ...visible() }).sort('-createdAt').limit(20))).map((p) => shape(p, me));
  if (pinnedUser?.pinned && !before) { // pinned post leads the first page of a profile
    const pp = await pop(Post.findById(pinnedUser.pinned));
    if (pp) out = [{ ...shape(pp, me), pinned: true }, ...out.filter((x) => x.id !== pp.id)];
  }
  res.json(out);
});

app.get('/api/posts/refresh', async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter((x) => /^[a-f0-9]{24}$/.test(x)).slice(0, 150);
  if (!ids.length) return res.json([]);
  res.json((await pop(Post.find({ _id: { $in: ids }, author: { $nin: await hiddenPosts(req.me) }, ...visible() }))).map((p) => shape(p, req.me)));
});

app.get('/api/posts/:id', async (req, res) => {
  const p = await pop(Post.findById(req.params.id));
  if (!p) return res.sendStatus(404);
  if (p.visibleAt && p.visibleAt > new Date() && String(p.author?._id) !== req.me?.id) return res.sendStatus(404);
  const hidden = await hiddenPosts(req.me);
  if (p.author?.protected && String(p.author._id) !== req.me?.id && !has(req.me?.following || [], p.author.id)) return res.sendStatus(404);
  const [rs, par] = await Promise.all([pop(Post.find({ parent: p._id, author: { $nin: hidden }, ...visible() }).sort('createdAt').limit(50)), p.parent ? pop(Post.findById(p.parent)) : null]);
  res.json({ post: shape(p, req.me), parent: par && shape(par, req.me), replies: rs.map((r) => shape(r, req.me)) });
});

const EDIT_MS = 60 * 60 * 1000;
app.post('/api/posts', auth, upload.array('image', 4), async (req, res) => {
  const text = (req.body.text || '').trim().slice(0, 280), files = req.files || [], parent = req.body.parent || undefined;
  const quoteOf = /^[a-f0-9]{24}$/.test(req.body.quote || '') && (await Post.exists({ _id: req.body.quote })) ? req.body.quote : undefined;
  if (quoteOf) { const qa = (await Post.findById(quoteOf).select('author')).author; if (String(qa) !== req.me.id && (await User.exists({ _id: qa, protected: true }))) return res.status(403).json({ error: 'Posts from protected accounts can’t be quoted' }); }
  let poll;
  if (req.body.poll) {
    if (parent) return res.status(400).json({ error: 'Replies can’t have polls' });
    if (files.length || req.body.gif) return res.status(400).json({ error: 'Polls can’t have images' });
    try {
      const pl = JSON.parse(req.body.poll);
      const opts = (Array.isArray(pl.options) ? pl.options : []).map((x) => String(x).trim().slice(0, 25)).filter(Boolean);
      if (opts.length < 2 || opts.length > 4) return res.status(400).json({ error: 'A poll needs 2 to 4 choices' });
      poll = { options: opts.map((t) => ({ text: t, votes: [] })), endsAt: new Date(Date.now() + Math.min(10080, Math.max(5, parseInt(pl.minutes) || 1440)) * 60000) };
    } catch { return res.status(400).json({ error: 'Bad poll' }); }
  }
  if (!text && !files.length && !req.body.gif && !quoteOf && !poll) return res.status(400).json({ error: 'Write something or add an image' });
  let sched;
  if (req.body.schedule) {
    sched = new Date(req.body.schedule);
    if (parent || quoteOf) return res.status(400).json({ error: 'Only new posts can be scheduled' });
    if (isNaN(sched) || sched < new Date(Date.now() + 60000) || sched > new Date(Date.now() + 365 * 864e5)) return res.status(400).json({ error: 'Pick a time between 1 minute and 1 year from now' });
  }
  if (parent) {
    const pp = await Post.findById(parent).populate('author');
    if (!pp) return res.status(404).json({ error: 'That post no longer exists' });
    if (pp.author?.protected && String(pp.author._id) !== req.me.id && !has(req.me.following, pp.author.id)) return res.status(403).json({ error: 'Follow this protected account to reply' });
    if (!canReplyTo(pp, req.me)) return res.status(403).json({ error: replyMsg(pp) });
  }
  if (files.some((f) => !f.mimetype.startsWith('image/'))) return res.status(400).json({ error: 'Only images are supported' });
  let images = [];
  if (files.length) { // images go to PostFile server-side so the key stays secret
    const ups = await Promise.all(files.map(pfUpload));
    if (ups.some((u) => !u)) { ups.filter(Boolean).forEach((u) => pfDelete(u.fileId)); return res.status(502).json({ error: 'Image upload failed' }); }
    images = ups;
  } else if (req.body.gif) { try { if (new URL(req.body.gif).hostname.endsWith('giphy.com')) images = [{ url: req.body.gif }]; } catch {} }
  const preview = !images.length && !poll && !quoteOf ? await linkPreview(text) : undefined;
  const replyLimit = ['following', 'mentioned'].includes(req.body.replyLimit) && !parent ? req.body.replyLimit : undefined;
  const p = await Post.create({ author: req.me._id, text, media: images[0], images, parent, quoteOf, poll, preview, replyLimit, ...(sched && { scheduled: true, visibleAt: sched, createdAt: sched }) });
  if (quoteOf) await Post.updateOne({ _id: quoteOf }, { $inc: { quotes: 1 } });
  if (parent) await Post.updateOne({ _id: parent }, { $inc: { replies: 1 } });
  const told = new Set([String(req.me._id)]);
  const tell = async (to, type) => { if (to && !told.has(String(to))) { told.add(String(to)); await notify(to, req.me._id, type, p._id, sched); } };
  if (parent) await tell((await Post.findById(parent).select('author'))?.author, 'reply');
  if (quoteOf) await tell((await Post.findById(quoteOf).select('author'))?.author, 'quote');
  const names = [...new Set((text.match(/(?:^|\s)@(\w{3,15})/g) || []).map((x) => x.trim().slice(1).toLowerCase()))].slice(0, 10);
  if (names.length) for (const u of await User.find({ username: { $in: names }, ghost: { $ne: true } }).select('_id')) await tell(u._id, 'mention');
  res.json(shape(await pop(Post.findById(p.id)), req.me));
});

app.patch('/api/posts/:id', auth, async (req, res) => {
  const p = await Post.findOne({ _id: req.params.id, author: req.me._id, repostOf: null });
  if (!p) return res.sendStatus(404);
  if (Date.now() - p.createdAt > EDIT_MS) return res.status(403).json({ error: 'Posts can only be edited for 60 minutes' });
  const text = String(req.body.text || '').trim().slice(0, 280);
  if (!text && !p.media?.url && !p.quoteOf && !p.poll?.options?.length) return res.status(400).json({ error: 'A post can’t be empty' });
  p.text = text;
  if (!(p.visibleAt && p.visibleAt > new Date())) p.editedAt = new Date();
  if (!p.images?.length && !p.poll?.options?.length && !p.quoteOf) p.preview = await linkPreview(text);
  await p.save();
  res.json(shape(await pop(Post.findById(p.id)), req.me));
});
app.post('/api/posts/:id/vote', auth, async (req, res) => {
  const p = await Post.findById(req.params.id), i = parseInt(req.body.option);
  if (!p?.poll?.options?.length) return res.sendStatus(404);
  if (p.poll.endsAt < new Date()) return res.status(400).json({ error: 'This poll has ended' });
  if (!(i >= 0 && i < p.poll.options.length)) return res.status(400).json({ error: 'Bad choice' });
  const r = await Post.updateOne({ _id: p._id, 'poll.options.votes': { $ne: req.me._id } }, { $addToSet: { [`poll.options.${i}.votes`]: req.me._id } });
  if (!r.modifiedCount) return res.status(400).json({ error: 'You already voted' });
  res.json(shape(await pop(Post.findById(p.id)), req.me));
});

// scheduled posts stay hidden (see `visible()`) until their time; these let the author manage them
app.get('/api/scheduled', auth, async (req, res) => {
  const ps = await Post.find({ author: req.me._id, scheduled: true, visibleAt: { $gt: new Date() } }).sort('visibleAt').limit(100);
  res.json(ps.map((p) => ({ id: p.id, text: p.text, at: p.visibleAt })));
});
app.post('/api/posts/:id/publish', auth, async (req, res) => {
  const p = await Post.findOne({ _id: req.params.id, author: req.me._id, scheduled: true, visibleAt: { $gt: new Date() } });
  if (!p) return res.sendStatus(404);
  await Post.collection.updateOne({ _id: p._id }, { $set: { createdAt: new Date(), scheduled: false }, $unset: { visibleAt: '' } }); // createdAt is immutable in Mongoose, so go native
  await Notif.updateMany({ post: p._id }, { $unset: { visibleAt: 1 } });
  res.json({ ok: true });
});

// drafts (text only)
app.get('/api/drafts', auth, async (req, res) => res.json((await Draft.find({ user: req.me._id }).sort('-updatedAt').limit(50)).map((d) => ({ id: d.id, text: d.text, at: d.updatedAt }))));
app.post('/api/drafts', auth, async (req, res) => {
  const text = String(req.body.text || '').trim().slice(0, 280);
  if (!text) return res.status(400).json({ error: 'Nothing to save' });
  if ((await Draft.countDocuments({ user: req.me._id })) >= 50) return res.status(400).json({ error: 'You can keep up to 50 drafts' });
  res.json({ id: (await Draft.create({ user: req.me._id, text })).id });
});
app.put('/api/drafts/:id', auth, async (req, res) => { await Draft.updateOne({ _id: req.params.id, user: req.me._id }, { text: String(req.body.text || '').trim().slice(0, 280) }); res.json({ ok: true }); });
app.delete('/api/drafts/:id', auth, async (req, res) => { await Draft.deleteOne({ _id: req.params.id, user: req.me._id }); res.json({ ok: true }); });

// @mention autocomplete: accounts you follow first
app.get('/api/mentions', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15);
  if (!q) return res.json([]);
  const hidden = await hiddenFor(req.me), fol = req.me?.following || [];
  const us = await User.find({ username: new RegExp('^' + q), _id: { $nin: hidden }, ghost: { $ne: true } }).limit(20);
  us.sort((a, b) => has(fol, b.id) - has(fol, a.id));
  res.json(us.slice(0, 5).map(pub));
});

app.post('/api/posts/:id/like', auth, async (req, res) => {
  const p = await Post.findById(req.params.id);
  if (!p) return res.sendStatus(404);
  const on = !has(p.likes, req.me.id);
  await Post.updateOne({ _id: p._id }, on ? { $addToSet: { likes: req.me._id } } : { $pull: { likes: req.me._id } });
  await (on ? notify(p.author, req.me._id, 'like', p._id) : unnotify(p.author, req.me._id, 'like', p._id));
  res.json({ ok: true });
});
app.post('/api/posts/:id/repost', auth, async (req, res) => {
  const p = await Post.findById(req.params.id);
  if (!p || p.repostOf) return res.sendStatus(404);
  if (!has(p.reposts, req.me.id) && String(p.author) !== req.me.id && (await User.exists({ _id: p.author, protected: true }))) return res.status(403).json({ error: 'Posts from protected accounts can’t be reposted' });
  if (has(p.reposts, req.me.id)) {
    await Post.updateOne({ _id: p._id }, { $pull: { reposts: req.me._id } });
    await Post.deleteOne({ author: req.me._id, repostOf: p._id });
    await unnotify(p.author, req.me._id, 'repost', p._id);
  } else {
    await Post.updateOne({ _id: p._id }, { $addToSet: { reposts: req.me._id } });
    await Post.create({ author: req.me._id, repostOf: p._id });
    await notify(p.author, req.me._id, 'repost', p._id);
  }
  res.json({ ok: true });
});
app.post('/api/posts/:id/bookmark', auth, async (req, res) => {
  const on = has(req.me.bookmarks, req.params.id);
  await User.updateOne({ _id: req.me._id }, on ? { $pull: { bookmarks: req.params.id } } : { $addToSet: { bookmarks: req.params.id } });
  await Post.updateOne({ _id: req.params.id }, { $inc: { saves: on ? -1 : 1 } });
  res.json({ ok: true });
});
app.delete('/api/posts/:id', auth, async (req, res) => {
  const p = await Post.findOneAndDelete(req.me.admin ? { _id: req.params.id } : { _id: req.params.id, author: req.me._id });
  if (!p) return res.sendStatus(404);
  await Post.deleteMany({ repostOf: p._id });
  await Notif.deleteMany({ post: p._id });
  await User.updateOne({ _id: p.author, pinned: p._id }, { $unset: { pinned: 1 } });
  await Post.updateMany({ quoteOf: p._id }, { quoteDeleted: true });
  if (p.parent) await Post.updateOne({ _id: p.parent }, { $inc: { replies: -1 } });
  if (p.quoteOf) await Post.updateOne({ _id: p.quoteOf }, { $inc: { quotes: -1 } });
  for (const im of p.images?.length ? p.images : [p.media]) if (im?.fileId) pfDelete(im.fileId);
  res.json({ ok: true });
});

app.get('/api/users/:u', async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u) return res.sendStatus(404);
  const [followers, posts] = await Promise.all([User.countDocuments({ following: u._id }), Post.countDocuments({ author: u._id, parent: null, repostOf: null, ...visible() })]);
  res.json({ ...pub(u), joined: u.createdAt, following: u.following.length, followers: followers + fakeVal(u.fake), posts, isFollowing: !!req.me && has(req.me.following, u.id),
    blocked: !!req.me && has(req.me.blocked, u.id), muted: !!req.me && has(req.me.muted, u.id), blockedBy: !!req.me && has(u.blocked, req.me.id),
    requested: !!req.me && has(u.followRequests, req.me.id), canSee: !u.protected || (!!req.me && (req.me.id === u.id || has(req.me.following, u.id))), location: u.location || '', website: u.website || '', born: bornText(u) });
});
app.post('/api/users/:u/follow', auth, async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u || u.id === req.me.id) return res.sendStatus(400);
  if (has(req.me.blocked, u.id) || has(u.blocked, req.me.id)) return res.status(403).json({ error: 'You can’t follow this account' });
  const on = !has(req.me.following, u.id);
  if (on && u.protected) { // toggles a pending request instead of following
    const asked = has(u.followRequests, req.me.id);
    await User.updateOne({ _id: u._id }, asked ? { $pull: { followRequests: req.me._id } } : { $addToSet: { followRequests: req.me._id } });
    await (asked ? unnotify(u._id, req.me._id, 'request') : notify(u._id, req.me._id, 'request'));
    return res.json({ isFollowing: false, requested: !asked });
  }
  await User.updateOne({ _id: req.me._id }, on ? { $addToSet: { following: u._id } } : { $pull: { following: u._id } });
  await (on ? notify(u._id, req.me._id, 'follow') : unnotify(u._id, req.me._id, 'follow'));
  res.json({ isFollowing: on });
});
const userList = (filter) => async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u) return res.sendStatus(404);
  if (u.protected && !(req.me && (req.me.id === u.id || has(req.me.following, u.id)))) return res.status(403).json({ error: 'These accounts are only visible to followers' });
  const hidden = await hiddenFor(req.me);
  const f0 = filter(u); // merge with any _id filter so "following" and "hidden" don't overwrite each other
  const us = await User.find({ ...f0, _id: { ...(f0._id || {}), $nin: hidden }, ghost: { $ne: true } }).sort('-createdAt').limit(100);
  res.json(us.map((x) => ({ ...pub(x), isFollowing: !!req.me && has(req.me.following, x.id) })));
};
app.get('/api/users/:u/followers', userList((u) => ({ following: u._id })));
app.get('/api/users/:u/following', userList((u) => ({ _id: { $in: u.following } })));
const toggleList = (field) => async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u || u.id === req.me.id) return res.sendStatus(400);
  const on = !has(req.me[field], u.id);
  await User.updateOne({ _id: req.me._id }, on ? { $addToSet: { [field]: u._id }, ...(field === 'blocked' && { $pull: { following: u._id } }) } : { $pull: { [field]: u._id } });
  if (on && field === 'blocked') await User.updateOne({ _id: u._id }, { $pull: { following: req.me._id } });
  res.json({ [field === 'blocked' ? 'blocked' : 'muted']: on });
};
app.post('/api/users/:u/block', auth, toggleList('blocked'));
app.post('/api/users/:u/mute', auth, toggleList('muted'));
app.post('/api/posts/:id/pin', auth, async (req, res) => {
  const p = await Post.findOne({ _id: req.params.id, author: req.me._id, parent: null, repostOf: null });
  if (!p) return res.sendStatus(404);
  const on = String(req.me.pinned) !== p.id;
  await User.updateOne({ _id: req.me._id }, on ? { pinned: p._id } : { $unset: { pinned: 1 } });
  res.json({ pinned: on });
});

// ---- notifications ----
const notifQuery = async (me) => ({ to: me._id, from: { $nin: await hiddenFor(me) }, ...visible() });
app.get('/api/notifications', auth, async (req, res) => {
  const ns = await Notif.find(await notifQuery(req.me)).sort('-createdAt').limit(60).populate('from').populate('post');
  res.json(ns.filter((n) => n.from).map((n) => ({ id: n.id, type: n.type, read: n.read, at: n.visibleAt || n.createdAt, from: pub(n.from), post: n.post ? { id: n.post.id, text: n.post.text, media: !!n.post.media?.url } : null })));
});
app.get('/api/notifications/count', auth, async (req, res) => res.json({ unread: await Notif.countDocuments({ ...(await notifQuery(req.me)), read: false }) }));
app.post('/api/notifications/read', auth, async (req, res) => { await Notif.updateMany({ to: req.me._id, read: false }, { read: true }); res.json({ ok: true }); });
app.get('/api/suggest', async (req, res) => {
  const ex = req.me ? [...req.me.following, req.me._id, ...(await hiddenFor(req.me))] : [];
  res.json((await User.find({ _id: { $nin: ex }, ghost: { $ne: true } }).sort('-createdAt').limit(4)).map(pub));
});

app.get('/api/trends', async (_req, res) => {
  const ps = await Post.find({ createdAt: { $gt: new Date(Date.now() - 7 * 864e5) }, repostOf: null, author: { $nin: await User.distinct('_id', { protected: true }) }, ...visible() }).select('text').limit(500);
  const c = {};
  ps.forEach((p) => new Set(p.text.toLowerCase().match(/#\w+/g) || []).forEach((t) => (c[t.slice(1)] = (c[t.slice(1)] || 0) + 1)));
  res.json(Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => ({ tag, count })));
});
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 50);
  if (!q) return res.json({ users: [], posts: [] });
  const r = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const hidden = await hiddenFor(req.me), hp = await hiddenPosts(req.me);
  const [us, ps] = await Promise.all([User.find({ $or: [{ username: r }, { name: r }], _id: { $nin: hidden }, ghost: { $ne: true } }).limit(5), pop(Post.find({ text: r, repostOf: null, author: { $nin: hp }, ...visible() }).sort('-createdAt').limit(20))]);
  res.json({ users: us.map((u) => ({ ...pub(u), isFollowing: !!req.me && has(req.me.following, u.id) })), posts: ps.map((p) => shape(p, req.me)) });
});

const pfDelete = (id) => fetch(`${PF}/files/${id}`, { method: 'DELETE', headers: pfH }).catch(() => {});

// ---- link previews (server-side, SSRF-safe: public hosts only, redirects re-checked, size/time capped) ----
const isPrivateIp = (ip) => {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::' || /^f[cd]/.test(l) || /^fe[89ab]/.test(l)) return true;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateIp(m[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
};
async function safeGet(url, hops = 0) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || (u.port && !['80', '443'].includes(u.port))) throw new Error('bad url');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((x) => isPrivateIp(x.address))) throw new Error('blocked');
  const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(2500), headers: { 'user-agent': 'UnviaBot/1.0 (link preview)', accept: 'text/html' } });
  const loc = r.headers.get('location');
  if (r.status >= 300 && r.status < 400 && loc && hops < 3) return safeGet(new URL(loc, u).href, hops + 1);
  return { r, url: u.href };
}
async function fetchPreview(url) {
  const { r, url: finalUrl } = await safeGet(url);
  if (!r.ok || !r.body || !(r.headers.get('content-type') || '').includes('text/html')) return undefined;
  const reader = r.body.getReader(), dec = new TextDecoder(); let html = '', size = 0;
  while (size < 300000) { const { done, value } = await reader.read(); if (done) break; size += value.length; html += dec.decode(value, { stream: true }); if (/<\/head>/i.test(html)) break; }
  reader.cancel().catch(() => {});
  const ent = (t) => (t || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  const meta = (k) => { const t = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, 'i')); const c = t && t[0].match(/content=["']([^"']*)["']/i); return c ? ent(c[1]) : ''; };
  const title = meta('og:title') || meta('twitter:title') || ent((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1]);
  if (!title) return undefined;
  let image = meta('og:image') || meta('twitter:image');
  try { image = image ? new URL(image, finalUrl).href : ''; if (!/^https?:/.test(image)) image = ''; } catch { image = ''; }
  return { url, title: title.slice(0, 120), description: (meta('og:description') || meta('description')).slice(0, 200), image, site: (meta('og:site_name') || new URL(finalUrl).hostname.replace(/^www\./, '')).slice(0, 60) };
}
async function linkPreview(text) {
  const m = (text || '').match(/https?:\/\/[^\s<>"']+/i); if (!m) return undefined;
  try { return await Promise.race([fetchPreview(m[0].replace(/[.,!?;:)\]]+$/, '')), new Promise((r) => setTimeout(() => r(undefined), 3500))]); } catch { return undefined; }
}

async function pfUpload(f) {
  const form = new FormData();
  form.append('file', new Blob([f.buffer], { type: f.mimetype }), f.originalname);
  const r = await fetch(`${PF}/upload`, { method: 'POST', headers: pfH, body: form });
  if (!r.ok) return null;
  const j = await r.json();
  return { url: j.url, fileId: j.file_id };
}
app.post('/api/me/password', auth, async (req, res) => {
  if (!(await bcrypt.compare(req.body.current || '', req.me.hash)) || String(req.body.next || '').length < 8) return res.status(400).json({ error: 'Check your current and new password' });
  req.me.hash = await bcrypt.hash(req.body.next, 10); req.me.sv = (req.me.sv || 0) + 1; await req.me.save(); res.json({ ok: true, token: sign(req.me) });
});
app.post('/api/me/email', auth, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) return res.status(400).json({ error: 'That email doesn’t look right' });
  if (!(await bcrypt.compare(req.body.password || '', req.me.hash))) return res.status(400).json({ error: 'Wrong password' });
  if (await User.exists({ email, _id: { $ne: req.me._id } })) return res.status(409).json({ error: 'That email is already in use' });
  const link = `${APP(req)}/#/verify/${jwt.sign({ id: req.me.id, t: 'verify', e: email }, JWT_SECRET, { expiresIn: '2d' })}`;
  req.me.pendingEmail = email; await req.me.save();
  const sent = await sendMail(email, 'Confirm your email for Unvia', `Confirm your email: ${link}`, mailHtml('Confirm your email', 'Tap the button to confirm this address for your Unvia account.', link, 'Confirm email'));
  res.json({ ok: true, sent, ...(!mailReady() && req.me.admin && { link }) }); // no mail provider: the owner gets the link directly
});
app.post('/api/me/2fa/setup', auth, async (req, res) => {
  if (req.me.twofa?.enabled) return res.status(400).json({ error: 'Two-factor is already on' });
  if (!(await bcrypt.compare(req.body.password || '', req.me.hash))) return res.status(400).json({ error: 'Wrong password' });
  const secret = b32enc(crypto.randomBytes(20));
  req.me.twofa = { secret, enabled: false, backup: [] }; await req.me.save();
  res.json({ secret, uri: `otpauth://totp/Unvia:${encodeURIComponent(req.me.username)}?secret=${secret}&issuer=Unvia` });
});
app.post('/api/me/2fa/enable', auth, async (req, res) => {
  const t = req.me.twofa;
  if (!t?.secret || t.enabled) return res.status(400).json({ error: 'Start setup first' });
  if (!totpOk(t.secret, req.body.code)) return res.status(400).json({ error: 'That code didn’t work. Check your phone’s clock and try again.' });
  const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));
  req.me.twofa.enabled = true; req.me.twofa.backup = codes.map(sha); req.me.sv = (req.me.sv || 0) + 1; await req.me.save();
  res.json({ backup: codes.map((c) => c.slice(0, 5) + '-' + c.slice(5)), token: sign(req.me) });
});
app.post('/api/me/2fa/disable', auth, async (req, res) => {
  if (!req.me.twofa?.enabled) return res.status(400).json({ error: 'Two-factor is off' });
  if (!(await bcrypt.compare(req.body.password || '', req.me.hash)) || !(await useSecondFactor(req.me, req.body.code))) return res.status(400).json({ error: 'Wrong password or code' });
  req.me.twofa = undefined; req.me.sv = (req.me.sv || 0) + 1; await req.me.save();
  res.json({ token: sign(req.me) });
});
app.post('/api/me/logout-all', auth, async (req, res) => { req.me.sv = (req.me.sv || 0) + 1; await req.me.save(); res.json({ token: sign(req.me) }); });
app.put('/api/me/muted-words', auth, async (req, res) => {
  const words = [...new Set((Array.isArray(req.body.words) ? req.body.words : []).map((w) => String(w).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 50);
  req.me.mutedWords = words; await req.me.save(); res.json({ words });
});
app.post('/api/me/privacy', auth, async (req, res) => {
  const on = !!req.body.protected;
  if (!on && req.me.protected && req.me.followRequests.length) { // going public approves everyone waiting
    await User.updateMany({ _id: { $in: req.me.followRequests } }, { $addToSet: { following: req.me._id } });
    req.me.followRequests = []; await Notif.deleteMany({ to: req.me._id, type: 'request' });
  }
  req.me.protected = on; await req.me.save(); res.json({ protected: on });
});
app.get('/api/me/relations', auth, async (req, res) => {
  const [blocked, muted] = await Promise.all([User.find({ _id: { $in: req.me.blocked } }), User.find({ _id: { $in: req.me.muted } })]);
  res.json({ blocked: blocked.map(pub), muted: muted.map(pub) });
});
app.get('/api/follow-requests', auth, async (req, res) => res.json((await User.find({ _id: { $in: req.me.followRequests }, ghost: { $ne: true } }).limit(100)).map(pub)));
app.post('/api/follow-requests/:u/:act', auth, async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u || !has(req.me.followRequests, u.id) || !['approve', 'deny'].includes(req.params.act)) return res.sendStatus(404);
  await User.updateOne({ _id: req.me._id }, { $pull: { followRequests: u._id } });
  await unnotify(req.me._id, u._id, 'request');
  if (req.params.act === 'approve') { await User.updateOne({ _id: u._id }, { $addToSet: { following: req.me._id } }); await notify(u._id, req.me._id, 'accepted'); }
  res.json({ ok: true });
});
app.delete('/api/me', auth, async (req, res) => {
  await Post.deleteMany({ author: req.me._id });
  await Msg.deleteMany({ from: req.me._id });
  for (const c of await Conv.find({ members: req.me._id })) {
    await Conv.updateOne({ _id: c._id }, { $pull: { members: req.me._id, reads: { u: req.me._id } } });
    if (c.members.length - 1 < 2) await purgeConv(c._id);
  }
  await User.deleteOne({ _id: req.me._id }); res.json({ ok: true });
});
app.get('/api/gifs', async (req, res) => {
  const k = process.env.GIPHY_API_KEY; if (!k) return res.json([]);
  const q = String(req.query.q || '').trim();
  const r = await fetch(`https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}?api_key=${k}&limit=24&rating=pg-13&q=${encodeURIComponent(q)}`);
  res.json(((await r.json()).data || []).map((g) => g.images.fixed_height.url));
});
app.post('/api/report', auth, async (req, res) => {
  const { kind, target, reason } = req.body;
  await Report.create({ by: req.me._id, [kind === 'post' ? 'post' : 'user']: target, reason: String(reason || '').slice(0, 60) });
  res.json({ ok: true });
});
const adm = (q, r, n) => (q.me?.admin ? n() : r.sendStatus(403));
app.get('/api/admin/overview', adm, async (req, res) => {
  const [users, posts, openReports, rs, recent] = await Promise.all([User.countDocuments(), Post.countDocuments(), Report.countDocuments({ status: 'open' }),
    Report.find({ status: 'open' }).sort('-createdAt').limit(30).populate('by').populate({ path: 'post', populate: 'author' }).populate('user'), User.find({ ghost: { $ne: true } }).sort('-createdAt').limit(30)]);
  res.json({ users, posts, openReports, recent: recent.map((u) => ({ ...pub(u), banned: !!u.banned })),
    reports: rs.map((r) => ({ id: r.id, reason: r.reason, by: r.by?.username, preview: r.post ? `@${r.post.author?.username}: ${r.post.text || '[media]'}` : `@${r.user?.username}` })) });
});
app.post('/api/admin/reports/:id', adm, async (req, res) => {
  const r = await Report.findById(req.params.id).populate('post'); if (!r) return res.sendStatus(404);
  const a = req.body.action;
  if (a === 'delete' && r.post) { await Post.deleteMany({ $or: [{ _id: r.post._id }, { repostOf: r.post._id }] }); await Post.updateMany({ quoteOf: r.post._id }, { quoteDeleted: true }); }
  if (a === 'ban') await User.updateOne({ _id: r.user || r.post?.author, admin: { $ne: true } }, { banned: true });
  r.status = a === 'dismiss' ? 'dismissed' : 'actioned'; await r.save(); res.json({ ok: true });
});
app.post('/api/admin/users/:id', adm, async (req, res) => {
  const set = {};
  if (['', 'verified', 'business', 'government', 'owner'].includes(req.body.badge)) set.badge = req.body.badge;
  if ('banned' in req.body && req.params.id !== req.me.id) set.banned = !!req.body.banned;
  await User.updateOne({ _id: req.params.id }, set); res.json({ ok: true });
});

app.post('/api/admin/users/:id/reset-link', adm, async (req, res) => {
  const u = OID.test(req.params.id) ? await User.findById(req.params.id) : null;
  if (!u) return res.sendStatus(404);
  res.json({ link: `${APP(req)}/#/reset/${jwt.sign({ id: u.id, t: 'reset', ph: u.hash.slice(-12) }, JWT_SECRET, { expiresIn: '1h' })}` });
});

// ---- Fake engagement (owner-only: `adm` only ever passes for the platform owner in this app) ----
const AMT_CAP = 50_000_000;
function schedule(current, body) {
  const amt = Math.max(0, Math.min(AMT_CAP, parseInt(body.amount) || 0));
  if (body.mode === 'gradual') {
    const end = new Date(body.until);
    if (!body.until || isNaN(end) || end <= new Date()) return { error: 'Pick a future date/time' };
    return { value: { target: amt, mode: 'gradual', startAt: new Date(), endAt: end, startVal: fakeVal(current) } };
  }
  return { value: { target: amt, mode: 'instant' } };
}
app.post('/api/admin/fake/followers', adm, async (req, res) => {
  const r = schedule(req.me.fake, req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  req.me.fake = r.value; await req.me.save();
  res.json({ ok: true, now: fakeVal(req.me.fake) });
});
app.post('/api/admin/fake/engagement', adm, async (req, res) => {
  const { postId, kind } = req.body;
  if (!['likes', 'reposts', 'saves'].includes(kind)) return res.status(400).json({ error: 'Bad metric' });
  const p = await Post.findById(postId);
  if (!p) return res.status(404).json({ error: 'Post not found (paste the link from its ⋯ → Copy link)' });
  const r = schedule(p.fake?.[kind], req.body);
  if (r.error) return res.status(400).json({ error: r.error });
  p.fake = p.fake || {}; p.fake[kind] = r.value; p.markModified('fake'); await p.save();
  res.json({ ok: true, now: fakeVal(p.fake[kind]) });
});
async function ghostAuthors(n) {
  const pool = await User.find({ ghost: true }).limit(Math.max(n, 40));
  const names = ['Alex', 'Jordan', 'Sam', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie', 'Avery', 'Quinn', 'Reese', 'Drew', 'Skyler', 'Dakota', 'Rowan', 'Emerson', 'Finley', 'Harper', 'Kai', 'Lane'];
  while (pool.length < Math.min(Math.max(n, 40), 200)) {
    try { pool.push(await User.create({ username: 'user_' + Math.random().toString(36).slice(2, 8), name: names[Math.floor(Math.random() * names.length)], hash: '', ghost: true })); }
    catch { /* rare username collision, just retry next loop */ }
  }
  return pool;
}
app.post('/api/admin/fake/replies', adm, async (req, res) => {
  const parent = await Post.findById(req.body.postId);
  if (!parent) return res.status(404).json({ error: 'Post not found (paste the link from its ⋯ → Copy link)' });
  const msgs = (Array.isArray(req.body.messages) ? req.body.messages : String(req.body.messages || '').split('\n')).map((m) => m.trim().slice(0, 280)).filter(Boolean);
  if (!msgs.length) return res.status(400).json({ error: 'Add at least one reply message, one per line' });
  const n = Math.max(1, Math.min(500, parseInt(req.body.count) || 0));
  const now = Date.now();
  let end = now;
  if (req.body.mode === 'gradual') {
    const d = new Date(req.body.until);
    if (!req.body.until || isNaN(d) || +d <= now) return res.status(400).json({ error: 'Pick a future date/time' });
    end = +d;
  }
  const authors = await ghostAuthors(n);
  await Post.insertMany(Array.from({ length: n }, (_, i) => ({
    author: authors[i % authors.length]._id, text: msgs[i % msgs.length], parent: parent._id,
    visibleAt: req.body.mode === 'gradual' ? new Date(now + (end - now) * (i + Math.random()) / n) : null,
  })));
  await Post.updateOne({ _id: parent._id }, { $inc: { replies: n } });
  res.json({ ok: true, created: n });
});
app.get('/api/admin/fake/active', adm, async (req, res) => {
  const [users, posts] = await Promise.all([
    User.find({ 'fake.mode': 'gradual', 'fake.target': { $gt: 0 } }).limit(20),
    pop(Post.find({ $or: [{ 'fake.likes.mode': 'gradual' }, { 'fake.reposts.mode': 'gradual' }, { 'fake.saves.mode': 'gradual' }] }).limit(20)),
  ]);
  res.json({
    users: users.filter((u) => fakeVal(u.fake) < u.fake.target).map((u) => ({ id: u.id, username: u.username, ...u.fake, now: fakeVal(u.fake) })),
    posts: posts.map((p) => ({
      id: p.id, author: p.author?.username,
      fake: Object.fromEntries(['likes', 'reposts', 'saves'].filter((k) => p.fake?.[k]?.mode === 'gradual' && fakeVal(p.fake[k]) < p.fake[k].target).map((k) => [k, { ...p.fake[k], now: fakeVal(p.fake[k]) }])),
    })).filter((p) => Object.keys(p.fake).length),
  });
});
app.post('/api/admin/fake/stop', adm, async (req, res) => {
  const { type, id, kind } = req.body;
  if (type === 'user') {
    const u = await User.findById(id); if (!u) return res.sendStatus(404);
    u.fake = { target: fakeVal(u.fake), mode: 'instant' }; await u.save();
  } else {
    const p = await Post.findById(id); if (!p || !p.fake?.[kind]) return res.sendStatus(404);
    p.fake[kind] = { target: fakeVal(p.fake[kind]), mode: 'instant' }; p.markModified('fake'); await p.save();
  }
  res.json({ ok: true });
});

// ---- direct messages ----
const OID = /^[a-f0-9]{24}$/;
const blockedFor = async (me) => new Set([...me.blocked, ...(await User.distinct('_id', { blocked: me._id }))].map(String));
const readOf = (c, id) => (c.reads || []).find((r) => String(r.u) === String(id));
async function markRead(convId, userId, at = new Date()) {
  const r = await Conv.updateOne({ _id: convId, 'reads.u': userId }, { $set: { 'reads.$.at': at } });
  if (!r.matchedCount) await Conv.updateOne({ _id: convId, 'reads.u': { $ne: userId } }, { $push: { reads: { u: userId, at } } });
}
async function purgeConv(id) {
  for (const m of await Msg.find({ conv: id, 'image.fileId': { $exists: true } })) pfDelete(m.image.fileId);
  await Msg.deleteMany({ conv: id }); await Conv.deleteOne({ _id: id });
}
const convShape = (c, me) => {
  const others = c.members.filter((m) => String(m._id) !== me.id), mine = readOf(c, me.id);
  return {
    id: c.id, group: !!c.group, name: c.group ? c.name || others.map((m) => m.name).join(', ') || 'Group' : others[0]?.name || 'Deleted account',
    members: c.members.map(pub), others: others.map(pub), owner: c.owner ? String(c.owner) : null,
    lastText: c.lastText || '', lastAt: c.lastAt, lastFromMe: String(c.lastFrom) === me.id,
    unread: !!c.lastAt && String(c.lastFrom) !== me.id && (!mine?.at || mine.at < c.lastAt),
    request: !!c.requestFor && String(c.requestFor) === me.id, pending: !!c.requestFor && String(c.requestFor) !== me.id,
  };
};
const msgShape = (m) => ({ id: m.id, from: String(m.from), text: m.deleted ? '' : m.text, image: m.deleted ? null : m.image?.url || null, deleted: !!m.deleted, at: m.createdAt });
async function myConv(req, res) {
  const c = OID.test(req.params.id) ? await Conv.findOne({ _id: req.params.id, members: req.me._id }).populate('members') : null;
  if (!c) { res.sendStatus(404); return null; }
  return c;
}
// is this chat visible to me (not cleared, not with someone blocked)?
const convVisible = (c, me, bl) => {
  const mine = readOf(c, me.id);
  if (mine?.clr && c.lastAt <= mine.clr) return false;
  return c.group || !c.members.some((m) => String(m._id ?? m) !== me.id && bl.has(String(m._id ?? m)));
};

app.get('/api/conversations', auth, async (req, res) => {
  const wantReq = req.query.box === 'requests', bl = await blockedFor(req.me);
  const cs = (await Conv.find({ members: req.me._id, lastAt: { $ne: null } }).sort('-lastAt').limit(100).populate('members'))
    .filter((c) => convVisible(c, req.me, bl) && (!!c.requestFor && String(c.requestFor) === req.me.id) === wantReq);
  res.json(cs.slice(0, 50).map((c) => convShape(c, req.me)));
});
app.get('/api/messages/unread', auth, async (req, res) => {
  const bl = await blockedFor(req.me); let unread = 0, requests = 0;
  for (const c of await Conv.find({ members: req.me._id, lastAt: { $ne: null } }).limit(200)) {
    if (!convVisible(c, req.me, bl)) continue;
    const mine = readOf(c, req.me.id);
    if (c.requestFor && String(c.requestFor) === req.me.id) requests++;
    else if (String(c.lastFrom) !== req.me.id && (!mine?.at || mine.at < c.lastAt)) unread++;
  }
  res.json({ unread, requests });
});
// start (or reopen) a chat: one username = 1:1, several = group
app.post('/api/conversations', auth, async (req, res) => {
  const names = [...new Set((Array.isArray(req.body.usernames) ? req.body.usernames : [req.body.username]).map((x) => String(x || '').toLowerCase()).filter(Boolean))].slice(0, 20);
  if (!names.length) return res.status(400).json({ error: 'Pick someone to message' });
  const us = await User.find({ username: { $in: names }, ghost: { $ne: true } });
  if (us.length !== names.length || us.some((u) => u.id === req.me.id)) return res.status(400).json({ error: 'Couldn’t find one of those accounts' });
  const bl = await blockedFor(req.me);
  if (us.some((u) => bl.has(u.id))) return res.status(403).json({ error: 'You can’t message this account' });
  const now = new Date();
  if (us.length === 1) {
    const u = us[0];
    const rf = has(u.following, req.me.id) ? undefined : u._id; // the recipient must accept if they don't follow the sender
    let c = await Conv.findOne({ group: { $ne: true }, members: { $all: [req.me._id, u._id], $size: 2 } });
    if (!c) c = await Conv.create({ members: [req.me._id, u._id], reads: [{ u: req.me._id, at: now }], requestFor: rf });
    else if (!c.lastAt) await Conv.updateOne({ _id: c._id }, rf ? { requestFor: rf } : { $unset: { requestFor: 1 } }); // empty chat: re-evaluate for whoever opens it now
    return res.json({ id: c.id });
  }
  if (us.some((u) => !has(req.me.following, u.id) && !has(u.following, req.me.id))) return res.status(403).json({ error: 'You can only add people you follow or who follow you' });
  const c = await Conv.create({ members: [req.me._id, ...us.map((u) => u._id)], group: true, name: String(req.body.name || '').trim().slice(0, 50), owner: req.me._id, reads: [{ u: req.me._id, at: now }] });
  res.json({ id: c.id });
});
// latest 50 messages (or older ones via `before`); read=1 marks the chat read, except while it's a request you haven't accepted
app.get('/api/conversations/:id', auth, async (req, res) => {
  const c = await myConv(req, res); if (!c) return;
  const clr = readOf(c, req.me.id)?.clr, before = req.query.before && new Date(req.query.before), q = { conv: c._id };
  if (clr || (before && !isNaN(before))) q.createdAt = { ...(clr && { $gt: clr }), ...(before && !isNaN(before) && { $lt: before }) };
  const msgs = (await Msg.find(q).sort('-createdAt').limit(50)).reverse();
  if (req.query.read === '1' && !(c.requestFor && String(c.requestFor) === req.me.id)) await markRead(c._id, req.me._id);
  res.json({ conv: convShape(c, req.me), messages: msgs.map(msgShape), reads: c.reads.map((r) => ({ u: String(r.u), at: r.at })), more: msgs.length === 50 });
});
app.post('/api/conversations/:id/messages', auth, upload.single('image'), async (req, res) => {
  const c = await myConv(req, res); if (!c) return;
  const text = String(req.body.text || '').trim().slice(0, 1000), f = req.file;
  if (!text && !f) return res.status(400).json({ error: 'Write a message or add a photo' });
  if (f && !f.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Only images are supported' });
  const other = c.members.find((m) => String(m._id) !== req.me.id);
  if (!c.group && (!other || has(req.me.blocked, other.id) || has(other.blocked, req.me.id))) return res.status(403).json({ error: 'You can’t message this account' });
  const accepting = !!c.requestFor && String(c.requestFor) === req.me.id; // replying to a request accepts it
  if (c.requestFor && !accepting && (await Msg.countDocuments({ conv: c._id, from: req.me._id })) >= 3) return res.status(403).json({ error: 'Wait for them to accept your request before sending more' });
  let image;
  if (f) { image = await pfUpload(f); if (!image) return res.status(502).json({ error: 'Photo upload failed' }); }
  const m = await Msg.create({ conv: c._id, from: req.me._id, text, image });
  await Conv.updateOne({ _id: c._id }, { $set: { lastAt: m.createdAt, lastText: text || '📷 Photo', lastFrom: req.me._id }, ...(accepting && { $unset: { requestFor: 1 } }) });
  await markRead(c._id, req.me._id, m.createdAt);
  res.json(msgShape(m));
});
app.post('/api/conversations/:id/accept', auth, async (req, res) => {
  const c = await myConv(req, res); if (!c) return;
  if (c.requestFor && String(c.requestFor) === req.me.id) await Conv.updateOne({ _id: c._id }, { $unset: { requestFor: 1 } });
  res.json({ ok: true });
});
app.post('/api/conversations/:id/decline', auth, async (req, res) => {
  const c = await myConv(req, res); if (!c) return;
  if (c.requestFor && String(c.requestFor) === req.me.id) await purgeConv(c._id);
  res.json({ ok: true });
});
app.patch('/api/conversations/:id', auth, async (req, res) => {
  const c = await myConv(req, res); if (!c) return;
  if (!c.group) return res.sendStatus(400);
  await Conv.updateOne({ _id: c._id }, { name: String(req.body.name || '').trim().slice(0, 50) }); res.json({ ok: true });
});
// groups: leave. 1:1: clear it for you (it comes back if they message again)
app.delete('/api/conversations/:id', auth, async (req, res) => {
  const c = await myConv(req, res); if (!c) return;
  if (c.group) {
    await Conv.updateOne({ _id: c._id }, { $pull: { members: req.me._id, reads: { u: req.me._id } } });
    const left = await Conv.findById(c._id).select('members');
    if (!left || left.members.length < 2) await purgeConv(c._id);
  } else {
    const now = new Date();
    const r = await Conv.updateOne({ _id: c._id, 'reads.u': req.me._id }, { $set: { 'reads.$.clr': now, 'reads.$.at': now } });
    if (!r.matchedCount) await Conv.updateOne({ _id: c._id }, { $push: { reads: { u: req.me._id, at: now, clr: now } } });
  }
  res.json({ ok: true });
});
app.delete('/api/messages/:id', auth, async (req, res) => {
  const m = OID.test(req.params.id) ? await Msg.findOne({ _id: req.params.id, from: req.me._id }) : null;
  if (!m || m.deleted) return res.sendStatus(404);
  if (m.image?.fileId) pfDelete(m.image.fileId);
  m.deleted = true; m.text = ''; m.image = undefined; await m.save();
  const last = await Msg.findOne({ conv: m.conv }).sort('-createdAt');
  if (last) await Conv.updateOne({ _id: m.conv }, { lastText: last.deleted ? 'Message deleted' : last.text || '📷 Photo' });
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use((e, _q, res, _n) => {
  console.error(e);
  if (e.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Each image must be under 4 MB' });
  if (e.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'You can add up to 4 images' });
  res.status(500).json({ error: 'Server error' });
});
if (require.main === module) app.listen(process.env.PORT || 3000, () => console.log('http://localhost:3000'));
module.exports = app;
