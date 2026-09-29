require('dotenv').config();
const express = require('express'), cors = require('cors'), mongoose = require('mongoose'), bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'), multer = require('multer'), path = require('path');

const { MONGODB_URI, JWT_SECRET = 'dev-secret', POSTFILE_API_KEY } = process.env;
const PF = 'https://postfile.net/v1', pfH = { 'X-API-Key': POSTFILE_API_KEY };

let conn; // cached so serverless invocations reuse the connection
const db = () => (conn ||= mongoose.connect(MONGODB_URI));
const Id = mongoose.Schema.Types.ObjectId;
const M = (n, s) => mongoose.models[n] || mongoose.model(n, new mongoose.Schema(s, { timestamps: true }));
const User = M('User', {
  username: { type: String, unique: true, lowercase: true, trim: true, match: /^[a-z0-9_]{3,15}$/ },
  name: String, bio: { type: String, default: '', maxlength: 160 }, hash: String,
  following: [Id], bookmarks: [Id], blocked: [Id], muted: [Id], pinned: Id, avatar: String, banner: String, badge: { type: String, default: '' }, admin: Boolean, banned: Boolean,
  ghost: Boolean, fake: mongoose.Schema.Types.Mixed, // { target, mode: 'instant'|'gradual', startAt, endAt, startVal }
});
const Post = M('Post', {
  author: { type: Id, ref: 'User', index: true }, text: { type: String, maxlength: 280, default: '' },
  media: { url: String, fileId: String }, likes: [Id], reposts: [Id], replies: { type: Number, default: 0 }, saves: { type: Number, default: 0 },
  parent: { type: Id, index: true }, repostOf: { type: Id, ref: 'Post' }, quoteOf: { type: Id, ref: 'Post' }, quoteDeleted: Boolean, quotes: { type: Number, default: 0 }, visibleAt: Date,
  fake: { likes: mongoose.Schema.Types.Mixed, reposts: mongoose.Schema.Types.Mixed, saves: mongoose.Schema.Types.Mixed },
});

const Report = M('Report', { by: { type: Id, ref: 'User' }, post: { type: Id, ref: 'Post' }, user: { type: Id, ref: 'User' }, reason: String, status: { type: String, default: 'open' } });
const Notif = M('Notif', { to: { type: Id, index: true }, from: { type: Id, ref: 'User' }, type: String, post: { type: Id, ref: 'Post' }, read: { type: Boolean, default: false } });
const has = (a, id) => a.some((x) => String(x) === String(id));
// Users whose content I shouldn't see: ones I blocked or muted, plus ones who blocked me.
const hiddenFor = async (me) => (me ? [...new Set([...me.blocked, ...me.muted, ...(await User.distinct('_id', { blocked: me._id }))].map(String))] : []);
// One notification per (recipient, sender, type, post); upsert makes repeat likes/follows idempotent.
async function notify(to, from, type, post) {
  if (!to || String(to) === String(from)) return;
  await Notif.updateOne({ to, from, type, post: post || null }, { $setOnInsert: { read: false } }, { upsert: true });
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
const visible = { $or: [{ visibleAt: null }, { visibleAt: { $exists: false } }, { visibleAt: { $lte: new Date() } }] };
const pub = (u) => ({ id: u.id, username: u.username, name: u.name, bio: u.bio, avatar: u.avatar, banner: u.banner, badge: u.badge, admin: !!u.admin, pinned: u.pinned ? String(u.pinned) : null });
const pop = (q) => q.populate('author').populate({ path: 'repostOf', populate: { path: 'author' } }).populate({ path: 'quoteOf', populate: { path: 'author' } });
const shape = (p, me) => {
  const o = p.repostOf?.author ? p.repostOf : p;
  return {
    id: o.id, text: o.text, media: o.media?.url, at: o.createdAt, author: o.author && pub(o.author),
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
  try { req.me = await User.findById(jwt.verify((req.headers.authorization || '').slice(7), JWT_SECRET).id); } catch {}
  const ow = (process.env.OWNER_USERNAME || '').toLowerCase();
  if (req.me && ow && !req.me.admin && req.me.username === ow) { req.me.admin = true; req.me.badge = 'owner'; await req.me.save(); }
  next();
});
const auth = (req, res, next) => (req.me && !req.me.banned ? next() : res.status(req.me ? 403 : 401).json({ error: req.me ? 'Account suspended' : 'Log in first' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const sign = (u) => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '30d' });

app.post('/api/auth/register', async (req, res) => {
  const { username, password, name } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password needs 8+ characters' });
  try {
    const owner = !(await User.exists({})) || String(username).toLowerCase() === (process.env.OWNER_USERNAME || '').toLowerCase();
    const u = await User.create({ username, name: (name || username).slice(0, 30), hash: await bcrypt.hash(password, 10), admin: owner, badge: owner ? 'owner' : '' });
    res.json({ token: sign(u), user: pub(u) });
  } catch (e) {
    res.status(400).json({ error: e.code === 11000 ? 'Username taken' : 'Username: 3-15 letters, numbers or _' });
  }
});
app.post('/api/auth/login', async (req, res) => {
  const u = await User.findOne({ username: String(req.body.username || '').toLowerCase() });
  if (!u || !(await bcrypt.compare(req.body.password || '', u.hash))) return res.status(401).json({ error: 'Wrong username or password' });
  res.json({ token: sign(u), user: pub(u) });
});
app.get('/api/me', auth, (req, res) => res.json({ user: pub(req.me) }));
app.patch('/api/me', auth, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), async (req, res) => {
  req.me.name = String(req.body.name || req.me.name).slice(0, 30);
  req.me.bio = String(req.body.bio || '').slice(0, 160);
  for (const k of ['avatar', 'banner']) {
    const f = req.files?.[k]?.[0];
    if (f?.mimetype.startsWith('image/')) { const r = await pfUpload(f); if (!r) return res.status(502).json({ error: 'Image upload failed' }); req.me[k] = r.url; }
  }
  await req.me.save();
  res.json({ user: pub(req.me) });
});

// feed = all | following | bookmarks | user:<name> | replies:<name> | media:<name> | likes:<name> (own only); paginated by `before`
app.get('/api/posts', async (req, res) => {
  const { feed = 'all', before } = req.query, me = req.me, f = { parent: null }, hidden = await hiddenFor(me);
  let pinnedUser;
  if (feed === 'following') { if (!me) return res.json([]); f.author = { $in: [...me.following, me.id].filter((x) => !hidden.includes(String(x))) }; }
  else if (feed === 'bookmarks') { if (!me) return res.json([]); delete f.parent; f._id = { $in: me.bookmarks }; }
  else if (/^(user|replies|media|likes):/.test(feed)) {
    const [kind, name] = [feed.split(':')[0], feed.slice(feed.indexOf(':') + 1).toLowerCase()];
    const u = await User.findOne({ username: name });
    if (!u || (me && (u.blocked || []).some((x) => String(x) === me.id))) return res.json([]); // they blocked me
    if (kind === 'likes') { if (me?.id !== u.id) return res.json([]); delete f.parent; f.likes = u._id; }
    else { f.author = u._id; if (kind === 'replies') f.parent = { $ne: null }; if (kind === 'media') { f['media.url'] = { $exists: true, $ne: null }; f.repostOf = null; } if (kind === 'user') pinnedUser = u; }
  } else if (hidden.length) f.author = { $nin: hidden };
  if (before) f.createdAt = { $lt: new Date(before) };
  let out = (await pop(Post.find({ ...f, ...visible }).sort('-createdAt').limit(20))).map((p) => shape(p, me));
  if (pinnedUser?.pinned && !before) { // pinned post leads the first page of a profile
    const pp = await pop(Post.findById(pinnedUser.pinned));
    if (pp) out = [{ ...shape(pp, me), pinned: true }, ...out.filter((x) => x.id !== pp.id)];
  }
  res.json(out);
});

app.get('/api/posts/refresh', async (req, res) => {
  const ids = String(req.query.ids || '').split(',').filter((x) => /^[a-f0-9]{24}$/.test(x)).slice(0, 150);
  if (!ids.length) return res.json([]);
  res.json((await pop(Post.find({ _id: { $in: ids } }))).map((p) => shape(p, req.me)));
});

app.get('/api/posts/:id', async (req, res) => {
  const p = await pop(Post.findById(req.params.id));
  if (!p) return res.sendStatus(404);
  const hidden = await hiddenFor(req.me);
  const [rs, par] = await Promise.all([pop(Post.find({ parent: p._id, author: { $nin: hidden }, ...visible }).sort('createdAt').limit(50)), p.parent ? pop(Post.findById(p.parent)) : null]);
  res.json({ post: shape(p, req.me), parent: par && shape(par, req.me), replies: rs.map((r) => shape(r, req.me)) });
});

app.post('/api/posts', auth, upload.single('image'), async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text && !req.file && !req.body.gif && !req.body.quote) return res.status(400).json({ error: 'Write something or add an image' });
  let media;
  if (req.file) { // image goes to PostFile server-side so the key stays secret
    if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Only images are supported' });
    const form = new FormData();
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    const r = await fetch(`${PF}/upload`, { method: 'POST', headers: pfH, body: form });
    if (!r.ok) return res.status(502).json({ error: `Image upload failed (${r.status})` });
    const f = await r.json();
    media = { url: f.url, fileId: f.file_id };
  }
  if (!req.file && req.body.gif) { try { if (new URL(req.body.gif).hostname.endsWith('giphy.com')) media = { url: req.body.gif }; } catch {} }
  const parent = req.body.parent || undefined;
  const quoteOf = /^[a-f0-9]{24}$/.test(req.body.quote || '') && (await Post.exists({ _id: req.body.quote })) ? req.body.quote : undefined;
  const p = await Post.create({ author: req.me._id, text, media, parent, quoteOf });
  if (quoteOf) await Post.updateOne({ _id: quoteOf }, { $inc: { quotes: 1 } });
  if (parent) await Post.updateOne({ _id: parent }, { $inc: { replies: 1 } });
  const told = new Set([String(req.me._id)]);
  const tell = async (to, type) => { if (to && !told.has(String(to))) { told.add(String(to)); await notify(to, req.me._id, type, p._id); } };
  if (parent) await tell((await Post.findById(parent).select('author'))?.author, 'reply');
  if (quoteOf) await tell((await Post.findById(quoteOf).select('author'))?.author, 'quote');
  const names = [...new Set((text.match(/(?:^|\s)@(\w{3,15})/g) || []).map((x) => x.trim().slice(1).toLowerCase()))].slice(0, 10);
  if (names.length) for (const u of await User.find({ username: { $in: names }, ghost: { $ne: true } }).select('_id')) await tell(u._id, 'mention');
  res.json(shape(await pop(Post.findById(p.id)), req.me));
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
  if (p.media?.fileId) await fetch(`${PF}/files/${p.media.fileId}`, { method: 'DELETE', headers: pfH }).catch(() => {});
  res.json({ ok: true });
});

app.get('/api/users/:u', async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u) return res.sendStatus(404);
  const [followers, posts] = await Promise.all([User.countDocuments({ following: u._id }), Post.countDocuments({ author: u._id, parent: null, repostOf: null })]);
  res.json({ ...pub(u), joined: u.createdAt, following: u.following.length, followers: followers + fakeVal(u.fake), posts, isFollowing: !!req.me && has(req.me.following, u.id),
    blocked: !!req.me && has(req.me.blocked, u.id), muted: !!req.me && has(req.me.muted, u.id), blockedBy: !!req.me && has(u.blocked, req.me.id) });
});
app.post('/api/users/:u/follow', auth, async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u || u.id === req.me.id) return res.sendStatus(400);
  if (has(req.me.blocked, u.id) || has(u.blocked, req.me.id)) return res.status(403).json({ error: 'You can’t follow this account' });
  const on = !has(req.me.following, u.id);
  await User.updateOne({ _id: req.me._id }, on ? { $addToSet: { following: u._id } } : { $pull: { following: u._id } });
  await (on ? notify(u._id, req.me._id, 'follow') : unnotify(u._id, req.me._id, 'follow'));
  res.json({ isFollowing: on });
});
const userList = (filter) => async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u) return res.sendStatus(404);
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
const notifQuery = async (me) => ({ to: me._id, from: { $nin: await hiddenFor(me) } });
app.get('/api/notifications', auth, async (req, res) => {
  const ns = await Notif.find(await notifQuery(req.me)).sort('-createdAt').limit(60).populate('from').populate('post');
  res.json(ns.filter((n) => n.from).map((n) => ({ id: n.id, type: n.type, read: n.read, at: n.createdAt, from: pub(n.from), post: n.post ? { id: n.post.id, text: n.post.text, media: !!n.post.media?.url } : null })));
});
app.get('/api/notifications/count', auth, async (req, res) => res.json({ unread: await Notif.countDocuments({ ...(await notifQuery(req.me)), read: false }) }));
app.post('/api/notifications/read', auth, async (req, res) => { await Notif.updateMany({ to: req.me._id, read: false }, { read: true }); res.json({ ok: true }); });
app.get('/api/suggest', async (req, res) => {
  const ex = req.me ? [...req.me.following, req.me._id, ...(await hiddenFor(req.me))] : [];
  res.json((await User.find({ _id: { $nin: ex }, ghost: { $ne: true } }).sort('-createdAt').limit(4)).map(pub));
});

app.get('/api/trends', async (_req, res) => {
  const ps = await Post.find({ createdAt: { $gt: new Date(Date.now() - 7 * 864e5) }, repostOf: null }).select('text').limit(500);
  const c = {};
  ps.forEach((p) => new Set(p.text.toLowerCase().match(/#\w+/g) || []).forEach((t) => (c[t.slice(1)] = (c[t.slice(1)] || 0) + 1)));
  res.json(Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => ({ tag, count })));
});
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 50);
  if (!q) return res.json({ users: [], posts: [] });
  const r = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const hidden = await hiddenFor(req.me);
  const [us, ps] = await Promise.all([User.find({ $or: [{ username: r }, { name: r }], _id: { $nin: hidden }, ghost: { $ne: true } }).limit(5), pop(Post.find({ text: r, repostOf: null, author: { $nin: hidden }, ...visible }).sort('-createdAt').limit(20))]);
  res.json({ users: us.map((u) => ({ ...pub(u), isFollowing: !!req.me && has(req.me.following, u.id) })), posts: ps.map((p) => shape(p, req.me)) });
});

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
  req.me.hash = await bcrypt.hash(req.body.next, 10); await req.me.save(); res.json({ ok: true });
});
app.delete('/api/me', auth, async (req, res) => {
  await Post.deleteMany({ author: req.me._id }); await User.deleteOne({ _id: req.me._id }); res.json({ ok: true });
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

app.use(express.static(path.join(__dirname, 'public')));
app.use((e, _q, res, _n) => {
  console.error(e);
  if (e.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Image must be under 4 MB' });
  res.status(500).json({ error: 'Server error' });
});
if (require.main === module) app.listen(process.env.PORT || 3000, () => console.log('http://localhost:3000'));
module.exports = app;
