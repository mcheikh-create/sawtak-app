const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const db = require('../db');

const STUDIO_DIR = '/home/mohiy/hassania-dataset/raw/studio';
fs.mkdirSync(STUDIO_DIR, { recursive: true });

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'studio');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

// POST /api/studio/session
router.post('/session', (req, res) => {
  const { speaker_name, session_type, date, mic_used, notes } = req.body;
  if (!speaker_name) return res.status(400).json({ error: 'speaker_name required' });
  const result = db.prepare(`
    INSERT INTO studio_sessions (speaker_name, session_type, date, mic_used, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(speaker_name, session_type || 'phrases', date || new Date().toISOString().slice(0, 10), mic_used || 'Blue Yeti USB', notes || null);
  res.json({ success: true, id: result.lastInsertRowid });
});

// POST /api/studio/upload
router.post('/upload', upload.array('files', 100), (req, res) => {
  const { session_id } = req.body;
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });

  const insert = db.prepare(`
    INSERT INTO studio_files (session_id, filename, duration_seconds, prompt_used)
    VALUES (?, ?, ?, ?)
  `);

  const saved = [];
  for (const file of req.files) {
    const r = insert.run(session_id || null, file.filename, 0, null);
    saved.push({ id: r.lastInsertRowid, filename: file.filename, size: file.size });
  }

  if (session_id) {
    db.prepare('UPDATE studio_sessions SET file_count = file_count + ? WHERE id = ?').run(req.files.length, session_id);
  }

  res.json({ success: true, uploaded: saved.length, files: saved });
});

// GET /api/studio/sessions
router.get('/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT s.*, COUNT(f.id) as file_count_actual,
      SUM(CASE WHEN f.transcription_status = 'approved' THEN 1 ELSE 0 END) as approved_count
    FROM studio_sessions s
    LEFT JOIN studio_files f ON f.session_id = s.id
    GROUP BY s.id ORDER BY s.created_at DESC
  `).all();
  res.json(sessions);
});

// GET /api/studio/queue
router.get('/queue', (req, res) => {
  const files = db.prepare(`
    SELECT f.*, s.speaker_name FROM studio_files f
    LEFT JOIN studio_sessions s ON s.id = f.session_id
    WHERE f.transcription_status IN ('pending', 'transcribed')
    ORDER BY f.created_at ASC LIMIT 50
  `).all();
  res.json(files);
});

// POST /api/studio/transcribe/:file_id
router.post('/transcribe/:file_id', (req, res) => {
  const file = db.prepare('SELECT * FROM studio_files WHERE id = ?').get(req.params.file_id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  const filepath = path.join(UPLOADS_DIR, file.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Audio file not found on disk' });

  // Try Whisper if available, else return placeholder
  try {
    const result = execSync(
      `python3 -c "import whisper; m=whisper.load_model('small'); r=m.transcribe('${filepath}', language='ar'); print(r['text'])"`,
      { timeout: 120000, encoding: 'utf8' }
    ).trim();
    db.prepare(`UPDATE studio_files SET transcription = ?, transcription_status = 'transcribed' WHERE id = ?`).run(result, file.id);
    res.json({ success: true, transcription: result });
  } catch {
    // Whisper not installed — mark as needs-manual
    db.prepare(`UPDATE studio_files SET transcription_status = 'needs-manual' WHERE id = ?`).run(file.id);
    res.json({ success: false, error: 'Whisper not installed. Install with: pip install openai-whisper', manual_required: true });
  }
});

// POST /api/studio/approve/:file_id
router.post('/approve/:file_id', (req, res) => {
  const { transcription, quality_score } = req.body;
  const file = db.prepare('SELECT * FROM studio_files WHERE id = ?').get(req.params.file_id);
  if (!file) return res.status(404).json({ error: 'Not found' });

  const finalText = transcription || file.transcription;
  db.prepare(`
    UPDATE studio_files SET transcription = ?, transcription_status = 'approved',
    quality_score = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(finalText, quality_score || 80, req.user?.name || 'admin', file.id);

  // Save approved entry to studio JSONL
  const session = db.prepare('SELECT * FROM studio_sessions WHERE id = ?').get(file.session_id);
  const entry = {
    id: file.id,
    type: 'voice',
    speaker: session?.speaker_name || 'unknown',
    session_type: session?.session_type || 'phrases',
    filename: file.filename,
    transcription: finalText,
    prompt_used: file.prompt_used,
    quality_score: quality_score || 80,
    source: 'sawtak_studio',
    created_at: new Date().toISOString(),
  };
  const date = new Date().toISOString().slice(0, 10);
  fs.appendFileSync(path.join(STUDIO_DIR, `studio_${date}.jsonl`), JSON.stringify(entry) + '\n', 'utf8');

  res.json({ success: true });
});

// POST /api/studio/reject/:file_id
router.post('/reject/:file_id', (req, res) => {
  db.prepare(`UPDATE studio_files SET transcription_status = 'rejected' WHERE id = ?`).run(req.params.file_id);
  res.json({ success: true });
});

// PATCH /api/studio/file/:file_id  — update transcription text
router.patch('/file/:file_id', (req, res) => {
  const { transcription, prompt_used } = req.body;
  db.prepare(`UPDATE studio_files SET transcription = ?, prompt_used = COALESCE(?, prompt_used) WHERE id = ?`)
    .run(transcription, prompt_used || null, req.params.file_id);
  res.json({ success: true });
});

module.exports = router;
