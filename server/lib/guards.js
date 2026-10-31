// Route guards: logged in, owner, moderator.

const auth = (req, res, next) => {
  if (!req.me) return res.status(401).json({ error: 'Log in first' });
  if (req.me.banned) return res.status(403).json({ error: 'Your account has been suspended.' });
  if (req.me.suspendedUntil > new Date()) return res.status(403).json({ error: `Your account is suspended until ${req.me.suspendedUntil.toUTCString()}.` });
  next();
};

const adm = (q, r, n) => (q.me?.admin ? n() : r.sendStatus(403));

const modr = (q, r, n) => (q.me?.admin || q.me?.mod ? n() : r.sendStatus(403)); // moderators: reports and suspensions only

module.exports = { adm, auth, modr };
