const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Init DB on startup
require('./db');

const { authenticate, requireAdmin, requireAnnotator } = require('./middleware/auth');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// Static pages
app.use(express.static(path.join(__dirname, 'public')));
app.use('/annotator', express.static(path.join(__dirname, 'annotator')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/annotator', authenticate, requireAnnotator, require('./routes/annotator'));
app.use('/api/admin', authenticate, requireAdmin, require('./routes/admin'));
app.use('/api/import', authenticate, requireAdmin, require('./routes/imports'));

// Root redirect
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════╗`);
  console.log(`║  Sawtak — صوتك  running on :${PORT}  ║`);
  console.log(`╚══════════════════════════════════╝`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Admin PIN: 1234\n`);
});
