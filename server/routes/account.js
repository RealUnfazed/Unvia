// Your own account: profile, password, email, 2FA, privacy, muted words, push preferences, data export, follow requests.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { app } = require('../app');
const { JWT_SECRET } = require('../config');
const { convVisible, purgeConv, readOf } = require('../lib/dm');
const { auth } = require('../lib/guards');
const { APP, mailHtml, mailReady, sendMail } = require('../lib/mail');
const { blockedText } = require('../lib/moderation');
const { notify, unnotify } = require('../lib/notify');
const { b32enc, sha, sign, totpOk, useSecondFactor } = require('../lib/security');
const { mine, pub } = require('../lib/shape');
const { pfDelete, pfUpload, upload } = require('../lib/uploads');
const { OID, has } = require('../lib/util');
const { blockedFor, hiddenFor } = require('../lib/visibility');
const { Conv, Draft, Folder, List, Msg, Notif, Post, PushSub, User } = require('../models');

app.get('/api/me', auth, (req, res) => res.json({ user: mine(req.me) }));

app.patch('/api/me', auth, upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), async (req, res) => {
  req.me.name = String(req.body.name || req.me.name).slice(0, 30);
  req.me.bio = String(req.body.bio || '').slice(0, 160);
  if (await blockedText(req.me.name + ' ' + req.me.bio)) return res.status(400).json({ error: 'That name or bio contains language that isn’t allowed.' });
  for (const k of ['avatar', 'banner']) {
    const f = req.files?.[k]?.[0];
    if (f?.mimetype.startsWith('image/')) { const r = await pfUpload(f); if (!r) return res.status(502).json({ error: 'Image upload failed' }); req.me[k] = r.url; }
  }
  if ('location' in req.body) req.me.location = String(req.body.location).trim().slice(0, 30);
  if ('website' in req.body) {
    const w = String(req.body.website).trim();
    if (!w) req.me.website = '';
    else { try { const url = new URL(/^https?:\/\//i.test(w) ? w : 'https://' + w); if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) throw 0; req.me.website = url.href.slice(0, 100); } catch { return res.status(400).json({ error: 'That website doesn’t look right' }); } }
  }
  if ('birthday' in req.body) {
    if (!req.body.birthday) req.me.birthday = undefined;
    else { const d = new Date(req.body.birthday + 'T00:00:00Z'), yrs = (Date.now() - d) / 31557600000; if (isNaN(d) || yrs < 13 || yrs > 120) return res.status(400).json({ error: 'Enter a valid birthday (you must be at least 13)' }); req.me.birthday = d; }
  }
  if (['none', 'monthday', 'full'].includes(req.body.birthdayVisible)) req.me.birthdayVisible = req.body.birthdayVisible;
  await req.me.save();
  res.json({ user: mine(req.me) });
});

// @mention autocomplete: accounts you follow first
app.get('/api/mentions', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15);
  if (!q) return res.json([]);
  const hidden = await hiddenFor(req.me), fol = req.me?.following || [];
  const us = await User.find({ username: new RegExp('^' + q), _id: { $nin: hidden }, ghost: { $ne: true } }).limit(20);
  us.sort((a, b) => has(fol, b.id) - has(fol, a.id));
  res.json(us.slice(0, 5).map(pub));
});

app.post('/api/me/password', auth, async (req, res) => {
  if (!(await bcrypt.compare(req.body.current || '', req.me.hash)) || String(req.body.next || '').length < 8) return res.status(400).json({ error: 'Check your current and new password' });
  req.me.hash = await bcrypt.hash(req.body.next, 10); req.me.sv = (req.me.sv || 0) + 1; await req.me.save(); res.json({ ok: true, token: sign(req.me) });
});

app.post('/api/me/email', auth, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) return res.status(400).json({ error: 'That email doesn’t look right' });
  if (!(await bcrypt.compare(req.body.password || '', req.me.hash))) return res.status(400).json({ error: 'Wrong password' });
  if (await User.exists({ email, _id: { $ne: req.me._id } })) return res.status(409).json({ error: 'That email is already in use' });
  const link = `${APP(req)}/#/verify/${jwt.sign({ id: req.me.id, t: 'verify', e: email }, JWT_SECRET, { expiresIn: '2d' })}`;
  req.me.pendingEmail = email; await req.me.save();
  const sent = await sendMail(email, 'Confirm your email for Unvia', `Confirm your email: ${link}`, mailHtml('Confirm your email', 'Tap the button to confirm this address for your Unvia account.', link, 'Confirm email'));
  res.json({ ok: true, sent, ...(!mailReady() && req.me.admin && { link }) }); // no mail provider: the owner gets the link directly
});

app.post('/api/me/2fa/setup', auth, async (req, res) => {
  if (req.me.twofa?.enabled) return res.status(400).json({ error: 'Two-factor is already on' });
  if (!(await bcrypt.compare(req.body.password || '', req.me.hash))) return res.status(400).json({ error: 'Wrong password' });
  const secret = b32enc(crypto.randomBytes(20));
  req.me.twofa = { secret, enabled: false, backup: [] }; await req.me.save();
  res.json({ secret, uri: `otpauth://totp/Unvia:${encodeURIComponent(req.me.username)}?secret=${secret}&issuer=Unvia` });
});

app.post('/api/me/2fa/enable', auth, async (req, res) => {
  const t = req.me.twofa;
  if (!t?.secret || t.enabled) return res.status(400).json({ error: 'Start setup first' });
  if (!totpOk(t.secret, req.body.code)) return res.status(400).json({ error: 'That code didn’t work. Check your phone’s clock and try again.' });
  const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));
  req.me.twofa.enabled = true; req.me.twofa.backup = codes.map(sha); req.me.sv = (req.me.sv || 0) + 1; await req.me.save();
  res.json({ backup: codes.map((c) => c.slice(0, 5) + '-' + c.slice(5)), token: sign(req.me) });
});

app.post('/api/me/2fa/disable', auth, async (req, res) => {
  if (!req.me.twofa?.enabled) return res.status(400).json({ error: 'Two-factor is off' });
  if (!(await bcrypt.compare(req.body.password || '', req.me.hash)) || !(await useSecondFactor(req.me, req.body.code))) return res.status(400).json({ error: 'Wrong password or code' });
  req.me.twofa = undefined; req.me.sv = (req.me.sv || 0) + 1; await req.me.save();
  res.json({ token: sign(req.me) });
});

app.post('/api/me/logout-all', auth, async (req, res) => { req.me.sv = (req.me.sv || 0) + 1; await req.me.save(); res.json({ token: sign(req.me) }); });

app.put('/api/me/muted-words', auth, async (req, res) => {
  const words = [...new Set((Array.isArray(req.body.words) ? req.body.words : []).map((w) => String(w).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 50);
  req.me.mutedWords = words; await req.me.save(); res.json({ words });
});

app.post('/api/me/privacy', auth, async (req, res) => {
  const on = !!req.body.protected;
  if (!on && req.me.protected && req.me.followRequests.length) { // going public approves everyone waiting
    await User.updateMany({ _id: { $in: req.me.followRequests } }, { $addToSet: { following: req.me._id } });
    req.me.followRequests = []; await Notif.deleteMany({ to: req.me._id, type: 'request' });
  }
  req.me.protected = on; await req.me.save(); res.json({ protected: on });
});

app.get('/api/me/relations', auth, async (req, res) => {
  const [blocked, muted] = await Promise.all([User.find({ _id: { $in: req.me.blocked } }), User.find({ _id: { $in: req.me.muted } })]);
  res.json({ blocked: blocked.map(pub), muted: muted.map(pub) });
});

app.get('/api/follow-requests', auth, async (req, res) => res.json((await User.find({ _id: { $in: req.me.followRequests }, ghost: { $ne: true } }).limit(100)).map(pub)));

app.post('/api/follow-requests/:u/:act', auth, async (req, res) => {
  const u = await User.findOne({ username: req.params.u.toLowerCase() });
  if (!u || !has(req.me.followRequests, u.id) || !['approve', 'deny'].includes(req.params.act)) return res.sendStatus(404);
  await User.updateOne({ _id: req.me._id }, { $pull: { followRequests: u._id } });
  await unnotify(req.me._id, u._id, 'request');
  if (req.params.act === 'approve') { await User.updateOne({ _id: u._id }, { $addToSet: { following: req.me._id } }); await notify(u._id, req.me._id, 'accepted'); }
  res.json({ ok: true });
});

app.get('/api/me/export', auth, async (req, res) => { // everything tied to your account, as a download
  const me = req.me, name = async (ids) => (await User.find({ _id: { $in: ids } }).select('username')).map((u) => u.username);
  const [posts, lists, folders, drafts, convs, following, blocked, muted] = await Promise.all([
    Post.find({ author: me._id }).sort('createdAt').limit(20000), List.find({ owner: me._id }), Folder.find({ user: me._id }), Draft.find({ user: me._id }), Conv.find({ members: me._id }),
    name(me.following), name(me.blocked), name(me.muted)]);
  const msgs = await Msg.find({ conv: { $in: convs.map((c) => c._id) } }).sort('createdAt').limit(20000);
  res.set('Content-Disposition', 'attachment; filename="unvia-data.json"');
  res.json({ exportedAt: new Date(), account: { ...mine(me), createdAt: me.createdAt }, following, blocked, muted, bookmarks: me.bookmarks,
    posts: posts.map((p) => ({ id: p.id, at: p.createdAt, text: p.text, reply: !!p.parent, repost: !!p.repostOf, quote: !!p.quoteOf, images: (p.images || []).map((i) => i.url), community: p.community || null })),
    lists: lists.map((l) => ({ name: l.name, description: l.description, private: !!l.private, members: l.members.length })), folders: folders.map((f) => ({ name: f.name, posts: f.posts })), drafts: drafts.map((d) => d.text),
    messages: msgs.map((m) => ({ conversation: String(m.conv), at: m.createdAt, mine: String(m.from) === me.id, text: m.deleted ? '' : m.text, image: m.deleted ? null : m.image?.url || null })) });
});

app.delete('/api/me', auth, async (req, res) => {
  if (!(await bcrypt.compare(String(req.body?.password || ''), req.me.hash))) return res.status(400).json({ error: 'Wrong password' });
  await Post.deleteMany({ author: req.me._id });
  await PushSub.deleteMany({ user: req.me._id });
  await Msg.deleteMany({ from: req.me._id });
  for (const c of await Conv.find({ members: req.me._id })) {
    await Conv.updateOne({ _id: c._id }, { $pull: { members: req.me._id, reads: { u: req.me._id } } });
    if (c.members.length - 1 < 2) await purgeConv(c._id);
  }
  await User.deleteOne({ _id: req.me._id }); res.json({ ok: true });
});

app.get('/api/messages/unread', auth, async (req, res) => {
  const bl = await blockedFor(req.me); let unread = 0, requests = 0;
  for (const c of await Conv.find({ members: req.me._id, lastAt: { $ne: null } }).limit(200)) {
    if (!convVisible(c, req.me, bl)) continue;
    const mine = readOf(c, req.me.id);
    if (c.requestFor && String(c.requestFor) === req.me.id) requests++;
    else if (String(c.lastFrom) !== req.me.id && (!mine?.at || mine.at < c.lastAt)) unread++;
  }
  res.json({ unread, requests });
});

app.delete('/api/messages/:id', auth, async (req, res) => {
  const m = OID.test(req.params.id) ? await Msg.findOne({ _id: req.params.id, from: req.me._id }) : null;
  if (!m || m.deleted) return res.sendStatus(404);
  if (m.image?.fileId) pfDelete(m.image.fileId);
  m.deleted = true; m.text = ''; m.image = undefined; await m.save();
  const last = await Msg.findOne({ conv: m.conv }).sort('-createdAt');
  if (last) await Conv.updateOne({ _id: m.conv }, { lastText: last.deleted ? 'Message deleted' : last.text || '📷 Photo' });
  res.json({ ok: true });
});

app.put('/api/me/push', auth, async (req, res) => { req.me.pushLevel = req.body.level === 'important' ? 'important' : 'all'; await req.me.save(); res.json({ level: req.me.pushLevel }); });
