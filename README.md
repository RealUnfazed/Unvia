# Unvia

A full-stack social platform built with **Node.js**, **MongoDB Atlas** and **Tailwind CSS**. One codebase ships to the **web (Vercel)**, **Android/iOS (Capacitor)** and **desktop (Electron)**. Media is hosted on [PostFile](https://postfile.net/docs).

Created by **Alireza Asakareh (RealUnfazed)** · [MIT License](LICENSE)

## Features

- **Timeline:** For you / Following feeds, infinite scroll, replies and threads, reposts and quote posts, likes, bookmarks, @mentions and #hashtags
- **Posting:** text (280 chars), up to 4 photos per post (compressed in the browser first), GIF picker (GIPHY), polls, emoji picker, @mention autocomplete, link preview cards, edit within 60 minutes, reply controls (everyone / accounts you follow / only mentioned), drafts and scheduled posts
- **Profiles:** photo, banner, bio, Posts / Replies / Media / Likes tabs, pinned post, followers and following lists, Follow / Unfollow
- **Notifications:** likes, reposts, quotes, replies, mentions and follows, with a live unread badge
- **Direct messages:** 1:1 and group chats, photos, read receipts ("Seen"), delete your own messages, unread badge, and message requests (a chat from someone you don't follow waits in Requests until you accept)
- **Block & mute:** hide people from your feeds, search and notifications; blocking also removes follows both ways
- **Badges:** Verified (blue), Business (gold), Government (grey) and Owner (gradient)
- **Search & trends:** people, posts and hashtags, plus trending hashtags
- **Safety:** report posts and accounts; admin review queue with dismiss, delete post and ban
- **Admin panel:** platform stats, reports, user list, badge assignment, ban/unban
- **Settings:** edit profile, change password, delete account
- **App-like UI:** pages stay alive with restored scroll, optimistic updates, per-action animations, reduced-motion support

## Quick start

```bash
npm install
cp .env.example .env      # then fill it in
npm run dev               # http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string (free M0 cluster works) |
| `JWT_SECRET` | Long random string used to sign login tokens |
| `POSTFILE_API_KEY` | PostFile key for image, avatar and banner uploads (server-side only) |
| `GIPHY_API_KEY` | Enables the GIF picker (optional) |
| `OWNER_USERNAME` | Account that becomes admin with the Owner badge (optional) |

The **first account registered** automatically becomes the platform owner and admin.

## Deploy

**Vercel:** run `npx vercel`, add the variables above under *Project → Settings → Environment Variables*, then redeploy. In Atlas → *Network Access*, allow `0.0.0.0/0` so serverless functions can connect.

**Android / iOS (Capacitor):**
1. Set your deployed URL in the `API` constant in `public/index.html`.
2. `npm run cap:add` (once), then `npm run android` or `npm run ios` (iOS needs macOS and Xcode).

**Desktop (Electron):**
- Dev: keep `npm run dev` running, then `npm run desktop`.
- Installer: set your deployed URL in `electron/main.js`, then `npm run desktop:build`.

Before publishing to app stores, change the bundle ID `com.realunfazed.unvia` in `capacitor.config.json` and `package.json` to your own.

## Project layout

```
server.js            Express API (auth, posts, users, reports, admin, uploads)
api/index.js         Vercel serverless entry
public/index.html    Single-page client (Tailwind via CDN)
electron/main.js     Desktop shell
capacitor.config.json  Mobile shell
```

## Notes

- PostFile's free tier has monthly upload limits; text-only posts don't use any, and a post with 4 photos uses 4 uploads.
- Messages are not end-to-end encrypted. They update by polling (open chat every 2.5 s, inbox every 5 s, badge every 10 s) because Vercel functions can't hold WebSocket connections.
- Message requests: a new 1:1 chat goes to the recipient's Requests unless they follow the sender. Until accepted, the sender can send 3 messages. Replying accepts. Groups can only include people you follow or who follow you, and members can't be added after creation yet.
- Scheduled posts are hidden by a time check on every read, so no background job or cron is needed. Drafts save text only (not photos or polls).
- Link previews are fetched server-side when a post is created. Only public hosts on ports 80/443 are fetched, redirects are re-checked, and size and time are capped.
- Uploads are capped at 4 MB each (Vercel's request body limit is about 4.5 MB).
- Tailwind loads from its CDN for simplicity; switch to the Tailwind CLI for production builds.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1. Social core | Notifications, profile tabs, followers/following lists, block & mute, pinned post | Done |
| 2. Rich posting | Multi-image posts (up to 4), polls, edit post, emoji picker, @mention autocomplete, drafts and scheduled posts, reply controls, link previews | Done |
| 3. Messaging | Direct messages (1:1 and group), read receipts, message requests | Done |
| 4. Accounts & safety | Password reset, email verification, protected accounts, 2FA, dim/light themes, muted words, profile extras (location, website, birthday) | Next |
| 5. Platform | Lists, Explore and topics, post analytics, Community Notes, communities, bookmark folders | Planned |
| 6. Production | Rate limiting, Tailwind build (no CDN), moderation tools, push notifications for mobile | Planned |
| Later / needs external services | Spaces (live audio needs WebRTC infrastructure), video posts (needs video hosting), Premium and payouts (needs a payment provider) | Backlog |

## Contributing & community

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md).
