// Suspensions, the moderation log and the banned-words filter.
const { Filter, ModLog, User } = require('../models');

let modIds = { at: 0, ids: [] };

const moderated = async () => { if (Date.now() - modIds.at > 30000) modIds = { at: Date.now(), ids: (await User.distinct('_id', { $or: [{ banned: true }, { suspendedUntil: { $gt: new Date() } }] })).map(String) }; return modIds.ids; };

let filt = { at: 0, re: null };

const wordRe = (words) => (words.length ? new RegExp('(^|[^\\w])(' + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\w])', 'i') : null);

async function blockedText(text) { // owner-managed list of words that can't be posted
  if (Date.now() - filt.at > 60000) filt = { at: Date.now(), re: wordRe((await Filter.find().limit(500)).map((f) => f.word)) };
  return !!(filt.re && filt.re.test(text || ''));
}

const isSuspended = (u, now = new Date()) => !!(u.banned || (u.suspendedUntil && u.suspendedUntil > now));

const logMod = (me, action, extra = {}) => ModLog.create({ mod: me._id, action, ...extra }).catch(() => {});

const canActOn = (me, u) => !!u && u.id !== me.id && !u.admin && !(u.mod && !me.admin); // nobody moderates the owner; only the owner moderates moderators

async function suspend(me, u, days, reason) { // days: >0 timed, 0 permanent ban, -1 lift
  const note = String(reason || '').slice(0, 200);
  if (days === -1) await User.updateOne({ _id: u._id }, { $unset: { banned: 1, suspendedUntil: 1, suspendReason: 1 } });
  else if (days === 0) await User.updateOne({ _id: u._id }, { banned: true, suspendReason: note, $unset: { suspendedUntil: 1 } });
  else await User.updateOne({ _id: u._id }, { suspendedUntil: new Date(Date.now() + Math.min(days, 365) * 864e5), suspendReason: note, $unset: { banned: 1 } });
  modIds.at = 0; // refresh the hidden-accounts cache
  await logMod(me, days === -1 ? 'lift suspension' : days === 0 ? 'ban' : `suspend ${Math.min(days, 365)}d`, { user: u._id, note });
}

// Lets the admin routes clear the cached word list after an edit.
const resetFilter = () => { filt.at = 0; };

module.exports = { blockedText, canActOn, filt, isSuspended, logMod, modIds, moderated, resetFilter, suspend, wordRe };
