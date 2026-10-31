// Every Mongoose model, one place.
const mongoose = require('mongoose');

const Id = mongoose.Schema.Types.ObjectId;

const M = (n, s) => mongoose.models[n] || mongoose.model(n, new mongoose.Schema(s, { timestamps: true }));

const User = M('User', {
  username: { type: String, unique: true, lowercase: true, trim: true, match: /^[a-z0-9_]{3,15}$/ },
  name: String, bio: { type: String, default: '', maxlength: 160 }, hash: String,
  following: [Id], bookmarks: [Id], blocked: [Id], muted: [Id], pinned: Id, pinnedLists: [Id], protected: Boolean, followRequests: [Id], mutedWords: [String], location: String, website: String, birthday: Date, birthdayVisible: String,
  email: { type: String, lowercase: true, trim: true, unique: true, sparse: true }, emailVerified: Boolean, pendingEmail: String, resetAt: Date,
  twofa: { secret: String, enabled: Boolean, backup: [String] }, sv: { type: Number, default: 0 }, fails: Number, lockUntil: Date, avatar: String, banner: String, badge: { type: String, default: '' }, admin: Boolean, banned: Boolean,
  mod: Boolean, suspendedUntil: Date, suspendReason: String, pushLevel: String,
  ghost: Boolean, fake: mongoose.Schema.Types.Mixed, // { target, mode: 'instant'|'gradual', startAt, endAt, startVal }
});

const Post = M('Post', {
  author: { type: Id, ref: 'User', index: true }, text: { type: String, maxlength: 280, default: '' },
  media: { url: String, fileId: String }, likes: [Id], reposts: [Id], replies: { type: Number, default: 0 }, saves: { type: Number, default: 0 },
  parent: { type: Id, index: true }, repostOf: { type: Id, ref: 'Post' }, quoteOf: { type: Id, ref: 'Post' }, quoteDeleted: Boolean, quotes: { type: Number, default: 0 }, visibleAt: Date, scheduled: Boolean, editedAt: Date, replyLimit: String,
  images: [{ _id: false, url: String, fileId: String }],
  poll: { options: [{ _id: false, text: String, votes: [Id] }], endsAt: Date },
  preview: { url: String, title: String, description: String, image: String, site: String },
  topics: { type: [String], index: true }, community: { type: Id, ref: 'Community', index: true }, views: { type: Number, default: 0 }, sensitive: Boolean, note: mongoose.Schema.Types.Mixed,
  fake: { likes: mongoose.Schema.Types.Mixed, reposts: mongoose.Schema.Types.Mixed, saves: mongoose.Schema.Types.Mixed, views: mongoose.Schema.Types.Mixed },
});

const Report = M('Report', { by: { type: Id, ref: 'User' }, post: { type: Id, ref: 'Post' }, user: { type: Id, ref: 'User' }, reason: String, status: { type: String, default: 'open' } });

const Notif = M('Notif', { to: { type: Id, index: true }, from: { type: Id, ref: 'User' }, type: String, post: { type: Id, ref: 'Post' }, read: { type: Boolean, default: false }, visibleAt: Date });

const Draft = M('Draft', { user: { type: Id, index: true }, text: String });

// Direct messages. `reads` holds each member's last-read time (read receipts) and `clr` (when they cleared the chat).
// `requestFor` is set while a 1:1 chat from someone the recipient doesn't follow waits for acceptance.
const Conv = M('Conv', { members: [{ type: Id, ref: 'User' }], group: Boolean, name: String, owner: Id, requestFor: Id, lastAt: Date, lastText: String, lastFrom: Id, reads: [{ _id: false, u: Id, at: Date, clr: Date }] });

// Phase 5: lists, communities, bookmark folders, community notes, per-day views
const List = M('List', { owner: { type: Id, ref: 'User', index: true }, name: String, description: String, private: Boolean, members: [Id], subs: [Id] });

const Community = M('Community', { name: String, nameKey: { type: String, unique: true }, description: String, rules: [String], owner: Id, mods: [Id], members: [Id], requests: [Id], joinMode: { type: String, default: 'open' } });

const Folder = M('Folder', { user: { type: Id, index: true }, name: String, posts: [Id] });

const Note = M('Note', { post: { type: Id, index: true }, author: { type: Id, ref: 'User' }, text: String, source: String, ratings: [{ _id: false, u: Id, v: Number }] });

const DailySchema = new mongoose.Schema({ post: Id, author: { type: Id, index: true }, day: String, n: { type: Number, default: 0 } });

DailySchema.index({ post: 1, day: 1 }, { unique: true });

const Daily = mongoose.models.Daily || mongoose.model('Daily', DailySchema);

const ttl = (def, field, secs) => { const sc = new mongoose.Schema(def); sc.index({ [field]: 1 }, { expireAfterSeconds: secs }); return sc; };

const Rate = mongoose.models.Rate || mongoose.model('Rate', ttl({ _id: String, n: Number, exp: Date }, 'exp', 0));

const ViewSeen = mongoose.models.ViewSeen || mongoose.model('ViewSeen', ttl({ _id: String, at: Date }, 'at', 3 * 86400));

const ModLog = M('ModLog', { mod: { type: Id, ref: 'User' }, action: String, user: { type: Id, ref: 'User' }, post: Id, note: String });

const Filter = M('Filter', { word: { type: String, unique: true } });

const PushSub = M('PushSub', { user: { type: Id, index: true }, endpoint: { type: String, unique: true }, keys: { p256dh: String, auth: String }, ua: String });

const Msg = M('Msg', { conv: { type: Id, index: true }, from: { type: Id, ref: 'User' }, text: String, image: { url: String, fileId: String }, deleted: Boolean });

module.exports = { Community, Conv, Daily, DailySchema, Draft, Filter, Folder, Id, List, M, ModLog, Msg, Note, Notif, Post, PushSub, Rate, Report, User, ViewSeen, ttl };
