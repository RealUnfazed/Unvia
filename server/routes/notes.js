// Community Notes.
const { app } = require('../app');
const { auth } = require('../lib/guards');
const { NOTE_MIN_AGE, notePost, refreshNote } = require('../lib/notes');
const { OID, oid } = require('../lib/util');
const { Note } = require('../models');

app.get('/api/posts/:id/notes', async (req, res) => {
  const p = await notePost(req, res); if (!p) return;
  const ns = await Note.find({ post: p._id }).sort('-createdAt').limit(30);
  res.json({ notes: ns.map((n) => ({ n, ...noteScore(n) })).filter((x) => x.status !== 'unhelpful' || oid(x.n.author) === req.me?.id).map(({ n, total, status }) => ({ id: n.id, text: n.text, source: n.source || '', status, total, mine: oid(n.author) === req.me?.id, myRating: req.me ? (n.ratings.find((r) => String(r.u) === req.me.id)?.v ?? -1) : -1, at: n.createdAt })) });
});

app.post('/api/posts/:id/notes', auth, async (req, res) => {
  const p = await notePost(req, res); if (!p) return;
  const text = String(req.body.text || '').trim().slice(0, 500);
  if (text.length < 20) return res.status(400).json({ error: 'Explain the missing context in at least 20 characters' });
  let source = String(req.body.source || '').trim().slice(0, 300);
  if (source) { try { const u = new URL(/^https?:\/\//i.test(source) ? source : 'https://' + source); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw 0; source = u.href; } catch { return res.status(400).json({ error: 'That source link doesn’t look right' }); } }
  if (oid(p.author) === req.me.id) return res.status(400).json({ error: 'You can’t add a note to your own post' });
  if (Date.now() - req.me.createdAt < NOTE_MIN_AGE * 864e5) return res.status(403).json({ error: `Accounts need to be ${NOTE_MIN_AGE} days old to write notes` });
  if (await Note.exists({ post: p._id, author: req.me._id })) return res.status(409).json({ error: 'You already added a note to this post' });
  await Note.create({ post: p._id, author: req.me._id, text, source }); res.json({ ok: true });
});

app.post('/api/notes/:id/rate', auth, async (req, res) => {
  const n = OID.test(req.params.id) ? await Note.findById(req.params.id) : null, v = parseInt(req.body.v);
  if (!n || ![0, 1, 2].includes(v)) return res.sendStatus(404);
  if (oid(n.author) === req.me.id) return res.status(400).json({ error: 'You can’t rate your own note' });
  req.params.id = String(n.post); if (!(await notePost(req, res))) return;
  const r = await Note.updateOne({ _id: n._id, 'ratings.u': req.me._id }, { $set: { 'ratings.$.v': v } });
  if (!r.matchedCount) await Note.updateOne({ _id: n._id }, { $push: { ratings: { u: req.me._id, v } } });
  await refreshNote(n.post); res.json({ ok: true });
});

app.delete('/api/notes/:id', auth, async (req, res) => {
  const n = OID.test(req.params.id) ? await Note.findOne({ _id: req.params.id, ...(req.me.admin ? {} : { author: req.me._id }) }) : null;
  if (!n) return res.sendStatus(404);
  await Note.deleteOne({ _id: n._id }); await refreshNote(n.post); res.json({ ok: true });
});
