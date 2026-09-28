# Unvia

A full-stack social platform built with **Node.js**, **MongoDB Atlas** and **Tailwind CSS**. One codebase ships to the **web (Vercel)**, **Android/iOS (Capacitor)** and **desktop (Electron)**. Media is hosted on [PostFile](https://postfile.net/docs).

Created by **Alireza Asakareh (RealUnfazed)** · [MIT License](LICENSE)

## Features

- **Timeline:** For you / Following feeds, infinite scroll, replies and threads, reposts, likes, bookmarks, @mentions and #hashtags
- **Posting:** text (280 chars), image upload and a GIF picker (GIPHY)
- **Profiles:** profile photo, banner, bio, followers/following, Follow / Unfollow
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

- PostFile's free tier has monthly upload limits; text-only posts don't use any.
- Uploads are capped at 4 MB each (Vercel's request body limit is about 4.5 MB).
- Tailwind loads from its CDN for simplicity; switch to the Tailwind CLI for production builds.
- Not yet built: notifications, direct messages, polls, quote posts, lists, video.

## Contributing & community

See [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and [SECURITY.md](SECURITY.md).
