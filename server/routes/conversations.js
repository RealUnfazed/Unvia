// Direct messages.
const { app } = require('../app');
const { PUSH } = require('../config');
const { convShape, convVisible, markRead, msgShape, myConv, purgeConv, readOf } = require('../lib/dm');
const { auth } = require('../lib/guards');
const { pushAllowed, pushTo, snip } = require('../lib/notify');
const { pfUpload, upload } = require('../lib/uploads');
const { has } = require('../lib/util');
const { blockedFor } = require('../lib/visibility');
const { Conv, Msg, User } = require('../models');

app.get('/api/conversations', auth, async (req, res) => {
  const wantReq = req.query.box === 'requests', bl = await blockedFor(req.me);
  const cs = (await Conv.find({ members: req.me._id, lastAt: { $ne: null } }).sort('-lastAt').limit(100).populate('members'))
    .filter((c) => convVisible(c, req.me, bl) && (!!c.requestFor && String(c.requestFor) === req.me.id) === wantReq);
  res.json(cs.slice(0, 50).map((c) => convShape(c, req.me)));
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
  if (PUSH) await Promise.race([Promise.all(c.members.filter((x) => String(x._id) !== req.me.id && !has(x.blocked, req.me.id) && !has(x.muted, req.me.id) && pushAllowed(x.pushLevel || 'all', 'dm'))
    .map((x) => pushTo(x._id, { title: c.group ? `${req.me.name} · ${c.name || 'Group'}` : req.me.name, body: text ? snip(text) : '📷 Photo', url: '/#/messages/' + c.id, tag: 'dm:' + c.id }))).catch(() => {}), new Promise((ok) => setTimeout(ok, 2500))]);
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
