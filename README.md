# صوتك — Sawtak
## Hassania Dialect Data Collection Platform

صوتك (Your Voice) is an open-source platform for collecting authentic Hassania dialect data to train Zidnni — the first AI assistant that speaks Mauritanian Hassania Arabic.

---

## What is Sawtak?

Sawtak solves the core problem in Hassania AI development: **there is no authentic training data**. Every major NLP dataset (FLORES-200, NLLB-200, MADAR) contains zero Hassaniyya data. Sawtak collects it directly from the community.

---

## Features

### Community Contribution
- Voice recording (up to 60 seconds per prompt)
- Text contribution in Hassania dialect
- Validation of other contributors recordings
- Story and proverb collection
- Works on mobile, RTL Arabic-first UI

### Paid Annotator System
- PIN-based annotator login
- Daily task queue with targets
- Earnings tracking (MRU per contribution)
- Payment CSV export for Bankily/Masrawi transfer
- Admin dashboard with performance metrics

### Import Pipeline
- WhatsApp chat export (.txt) bulk import
- Facebook data export (.json) bulk import
- Auto-detects Arabic text and Hassania markers
- Filters and saves to HDRP dataset format

### Studio Recording Module
- Session management (speaker, date, microphone)
- Bulk audio file upload (drag and drop)
- Whisper transcription queue
- Human review: approve/edit/reject
- Auto-saves approved transcripts to dataset

### Export Formats
- HDRP (Hassania Dialect Resource Protocol)
- SFT (Supervised Fine-Tuning format)
- DAPT (Domain-Adaptive Pre-Training format)
- Payment CSV for Bankily/Masrawi

---

## Tech Stack

- **Backend**: Node.js 22 + Express
- **Database**: SQLite (sawtak.db)
- **Auth**: JWT + PIN-based for annotators
- **Frontend**: Vanilla HTML/CSS/JS — no framework, mobile-first, RTL Arabic
- **Audio**: Web Audio API (browser recording)
- **Transcription**: OpenAI Whisper (local)
- **Port**: 4000

---

## Installation

```bash
git clone https://github.com/mcheikh-create/sawtak-app
cd sawtak-app
npm install
npm start
```

Open http://localhost:4000

---

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Landing | / | Community contribution entry point |
| Record Voice | /record.html | Voice recording with prompts |
| Write Text | /write.html | Text contribution form |
| Validate | /validate.html | Community validation queue |
| Stories | /story.html | Long-form story/proverb collection |
| Annotator Login | /annotator/login.html | PIN login for paid annotators |
| Annotator Dashboard | /annotator/dashboard.html | Task queue and earnings |
| Admin Dashboard | /admin/dashboard.html | Full platform management |
| Studio | /admin/studio.html | Recording session management |

---

## Default Credentials

Admin PIN: **1234** (change immediately in production)

---

## Data Storage

All contributions are saved to two locations:
1. `sawtak.db` — SQLite database for app functionality
2. `~/hassania-dataset/raw/community/` — JSONL files for training pipeline

---

## Payment Rates (default)

| Contribution Type | Rate |
|-------------------|------|
| Text contribution | 5 MRU |
| Voice recording (>15s) | 15 MRU |
| Story (>100 words) | 25 MRU |
| Validation | 2 MRU |
| WhatsApp import (per valid entry) | 1 MRU |

Rates are configurable per annotator in the admin dashboard.

---

## Why Hassania?

Hassaniya Arabic is spoken by ~4 million people in Mauritania, Western Sahara, Mali, and southern Morocco. It is critically under-resourced in NLP:

- FLORES-200: **0** Hassaniyya sentences
- NLLB-200: **0** Hassaniyya sentences  
- MADAR (25 Arabic cities): **0** Mauritanian entries
- The entire public dataset ecosystem: ~3,000 sentences (DAH)

Sawtak exists to change this. Every contribution matters.

---

## Part of the Zidnni Ecosystem

| Repo | Purpose |
|------|---------|
| [Zidnni](https://github.com/mcheikh-create/Zidnni) | Arabic-first AI assistant for Mauritania |
| [Sawtak](https://github.com/mcheikh-create/sawtak-app) | This repo — data collection platform |
| [Hassania Dataset](https://github.com/mcheikh-create/hassania-dataset) | Collected training data |
| [Hassania Research](https://github.com/mcheikh-create/hassania-research) | AutoResearch training engine |
| [Hassania Dialect Engine](https://github.com/mcheikh-create/hassania-dialect-engine) | Simula data pipeline |

---

## Contributing

We welcome contributions from:
- Mauritanian community members (voice, text)
- Linguists and NLP researchers
- Developers (code contributions)
- Anyone who speaks or understands Hassania

Contact: Open an issue or reach out via the Zidnni project.

---

## License

MIT License — open source for the benefit of the Mauritanian community.

بُنِيَ بإحسان — Built with Ihsan standard.
