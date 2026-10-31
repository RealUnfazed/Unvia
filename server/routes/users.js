// Profiles, follow, block/mute, followers lists.
const { app } = require('../app');
const { auth } = require('../lib/guards');
const { isSuspended } = require('../lib/moderation');
const { notify, unnotify } = require('../lib/notify');
const { bornText } = require('../lib/shape');
const { fakeVal, has } = require('../lib/util');
const { hiddenFor } = require('../lib/visibility');
const { Post, User } = require('../models');

app.get('/api/users/:u', async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u) return res.sendStatus(404);
  const [followers, posts] = await Promise.all([User.countDocuments({ following: u._id }), Post.countDocuments({ author: u._id, parent: null, repostOf: null, ...visible() })]);
  res.json({ ...pub(u), joined: u.createdAt, following: u.following.length, followers: followers + fakeVal(u.fake), posts, isFollowing: !!req.me && has(req.me.following, u.id),
    blocked: !!req.me && has(req.me.blocked, u.id), muted: !!req.me && has(req.me.muted, u.id), blockedBy: !!req.me && has(u.blocked, req.me.id),
    requested: !!req.me && has(u.followRequests, req.me.id), canSee: !u.protected || (!!req.me && (req.me.id === u.id || has(req.me.following, u.id))), location: u.location || '', website: u.website || '', born: bornText(u), suspended: isSuspended(u) });
});

app.post('/api/users/:u/follow', auth, async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u || u.id === req.me.id) return res.sendStatus(400);
  if (has(req.me.blocked, u.id) || has(u.blocked, req.me.id)) return res.status(403).json({ error: 'You can’t follow this account' });
  const on = !has(req.me.following, u.id);
  if (on && u.protected) { // toggles a pending request instead of following
    const asked = has(u.followRequests, req.me.id);
    await User.updateOne({ _id: u._id }, asked ? { $pull: { followRequests: req.me._id } } : { $addToSet: { followRequests: req.me._id } });
    await (asked ? unnotify(u._id, req.me._id, 'request') : notify(u._id, req.me._id, 'request'));
    return res.json({ isFollowing: false, requested: !asked });
  }
  await User.updateOne({ _id: req.me._id }, on ? { $addToSet: { following: u._id } } : { $pull: { following: u._id } });
  await (on ? notify(u._id, req.me._id, 'follow') : unnotify(u._id, req.me._id, 'follow'));
  res.json({ isFollowing: on });
});

const userList = (filter) => async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u) return res.sendStatus(404);
  if (u.protected && !(req.me && (req.me.id === u.id || has(req.me.following, u.id)))) return res.status(403).json({ error: 'These accounts are only visible to followers' });
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
