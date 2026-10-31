// Direct-message helpers.
const { mine, pub } = require('./shape');
const { pfDelete } = require('./uploads');
const { OID } = require('./util');
const { Conv, Msg } = require('../models');

const readOf = (c, id) => (c.reads || []).find((r) => String(r.u) === String(id));

async function markRead(convId, userId, at = new Date()) {
  const r = await Conv.updateOne({ _id: convId, 'reads.u': userId }, { $set: { 'reads.$.at': at } });
  if (!r.matchedCount) await Conv.updateOne({ _id: convId, 'reads.u': { $ne: userId } }, { $push: { reads: { u: userId, at } } });
}

async function purgeConv(id) {
  for (const m of await Msg.find({ conv: id, 'image.fileId': { $exists: true } })) pfDelete(m.image.fileId);
  await Msg.deleteMany({ conv: id }); await Conv.deleteOne({ _id: id });
}

const convShape = (c, me) => {
  const others = c.members.filter((m) => String(m._id) !== me.id), mine = readOf(c, me.id);
  return {
    id: c.id, group: !!c.group, name: c.group ? c.name || others.map((m) => m.name).join(', ') || 'Group' : others[0]?.name || 'Deleted account',
    members: c.members.map(pub), others: others.map(pub), owner: c.owner ? String(c.owner) : null,
    lastText: c.lastText || '', lastAt: c.lastAt, lastFromMe: String(c.lastFrom) === me.id,
    unread: !!c.lastAt && String(c.lastFrom) !== me.id && (!mine?.at || mine.at < c.lastAt),
    request: !!c.requestFor && String(c.requestFor) === me.id, pending: !!c.requestFor && String(c.requestFor) !== me.id,
  };
};

const msgShape = (m) => ({ id: m.id, from: String(m.from), text: m.deleted ? '' : m.text, image: m.deleted ? null : m.image?.url || null, deleted: !!m.deleted, at: m.createdAt });

async function myConv(req, res) {
  const c = OID.test(req.params.id) ? await Conv.findOne({ _id: req.params.id, members: req.me._id }).populate('members') : null;
  if (!c) { res.sendStatus(404); return null; }
  return c;
}

// is this chat visible to me (not cleared, not with someone blocked)?
const convVisible = (c, me, bl) => {
  const mine = readOf(c, me.id);
  if (mine?.clr && c.lastAt <= mine.clr) return false;
  return c.group || !c.members.some((m) => String(m._id ?? m) !== me.id && bl.has(String(m._id ?? m)));
};

module.exports = { convShape, convVisible, markRead, msgShape, myConv, purgeConv, readOf };
