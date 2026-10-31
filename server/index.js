// Builds the app: middleware first, then every routes file (order matters for overlapping paths), then the final handlers.
const app = require('./app');
require('./middleware');
require('./routes/auth');
require('./routes/account');
require('./routes/drafts');
require('./routes/posts');
require('./routes/users');
require('./routes/notifications');
require('./routes/discover');
require('./routes/analytics');
require('./routes/growth');
require('./routes/moderation');
require('./routes/conversations');
require('./routes/lists');
require('./routes/communities');
require('./routes/folders');
require('./routes/notes');
require('./routes/push');
require('./routes/system');
require('./finalize');

module.exports = app;
