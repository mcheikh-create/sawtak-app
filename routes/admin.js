const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const path = require('path');
const fs = require('fs');

const COMMUNITY_DIR = '/home/mohiy/hassania-dataset/raw/community';
const SYSTEM_PROMPT = 'أنت مساعد يتكلم اللهجة الحسانية الموريتانية بشكل طبيعي وأصيل.';

// GET /api/admin/dashboard
router.get('/dashboard', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM contributions').get().c;
  const validated = db.prepare("SELECT COUNT(*) as c FROM contributions WHERE status = 'validated'").get().c;
  const pending = db.prepare("SELECT COUNT(*) as c FROM contributions WHERE status = 'pending'").get().c;
  const contributors = db.prepare("SELECT COUNT(*) as c FROM contributors WHERE type = 'community'").get().c;
  const annotators = db.prepare("SELECT COUNT(*) as c FROM contributors WHERE type IN ('annotator','admin')").get().c;
  const voiceHours = db.prepare("SELECT COALESCE(SUM(duration_seconds),0)/3600.0 as h FROM contributions WHERE type='voice'").get().h;

  const daily = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM contributions
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all();

  const annotatorStats = db.prepare(`
    SELECT c.id, c.name, c.phone, c.daily_target, c.rate_per_contribution,
      COUNT(co.id) as total_contribs,
      SUM(CASE WHEN DATE(co.created_at) = DATE('now') THEN 1 ELSE 0 END) as today,
      SUM(CASE WHEN co.created_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) as week,
      COALESCE((SELECT SUM(p.amount_mrtu) FROM payments p WHERE p.annotator_id = c.id AND p.status='pending'),0) as pending_pay
    FROM contributors c
    LEFT JOIN contributions co ON co.contributor_id = c.id
    WHERE c.type IN ('annotator','admin')
    GROUP BY c.id
  `).all();

  res.json({ total, validated, pending, contributors, annotators, voice_hours: voiceHours, daily, annotator_stats: annotatorStats });
});

// GET /api/admin/contributors
router.get('/contributors', (req, res) => {
  const list = db.prepare(`
    SELECT c.*, COUNT(co.id) as contrib_count
    FROM contributors c
    LEFT JOIN contributions co ON co.contributor_id = c.id
    WHERE c.type IN ('annotator','admin')
    GROUP BY c.id ORDER BY c.joined_at DESC
  `).all();
  res.json(list);
});

// POST /api/admin/annotator
router.post('/annotator', (req, res) => {
  const { name, phone, pin, daily_target, rate_per_contribution } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'name and pin required' });
  if (String(pin).length !== 4) return res.status(400).json({ error: 'PIN must be 4 digits' });

  const exists = db.prepare('SELECT id FROM contributors WHERE (phone = ? OR name = ?) AND type = ?').get(phone || '', name, 'annotator');
  if (exists) return res.status(409).json({ error: 'Annotator already exists' });

  const hashed = bcrypt.hashSync(String(pin), 10);
  const result = db.prepare(`
    INSERT INTO contributors (name, phone, type, pin, daily_target, rate_per_contribution)
    VALUES (?, ?, 'annotator', ?, ?, ?)
  `).run(name, phone || null, hashed, daily_target || 20, rate_per_contribution || 5.0);

  res.json({ success: true, id: result.lastInsertRowid, name });
});

// GET /api/admin/exports?format=hdrp|sft|dapt  (also accepts ?token= for browser downloads)
router.get('/exports', (req, res) => {
  const { format = 'hdrp' } = req.query;

  const rows = db.prepare(`
    SELECT * FROM contributions WHERE status IN ('validated','pending') AND content_text IS NOT NULL AND LENGTH(content_text) > 10
    ORDER BY created_at DESC
  `).all();

  const lines = [];
  for (const row of rows) {
    if (format === 'dapt') {
      lines.push(JSON.stringify({ text: row.content_text, metadata: { domain: row.domain, bucket: row.bucket, source: 'sawtak', quality_score: row.quality_score } }));
    } else {
      // hdrp and sft share the same chat format
      lines.push(JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: row.prompt_used || 'تكلم بالحسانية' },
          { role: 'assistant', content: row.content_text },
        ],
        metadata: { domain: row.domain, bucket: row.bucket, quality_score: row.quality_score, hassaniya_confidence: row.hassaniya_confidence, source: 'sawtak' },
      }));
    }
  }

  const filename = `sawtak_${format}_${new Date().toISOString().slice(0,10)}.jsonl`;
  res.setHeader('Content-Type', 'application/jsonl');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\n'));
});

// GET /api/admin/payments
router.get('/payments', (req, res) => {
  const payments = db.prepare(`
    SELECT p.*, c.name, c.phone FROM payments p
    JOIN contributors c ON c.id = p.annotator_id
    ORDER BY p.created_at DESC LIMIT 100
  `).all();
  res.json(payments);
});

// POST /api/admin/payments/mark-paid
router.post('/payments/mark-paid', (req, res) => {
  const { payment_ids } = req.body;
  if (!payment_ids?.length) return res.status(400).json({ error: 'payment_ids required' });
  const placeholders = payment_ids.map(() => '?').join(',');
  db.prepare(`UPDATE payments SET status = 'paid' WHERE id IN (${placeholders})`).run(...payment_ids);
  res.json({ success: true });
});

// GET /api/admin/payments/export-csv
router.get('/payments/export-csv', (req, res) => {
  const payments = db.prepare(`
    SELECT c.name, c.phone, p.period_start, p.period_end, p.contributions_count, p.amount_mrtu, p.status
    FROM payments p JOIN contributors c ON c.id = p.annotator_id
    WHERE p.status = 'pending' ORDER BY c.name
  `).all();

  const header = 'Name,Phone,Period Start,Period End,Contributions,Amount MRU,Status';
  const rows = payments.map(r => `${r.name},${r.phone || ''},${r.period_start},${r.period_end},${r.contributions_count},${r.amount_mrtu},${r.status}`);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sawtak_payments.csv"');
  res.send([header, ...rows].join('\n'));
});

module.exports = router;
