const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const COMMUNITY_DIR = '/home/mohiy/hassania-dataset/raw/community';
const upload = multer({ dest: '/tmp/sawtak-imports/', limits: { fileSize: 50 * 1024 * 1024 } });

const ARABIC_RE = /[؀-ۿ]/;
const HASSANIYA_MARKERS = ['گ','ڤ','ژ','واش','ويلي','شكون','كيفاش','مزيان','بزاف','طرو'];

function detectHassaniya(text) {
  const found = HASSANIYA_MARKERS.filter(m => text.includes(m));
  return Math.min(1, found.length / 2);
}

function saveContributions(entries, sourceType, contributorId) {
  const insert = db.prepare(`
    INSERT INTO contributions (contributor_id, type, content_text, domain, bucket, hassaniya_confidence, status)
    VALUES (?, 'import', ?, 'general', 'community', ?, 'pending')
  `);
  const date = new Date().toISOString().slice(0, 10);
  const outFile = path.join(COMMUNITY_DIR, `import_${sourceType}_${date}.jsonl`);

  let saved = 0;
  for (const entry of entries) {
    const r = insert.run(contributorId || null, entry.text, entry.confidence);
    fs.appendFileSync(outFile, JSON.stringify({ id: r.lastInsertRowid, ...entry, source: sourceType }) + '\n', 'utf8');
    saved++;
  }
  if (contributorId) db.prepare('UPDATE contributors SET total_contributions = total_contributions + ? WHERE id = ?').run(saved, contributorId);
  return saved;
}

// POST /api/import/whatsapp
router.post('/whatsapp', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let content;
  try {
    content = fs.readFileSync(req.file.path, 'utf8');
  } catch {
    return res.status(400).json({ error: 'Could not read file' });
  } finally {
    fs.unlinkSync(req.file.path);
  }

  // Parse WhatsApp format: "dd/mm/yyyy, hh:mm - Name: message"
  // or: "[dd/mm/yyyy, hh:mm:ss] Name: message"
  const lines = content.split('\n');
  const entries = [];

  for (const line of lines) {
    const match = line.match(/^[\[\d\/\., :]+[\]\-]\s*[^:]+:\s*(.+)$/);
    if (!match) continue;
    const text = match[1].trim();
    if (text.startsWith('<') || text === 'null' || text.toLowerCase().includes('<media')) continue;
    if (!ARABIC_RE.test(text)) continue;
    if (text.length < 10 || text.length > 2000) continue;
    entries.push({ text, confidence: detectHassaniya(text) });
  }

  const importRecord = db.prepare(`
    INSERT INTO imports (contributor_id, source_type, filename, total_entries, processed_entries, status)
    VALUES (?, 'whatsapp', ?, ?, ?, 'complete')
  `).run(req.user.id, req.file.originalname || 'whatsapp.txt', lines.length, entries.length);

  const saved = saveContributions(entries, 'whatsapp', req.user.id);
  const hassaniyaCount = entries.filter(e => e.confidence > 0).length;

  res.json({ success: true, import_id: importRecord.lastInsertRowid, extracted: saved, hassaniya_detected: hassaniyaCount, total_lines: lines.length });
});

// POST /api/import/facebook
router.post('/facebook', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let data;
  try {
    const raw = fs.readFileSync(req.file.path, 'utf8');
    data = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON file' });
  } finally {
    fs.unlinkSync(req.file.path);
  }

  const entries = [];

  function extractText(obj) {
    if (!obj) return;
    if (typeof obj === 'string') {
      if (ARABIC_RE.test(obj) && obj.length >= 10 && obj.length <= 2000) {
        entries.push({ text: obj.trim(), confidence: detectHassaniya(obj) });
      }
      return;
    }
    if (Array.isArray(obj)) { obj.forEach(extractText); return; }
    if (typeof obj === 'object') {
      for (const key of ['content', 'message', 'body', 'text', 'post', 'comment', 'data']) {
        if (obj[key]) extractText(obj[key]);
      }
    }
  }

  extractText(data);

  const importRecord = db.prepare(`
    INSERT INTO imports (contributor_id, source_type, filename, total_entries, processed_entries, status)
    VALUES (?, 'facebook', ?, ?, ?, 'complete')
  `).run(req.user.id, req.file.originalname || 'facebook.json', entries.length, entries.length);

  const saved = saveContributions(entries, 'facebook', req.user.id);
  const hassaniyaCount = entries.filter(e => e.confidence > 0).length;

  res.json({ success: true, import_id: importRecord.lastInsertRowid, extracted: saved, hassaniya_detected: hassaniyaCount });
});

module.exports = router;
