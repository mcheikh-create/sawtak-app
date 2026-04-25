const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(__dirname, 'sawtak.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS contributors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    type TEXT NOT NULL DEFAULT 'community',
    pin TEXT,
    total_contributions INTEGER DEFAULT 0,
    total_validated INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    daily_target INTEGER DEFAULT 20,
    rate_per_contribution REAL DEFAULT 5.0
  );

  CREATE TABLE IF NOT EXISTS contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contributor_id INTEGER,
    type TEXT NOT NULL,
    content_text TEXT,
    audio_file TEXT,
    duration_seconds REAL,
    domain TEXT,
    bucket TEXT DEFAULT 'everyday_chat',
    prompt_used TEXT,
    hassaniya_confidence REAL DEFAULT 0.5,
    status TEXT DEFAULT 'pending',
    validator_id INTEGER,
    validated_at DATETIME,
    quality_score INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contributor_id) REFERENCES contributors(id)
  );

  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arabic_text TEXT NOT NULL,
    french_text TEXT,
    english_text TEXT,
    domain TEXT NOT NULL,
    difficulty TEXT DEFAULT 'medium',
    times_used INTEGER DEFAULT 0,
    avg_quality_score REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contributor_id INTEGER,
    source_type TEXT NOT NULL,
    filename TEXT,
    total_entries INTEGER DEFAULT 0,
    processed_entries INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contributor_id) REFERENCES contributors(id)
  );

  CREATE TABLE IF NOT EXISTS studio_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    speaker_name TEXT NOT NULL,
    session_type TEXT DEFAULT 'phrases',
    date TEXT,
    duration_minutes INTEGER DEFAULT 0,
    file_count INTEGER DEFAULT 0,
    mic_used TEXT DEFAULT 'Blue Yeti USB',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS studio_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    filename TEXT,
    duration_seconds INTEGER,
    prompt_used TEXT,
    transcription TEXT,
    transcription_status TEXT DEFAULT 'pending',
    quality_score INTEGER DEFAULT 0,
    approved_by TEXT,
    approved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES studio_sessions(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    annotator_id INTEGER NOT NULL,
    period_start DATE,
    period_end DATE,
    contributions_count INTEGER DEFAULT 0,
    amount_mrtu REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (annotator_id) REFERENCES contributors(id)
  );
`);

// Seed admin
const adminExists = db.prepare('SELECT id FROM contributors WHERE type = ? LIMIT 1').get('admin');
if (!adminExists) {
  const hashed = bcrypt.hashSync('1234', 10);
  db.prepare('INSERT INTO contributors (name, type, pin) VALUES (?, ?, ?)').run('Admin', 'admin', hashed);
  console.log('Admin created — PIN: 1234');
}

// Seed prompts
const promptCount = db.prepare('SELECT COUNT(*) as c FROM prompts').get().c;
if (promptCount === 0) {
  const prompts = [
    // Daily Life
    ["كيف تقول 'صباح الخير' بالحسانية؟", 'daily_life', 'easy'],
    ["كيف تقول 'كيف حالك؟' بالحسانية؟", 'daily_life', 'easy'],
    ['كيف تستقبل ضيفاً في بيتك؟', 'daily_life', 'easy'],
    ['كيف تودع شخصاً تحبه؟', 'daily_life', 'easy'],
    ['كيف تطلب الماء بالحسانية؟', 'daily_life', 'easy'],
    ['كيف تقول إنك جائع؟', 'daily_life', 'easy'],
    ['كيف تصف طقس نواذيبو؟', 'daily_life', 'medium'],
    ["كيف تقول 'الحمد لله' بطريقتك؟", 'daily_life', 'easy'],
    ['كيف تنادي أمك أو أبيك؟', 'daily_life', 'easy'],
    ['كيف تمزح مع صديق بالحسانية؟', 'daily_life', 'medium'],
    ['كيف تعزي شخصاً في مصيبة؟', 'daily_life', 'medium'],
    ['كيف تهنئ شخصاً في عيد؟', 'daily_life', 'easy'],
    ["كيف تقول 'أنا متعب'؟", 'daily_life', 'easy'],
    ['كيف تطلب من شخص الانتظار؟', 'daily_life', 'easy'],
    ["كيف تقول 'لا أعرف'؟", 'daily_life', 'easy'],
    // Market
    ['كيف تساوم على سعر السمك في السوق؟', 'market', 'medium'],
    ['كيف تسأل عن ثمن شيء؟', 'market', 'easy'],
    ['كيف تقول إن الشيء غالي؟', 'market', 'easy'],
    ['كيف تطلب كيلو من الأرز؟', 'market', 'easy'],
    ['كيف تشتري الخضار بالحسانية؟', 'market', 'easy'],
    ["كيف تقول 'أعطيني هذا'؟", 'market', 'easy'],
    ['كيف تسأل أين تجد شيئاً في السوق؟', 'market', 'medium'],
    ['كيف تتفق على سعر مع البائع؟', 'market', 'medium'],
    ['كيف تقول إن البضاعة طازجة؟', 'market', 'easy'],
    ['كيف تطلب الفكة (الباقي)؟', 'market', 'easy'],
    // Stories & Culture
    ['احك لنا مثلاً حسانياً تعرفه', 'culture', 'medium'],
    ['احك لنا قصة جدتك أو جدك', 'culture', 'hard'],
    ['صف لنا عرس موريتاني بالحسانية', 'culture', 'hard'],
    ['احك لنا عن الصيد في نواذيبو', 'culture', 'medium'],
    ['صف لنا الصحراء الموريتانية', 'culture', 'medium'],
    ['احك لنا عن رمضان في موريتانيا', 'culture', 'medium'],
    ['ما هي أهم الأمثال الحسانية عندك؟', 'culture', 'medium'],
    ['صف لنا طبق تبصة أو مرق', 'culture', 'medium'],
    ['احك لنا حكاية للأطفال بالحسانية', 'culture', 'hard'],
    ['صف لنا ميناء نواذيبو', 'culture', 'medium'],
    ['احك لنا عن حياة البدو', 'culture', 'hard'],
    ['ما أجمل شيء في موريتانيا؟', 'culture', 'medium'],
    ['احك لنا عن التعليم في بلدك', 'culture', 'medium'],
    ['صف يوم عادي في حياتك', 'culture', 'easy'],
    ['ما الفرق بين الحسانية والعربية الفصحى؟', 'culture', 'hard'],
    // Religion
    ["كيف تقول 'إن شاء الله' بطريقتك؟", 'religion', 'easy'],
    ['كيف تدعو لشخص بالخير بالحسانية؟', 'religion', 'easy'],
    ['كيف تقرأ البسملة بالنطق الحساني؟', 'religion', 'medium'],
    ["كيف تقول 'بارك الله فيك'؟", 'religion', 'easy'],
    ['صف صلاة الجماعة في المسجد', 'religion', 'medium'],
    // Technology
    ["كيف تقول 'أرسل لي رسالة'؟", 'technology', 'easy'],
    ["كيف تقول 'اتصل بي'؟", 'technology', 'easy'],
    ['كيف تشرح الإنترنت لشخص كبير؟', 'technology', 'hard'],
    ["كيف تقول 'صور لي صورة'؟", 'technology', 'easy'],
    ["كيف تقول 'شاهدت هذا على يوتيوب'؟", 'technology', 'easy'],
  ];
  const insert = db.prepare('INSERT INTO prompts (arabic_text, domain, difficulty) VALUES (?, ?, ?)');
  for (const [text, domain, diff] of prompts) insert.run(text, domain, diff);
  console.log(`Seeded ${prompts.length} prompts`);
}

module.exports = db;
