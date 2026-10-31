// Lists.
const { app } = require('../app');
const { auth } = require('../lib/guards');
const { pub } = require('../lib/shape');
const { OID, has, oid } = require('../lib/util');
const { hiddenFor } = require('../lib/visibility');
const { List, User } = require('../models');

const listShape = (l, me) => ({ id: l.id, name: l.name, description: l.description || '', private: !!l.private, owner: l.owner?.username ? pub(l.owner) : null, members: l.members.length, subs: l.subs.length, mine: oid(l.owner) === me?.id, subscribed: !!me && has(l.subs, me.id), pinned: !!me && has(me.pinnedLists || [], l.id) });

async function loadList(req, res, ownerOnly) {
  const l = OID.test(req.params.id) ? await List.findById(req.params.id).populate('owner') : null;
  if (!l || (l.private && oid(l.owner) !== req.me?.id) || (ownerOnly && oid(l.owner) !== req.me?.id)) { res.sendStatus(404); return null; }
  return l;
}

app.get('/api/lists', auth, async (req, res) => {
  const hidden = await hiddenFor(req.me), ok = (l) => l.owner && !hidden.includes(oid(l.owner));
  const [owned, subscribed, discover] = await Promise.all([
    List.find({ owner: req.me._id }).sort('-createdAt').populate('owner'),
    List.find({ subs: req.me._id, private: { $ne: true } }).populate('owner'),
    List.find({ private: { $ne: true }, owner: { $ne: req.me._id }, subs: { $ne: req.me._id } }).sort('-createdAt').limit(20).populate('owner')]);
  res.json({ owned: owned.map((l) => listShape(l, req.me)), subscribed: subscribed.filter(ok).map((l) => listShape(l, req.me)), discover: discover.filter(ok).map((l) => listShape(l, req.me)) });
});

app.get('/api/lists/pinned', async (req, res) => {
  if (!req.me?.pinnedLists?.length) return res.json([]);
  const ls = await List.find({ _id: { $in: req.me.pinnedLists } });
  res.json(req.me.pinnedLists.map((id) => ls.find((l) => l.id === String(id))).filter((l) => l && (!l.private || String(l.owner) === req.me.id)).map((l) => ({ id: l.id, name: l.name })));
});

app.post('/api/lists', auth, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Give your list a name' });
  if ((await List.countDocuments({ owner: req.me._id })) >= 20) return res.status(400).json({ error: 'You can have up to 20 lists' });
  const l = await List.create({ owner: req.me._id, name, description: String(req.body.description || '').trim().slice(0, 100), private: !!req.body.private });
  res.json({ id: l.id });
});

app.get('/api/lists/:id', async (req, res) => {
  const l = await loadList(req, res); if (!l) return;
  const us = await User.find({ _id: { $in: l.members.slice(0, 200) }, ghost: { $ne: true } });
  res.json({ list: listShape(l, req.me), members: us.map((u) => ({ ...pub(u), isFollowing: !!req.me && has(req.me.following, u.id) })) });
});

app.patch('/api/lists/:id', auth, async (req, res) => {
  const l = await loadList(req, res, true); if (!l) return;
  if ('name' in req.body) { const n = String(req.body.name).trim().slice(0, 40); if (!n) return res.status(400).json({ error: 'Give your list a name' }); l.name = n; }
  if ('description' in req.body) l.description = String(req.body.description).trim().slice(0, 100);
  if ('private' in req.body) { l.private = !!req.body.private; if (l.private && l.subs.length) { await User.updateMany({ _id: { $in: l.subs } }, { $pull: { pinnedLists: l._id } }); l.subs = []; } }
  await l.save(); res.json({ ok: true });
});

app.delete('/api/lists/:id', auth, async (req, res) => {
  const l = await loadList(req, res, true); if (!l) return;
  await User.updateMany({ pinnedLists: l._id }, { $pull: { pinnedLists: l._id } }); await List.deleteOne({ _id: l._id }); res.json({ ok: true });
});

app.post('/api/lists/:id/members/:username', auth, async (req, res) => {
  const l = await loadList(req, res, true); if (!l) return;
  const u = await User.findOne({ username: req.params.username.toLowerCase(), ghost: { $ne: true } });
  if (!u) return res.sendStatus(404);
  const on = !has(l.members, u.id);
  if (on) {
    if (has(u.blocked, req.me.id)) return res.status(403).json({ error: 'You can’t add this account' });
    if (l.members.length >= 500) return res.status(400).json({ error: 'Lists can have up to 500 members' });
  }
  await List.updateOne({ _id: l._id }, on ? { $addToSet: { members: u._id } } : { $pull: { members: u._id } });
  res.json({ in: on });
});

app.get('/api/users/:u/list-memberships', auth, async (req, res) => { // for the "add to list" dialog
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u) return res.sendStatus(404);
  res.json((await List.find({ owner: req.me._id }).sort('-createdAt')).map((l) => ({ id: l.id, name: l.name, private: !!l.private, has: has(l.members, u.id) })));
});

app.post('/api/lists/:id/subscribe', auth, async (req, res) => {
  const l = await loadList(req, res); if (!l || oid(l.owner) === req.me.id) return res.sendStatus(404);
  const on = !has(l.subs, req.me.id);
  await List.updateOne({ _id: l._id }, on ? { $addToSet: { subs: req.me._id } } : { $pull: { subs: req.me._id } });
  if (!on) await User.updateOne({ _id: req.me._id }, { $pull: { pinnedLists: l._id } });
  res.json({ subscribed: on });
});

app.post('/api/lists/:id/pin', auth, async (req, res) => {
  const l = await loadList(req, res); if (!l) return;
  if (oid(l.owner) !== req.me.id && !has(l.subs, req.me.id)) return res.status(403).json({ error: 'Subscribe to this list first' });
  const on = !has(req.me.pinnedLists || [], l.id);
  if (on && (req.me.pinnedLists || []).length >= 5) return res.status(400).json({ error: 'You can pin up to 5 lists' });
  await User.updateOne({ _id: req.me._id }, on ? { $addToSet: { pinnedLists: l._id } } : { $pull: { pinnedLists: l._id } });
  res.json({ pinned: on });
});
