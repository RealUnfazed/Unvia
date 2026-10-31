// Community Notes scoring.
const { notify } = require('./notify');
const { OID, has, oid } = require('./util');
const { hiddenCommunities } = require('./visibility');
const { Note, Post } = require('../models');

const NOTE_MIN = +process.env.NOTES_MIN_RATINGS || 5, NOTE_MIN_AGE = +process.env.NOTES_MIN_AGE_DAYS || 0;

const noteScore = (n) => { const t = n.ratings.length, sc = t ? n.ratings.reduce((a, r) => a + r.v / 2, 0) / t : 0; return { total: t, score: sc, status: t >= NOTE_MIN && sc >= 0.7 ? 'helpful' : t >= NOTE_MIN && sc < 0.4 ? 'unhelpful' : 'proposed' }; };

async function refreshNote(postId) { // keeps the note shown on the post in sync with the best helpful note
  const best = (await Note.find({ post: postId })).map((n) => ({ n, ...noteScore(n) })).filter((x) => x.status === 'helpful').sort((a, b) => b.score - a.score || b.total - a.total)[0];
  const p = await Post.findById(postId).select('note author'); if (!p) return;
  if (best) { if (p.note?.id !== best.n.id) { await Post.updateOne({ _id: p._id }, { note: { id: best.n.id, text: best.n.text, source: best.n.source || '' } }); await notify(p.author, best.n.author, 'note', p._id); } }
  else if (p.note?.id) await Post.updateOne({ _id: p._id }, { $unset: { note: 1 } });
}

async function notePost(req, res) { // the post a note belongs to, only if the viewer can see it
  const p = OID.test(req.params.id) ? await Post.findById(req.params.id).populate('author') : null;
  const vis = p && !(p.visibleAt && p.visibleAt > new Date()) && !(p.author?.protected && oid(p.author) !== req.me?.id && !has(req.me?.following || [], oid(p.author))) && !(p.community && (await hiddenCommunities(req.me)).includes(oid(p.community)));
  if (!vis) { res.sendStatus(404); return null; }
  return p;
}

module.exports = { NOTE_MIN, NOTE_MIN_AGE, notePost, noteScore, refreshNote };
