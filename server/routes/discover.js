// Explore, trends, search, suggestions, @mention and GIF lookups.
const { app } = require('../app');
const { pop, pub, shape } = require('../lib/shape');
const { TOPICS } = require('../lib/topics');
const { fakeVal, has } = require('../lib/util');
const { hiddenCommunities, hiddenFor, hiddenPosts } = require('../lib/visibility');
const { Community, Post, User } = require('../models');

app.get('/api/suggest', async (req, res) => {
  const ex = req.me ? [...req.me.following, req.me._id, ...(await hiddenFor(req.me))] : [];
  res.json((await User.find({ _id: { $nin: ex }, ghost: { $ne: true } }).sort('-createdAt').limit(4)).map(pub));
});

// Explore: trending posts (engagement with time decay, incl. the owner's boosts), hashtags and topic counts; cached 45s
let exploreCache = { at: 0, data: null };

async function exploreData() {
  if (exploreCache.data && Date.now() - exploreCache.at < 45000) return exploreCache.data;
  const ps = await Post.find({ createdAt: { $gt: new Date(Date.now() - 3 * 864e5) }, parent: null, repostOf: null, author: { $nin: await User.distinct('_id', { protected: true }) }, community: { $nin: await Community.distinct('_id', { joinMode: 'request' }) }, ...visible() }).sort('-createdAt').limit(400);
  const score = (p) => { const eng = p.likes.length + fakeVal(p.fake?.likes) + 2 * (p.reposts.length + (p.quotes || 0) + fakeVal(p.fake?.reposts)) + 1.5 * p.replies + 0.02 * ((p.views || 0) + fakeVal(p.fake?.views)); return eng / Math.pow((Date.now() - p.createdAt) / 36e5 + 2, 1.2); };
  const ids = ps.map((p) => [p, score(p)]).filter(([, sc]) => sc > 0).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([p]) => p.id);
  const tags = {};
  for (const p of ps) for (const t of new Set((p.text || '').toLowerCase().match(/#\w+/g) || [])) { (tags[t.slice(1)] ||= new Set()).add(String(p.author)); }
  const topTags = Object.entries(tags).map(([tag, a]) => ({ tag, count: ps.filter((p) => (p.text || '').toLowerCase().includes('#' + tag)).length, people: a.size })).sort((a, b) => b.people - a.people || b.count - a.count).slice(0, 15);
  const tc = Object.fromEntries((await Post.aggregate([{ $match: { createdAt: { $gt: new Date(Date.now() - 7 * 864e5) }, topics: { $exists: true, $ne: [] } } }, { $unwind: '$topics' }, { $group: { _id: '$topics', n: { $sum: 1 } } }])).map((x) => [x._id, x.n]));
  exploreCache = { at: Date.now(), data: { ids, tags: topTags, topics: TOPICS.map((t) => ({ slug: t.slug, name: t.name, emoji: t.emoji, count: tc[t.slug] || 0 })) } };
  return exploreCache.data;
}

app.get('/api/explore', async (req, res) => {
  const d = await exploreData();
  const ps = await pop(Post.find({ _id: { $in: d.ids }, author: { $nin: await hiddenPosts(req.me) }, community: { $nin: await hiddenCommunities(req.me) }, ...visible() }));
  const by = new Map(ps.map((p) => [p.id, p]));
  res.json({ posts: d.ids.map((i) => by.get(i)).filter(Boolean).slice(0, 20).map((p) => shape(p, req.me)), tags: d.tags, topics: d.topics });
});

app.get('/api/trends', async (_req, res) => {
  const ps = await Post.find({ createdAt: { $gt: new Date(Date.now() - 7 * 864e5) }, repostOf: null, author: { $nin: await User.distinct('_id', { protected: true }) }, community: { $nin: await Community.distinct('_id', { joinMode: 'request' }) }, ...visible() }).select('text').limit(500);
  const c = {};
  ps.forEach((p) => new Set(p.text.toLowerCase().match(/#\w+/g) || []).forEach((t) => (c[t.slice(1)] = (c[t.slice(1)] || 0) + 1)));
  res.json(Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag, count]) => ({ tag, count })));
});

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 50);
  if (!q) return res.json({ users: [], posts: [] });
  const r = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const hidden = await hiddenFor(req.me), hp = await hiddenPosts(req.me);
  const [us, ps] = await Promise.all([User.find({ $or: [{ username: r }, { name: r }], _id: { $nin: hidden }, ghost: { $ne: true } }).limit(5), pop(Post.find({ text: r, repostOf: null, author: { $nin: hp }, community: { $nin: await hiddenCommunities(req.me) }, ...visible() }).sort('-createdAt').limit(20))]);
  res.json({ users: us.map((u) => ({ ...pub(u), isFollowing: !!req.me && has(req.me.following, u.id) })), posts: ps.map((p) => shape(p, req.me)) });
});

app.get('/api/gifs', async (req, res) => {
  const k = process.env.GIPHY_API_KEY; if (!k) return res.json([]);
  const q = String(req.query.q || '').trim();
  const r = await fetch(`https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}?api_key=${k}&limit=24&rating=pg-13&q=${encodeURIComponent(q)}`);
  res.json(((await r.json()).data || []).map((g) => g.images.fixed_height.url));
});
