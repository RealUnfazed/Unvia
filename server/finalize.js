// Runs after all routes: static files and the error handler.
const express = require('express');
const path = require('path');
const { app } = require('./app');

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((e, _q, res, _n) => {
  console.error(e);
  if (e.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Each image must be under 4 MB' });
  if (e.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'You can add up to 4 images' });
  res.status(500).json({ error: 'Server error' });
});
