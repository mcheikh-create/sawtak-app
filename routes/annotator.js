const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');

const COMMUNITY_DIR = '/home/mohiy/hassania-dataset/raw/community';

function saveToJSONL(entry) {
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(COMMUNITY_DIR, `contributions_${date}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
}

// GET /api/annotator/dashboard
router.get('/dashboard', (req, res) => {
  const { id } = req.user;
  const user = db.prepare('SELECT * FROM contributors WHERE id = ?').get(id);
  const today = new Date().toISOString().slice(0, 10);

  const todayCount = db.prepare(`
    SELECT COUNT(*) as c FROM contributions WHERE contributor_id = ? AND DATE(created_at) = DATE('now')
  `).get(id).c;
  const weekCount = db.prepare(`
    SELECT COUNT(*) as c FROM contributions WHERE contributor_id = ? AND created_at >= datetime('now', '-7 days')
  `).get(id).c;
  const earnings = db.prepare(`
    SELECT COALESCE(SUM(amount_mrtu), 0) as total FROM payments WHERE annotator_id = ? AND status = 'pending'
  `).get(id).total;
  const recent = db.prepare(`
    SELECT * FROM contributions WHERE contributor_id = ? ORDER BY created_at DESC LIMIT 10
  `).all(id);

  res.json({ user, today: todayCount, week: weekCount, total: user.total_contributions, pending_earnings: earnings, recent });
});

// GET /api/annotator/tasks
router.get('/tasks', (req, res) => {
  const prompts = db.prepare('SELECT * FROM prompts ORDER BY RANDOM() LIMIT 5').all();
  const pending = db.prepare(`
    SELECT c.*, p.arabic_text as prompt_arabic FROM contributions c
    LEFT JOIN prompts p ON c.prompt_used = p.arabic_text
    WHERE c.status = 'pending' ORDER BY c.created_at ASC LIMIT 10
  `).all();
  res.json({ prompts, pending_validations: pending });
});

// POST /api/annotator/story
router.post('/story', (req, res) => {
  const { content_text, story_type, domain, prompt_text, audio_file } = req.body;
  if (!content_text || content_text.trim().length < 20) {
    return res.status(400).json({ error: 'Story too short (min 20 chars)' });
  }

  const result = db.prepare(`
    INSERT INTO contributions (contributor_id, type, content_text, domain, bucket, prompt_used, hassaniya_confidence)
    VALUES (?, 'story', ?, ?, 'narrative', ?, 0.7)
  `).run(req.user.id, content_text.trim(), domain || 'culture', prompt_text || null);

  db.prepare('UPDATE contributors SET total_contributions = total_contributions + 1 WHERE id = ?').run(req.user.id);

  saveToJSONL({
    id: result.lastInsertRowid,
    type: 'story',
    story_type: story_type || 'general',
    content: content_text.trim(),
    domain: domain || 'culture',
    contributor_id: req.user.id,
    source: 'sawtak_annotator',
    created_at: new Date().toISOString(),
  });

  res.json({ success: true, id: result.lastInsertRowid });
});

// POST /api/annotator/validate
router.post('/validate', (req, res) => {
  const { contribution_id, result: verdict } = req.body;
  if (!contribution_id || !verdict) return res.status(400).json({ error: 'Missing fields' });

  const scoreMap = { validated: 90, partial: 55, rejected: 0 };
  const statusMap = { validated: 'validated', partial: 'validated', rejected: 'rejected' };

  db.prepare(`
    UPDATE contributions SET status = ?, quality_score = ?, validator_id = ?, validated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(statusMap[verdict] || 'pending', scoreMap[verdict] ?? 55, req.user.id, contribution_id);

  db.prepare('UPDATE contributors SET total_validated = total_validated + 1 WHERE id = ?').run(req.user.id);

  // Award validation payment (2 MRU per validation)
  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  const weekStart = thisWeekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(thisWeekStart.getTime() + 6 * 86400000).toISOString().slice(0, 10);

  const existing = db.prepare(
    'SELECT id FROM payments WHERE annotator_id = ? AND period_start = ? AND status = ?'
  ).get(req.user.id, weekStart, 'pending');

  if (existing) {
    db.prepare('UPDATE payments SET contributions_count = contributions_count + 1, amount_mrtu = amount_mrtu + 2 WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO payments (annotator_id, period_start, period_end, contributions_count, amount_mrtu) VALUES (?, ?, ?, 1, 2)').run(req.user.id, weekStart, weekEnd);
  }

  res.json({ success: true });
});

// GET /api/annotator/earnings
router.get('/earnings', (req, res) => {
  const payments = db.prepare('SELECT * FROM payments WHERE annotator_id = ? ORDER BY created_at DESC LIMIT 20').all(req.user.id);
  const pending = db.prepare("SELECT COALESCE(SUM(amount_mrtu),0) as t FROM payments WHERE annotator_id = ? AND status = 'pending'").get(req.user.id).t;
  const paid = db.prepare("SELECT COALESCE(SUM(amount_mrtu),0) as t FROM payments WHERE annotator_id = ? AND status = 'paid'").get(req.user.id).t;
  res.json({ payments, pending_total: pending, paid_total: paid });
});

module.exports = router;
