// Bookmark folders.
const { app } = require('../app');
const { auth } = require('../lib/guards');
const { OID, has } = require('../lib/util');
const { Folder, Post, User } = require('../models');

app.get('/api/folders', auth, async (req, res) => res.json((await Folder.find({ user: req.me._id }).sort('createdAt')).map((f) => ({ id: f.id, name: f.name, count: f.posts.length, ...(OID.test(req.query.post || '') && { has: has(f.posts, req.query.post) }) }))));

app.post('/api/folders', auth, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: 'Give the folder a name' });
  if ((await Folder.countDocuments({ user: req.me._id })) >= 25) return res.status(400).json({ error: 'You can have up to 25 folders' });
  res.json({ id: (await Folder.create({ user: req.me._id, name })).id });
});

app.patch('/api/folders/:id', auth, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 30);
  if (!name || !OID.test(req.params.id)) return res.status(400).json({ error: 'Give the folder a name' });
  await Folder.updateOne({ _id: req.params.id, user: req.me._id }, { name }); res.json({ ok: true });
});

app.delete('/api/folders/:id', auth, async (req, res) => { if (OID.test(req.params.id)) await Folder.deleteOne({ _id: req.params.id, user: req.me._id }); res.json({ ok: true }); });

app.post('/api/folders/:id/posts/:pid', auth, async (req, res) => { // toggle; adding also bookmarks the post
  if (!OID.test(req.params.id) || !OID.test(req.params.pid)) return res.sendStatus(404);
  const f = await Folder.findOne({ _id: req.params.id, user: req.me._id });
  if (!f || !(await Post.exists({ _id: req.params.pid }))) return res.sendStatus(404);
  const on = !has(f.posts, req.params.pid);
  await Folder.updateOne({ _id: f._id }, on ? { $addToSet: { posts: req.params.pid } } : { $pull: { posts: req.params.pid } });
  if (on && !has(req.me.bookmarks, req.params.pid)) { await User.updateOne({ _id: req.me._id }, { $addToSet: { bookmarks: req.params.pid } }); await Post.updateOne({ _id: req.params.pid }, { $inc: { saves: 1 } }); }
  res.json({ in: on });
});
