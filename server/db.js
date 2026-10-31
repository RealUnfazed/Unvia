// MongoDB connection (cached so serverless invocations reuse it).
const mongoose = require('mongoose');
const { MONGODB_URI } = require('./config');

let conn; // cached so serverless invocations reuse the connection

const db = () => (conn ||= (() => { if (!MONGODB_URI) throw new Error('MONGODB_URI is not set'); return mongoose.connect(MONGODB_URI); })());

module.exports = { conn, db };
