// The notifications inbox.
const { app } = require('../app');
const { auth } = require('../lib/guards');
const { pub } = require('../lib/shape');
const { hiddenFor } = require('../lib/visibility');
const { Notif } = require('../models');

const notifQuery = async (me) => ({ to: me._id, from: { $nin: await hiddenFor(me) }, ...visible() });

app.get('/api/notifications', auth, async (req, res) => {
  const ns = await Notif.find(await notifQuery(req.me)).sort('-createdAt').limit(60).populate('from').populate('post');
  res.json(ns.filter((n) => n.from).map((n) => ({ id: n.id, type: n.type, read: n.read, at: n.visibleAt || n.createdAt, from: n.type === 'note' ? { id: '', name: 'Community Notes', username: '' } : pub(n.from), post: n.post ? { id: n.post.id, text: n.post.text, media: !!n.post.media?.url } : null })));
});

app.get('/api/notifications/count', auth, async (req, res) => res.json({ unread: await Notif.countDocuments({ ...(await notifQuery(req.me)), read: false }) }));

app.post('/api/notifications/read', auth, async (req, res) => { await Notif.updateMany({ to: req.me._id, read: false }, { read: true }); res.json({ ok: true }); });
