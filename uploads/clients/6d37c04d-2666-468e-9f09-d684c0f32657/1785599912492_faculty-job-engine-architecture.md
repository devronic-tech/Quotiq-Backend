# India Faculty Job Search Engine — Implementation-Ready Architecture

Stack: React/Tailwind/React Query · Node.js/Express · Python workers · PostgreSQL · Redis · BullMQ · Wasabi S3 · Nginx · Docker → Kubernetes-ready · Hostinger KVM VPS → multi-VPS

---

## 1. System Overview

```mermaid
flowchart TD
    A[College Discovery<br/>runs quarterly] --> B[(College Registry - Postgres)]
    B --> C[Career Page Monitor<br/>adaptive scheduler]
    C -->|hash/etag unchanged| STOP1[Stop - no cost incurred]
    C -->|changed| D[Document Downloader]
    D --> E[(Wasabi S3 - originals)]
    D --> F[OCR Queue]
    F --> G{Scanned?}
    G -->|No, text PDF| H[Direct text extraction]
    G -->|Yes| I[OCR - PaddleOCR/Tesseract]
    H --> J[Language Detection]
    I --> J
    J -->|non-English| K[Translation - IndicTrans2/NLLB]
    J -->|English| L[AI Extraction]
    K --> L[AI Extraction - LLM structured output]
    L --> M[Validation & Dedup Engine]
    M -->|confidence >= 90%| N[(Jobs DB + Search Index)]
    M -->|confidence < 90%| O[Manual Review Queue]
    O --> N
    N --> P[Notification Engine]
    N --> Q[Search API]
    P --> R[Users - Email/Push/WhatsApp]
    Q --> S[React Frontend]
```

Core principle: **every service talks to the next only through a queue or a database row it wrote.** No service calls another service's HTTP endpoint synchronously. If Layer 5 (OCR) is down for six hours, Layers 1–4 keep running and simply pile up in `ocr_queue`; nothing else stalls.

---

## 2. College Discovery Service

**Trigger:** manual/cron, not continuous. Run modes:
- **Bootstrap run** (once): ingest AISHE, UGC, AICTE, NMC, BCI, PCI, INC datasets + state government college lists.
- **Refresh run**: every 90 days, or immediately when a new AISHE/UGC dataset drops (these are published annually/biennially — a Python script polls the source URLs weekly just to check for a new dataset file, which is cheap).
- **On-demand run**: admin adds a college manually via the admin panel.

**New-college detection:** normalize `(college_name, state, district)` into a slug, hash it, and `UPSERT` against `college_registry.dedupe_key`. Anything not previously seen is `status='new'` and queued for career-page discovery.

**Career page discovery (automated):**
1. Fetch the homepage HTML.
2. Search anchor text + href for keywords: `career|recruitment|vacancy|jobs|notification|advt|advertisement` (English + transliterations).
3. If nothing found on homepage, try `/sitemap.xml` and grep for the same keywords.
4. If still nothing, fall back to a targeted search query (`site:collegedomain.edu recruitment OR vacancy`) — this is the only place Google/Bing Search API is used, and only once per college, not repeatedly.
5. Store the resolved career URL with a `discovery_method` enum (`homepage_link`, `sitemap`, `search_fallback`, `manual`) so you can measure which method needs improvement.

**Broken link verification:** a lightweight weekly job does a `HEAD` request against every career page; 3 consecutive failures (with exponential backoff across the week, not 3 retries in a row) flips `college_registry.career_page_status = 'broken'` and re-triggers career-page discovery for that college only.

**Schema for this service** is part of the shared schema in Section 5.

---

## 3. Career Page Monitor (the cost-saving core)

### 3.1 Signals used, in order of cheapness
1. **HEAD request** — check `ETag` / `Last-Modified` headers first. Zero bandwidth cost if server supports it.
2. **Sitemap `lastmod`** — if the site exposes a sitemap, diff `lastmod` for the career URL entry.
3. **Content hash** — if headers are absent/unreliable (true for most Indian college sites), GET the page and SHA-256 the *visible text* (strip nav/footer boilerplate via a fixed CSS-selector allowlist per site template) rather than raw HTML, so ad rotations/timestamps in the footer don't cause false positives.
4. **RSS/Atom** — rare for these sites, but check once during discovery and use it if present (cheapest possible signal).

### 3.2 Adaptive priority scheduling

Each college gets a `check_interval_hours` computed by a scoring function re-evaluated after every check:

```
base_interval = category_base[category]           # table below
if last_change_detected_days_ago < 30: base_interval *= 0.5
if consecutive_no_change_checks > 10: base_interval *= 1.5   # cap at max
if consecutive_no_change_checks > 30: base_interval *= 2.0   # cap at max
interval = clamp(base_interval, category_min[category], category_max[category])
```

| Category | Base interval | Min | Max |
|---|---|---|---|
| Central/State Universities (high recruitment volume) | 8h | 6h | 48h |
| Government colleges | 48h | 24h | 96h |
| Medical/Engineering (autonomous, frequent ads) | 24h | 12h | 72h |
| Private colleges | 120h | 48h | 168h |
| Dormant (no change in 6 months) | 336h (2wk) | 168h | 720h (30d) |

This is implemented as a **BullMQ repeatable/delayed job per college**, not a single cron looping over 46,000 rows — each college's next check is its own delayed job re-enqueued with the new interval after every run, so the scheduler itself scales horizontally across workers instead of being a single bottleneck process.

### 3.3 Politeness
- Respect `robots.txt` (cache parsed rules per domain for 24h).
- Randomized jitter of ±20% on every interval so 46,000 colleges don't cluster on round-hour boundaries.
- Per-domain concurrency cap of 1 (never hit the same college twice simultaneously) enforced via a Redis lock keyed on domain.

This is where the "95%+ cost reduction" claim in the prior response comes from concretely: only pages whose hash actually changed ever reach the downloader, OCR, translation, or LLM stages — which are the expensive stages.

---

## 4. Document Downloader

**Retry strategy:** BullMQ job options `attempts: 5`, `backoff: {type: 'exponential', delay: 5000}`. After 5 failures, job moves to a `downloads-dlq` queue for manual inspection, college is flagged `download_failing = true` (does not block other colleges).

**Dedup/versioning:**
- SHA-256 the downloaded bytes → `documents.content_hash`.
- If a document with the same `content_hash` already exists for that college, link the new URL to the existing document row instead of re-storing/re-processing (common: colleges re-upload the identical PDF under a new filename).
- If the URL is the same but the hash differs, insert a new row and set `documents.supersedes_id` to the previous version — full version history is kept, nothing is overwritten.

**File naming in Wasabi:** `s3://faculty-jobs/{college_id}/{yyyy}/{mm}/{content_hash}.{ext}` — content-addressed, so accidental duplicate uploads are naturally deduplicated at the storage layer too, and URLs never leak predictable sequential IDs.

**Metadata stored in Postgres, not the file itself** — `documents` table (Section 5) holds URL, hash, size, mime type, college_id, discovered_at, processing_status.

---

## 5. Database Schema (PostgreSQL)

```sql
-- ============ CORE REGISTRY ============
CREATE TABLE college_registry (
    id                  BIGSERIAL PRIMARY KEY,
    dedupe_key          TEXT UNIQUE NOT NULL,        -- normalized hash of name+state+district
    name                TEXT NOT NULL,
    website             TEXT,
    career_page_url     TEXT,
    career_page_status  TEXT DEFAULT 'unknown',       -- unknown|active|broken
    discovery_method     TEXT,                         -- homepage_link|sitemap|search_fallback|manual
    state               TEXT NOT NULL,
    district             TEXT,
    category            TEXT NOT NULL,                 -- medical|engineering|arts|... (see enum below)
    university_type      TEXT,                          -- central|state|deemed|private|autonomous
    source_dataset       TEXT,                           -- aishe|ugc|aicte|manual|...
    status                TEXT DEFAULT 'new',            -- new|active|inactive|merged
    check_interval_hours  NUMERIC DEFAULT 48,
    consecutive_no_change INTEGER DEFAULT 0,
    last_checked_at       TIMESTAMPTZ,
    last_change_at        TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_registry_category ON college_registry(category);
CREATE INDEX idx_registry_state ON college_registry(state);
CREATE INDEX idx_registry_next_check ON college_registry(last_checked_at);

CREATE TYPE college_category AS ENUM (
    'government','private','university','autonomous','medical','engineering',
    'polytechnic','arts','commerce','science','law','agriculture','pharmacy',
    'nursing','dental','management','hotel_management','architecture',
    'teacher_education','research_institute'
);

-- ============ PAGE SNAPSHOTS ============
CREATE TABLE page_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    college_id      BIGINT REFERENCES college_registry(id),
    url             TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    etag            TEXT,
    last_modified   TEXT,
    checked_at      TIMESTAMPTZ DEFAULT now(),
    changed         BOOLEAN DEFAULT false
);
CREATE INDEX idx_snapshot_college_time ON page_snapshots(college_id, checked_at DESC);

-- ============ DOCUMENTS ============
CREATE TABLE documents (
    id                BIGSERIAL PRIMARY KEY,
    college_id        BIGINT REFERENCES college_registry(id),
    source_url        TEXT NOT NULL,
    storage_key       TEXT NOT NULL,      -- Wasabi key
    content_hash      TEXT NOT NULL,
    mime_type         TEXT,
    size_bytes        BIGINT,
    supersedes_id     BIGINT REFERENCES documents(id),
    is_scanned        BOOLEAN,
    ocr_status        TEXT DEFAULT 'pending',   -- pending|not_needed|processing|done|failed
    detected_language  TEXT,
    lang_confidence     NUMERIC,
    translation_status  TEXT DEFAULT 'pending',  -- pending|not_needed|done|failed
    extraction_status   TEXT DEFAULT 'pending',  -- pending|done|failed|needs_review
    discovered_at        TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX idx_doc_hash ON documents(college_id, content_hash);
CREATE INDEX idx_doc_status ON documents(extraction_status);

-- ============ EXTRACTED TEXT ============
CREATE TABLE document_text (
    document_id     BIGINT PRIMARY KEY REFERENCES documents(id),
    original_text   TEXT,
    english_text    TEXT,
    ocr_engine      TEXT,
    ocr_confidence  NUMERIC
);

-- ============ JOBS (final structured output) ============
CREATE TABLE jobs (
    id                    BIGSERIAL PRIMARY KEY,
    document_id           BIGINT REFERENCES documents(id),
    college_id            BIGINT REFERENCES college_registry(id),
    department             TEXT,
    designation             TEXT,
    designation_normalized  TEXT,          -- mapped to a controlled vocabulary
    qualification            TEXT,
    experience_years_min     NUMERIC,
    experience_years_max     NUMERIC,
    salary_min                NUMERIC,
    salary_max                NUMERIC,
    salary_raw                 TEXT,
    vacancies                   INTEGER,
    employment_type              TEXT,     -- permanent|contract|adhoc|guest|visiting
    reservation_category           TEXT,
    notification_date               DATE,
    last_date                        DATE,
    advertisement_number              TEXT,
    contact_email                       TEXT,
    contact_phone                       TEXT,
    apply_link                           TEXT,
    required_documents                    TEXT[],
    selection_process                       TEXT,
    extraction_confidence                   NUMERIC,
    review_status                            TEXT DEFAULT 'auto_approved', -- auto_approved|needs_review|approved|rejected
    is_duplicate_of                            BIGINT REFERENCES jobs(id),
    created_at                                  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_jobs_search ON jobs(college_id, department, designation_normalized, last_date);
CREATE INDEX idx_jobs_state_date ON jobs USING btree (last_date);
-- Partition jobs by created_at (yearly range partitions) once volume passes ~5M rows.

-- ============ USERS & ALERTS ============
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    role TEXT DEFAULT 'user',              -- user|admin|reviewer
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE alert_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    department TEXT,
    designation TEXT,
    state TEXT,
    qualification TEXT,
    min_salary NUMERIC,
    channel TEXT DEFAULT 'email'           -- email|push|whatsapp
);
CREATE INDEX idx_alert_match ON alert_preferences(department, state, designation);

CREATE TABLE notifications_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    job_id BIGINT REFERENCES jobs(id),
    channel TEXT,
    status TEXT,          -- queued|sent|failed
    sent_at TIMESTAMPTZ
);
```

**Partitioning/archiving:** once `jobs` exceeds a few million rows, convert to a `PARTITION BY RANGE (created_at)` table, one partition per year; expired (`last_date` > 2 years old) partitions get moved to a cheaper "archive" tablespace or exported to Parquet on Wasabi and detached.

---

## 6. Queue Architecture (BullMQ + Redis)

| Queue | Purpose | Concurrency | Priority | Retry policy |
|---|---|---|---|---|
| `discovery` | college discovery batch jobs | 2 | low | 3 attempts |
| `career-monitor` | per-college check job (delayed, repeatable) | 50 | medium | 3 attempts, no DLQ (self-reschedules) |
| `downloads` | fetch changed documents | 20 | medium | 5 attempts, exponential backoff |
| `ocr` | OCR scanned PDFs | GPU-bound: 2–4 per GPU worker | high | 3 attempts |
| `translation` | non-English → English | 10 | medium | 3 attempts |
| `extraction` | LLM structured extraction | 10 (rate-limited by provider) | high | 3 attempts w/ backoff |
| `validation` | rules engine | 20 | high | 1 attempt (deterministic) |
| `notifications` | fan-out email/push | 30 | medium | 5 attempts |
| `*-dlq` | dead letter per queue above | — | — | manual replay via admin panel |

Naming convention: `{domain}:{action}` e.g. `documents:download`, `ai:extract`. Every queue has a matching `*-dlq` for jobs that exhaust retries — surfaced in an admin "Failed Jobs" screen, never silently dropped.

**Worker autoscaling:** each worker type is a separate Docker service; scale via `docker compose up --scale ocr-worker=4`. Later, a Kubernetes HPA scales `ocr-worker` and `extraction-worker` deployments on queue depth (via KEDA watching Redis list length), not CPU%, since these are I/O/GPU-bound, not CPU-bound.

---

## 7. OCR Pipeline

| Engine | Cost | Multilingual (Indic) | CPU/GPU | Accuracy (typical scanned Indian govt PDF) |
|---|---|---|---|---|
| **PaddleOCR** | Free, open-source | Strong — Devanagari, Tamil, Telugu, Kannada via PP-OCRv4 multilingual models | Both; GPU ~5–10x faster | Best overall for mixed English+Indic |
| Tesseract | Free | Supports Indic via trained data, weaker on noisy scans | CPU only | Noticeably lower on low-DPI scans |
| EasyOCR | Free | Good script coverage, slower | GPU strongly recommended | Comparable to PaddleOCR, heavier runtime |
| Surya OCR | Free | Newer, good layout detection | GPU | Promising, less battle-tested at this scale |

**Recommendation:** PaddleOCR as primary engine (best cost/accuracy/language-coverage balance), Tesseract as a CPU fallback when GPU workers are saturated, and a scanned-vs-text detector (page has zero extractable text layer + image object covering >90% of page → scanned) so OCR only runs on the subset that actually needs it — most PDFs generated by government offices are digitally native and skip OCR entirely.

**Scanned detection:** use `pdftotext` (or `pypdf`) first; if extracted text length < 20 characters per page average, treat as scanned and route to OCR queue; otherwise treat as text-native.

**GPU vs CPU:** a single shared GPU worker (e.g., one VPS with a GPU, or a burstable GPU instance) handles OCR + translation batch jobs; CPU workers handle everything else. At 46,000 colleges the OCR volume is bursty (concentrated around recruitment-notification seasons: Dec–Feb and May–Jul for many Indian institutions), so a queue-depth-triggered autoscaled GPU worker pool is more cost-effective than provisioning GPU capacity for peak load year-round.

---

## 8. Language Detection & Translation

**Detection:** `fastText lid.176` or `langdetect`/`py-cld3` run on the extracted text; return top-2 languages with confidence. For mixed-language documents (common: English header + Hindi body), run detection per paragraph/block rather than on the whole document, and store a `language_map` (JSON: block index → language) alongside a single dominant `detected_language`.

**Translation model comparison:**

| Option | Cost (approx.) | Quality on govt/formal Indic text | Notes |
|---|---|---|---|
| IndicTrans2 (AI4Bharat, open-source) | Free (self-hosted compute only) | Very good, purpose-built for Indian languages | Best cost/quality ratio at this scale |
| NLLB-200 (Meta, open-source) | Free (self-hosted compute only) | Good, broader but slightly less tuned for Indian formal/govt register | Good fallback for languages IndicTrans2 covers less well |
| Claude/GPT/Gemini | Per-token API cost | Excellent, handles messy OCR output gracefully | Best when OCR text is noisy and needs joint clean-up + translation |
| Grok | Per-token API cost | Comparable to other frontier LLMs | No strong Indic-specific advantage over Claude/GPT/Gemini |

**Recommended approach:** IndicTrans2 self-hosted as the default (near-zero marginal cost at 46,000-college scale), with an LLM-based translation fallback only for documents where OCR confidence was low (noisy text benefits from an LLM's ability to infer intent) — this keeps the expensive path rare.

**Caching:** translation cache keyed on `content_hash` of the source text block — if two colleges post an identical UGC-mandated boilerplate paragraph, it's translated once.

**Batching:** group pending translation jobs by language and batch them (e.g., 20 documents per IndicTrans2 batch inference call) to maximize GPU throughput instead of one document per inference call.

---

## 9. AI Structured Extraction

**Schema-first prompting** — force the model into a strict JSON schema (use provider-native structured output / tool-calling, not "please return JSON" free text):

```json
{
  "college_name": "string",
  "department": "string|null",
  "designation": "string",
  "qualification": "string|null",
  "experience_years_min": "number|null",
  "experience_years_max": "number|null",
  "salary_min": "number|null",
  "salary_max": "number|null",
  "vacancies": "integer|null",
  "employment_type": "permanent|contract|adhoc|guest|visiting|null",
  "reservation_category": "string|null",
  "notification_date": "YYYY-MM-DD|null",
  "last_date": "YYYY-MM-DD|null",
  "advertisement_number": "string|null",
  "contact_email": "string|null",
  "contact_phone": "string|null",
  "apply_link": "string|null",
  "required_documents": ["string"],
  "selection_process": "string|null",
  "confidence": "number (0-1, self-reported)"
}
```

**Hallucination prevention:**
- Every extracted field must be traceable — prompt requires the model to only fill a field if the value literally appears in the source text; instruct it to return `null` rather than infer.
- Post-extraction, run a **grounding check**: regex-search the source `english_text` for the extracted email/phone/date substrings; if not found verbatim, downgrade confidence and flag for review.
- Use a **low temperature** (0–0.2) and a single deterministic pass; only re-run (retry) on schema-validation failure, not to "double check" the same input repeatedly (cost control).

**Retry mechanism:** if the model's output fails JSON-schema validation, retry once with the validation error appended to the prompt ("your previous output failed because X — fix it"); after 2 failures, send to manual review rather than looping indefinitely.

**Cost optimization:**
- Cache by `document_id` + prompt-version hash — re-running extraction (e.g., after a prompt improvement) only reprocesses documents, never re-does unaffected ones.
- Use the cheapest capable model for the first pass (e.g., a smaller/faster model tier); escalate to a stronger model only when confidence < threshold or validation fails twice.
- Chunk only the relevant portion of long documents (many notifications are 1–3 pages of actual content inside a longer PDF) — a lightweight heuristic/keyword pre-filter trims input tokens before the LLM call.

**Model comparison for this task:** Claude, GPT, and Gemini are all viable for structured extraction with tool-calling; the practical differentiator at this scale is **cost per document and schema-adherence reliability** rather than raw quality — since the schema is narrow and well-defined, cheaper mid-tier models generally suffice, with the pricier model reserved for the escalation path above.

---

## 10. Validation Layer

Deterministic rule engine (no LLM calls — this must be nearly free per document):

- **Email:** RFC-shape regex + reject role-mailbox-only garbage from OCR noise.
- **Phone:** normalize to E.164-ish Indian format, reject if not 10 digits (post country-code strip).
- **Dates:** reject `last_date < notification_date`; reject dates far in the past (likely OCR digit error) or > 2 years future.
- **Salary parsing:** handle "Level 10", "Rs. 57,700–1,82,400", "as per UGC norms" — normalize to numeric range where possible, else store raw string only.
- **Department/designation normalization:** maintain a controlled vocabulary table (`designation_normalized`) with fuzzy-matching (trigram similarity in Postgres via `pg_trgm`) against common variants ("Asst. Professor" → "Assistant Professor").
- **Duplicate detection:** two jobs are duplicates if `(college_id, designation_normalized, department, advertisement_number)` match, or if extracted text similarity (embedding cosine similarity) exceeds a threshold across two documents — link via `is_duplicate_of` rather than deleting, so provenance is preserved.
- **Confidence threshold:** combined score from LLM self-reported confidence + validation pass rate; below 0.9 → `review_status = 'needs_review'`, surfaced in an admin review queue with the source PDF side-by-side with extracted fields for one-click approve/edit/reject.

---

## 11. Search Index

| Option | Verdict for this use case |
|---|---|
| PostgreSQL full-text search alone | Fine up to a few hundred thousand jobs with simple filters; struggles with typo-tolerance and relevance ranking at millions of rows / high QPS |
| Elasticsearch | Very capable but operationally heavy (JVM, cluster management) for a small team starting on a single VPS |
| **Meilisearch** | **Recommended** — lightweight, single binary, excellent typo-tolerance and instant search out of the box, far simpler ops story than Elasticsearch, scales comfortably to tens of millions of documents on modest hardware |

**Approach:** Postgres remains the system of record; a change-data-capture step (on `jobs` insert/update, enqueue a `search-index` job) pushes a denormalized document into Meilisearch. Filters (state, district, department, designation, category, qualification, salary range, date range) map directly to Meilisearch filterable attributes; ranking rules tuned to boost `last_date` proximity and `created_at` recency; typo tolerance and autocomplete are native features, not custom-built.

---

## 12. Backend Architecture (Node.js/Express)

```
backend/
├── src/
│   ├── config/            # env loading, db pool, redis client, constants
│   ├── controllers/        # thin HTTP layer — parse req, call service, format res
│   │   ├── jobs.controller.js
│   │   ├── colleges.controller.js
│   │   ├── auth.controller.js
│   │   └── admin.controller.js
│   ├── services/            # business logic, orchestrates repositories + queues
│   │   ├── jobs.service.js
│   │   ├── search.service.js
│   │   ├── notification.service.js
│   │   └── review.service.js
│   ├── repositories/          # all SQL lives here, nowhere else
│   │   ├── jobs.repository.js
│   │   └── colleges.repository.js
│   ├── middlewares/
│   │   ├── auth.middleware.js      # JWT verify
│   │   ├── rbac.middleware.js      # role checks
│   │   ├── rateLimit.middleware.js
│   │   └── errorHandler.middleware.js
│   ├── queues/               # BullMQ producers (consumers live in Python/Node workers)
│   ├── validators/            # request schema validation (zod/joi)
│   ├── routes/
│   ├── utils/logger.js        # pino/winston structured logging
│   └── app.js
├── tests/
├── Dockerfile
└── package.json
```

- **Repository pattern:** controllers never touch the DB directly; only repositories issue SQL (parameterized queries, e.g., via `pg` with prepared statements — no string concatenation, prevents SQL injection).
- **RBAC:** `role` claim in JWT (`user`, `reviewer`, `admin`); `rbac.middleware.js` is a simple `requireRole(['admin'])` wrapper on admin routes.
- **Rate limiting:** `express-rate-limit` backed by Redis store, tiered (stricter on `/auth`, generous on `/search`).
- **Logging:** structured JSON logs (pino) shipped to Loki; every request gets a `requestId` for tracing across services.
- **Error handling:** centralized error middleware maps known error classes (`ValidationError`, `NotFoundError`, `AuthError`) to HTTP codes; unknown errors are logged with stack trace and returned as generic 500 (never leak internals).

---

## 13. Python Workers Architecture

```
workers/
├── common/
│   ├── queue_client.py     # BullMQ-compatible Redis job puller (bullmq-py or custom)
│   ├── db.py                # asyncpg pool
│   ├── storage.py            # Wasabi S3 client (boto3-compatible)
│   └── retry.py               # shared retry/backoff decorator
├── discovery_worker/
├── monitor_worker/
├── download_worker/
├── ocr_worker/
│   ├── engine_paddle.py
│   ├── engine_tesseract.py
│   └── detect_scanned.py
├── translation_worker/
├── extraction_worker/
│   ├── prompts/
│   └── schema.py             # pydantic schema mirroring Section 9 JSON
├── validation_worker/
└── docker-compose.workers.yml
```

**Concurrency model — recommendation:** `asyncio` for I/O-bound workers (download, translation-API-calls, extraction-API-calls — mostly waiting on network), and a small `multiprocessing` pool specifically for OCR (CPU/GPU-bound, benefits from true parallelism, and PaddleOCR's Python bindings are not async-native). Avoid raw `threading` for this workload — the GIL limits it for CPU-bound OCR, and asyncio already covers the I/O-bound cases more cleanly with less lock-management overhead.

**Failure recovery:** each worker wraps its job handler in a retry decorator (`tenacity` library) with exponential backoff; unrecoverable errors re-raise so BullMQ's own retry/DLQ mechanism takes over — workers should not swallow errors, only add typed logging context before re-raising.

---

## 14. Frontend Architecture (React)

```
frontend/
├── src/
│   ├── pages/
│   │   ├── Landing/
│   │   ├── Search/
│   │   ├── JobDetails/
│   │   ├── CollegeDetails/
│   │   ├── Notifications/
│   │   ├── SavedJobs/
│   │   ├── Dashboard/
│   │   ├── Profile/
│   │   └── Admin/            # review queue, failed jobs, college registry management
│   ├── components/            # shared UI (JobCard, FilterPanel, Pagination)
│   ├── hooks/                  # useJobSearch, useSavedJobs (wrap React Query)
│   ├── api/                     # typed fetch wrappers per resource
│   ├── routes/                   # React Router route tree, lazy-loaded pages
│   ├── store/                     # lightweight client state (filters, auth) if needed beyond RQ
│   └── App.jsx
```

- **API/caching:** React Query owns all server state — `useInfiniteQuery` for job search results (cursor-based pagination on `(last_date, id)` for stable infinite scroll), `staleTime` tuned per resource (job listings: short; college metadata: long).
- **SEO:** job details and college details pages need server-rendered/pre-rendered HTML for crawlers — either a lightweight SSR layer (Next.js-style) or pre-render top N pages + dynamic meta tags injected server-side for the rest; pure client-rendered React alone will not rank well for "assistant professor jobs Maharashtra" type queries, which matters a lot for organic discovery of a jobs site.
- **Auth:** JWT stored in httpOnly cookie (not localStorage, to reduce XSS token-theft risk), refreshed via silent refresh endpoint.

---

## 15. Docker Compose (initial single-VPS deployment)

```yaml
version: "3.9"
services:
  nginx:
    image: nginx:1.27-alpine
    ports: ["80:80", "443:443"]
    volumes: ["./nginx.conf:/etc/nginx/nginx.conf:ro"]
    depends_on: [backend, frontend]

  frontend:
    build: ./frontend
    restart: unless-stopped

  backend:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql://app:${DB_PASS}@postgres:5432/faculty_jobs
      - REDIS_URL=redis://redis:6379
    depends_on: [postgres, redis]
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=faculty_jobs
      - POSTGRES_PASSWORD=${DB_PASS}
    volumes: ["pgdata:/var/lib/postgresql/data"]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes: ["redisdata:/data"]
    restart: unless-stopped

  meilisearch:
    image: getmeili/meilisearch:v1.9
    environment:
      - MEILI_MASTER_KEY=${MEILI_KEY}
    volumes: ["meilidata:/meili_data"]

  monitor-worker:
    build: ./workers/monitor_worker
    deploy: {replicas: 4}
    depends_on: [redis, postgres]

  download-worker:
    build: ./workers/download_worker
    deploy: {replicas: 3}

  ocr-worker:
    build: ./workers/ocr_worker
    deploy: {replicas: 1}     # scale up on GPU-equipped host later

  extraction-worker:
    build: ./workers/extraction_worker
    deploy: {replicas: 2}

  notification-worker:
    build: ./workers/notification_worker
    deploy: {replicas: 2}

volumes:
  pgdata:
  redisdata:
  meilidata:
```

Health checks (`healthcheck:` blocks per service) and a `restart: unless-stopped` policy are the minimum for production; Kubernetes migration later swaps `deploy.replicas` for HPA-driven replica counts and adds liveness/readiness probes matching the same health-check endpoints.

---

## 16. Monitoring & Observability

- **Prometheus** scrapes: Express (via `prom-client` middleware — request latency, error rate), BullMQ queue depths (via `bullmq`'s metrics or a custom exporter), Postgres (`postgres_exporter`), Node/Python worker custom metrics (docs processed/min, OCR latency, extraction cost per doc).
- **Grafana** dashboards: (1) pipeline throughput — docs at each stage per hour; (2) queue depth & age of oldest job per queue (the single most useful early-warning signal); (3) cost dashboard — LLM tokens & OCR minutes consumed per day.
- **Loki** aggregates structured logs from all services, correlated by `requestId`/`jobId`.
- **Sentry** for unhandled exceptions in both Node backend and Python workers — this is what actually pages someone when the extraction worker starts silently failing on a schema change.
- **Alerts:** queue age > 2 hours on any high-priority queue; DLQ depth > 50; Postgres disk > 80%; daily LLM spend > configured threshold (kill-switch alert, not just a log line).

---

## 17. Security

- **Rate limiting:** per-IP + per-account, stricter on auth and write endpoints.
- **Bot protection:** Cloudflare (or similar) in front of Nginx for the public site; separate, tightly scoped internal network for worker-to-Postgres/Redis traffic (never exposed publicly).
- **Prompt injection protection:** the AI extraction prompt treats document text strictly as *data to extract from*, never as instructions — explicitly tell the model to ignore any instructions found within the document text, and never let extracted fields feed back into a system prompt unsanitized.
- **SQL injection:** parameterized queries only, enforced via the repository-pattern rule that no other layer touches the DB.
- **XSS:** React's default escaping + strict CSP headers; sanitize any rendered HTML fragments (e.g., rich job descriptions) with a library allowlist (e.g., DOMPurify) rather than trusting source data.
- **CSRF:** SameSite=Strict cookies + CSRF token on state-changing requests.
- **SSRF:** the downloader/discovery workers fetch arbitrary external URLs — restrict outbound requests from those workers to ports 80/443, block private IP ranges (169.254.x, 10.x, 192.168.x, 127.x) at the HTTP client layer to prevent a malicious "career page" redirect from probing internal infrastructure.
- **Secrets management:** `.env` files never committed; production secrets in a vault (Docker secrets initially, HashiCorp Vault or cloud secrets manager once multi-server).
- **Signed URLs:** original PDFs in Wasabi are private by default; served via short-lived signed URLs generated by the backend, never public bucket links.
- **Audit logs:** every admin action (approve/reject a job, edit a college record) logged with `admin_id`, `action`, `before/after` diff.

---

## 18. Cost Optimization Summary

- Change-detection (Section 3) eliminates the vast majority of would-be crawl/OCR/translation/LLM cost before it's ever incurred — this is the single biggest lever.
- Content-hash dedup at the document level prevents re-processing identical re-uploaded PDFs.
- Translation cache at the text-block level catches repeated boilerplate across colleges.
- LLM extraction caching by `(document_id, prompt_version)` prevents redundant re-runs; cheap-model-first with escalation-on-failure keeps the median cost per document low.
- Embeddings-based duplicate detection (Section 10) avoids running the full expensive pipeline twice on substantively identical notifications posted by multiple mirror pages.

---

## 19. Performance & Infrastructure Estimates

| Scale | Colleges | Est. docs/month | Postgres size (1yr) | Suggested infra |
|---|---|---|---|---|
| Pilot | 1,000 | ~3,000–8,000 | a few GB | 1 Hostinger KVM VPS (4 vCPU/16GB) running full stack via Compose |
| Growth | 10,000 | ~30,000–80,000 | tens of GB | Split: 1 VPS for API+frontend, 1 VPS for Postgres+Redis, 1 VPS (GPU-capable) for OCR/translation/extraction workers |
| Full scale | 46,000+ | ~150,000–400,000+ | low hundreds of GB (with partitioning/archiving) | Multi-VPS or move to Kubernetes cluster: dedicated Postgres (managed or replicated primary+replica), dedicated Redis, autoscaled worker pool, CDN in front of Nginx, Meilisearch on its own node |

Storage on Wasabi scales independently of compute (it's the cheapest line item here — original PDFs at this scale realistically total low hundreds of GB to a few TB over a couple of years, which is inexpensive object storage regardless of provider).

---

## 20. Scaling Roadmap & Implementation Phases

**Phase 1 (Weeks 1–4) — Foundation**
Postgres schema, college registry bootstrap (AISHE/UGC ingestion), basic Express API skeleton, auth, Docker Compose on single VPS.

**Phase 2 (Weeks 5–8) — Crawl pipeline**
Career page monitor + adaptive scheduler, document downloader, Wasabi integration, dedup logic.

**Phase 3 (Weeks 9–12) — Processing pipeline**
OCR worker, language detection, translation worker, basic extraction worker with a narrow schema (start with English-only documents to de-risk the pipeline before adding translation dependency).

**Phase 4 (Weeks 13–16) — Extraction quality + validation**
Full extraction schema, validation/dedup engine, manual review admin UI, confidence tuning.

**Phase 5 (Weeks 17–20) — Search & frontend**
Meilisearch integration, full React frontend (search, job details, saved jobs, notifications UI), SEO pre-rendering.

**Phase 6 (Weeks 21–24) — Notifications, monitoring, hardening**
Notification engine (email first, push second, WhatsApp later), Prometheus/Grafana/Loki/Sentry, security hardening pass, load testing.

**Phase 7 (ongoing)** — Scale-out: split services across VPS instances, then Kubernetes migration once operational load justifies it; WhatsApp channel; multi-language UI.

**Testing strategy:** unit tests per repository/service function; integration tests for each queue consumer against a test Postgres/Redis; a fixed "golden set" of ~50 real (anonymized) recruitment PDFs across languages used as a regression suite for the OCR→translation→extraction pipeline whenever prompts or models change.

**CI/CD:** GitHub Actions — lint + unit tests on every PR; on merge to `main`, build Docker images, push to a registry, and deploy via SSH+Compose to the VPS (or `kubectl apply` once on Kubernetes); migrations run via a dedicated `migrate` job gated before the app containers restart.

**Disaster recovery / backup:** nightly Postgres `pg_dump` (or WAL-based continuous archiving once past pilot scale) to Wasabi, retained 30 days; Wasabi itself is already durable object storage for original documents; Redis is treated as ephemeral/rebuildable (queue state, not source of truth) so it needs no backup, only monitoring.

---

## 21. Key Risks

| Risk | Mitigation |
|---|---|
| Career pages behind JS-heavy SPAs (no static HTML) | Fallback to a headless-browser fetch (Playwright) for the subset of colleges whose sites need it, flagged per-college rather than used universally (expensive to run at full scale) |
| LLM cost overrun if change-detection fails silently | Daily cost dashboard + hard alert threshold (Section 16) |
| OCR/translation quality varies a lot across scanned notification quality | Confidence-gated manual review queue absorbs the long tail rather than letting bad data reach users |
| Single-VPS Postgres becomes a bottleneck at full scale | Partitioning (Section 5) + read replica + eventual managed/dedicated Postgres node planned in Phase 7 |
| Site owners blocking the crawler | Strict robots.txt compliance + low request rate + honest User-Agent string reduces this risk substantially |
