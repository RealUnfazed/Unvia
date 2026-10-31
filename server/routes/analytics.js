// View counting and analytics.
const { app } = require('../app');
const { auth } = require('../lib/guards');
const { clientIp } = require('../lib/ratelimit');
const { pollShape } = require('../lib/shape');
const { OID, fakeVal } = require('../lib/util');
const { Daily, Post, User, ViewSeen } = require('../models');

// views: one impression per viewer session per post (client dedupes); authors don't count their own
app.post('/api/views', async (req, res) => {
  const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).filter((x) => OID.test(x)))].slice(0, 40);
  if (ids.length) {
    const ps = (await Post.find({ _id: { $in: ids }, ...visible() }).select('author')).filter((p) => String(p.author) !== req.me?.id), day = new Date().toISOString().slice(0, 10);
    const who = req.me ? 'u' + req.me.id : 'i' + clientIp(req); // dedupe per viewer per post per day, so scripts can't inflate counts from one place
    const seen = ps.length ? await ViewSeen.bulkWrite(ps.map((p) => ({ updateOne: { filter: { _id: `${p.id}:${who}:${day}` }, update: { $setOnInsert: { at: new Date() } }, upsert: true } })), { ordered: false }) : null;
    const fresh = ps.filter((_, i) => seen?.upsertedIds && i in seen.upsertedIds);
    if (fresh.length) {
      await Post.updateMany({ _id: { $in: fresh.map((p) => p._id) } }, { $inc: { views: 1 } });
      await Daily.bulkWrite(fresh.map((p) => ({ updateOne: { filter: { post: p._id, day }, update: { $inc: { n: 1 }, $setOnInsert: { author: p.author } }, upsert: true } })));
    }
  }
  res.json({ ok: true });
});

const lastDays = (n) => Array.from({ length: n }, (_, i) => new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10));

app.get('/api/posts/:id/analytics', auth, async (req, res) => {
  const p = OID.test(req.params.id) ? await Post.findById(req.params.id) : null;
  if (!p || (String(p.author) !== req.me.id && !req.me.admin)) return res.sendStatus(404);
  const likes = p.likes.length + fakeVal(p.fake?.likes), reposts = p.reposts.length + fakeVal(p.fake?.reposts), quotes = p.quotes || 0, saves = (p.saves || 0) + fakeVal(p.fake?.saves), views = (p.views || 0) + fakeVal(p.fake?.views);
  const eng = likes + reposts + quotes + p.replies + saves, days = lastDays(14), rows = await Daily.find({ post: p._id, day: { $in: days } });
  res.json({ views, likes, reposts, quotes, replies: p.replies, saves, engagements: eng, rate: views ? Math.min(100, +((eng / views) * 100).toFixed(1)) : 0, votes: pollShape(p, req.me)?.total ?? null, daily: days.map((d) => ({ day: d, n: rows.find((r) => r.day === d)?.n || 0 })) });
});

app.get('/api/analytics', auth, async (req, res) => {
  const ps = await Post.find({ author: req.me._id, repostOf: null, ...visible() }).sort('-createdAt').limit(500);
  const row = (p) => ({ id: p.id, text: (p.text || '').slice(0, 90), at: p.createdAt, views: (p.views || 0) + fakeVal(p.fake?.views), likes: p.likes.length + fakeVal(p.fake?.likes), reposts: p.reposts.length + (p.quotes || 0) + fakeVal(p.fake?.reposts), replies: p.replies, saves: (p.saves || 0) + fakeVal(p.fake?.saves) });
  const rows = ps.map(row), sum = (k) => rows.reduce((a, r) => a + r[k], 0), days = lastDays(28);
  const d = await Daily.aggregate([{ $match: { author: req.me._id, day: { $in: days } } }, { $group: { _id: '$day', n: { $sum: '$n' } } }]);
  res.json({ posts: rows.length, views: sum('views'), likes: sum('likes'), reposts: sum('reposts'), replies: sum('replies'), saves: sum('saves'), followers: (await User.countDocuments({ following: req.me._id })) + fakeVal(req.me.fake),
    daily: days.map((x) => ({ day: x, n: d.find((r) => r._id === x)?.n || 0 })), top: [...rows].sort((a, b) => b.views - a.views).slice(0, 5) });
});
