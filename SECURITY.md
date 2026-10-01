# Security Policy

## Supported versions

Only the latest release on the `main` branch receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately using GitHub's **"Report a vulnerability"** option under the repository's *Security* tab (private vulnerability reporting), or contact the maintainer, Alireza Asakareh (RealUnfazed), directly through the contact listed on their GitHub profile.

Please include:
- A description of the issue and its impact
- Steps to reproduce or a proof of concept
- Affected version or commit

You can expect an acknowledgement within 7 days. We'll keep you updated, fix confirmed issues as quickly as we can, and credit you in the release notes if you'd like.

## Scope and good practice

In scope: authentication, authorization (including admin routes), uploads, injection and XSS, and data exposure.

If you deploy Unvia yourself:
- Set a long random `JWT_SECRET`; never use the development default.
- Keep `.env` out of version control and rotate any key that leaks.
- Restrict MongoDB Atlas network access and use a least-privilege database user.
- Keep dependencies updated (`npm audit`).
- Set `APP_URL` so reset and verification links point at your real domain, and verify a sending domain with your email provider.
- Changing `JWT_SECRET` signs everyone out and invalidates outstanding reset and verification links.
- Two-factor secrets are stored in the database as-is: keep database credentials private and use a least-privilege database user.
- Add rate limiting and a proper Tailwind build (no CDN) before running a public production service.

Please act in good faith: don't access other users' data, disrupt the service, or run automated attacks against live deployments you don't own.
