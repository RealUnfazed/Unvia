// Who can see what: blocked/muted/protected accounts, private communities.
const { moderated } = require('./moderation');
const { has } = require('./util');
const { Community, User } = require('../models');

// Users whose content I shouldn't see: ones I blocked or muted, plus ones who blocked me.
const hiddenFor = async (me) => (me ? [...new Set([...me.blocked, ...me.muted, ...(await User.distinct('_id', { blocked: me._id }))].map(String))] : []);

const hiddenPosts = async (me) => {
  const base = await hiddenFor(me);
  const prot = await User.distinct('_id', { protected: true, ...(me ? { _id: { $nin: [me._id, ...me.following] } } : {}) });
  return [...new Set([...base, ...prot.map(String), ...(await moderated())])];
};

// Request-to-join communities are private: only members see their posts
const hiddenCommunities = async (me) => (await Community.distinct('_id', { joinMode: 'request', ...(me ? { members: { $ne: me._id } } : {}) })).map(String);

const canSeeCommunity = (c, me) => c.joinMode !== 'request' || (!!me && has(c.members, me.id));

const isMember = (cid, me) => Community.exists({ _id: cid, members: me._id });

const blockedFor = async (me) => new Set([...me.blocked, ...(await User.distinct('_id', { blocked: me._id }))].map(String));

module.exports = { blockedFor, canSeeCommunity, hiddenCommunities, hiddenFor, hiddenPosts, isMember };
