const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const COMMUNITY_DIR = '/home/mohiy/hassania-dataset/raw/community';
fs.mkdirSync(COMMUNITY_DIR, { recursive: true });

const HASSANIYA_MARKERS = ['گ','ڤ','ژ','واش','ويلي','شكون','فين','كيفاش','مزيان','ليلا','شحال','بزاف','الله خير','انشالله','امبارح','اليوم','غدوة','درهم','طرو','زكارة'];

function detectHassaniya(text) {
  if (!text) return 0;
  const found = HASSANIYA_MARKERS.filter(m => text.includes(m));
  return Math.min(1, found.length / 3);
}

function saveToJSONL(entry) {
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(COMMUNITY_DIR, `contributions_${date}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(entry, null, 0) + '\n', 'utf8');
}

// Audio upload storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, `${uuidv4()}.webm`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/prompts/random
router.get('/prompts/random', (req, res) => {
  const { domain } = req.query;
  const prompt = domain
    ? db.prepare('SELECT * FROM prompts WHERE domain = ? ORDER BY RANDOM() LIMIT 1').get(domain)
    : db.prepare('SELECT * FROM prompts ORDER BY RANDOM() LIMIT 1').get();
  if (!prompt) return res.status(404).json({ error: 'No prompts found' });
  db.prepare('UPDATE prompts SET times_used = times_used + 1 WHERE id = ?').run(prompt.id);
  res.json(prompt);
});

// GET /api/stats
router.get('/stats', (req, res) => {
  const total = db.prepare("SELECT COUNT(*) as c FROM contributions").get().c;
  const contributors = db.prepare("SELECT COUNT(DISTINCT contributor_id) as c FROM contributions WHERE contributor_id IS NOT NULL").get().c;
  const voiceSeconds = db.prepare("SELECT COALESCE(SUM(duration_seconds),0) as s FROM contributions WHERE type = 'voice'").get().s;
  res.json({
    total_contributions: total,
    total_contributors: contributors,
    total_voice_hours: Math.round(voiceSeconds / 3600 * 10) / 10,
  });
});

// POST /api/contribute/text
router.post('/contribute/text', (req, res) => {
  const { text, domain, prompt_id, contributor_name, prompt_text } = req.body;
  if (!text || text.trim().length < 10) return res.status(400).json({ error: 'Text too short (min 10 chars)' });

  const conf = detectHassaniya(text);
  const result = db.prepare(`
    INSERT INTO contributions (type, content_text, domain, prompt_used, hassaniya_confidence)
    VALUES ('text', ?, ?, ?, ?)
  `).run(text.trim(), domain || 'general', prompt_text || null, conf);

  const entry = {
    id: result.lastInsertRowid,
    type: 'text',
    content: text.trim(),
    domain: domain || 'general',
    prompt: prompt_text || null,
    hassaniya_confidence: conf,
    source: 'sawtak_community',
    created_at: new Date().toISOString(),
  };
  saveToJSONL(entry);

  res.json({ success: true, id: result.lastInsertRowid, message: 'شكراً على مساهمتك!' });
});

// POST /api/contribute/voice
router.post('/contribute/voice', upload.single('audio'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });
  const { domain, prompt_text, contributor_name, duration, transcription } = req.body;
  const dur = parseFloat(duration) || 0;
  const conf = detectHassaniya(transcription || '');

  const result = db.prepare(`
    INSERT INTO contributions (type, content_text, audio_file, duration_seconds, domain, prompt_used, hassaniya_confidence)
    VALUES ('voice', ?, ?, ?, ?, ?, ?)
  `).run(transcription || null, req.file.filename, dur, domain || 'general', prompt_text || null, conf);

  const entry = {
    id: result.lastInsertRowid,
    type: 'voice',
    audio_file: req.file.filename,
    transcription: transcription || null,
    duration_seconds: dur,
    domain: domain || 'general',
    prompt: prompt_text || null,
    hassaniya_confidence: conf,
    source: 'sawtak_community',
    created_at: new Date().toISOString(),
  };
  saveToJSONL(entry);

  res.json({ success: true, id: result.lastInsertRowid });
});

// POST /api/contribute/validate (public anonymous)
router.post('/contribute/validate', (req, res) => {
  const { contribution_id, result: verdict } = req.body;
  if (!contribution_id || !verdict) return res.status(400).json({ error: 'contribution_id and result required' });

  const scoreMap = { validated: 90, partial: 55, rejected: 0 };
  const statusMap = { validated: 'validated', partial: 'validated', rejected: 'rejected' };
  const score = scoreMap[verdict] ?? 55;
  const status = statusMap[verdict] ?? 'pending';

  db.prepare(`
    UPDATE contributions SET status = ?, quality_score = ?, validated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(status, score, contribution_id);

  res.json({ success: true });
});

// GET /api/contribute/next-for-validation
router.get('/contribute/next-for-validation', (req, res) => {
  const item = db.prepare(`
    SELECT * FROM contributions WHERE status = 'pending' AND (type = 'voice' OR type = 'text')
    ORDER BY RANDOM() LIMIT 1
  `).get();
  res.json(item || null);
});

module.exports = router;
