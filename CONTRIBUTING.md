# Contributing to Unvia

Thanks for helping improve Unvia! Please read our [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Getting started

1. Fork the repository and clone your fork.
2. `npm install`, then copy `.env.example` to `.env` and fill it in (a free MongoDB Atlas cluster is enough).
3. `npm run dev` and open http://localhost:3000.

## Making changes

- Create a branch from `main`: `feat/short-name` or `fix/short-name`.
- Keep pull requests focused on one change and describe what and why.
- Match the existing style: 2-space indent, single quotes, no unused code.
- Run `npm test` (Node only, no database needed) and add a case in `tests/` for new behavior.
- Test your change manually in the browser. Include steps to reproduce for bug fixes and screenshots or a short clip for UI changes.
- Never commit secrets, `.env` files or API keys.
- Changes touching auth, uploads, reports or the admin panel get extra review; please explain the security impact.

## Reporting bugs and requesting features

Open an issue with clear steps, expected vs actual behavior, and your browser/OS. **Do not report security problems in public issues.** See [SECURITY.md](SECURITY.md).

## Commit messages

Short, imperative present tense, e.g. `Add poll composer` or `Fix scroll restore on back`.

## License

By contributing, you agree your contributions are licensed under the [MIT License](LICENSE).
