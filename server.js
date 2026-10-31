// Entry point: `node server.js` locally, and what api/index.js hands to Vercel. The app itself is built in ./server (see README -> Project structure).
const app = require('./server/index');

if (require.main === module) app.listen(process.env.PORT || 3000, () => console.log('http://localhost:3000'));
module.exports = app;
