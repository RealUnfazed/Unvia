// Owner-only fake engagement tools.
const { app } = require('../app');
const { adm } = require('../lib/guards');
const { pop } = require('../lib/shape');
const { fakeVal } = require('../lib/util');
const { Post, User } = require('../models');

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
  if (!['likes', 'reposts', 'saves', 'views'].includes(kind)) return res.status(400).json({ error: 'Bad metric' });
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
    pop(Post.find({ $or: [{ 'fake.likes.mode': 'gradual' }, { 'fake.reposts.mode': 'gradual' }, { 'fake.saves.mode': 'gradual' }, { 'fake.views.mode': 'gradual' }] }).limit(20)),
  ]);
  res.json({
    users: users.filter((u) => fakeVal(u.fake) < u.fake.target).map((u) => ({ id: u.id, username: u.username, ...u.fake, now: fakeVal(u.fake) })),
    posts: posts.map((p) => ({
      id: p.id, author: p.author?.username,
      fake: Object.fromEntries(['likes', 'reposts', 'saves', 'views'].filter((k) => p.fake?.[k]?.mode === 'gradual' && fakeVal(p.fake[k]) < p.fake[k].target).map((k) => [k, { ...p.fake[k], now: fakeVal(p.fake[k]) }])),
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
