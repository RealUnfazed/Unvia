// Vercel runs this one function for every /api/<anything> request (a catch-all route) and hands it to the Express app.
// This replaces the old /api rewrite in vercel.json, which newer Vercel versions apply differently and can break routing.
// If the platform rewrote req.url (for example to "/api/[...path]"), rebuild the real path from the route params so Express can match its routes.
const app = require('../server');

module.exports = (req, res) => {
  if (!/^\/api\/[^[]/.test(req.url || '')) {
    const params = new URLSearchParams(String(req.url || '').split('?')[1] || '');
    const segments = [].concat((req.query && req.query.path) || params.getAll('path'));
    params.delete('path');
    req.url = '/api/' + segments.join('/') + (params.toString() ? '?' + params : '');
  }
  return app(req, res);
};
