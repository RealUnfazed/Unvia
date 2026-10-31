// Push subscriptions.
const { app } = require('../app');
const { PUSH } = require('../config');
const { auth } = require('../lib/guards');
const { pushTo } = require('../lib/notify');
const { PushSub } = require('../models');

app.get('/api/push/key', (_q, res) => res.json({ key: PUSH ? process.env.VAPID_PUBLIC_KEY : null }));

app.post('/api/push/subscribe', auth, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!PUSH) return res.status(400).json({ error: 'Push isn’t set up on this server' });
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 600 || !keys?.p256dh || !keys?.auth || String(keys.p256dh).length > 200 || String(keys.auth).length > 100) return res.status(400).json({ error: 'Bad subscription' });
  if (!(await PushSub.exists({ endpoint })) && (await PushSub.countDocuments({ user: req.me._id })) >= 10) return res.status(400).json({ error: 'Too many devices. Turn push off on one first.' });
  await PushSub.updateOne({ endpoint }, { user: req.me._id, keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) }, ua: String(req.headers['user-agent'] || '').slice(0, 120) }, { upsert: true });
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', auth, async (req, res) => { await PushSub.deleteOne({ endpoint: String(req.body?.endpoint || ''), user: req.me._id }); res.json({ ok: true }); });

app.post('/api/push/test', auth, async (req, res) => {
  if (!PUSH) return res.status(400).json({ error: 'Push isn’t set up on this server' });
  await pushTo(req.me._id, { title: 'Unvia', body: 'Push notifications are working 🎉', url: '/#/settings', tag: 'test' }); res.json({ ok: true });
});
