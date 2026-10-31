// Turns database documents into the JSON the client receives.
const { fakeVal, has } = require('./util');

const pub = (u) => ({ id: u.id, username: u.username, name: u.name, bio: u.bio, avatar: u.avatar, banner: u.banner, badge: u.badge, admin: !!u.admin, mod: !!u.mod, pinned: u.pinned ? String(u.pinned) : null, protected: !!u.protected });

const pop = (q) => q.populate('author').populate({ path: 'repostOf', populate: { path: 'author' } }).populate({ path: 'quoteOf', populate: { path: 'author' } }).populate({ path: 'community', select: 'name' });

const replyMsg = (o) => (o.replyLimit === 'following' ? `Only accounts @${o.author?.username} follows can reply` : 'Only people mentioned in this post can reply');

const canReplyTo = (o, me) => {
  const rl = o.replyLimit || 'all';
  if (rl === 'all' || !me || !o.author || String(o.author._id ?? o.author) === me.id) return true;
  if (rl === 'following') return has(o.author.following || [], me.id);
  return new RegExp(`(^|\\s)@${me.username}\\b`, 'i').test(o.text || '');
};

const pollShape = (o, me) => {
  const q = o.poll; if (!q?.options?.length) return null;
  const total = q.options.reduce((a, x) => a + x.votes.length, 0);
  return { options: q.options.map((x) => ({ text: x.text, votes: x.votes.length })), total, endsAt: q.endsAt, ended: q.endsAt < new Date(), voted: me ? q.options.findIndex((x) => has(x.votes, me.id)) : -1 };
};

const shape = (p, me) => {
  const o = p.repostOf?.author ? p.repostOf : p;
  return {
    id: o.id, text: o.text, media: o.media?.url, images: (o.images?.length ? o.images : o.media?.url ? [o.media] : []).map((i) => i.url), at: o.createdAt, author: o.author && pub(o.author),
    views: (o.views || 0) + fakeVal(o.fake?.views), community: o.community?.name ? { id: String(o.community._id), name: o.community.name } : null, note: o.note?.id ? { text: o.note.text, source: o.note.source || '' } : null,
    sensitive: !!o.sensitive, edited: !!o.editedAt, replyLimit: o.replyLimit || 'all', canReply: canReplyTo(o, me), poll: pollShape(o, me), scheduled: !!(o.scheduled && o.visibleAt && o.visibleAt > new Date()),
    preview: o.preview?.title ? { url: o.preview.url, title: o.preview.title, description: o.preview.description, image: o.preview.image, site: o.preview.site } : null,
    likes: o.likes.length + fakeVal(o.fake?.likes), liked: !!me && has(o.likes, me.id),
    reposts: o.reposts.length + (o.quotes || 0) + fakeVal(o.fake?.reposts), reposted: !!me && has(o.reposts, me.id),
    replies: o.replies, reply: !!o.parent, bookmarked: !!me && has(me.bookmarks, o.id), saves: (o.saves || 0) + fakeVal(o.fake?.saves),
    quoted: o.quoteOf ? { id: o.quoteOf.id, text: o.quoteOf.text, media: o.quoteOf.media?.url, at: o.quoteOf.createdAt, author: o.quoteOf.author && pub(o.quoteOf.author) } : (o.quoteDeleted ? { deleted: true } : null),
    repostBy: p === o ? null : pub(p.author), feedAt: p.createdAt,
  };
};

const mine = (u) => ({ ...pub(u), mutedWords: u.mutedWords || [], pushLevel: u.pushLevel || 'all', email: u.email || null, emailVerified: !!u.emailVerified, pendingEmail: u.pendingEmail || null, twofa: !!u.twofa?.enabled,
  requests: (u.followRequests || []).length, location: u.location || '', website: u.website || '', birthday: u.birthday ? u.birthday.toISOString().slice(0, 10) : '', birthdayVisible: u.birthdayVisible || 'none' });

const bornText = (u) => (!u.birthday || !['monthday', 'full'].includes(u.birthdayVisible) ? '' : u.birthday.toLocaleDateString('en-US', u.birthdayVisible === 'full' ? { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' } : { month: 'long', day: 'numeric', timeZone: 'UTC' }));

module.exports = { bornText, canReplyTo, mine, pollShape, pop, pub, replyMsg, shape };
