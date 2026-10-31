// Reports and the admin/moderator panel API.
const jwt = require('jsonwebtoken');
const { app } = require('../app');
const { JWT_SECRET } = require('../config');
const { adm, auth, modr } = require('../lib/guards');
const { APP } = require('../lib/mail');
const { canActOn, isSuspended, logMod, resetFilter, suspend } = require('../lib/moderation');
const { topicsOf } = require('../lib/topics');
const { OID, oid } = require('../lib/util');
const { Filter, ModLog, Note, Post, Report, User } = require('../models');

app.post('/api/admin/backfill-topics', (q, r, n) => adm(q, r, n), async (req, res) => { // tags posts written before topics existed
  let n = 0;
  for (const p of await Post.find({ topics: { $exists: false } }).select('text').limit(2000)) { await Post.updateOne({ _id: p._id }, { topics: topicsOf(p.text) }); n++; }
  res.json({ updated: n });
});

app.post('/api/report', auth, async (req, res) => {
  if (!OID.test(req.body.target || '')) return res.sendStatus(400);
  if (await Report.exists({ by: req.me._id, status: 'open', [req.body.kind === 'post' ? 'post' : 'user']: req.body.target })) return res.json({ ok: true }); // already reported
  const { kind, target, reason } = req.body;
  await Report.create({ by: req.me._id, [kind === 'post' ? 'post' : 'user']: target, reason: String(reason || '').slice(0, 60) });
  res.json({ ok: true });
});

app.get('/api/admin/overview', modr, async (req, res) => {
  const [users, posts, rs, recent, log] = await Promise.all([User.countDocuments({ ghost: { $ne: true } }), Post.countDocuments(),
    Report.find({ status: 'open' }).sort('-createdAt').limit(300).populate('by').populate({ path: 'post', populate: 'author' }).populate('user'),
    User.find({ ghost: { $ne: true } }).sort('-createdAt').limit(30), ModLog.find().sort('-createdAt').limit(30).populate('mod').populate('user')]);
  const groups = new Map(); // reports about the same post/account are shown together, most-reported first
  for (const r of rs) {
    const k = r.post ? 'p' + oid(r.post) : r.user ? 'u' + oid(r.user) : null; if (!k) continue;
    const g = groups.get(k) || { id: r.id, kind: r.post ? 'post' : 'user', count: 0, reasons: new Set(), by: [], media: !!r.post?.media?.url, preview: r.post ? `@${r.post.author?.username}: ${r.post.text || '[media]'}` : `@${r.user?.username}` };
    g.count++; g.reasons.add(r.reason); if (g.by.length < 3 && r.by) g.by.push(r.by.username); groups.set(k, g);
  }
  res.json({ users, posts, openReports: groups.size, recent: recent.map((u) => ({ ...pub(u), banned: !!u.banned, suspended: isSuspended(u), until: u.suspendedUntil || null })),
    reports: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 30).map((g) => ({ ...g, reasons: [...g.reasons] })),
    modlog: log.map((l) => ({ at: l.createdAt, mod: l.mod?.username, action: l.action, target: l.user ? '@' + l.user.username : l.post ? 'a post' : '', note: l.note || '' })),
    filters: req.me.admin ? (await Filter.find().sort('word').limit(200)).map((f) => f.word) : [] });
});

app.post('/api/admin/reports/:id', modr, async (req, res) => {
  const r = OID.test(req.params.id) ? await Report.findById(req.params.id).populate('post') : null; if (!r) return res.sendStatus(404);
  const a = String(req.body.action || ''), targetId = r.user || r.post?.author, same = { status: 'open', ...(r.post ? { post: r.post._id } : { user: r.user }) };
  if (a === 'delete' && r.post) {
    await Post.deleteMany({ $or: [{ _id: r.post._id }, { repostOf: r.post._id }] }); await Post.updateMany({ quoteOf: r.post._id }, { quoteDeleted: true });
    await Note.deleteMany({ post: r.post._id }); await logMod(req.me, 'delete post', { user: r.post.author, post: r.post._id, note: (r.post.text || '').slice(0, 100) });
  } else if (a === 'sensitive' && r.post) { await Post.updateOne({ _id: r.post._id }, { sensitive: true }); await logMod(req.me, 'mark sensitive', { user: r.post.author, post: r.post._id });
  } else if ((a === 'suspend7' || a === 'ban') && targetId) {
    const u = await User.findById(targetId); if (!canActOn(req.me, u)) return res.status(403).json({ error: 'You can’t do that to this account' });
    await suspend(req.me, u, a === 'ban' ? 0 : 7, 'Reported content');
  } else if (a !== 'dismiss') return res.sendStatus(400);
  if (a === 'dismiss') await logMod(req.me, 'dismiss report', { user: r.user || r.post?.author });
  await Report.updateMany(same, { status: a === 'dismiss' ? 'dismissed' : 'actioned' }); res.json({ ok: true });
});

app.post('/api/admin/users/:id/suspend', modr, async (req, res) => { // days: 1-365 timed, 0 permanent, -1 lift
  const u = OID.test(req.params.id) ? await User.findById(req.params.id) : null;
  if (!canActOn(req.me, u)) return res.status(403).json({ error: 'You can’t do that to this account' });
  const days = parseInt(req.body.days); if (!Number.isInteger(days) || days < -1 || days > 365) return res.sendStatus(400);
  await suspend(req.me, u, days, req.body.reason); res.json({ ok: true });
});

app.post('/api/admin/users/:id/mod', adm, async (req, res) => {
  const u = OID.test(req.params.id) ? await User.findById(req.params.id) : null;
  if (!u || u.admin || u.ghost) return res.sendStatus(404);
  u.mod = !!req.body.on; await u.save(); await logMod(req.me, u.mod ? 'make moderator' : 'remove moderator', { user: u._id }); res.json({ mod: u.mod });
});

app.post('/api/admin/filters', adm, async (req, res) => {
  const w = String(req.body.word || '').trim().toLowerCase().slice(0, 40);
  if (w.length < 2) return res.status(400).json({ error: 'Enter a word or phrase (2+ characters)' });
  if ((await Filter.countDocuments()) >= 500) return res.status(400).json({ error: 'Filter list is full' });
  await Filter.updateOne({ word: w }, { word: w }, { upsert: true }); resetFilter(); await logMod(req.me, 'add blocked word', { note: w }); res.json({ ok: true });
});

app.delete('/api/admin/filters/:word', adm, async (req, res) => { await Filter.deleteOne({ word: String(req.params.word).toLowerCase() }); resetFilter(); await logMod(req.me, 'remove blocked word', { note: req.params.word }); res.json({ ok: true }); });

app.post('/api/admin/users/:id', adm, async (req, res) => {
  const set = {};
  if (['', 'verified', 'business', 'government', 'owner'].includes(req.body.badge)) set.badge = req.body.badge;
  await User.updateOne({ _id: req.params.id }, set); res.json({ ok: true });
});

app.post('/api/admin/users/:id/reset-link', adm, async (req, res) => {
  const u = OID.test(req.params.id) ? await User.findById(req.params.id) : null;
  if (!u) return res.sendStatus(404);
  res.json({ link: `${APP(req)}/#/reset/${jwt.sign({ id: u.id, t: 'reset', ph: u.hash.slice(-12) }, JWT_SECRET, { expiresIn: '1h' })}` });
});
