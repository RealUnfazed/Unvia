// In-app notifications and the web-push messages sent alongside them.
const { PUSH, webpush } = require('../config');
const { has } = require('./util');
const { Notif, Post, PushSub, User } = require('../models');

// One notification per (recipient, sender, type, post); upsert makes repeat likes/follows idempotent.
async function notify(to, from, type, post, at) {
  if (!to || String(to) === String(from)) return;
  const r = await Notif.updateOne({ to, from, type, post: post || null }, { $setOnInsert: { read: false, ...(at && { visibleAt: at }) } }, { upsert: true });
  if (PUSH && r.upsertedCount && !at) await Promise.race([pushNotif(to, from, type, post).catch(() => {}), new Promise((ok) => setTimeout(ok, 2500))]); // a push per new notification, never for repeats or scheduled posts
}

const IMPORTANT = new Set(['reply', 'mention', 'quote', 'request', 'accepted', 'note', 'dm']);

const pushAllowed = (level, type) => (level === 'important' ? IMPORTANT.has(type) : true);

const snip = (t, n = 100) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

const pushText = (type, name, text) => ({ like: [`${name} liked your post`, snip(text)], repost: [`${name} reposted your post`, snip(text)], reply: [`${name} replied to you`, snip(text)], quote: [`${name} quoted your post`, snip(text)], mention: [`${name} mentioned you`, snip(text)],
  follow: [`${name} followed you`, ''], request: [`${name} wants to follow you`, 'Open to approve or deny'], accepted: [`${name} accepted your follow request`, ''], note: ['Readers added context to your post', snip(text)] })[type];

async function pushTo(userId, payload) {
  if (!PUSH) return;
  await Promise.allSettled((await PushSub.find({ user: userId }).limit(10)).map(async (sub) => {
    try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 3600, timeout: 4000 }); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await PushSub.deleteOne({ _id: sub._id }); } // device unsubscribed
  }));
}

async function pushNotif(to, from, type, postId) {
  const [rcpt, sender, post] = await Promise.all([User.findById(to).select('muted blocked pushLevel'), type === 'note' ? null : User.findById(from).select('name username'), postId ? Post.findById(postId).select('text') : null]);
  if (!rcpt || !pushAllowed(rcpt.pushLevel || 'all', type) || has(rcpt.muted, from) || has(rcpt.blocked, from)) return;
  const t = pushText(type, sender?.name || 'Someone', post?.text); if (!t) return;
  await pushTo(to, { title: t[0], body: t[1], url: type === 'request' ? '/#/follow-requests' : postId ? '/#/p/' + postId : sender ? '/#/u/' + sender.username : '/#/notifications', tag: `${type}:${postId || from}` });
}

const unnotify = (to, from, type, post) => Notif.deleteOne({ to, from, type, post: post || null });

module.exports = { IMPORTANT, notify, pushAllowed, pushNotif, pushText, pushTo, snip, unnotify };
