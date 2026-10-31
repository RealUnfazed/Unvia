// Drafts and scheduled posts.
const { app } = require('../app');
const { auth } = require('../lib/guards');
const { Draft, Post } = require('../models');

// scheduled posts stay hidden (see `visible()`) until their time; these let the author manage them
app.get('/api/scheduled', auth, async (req, res) => {
  const ps = await Post.find({ author: req.me._id, scheduled: true, visibleAt: { $gt: new Date() } }).sort('visibleAt').limit(100);
  res.json(ps.map((p) => ({ id: p.id, text: p.text, at: p.visibleAt })));
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
