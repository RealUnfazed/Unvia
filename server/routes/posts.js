// Posts: feeds, create/edit/delete, reactions, polls, pinning.
const { app } = require('../app');
const { auth } = require('../lib/guards');
const { linkPreview } = require('../lib/linkpreview');
const { blockedText, isSuspended } = require('../lib/moderation');
const { notify, unnotify } = require('../lib/notify');
const { canReplyTo, pop, replyMsg, shape } = require('../lib/shape');
const { topicsOf } = require('../lib/topics');
const { pfDelete, pfUpload, upload } = require('../lib/uploads');
const { OID, has } = require('../lib/util');
const { canSeeCommunity, hiddenCommunities, hiddenPosts, isMember } = require('../lib/visibility');
const { Community, Daily, Folder, List, Note, Notif, Post, User } = require('../models');

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
    if (isSuspended(u)) return res.json([]);
    if (kind === 'likes') { if (me?.id !== u.id) return res.json([]); delete f.parent; f.likes = u._id; if (hidden.length) f.author = { $nin: hidden }; }
    else { f.author = u._id; if (kind === 'replies') f.parent = { $ne: null }; if (kind === 'media') { f['media.url'] = { $exists: true, $ne: null }; f.repostOf = null; } if (kind === 'user') pinnedUser = u; }
  } else if (feed.startsWith('list:')) {
    const l = OID.test(feed.slice(5)) ? await List.findById(feed.slice(5)) : null;
    if (!l || (l.private && String(l.owner) !== me?.id)) return res.json([]);
    f.author = { $in: l.members.filter((x) => !hidden.includes(String(x))) };
  } else if (feed.startsWith('topic:')) { f.topics = feed.slice(6).toLowerCase().replace(/[^a-z-]/g, ''); if (hidden.length) f.author = { $nin: hidden };
  } else if (feed.startsWith('community:')) {
    const c = OID.test(feed.slice(10)) ? await Community.findById(feed.slice(10)) : null;
    if (!c || !canSeeCommunity(c, me)) return res.json([]);
    f.community = c._id; if (hidden.length) f.author = { $nin: hidden };
  } else if (feed.startsWith('folder:')) {
    const fo = me && OID.test(feed.slice(7)) ? await Folder.findOne({ _id: feed.slice(7), user: me._id }) : null;
    if (!fo) return res.json([]);
    delete f.parent; f._id = { $in: fo.posts }; if (hidden.length) f.author = { $nin: hidden };
  } else if (hidden.length) f.author = { $nin: hidden };
  const hc = await hiddenCommunities(me); if (hc.length && !f.community) f.community = { $nin: hc };
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
  res.json((await pop(Post.find({ _id: { $in: ids }, author: { $nin: await hiddenPosts(req.me) }, community: { $nin: await hiddenCommunities(req.me) }, ...visible() }))).map((p) => shape(p, req.me)));
});

app.get('/api/posts/:id', async (req, res) => {
  const p = await pop(Post.findById(req.params.id));
  if (!p) return res.sendStatus(404);
  if (p.visibleAt && p.visibleAt > new Date() && String(p.author?._id) !== req.me?.id) return res.sendStatus(404);
  const hidden = await hiddenPosts(req.me);
  if (p.community && (await hiddenCommunities(req.me)).includes(String(p.community._id))) return res.sendStatus(404);
  if (p.author && isSuspended(p.author) && !req.me?.admin && !req.me?.mod) return res.sendStatus(404);
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
  if (await blockedText(text)) return res.status(400).json({ error: 'Your post contains language that isn’t allowed here.' });
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
  let community;
  if (parent) { const pc = (await Post.findById(parent).select('community'))?.community; if (pc) { if (!(await isMember(pc, req.me))) return res.status(403).json({ error: 'Join this community to reply' }); community = pc; } }
  else if (OID.test(req.body.community || '')) { if (!(await isMember(req.body.community, req.me))) return res.status(403).json({ error: 'Join this community to post in it' }); community = req.body.community; }
  const p = await Post.create({ author: req.me._id, text, media: images[0], images, parent, quoteOf, poll, preview, replyLimit, topics: topicsOf(text), community, sensitive: images.length > 0 && req.body.sensitive === '1', ...(sched && { scheduled: true, visibleAt: sched, createdAt: sched }) });
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
  if (await blockedText(text)) return res.status(400).json({ error: 'Your post contains language that isn’t allowed here.' });
  p.text = text; p.topics = topicsOf(text);
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

app.post('/api/posts/:id/publish', auth, async (req, res) => {
  const p = await Post.findOne({ _id: req.params.id, author: req.me._id, scheduled: true, visibleAt: { $gt: new Date() } });
  if (!p) return res.sendStatus(404);
  await Post.collection.updateOne({ _id: p._id }, { $set: { createdAt: new Date(), scheduled: false }, $unset: { visibleAt: '' } }); // createdAt is immutable in Mongoose, so go native
  await Notif.updateMany({ post: p._id }, { $unset: { visibleAt: 1 } });
  res.json({ ok: true });
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
  if (on) await Folder.updateMany({ user: req.me._id, posts: req.params.id }, { $pull: { posts: req.params.id } });
  res.json({ ok: true });
});

app.delete('/api/posts/:id', auth, async (req, res) => {
  const p0 = OID.test(req.params.id) ? await Post.findById(req.params.id) : null;
  if (!p0) return res.sendStatus(404);
  const mod = p0.community && (await Community.exists({ _id: p0.community, $or: [{ owner: req.me._id }, { mods: req.me._id }] }));
  if (!(req.me.admin || mod || String(p0.author) === req.me.id)) return res.sendStatus(404);
  const p = await Post.findOneAndDelete({ _id: p0._id });
  if (!p) return res.sendStatus(404);
  await Note.deleteMany({ post: p._id }); await Daily.deleteMany({ post: p._id }); await Folder.updateMany({ posts: p._id }, { $pull: { posts: p._id } });
  await Post.deleteMany({ repostOf: p._id });
  await Notif.deleteMany({ post: p._id });
  await User.updateOne({ _id: p.author, pinned: p._id }, { $unset: { pinned: 1 } });
  await Post.updateMany({ quoteOf: p._id }, { quoteDeleted: true });
  if (p.parent) await Post.updateOne({ _id: p.parent }, { $inc: { replies: -1 } });
  if (p.quoteOf) await Post.updateOne({ _id: p.quoteOf }, { $inc: { quotes: -1 } });
  for (const im of p.images?.length ? p.images : [p.media]) if (im?.fileId) pfDelete(im.fileId);
  res.json({ ok: true });
});

app.post('/api/posts/:id/pin', auth, async (req, res) => {
  const p = await Post.findOne({ _id: req.params.id, author: req.me._id, parent: null, repostOf: null });
  if (!p) return res.sendStatus(404);
  const on = String(req.me.pinned) !== p.id;
  await User.updateOne({ _id: req.me._id }, on ? { pinned: p._id } : { $unset: { pinned: 1 } });
  res.json({ pinned: on });
});
