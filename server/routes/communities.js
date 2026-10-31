// Communities.
const { app } = require('../app');
const { auth } = require('../lib/guards');
const { mine, pub } = require('../lib/shape');
const { pfDelete } = require('../lib/uploads');
const { OID, has, oid } = require('../lib/util');
const { canSeeCommunity } = require('../lib/visibility');
const { Community, Post, User } = require('../models');

const commShape = (c, me) => {
  const mod = !!me && (oid(c.owner) === me.id || has(c.mods, me.id));
  return { id: c.id, name: c.name, description: c.description || '', rules: c.rules || [], joinMode: c.joinMode, members: c.members.length, canSee: canSeeCommunity(c, me), requested: !!me && has(c.requests, me.id), requests: mod ? c.requests.length : 0,
    role: !me ? null : oid(c.owner) === me.id ? 'owner' : has(c.mods, me.id) ? 'mod' : has(c.members, me.id) ? 'member' : null };
};

async function loadComm(req, res, need) { // need: 'mod' | 'owner' | undefined
  const c = OID.test(req.params.id) ? await Community.findById(req.params.id) : null;
  if (!c) { res.sendStatus(404); return null; }
  const me = req.me, isOwner = !!me && oid(c.owner) === me.id, isMod = isOwner || (!!me && has(c.mods, me.id));
  if ((need === 'owner' && !isOwner) || (need === 'mod' && !isMod)) { res.status(403).json({ error: 'Only moderators can do that' }); return null; }
  return c;
}

app.get('/api/communities', async (req, res) => {
  const me = req.me;
  const [mine, discover] = await Promise.all([me ? Community.find({ members: me._id }).sort('-createdAt') : [], Community.find(me ? { members: { $ne: me._id } } : {}).sort('-createdAt').limit(30)]);
  res.json({ mine: mine.map((c) => commShape(c, me)), discover: discover.map((c) => commShape(c, me)) });
});

app.post('/api/communities', auth, async (req, res) => {
  const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 40) return res.status(400).json({ error: 'Name must be 3 to 40 characters' });
  if ((await Community.countDocuments({ owner: req.me._id })) >= 10) return res.status(400).json({ error: 'You can own up to 10 communities' });
  const rules = (Array.isArray(req.body.rules) ? req.body.rules : []).map((r) => String(r).trim().slice(0, 120)).filter(Boolean).slice(0, 8);
  try {
    const c = await Community.create({ name, nameKey: name.toLowerCase(), description: String(req.body.description || '').trim().slice(0, 300), rules, owner: req.me._id, members: [req.me._id], joinMode: req.body.joinMode === 'request' ? 'request' : 'open' });
    res.json({ id: c.id });
  } catch (e) { res.status(e.code === 11000 ? 409 : 500).json({ error: e.code === 11000 ? 'A community with that name already exists' : 'Server error' }); }
});

app.get('/api/communities/:id', async (req, res) => {
  const c = await loadComm(req, res); if (!c) return;
  const out = { community: commShape(c, req.me), members: [] };
  if (out.community.canSee) out.members = (await User.find({ _id: { $in: c.members.slice(0, 100) }, ghost: { $ne: true } })).map((u) => ({ ...pub(u), role: oid(c.owner) === u.id ? 'owner' : has(c.mods, u.id) ? 'mod' : 'member' }));
  res.json(out);
});

app.post('/api/communities/:id/join', auth, async (req, res) => {
  const c = await loadComm(req, res); if (!c) return;
  if (has(c.members, req.me.id)) return res.status(400).json({ error: 'You’re already a member' });
  if (c.joinMode === 'open') { await Community.updateOne({ _id: c._id }, { $addToSet: { members: req.me._id } }); return res.json({ joined: true, requested: false }); }
  const asked = has(c.requests, req.me.id);
  await Community.updateOne({ _id: c._id }, asked ? { $pull: { requests: req.me._id } } : { $addToSet: { requests: req.me._id } });
  res.json({ joined: false, requested: !asked });
});

app.post('/api/communities/:id/leave', auth, async (req, res) => {
  const c = await loadComm(req, res); if (!c) return;
  if (oid(c.owner) === req.me.id) return res.status(400).json({ error: 'Owners can’t leave. Delete the community instead.' });
  await Community.updateOne({ _id: c._id }, { $pull: { members: req.me._id, mods: req.me._id, requests: req.me._id } }); res.json({ ok: true });
});

app.get('/api/communities/:id/requests', auth, async (req, res) => {
  const c = await loadComm(req, res, 'mod'); if (!c) return;
  res.json((await User.find({ _id: { $in: c.requests }, ghost: { $ne: true } }).limit(100)).map(pub));
});

app.post('/api/communities/:id/requests/:username/:act', auth, async (req, res) => {
  const c = await loadComm(req, res, 'mod'); if (!c) return;
  const u = await User.findOne({ username: req.params.username.toLowerCase() });
  if (!u || !has(c.requests, u.id) || !['approve', 'deny'].includes(req.params.act)) return res.sendStatus(404);
  await Community.updateOne({ _id: c._id }, { $pull: { requests: u._id }, ...(req.params.act === 'approve' && { $addToSet: { members: u._id } }) });
  res.json({ ok: true });
});

app.post('/api/communities/:id/members/:username/remove', auth, async (req, res) => {
  const c = await loadComm(req, res, 'mod'); if (!c) return;
  const u = await User.findOne({ username: req.params.username.toLowerCase() });
  if (!u || !has(c.members, u.id) || oid(c.owner) === u.id || (has(c.mods, u.id) && oid(c.owner) !== req.me.id)) return res.status(403).json({ error: 'You can’t remove this member' });
  await Community.updateOne({ _id: c._id }, { $pull: { members: u._id, mods: u._id } }); res.json({ ok: true });
});

app.post('/api/communities/:id/mods/:username', auth, async (req, res) => {
  const c = await loadComm(req, res, 'owner'); if (!c) return;
  const u = await User.findOne({ username: req.params.username.toLowerCase() });
  if (!u || !has(c.members, u.id) || oid(c.owner) === u.id) return res.sendStatus(404);
  const on = !has(c.mods, u.id);
  await Community.updateOne({ _id: c._id }, on ? { $addToSet: { mods: u._id } } : { $pull: { mods: u._id } }); res.json({ mod: on });
});

app.patch('/api/communities/:id', auth, async (req, res) => {
  const c = await loadComm(req, res, 'owner'); if (!c) return;
  if ('description' in req.body) c.description = String(req.body.description).trim().slice(0, 300);
  if (Array.isArray(req.body.rules)) c.rules = req.body.rules.map((r) => String(r).trim().slice(0, 120)).filter(Boolean).slice(0, 8);
  if (['open', 'request'].includes(req.body.joinMode)) { c.joinMode = req.body.joinMode; if (c.joinMode === 'open' && c.requests.length) { c.members.push(...c.requests.filter((r) => !has(c.members, r))); c.requests = []; } }
  await c.save(); res.json({ ok: true });
});

app.delete('/api/communities/:id', auth, async (req, res) => {
  const c = await loadComm(req, res, 'owner'); if (!c) return;
  for (const p of await Post.find({ community: c._id, 'images.fileId': { $exists: true } }).select('images')) for (const im of p.images) if (im.fileId) pfDelete(im.fileId);
  await Post.deleteMany({ community: c._id }); await Community.deleteOne({ _id: c._id }); res.json({ ok: true });
});
