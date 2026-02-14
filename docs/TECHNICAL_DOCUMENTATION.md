# BukuHutang - Technical Documentation

> **Version:** 1.0.0  
> **Architecture:** Single Admin Mode (Stateless API + OpenClaw Orchestration)  
> **Last Updated:** February 14, 2026

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [API Documentation](#api-documentation)
5. [WhatsApp Integration](#whatsapp-integration)
6. [OpenClaw Integration](#openclaw-integration)
7. [Dashboard](#dashboard)
8. [Deployment](#deployment)

---

## System Overview

### What is BukuHutang?

BukuHutang is a **WhatsApp-based debt tracking system** designed for Indonesian UMKM (Micro, Small, and Medium Enterprises) and personal use. It facilitates loan agreements between lenders and borrowers through an AI-powered conversational interface.

### Key Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI-Powered** | Natural language processing for all interactions |
| 📱 **WhatsApp Native** | No app installation required for users |
| 📝 **Loan Agreements** | Formal installment-based lending with PDF generation |
| 🔔 **Automated Reminders** | OpenClaw-powered cron-based notifications |
| 📊 **Web Dashboard** | Real-time monitoring and management |
| 💰 **Payment Tracking** | Installment management with auto-completion |

### User Roles

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│     ADMIN       │     │     LENDER       │     │    BORROWER     │
│  (Platform)     │────▶│  (Pemberi Pinjam)│────▶│  (Peminjam)     │
│  081254653452   │     │  e.g., Ari       │     │  e.g., Budi     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                        │
         │                       │                        │
         ▼                       ▼                        ▼
   ┌──────────────────────────────────────────────────────────┐
   │              AI-Powered WhatsApp Handler                 │
   └──────────────────────────────────────────────────────────┘
```

---

## Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BUKUHUTANG SYSTEM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   WhatsApp   │    │   Express    │    │   SQLite     │                  │
│  │   (Baileys)  │◀──▶│    Server    │◀──▶│  Database    │                  │
│  │              │    │              │    │              │                  │
│  └──────────────┘    └──────┬───────┘    └──────────────┘                  │
│                             │                                               │
│                             ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        BUSINESS LOGIC LAYER                          │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │   │
│  │  │   Handler  │  │  Interview │  │  Services  │  │   Policy   │   │   │
│  │  │            │  │    Agent   │  │            │  │            │   │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                             │                                               │
│                             ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     OPENCLAW INTEGRATION                             │   │
│  │                                                                      │   │
│  │   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐       │   │
│  │   │   Cron Jobs  │────▶│  /api/jobs   │────▶│  Worker Agent│       │   │
│  │   │  (6 hours)   │     │  Endpoint    │     │  (WhatsApp)  │       │   │
│  │   └──────────────┘     └──────────────┘     └──────────────┘       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Overview

#### 1. WhatsApp Client (`src/whatsapp/client.js`)
- **Library:** Baileys (v7.0.0-rc.9)
- **Purpose:** Manages WhatsApp Web connection
- **Features:**
  - QR Code generation for authentication
  - Auto-reconnect on disconnect
  - Multi-file auth state persistence
  - Message sending/receiving

#### 2. Message Handler (`src/whatsapp/handler.js`)
- **Purpose:** Routes incoming messages to appropriate handlers
- **Intents Supported:**
  - `PINJAM` - Borrower initiates loan request
  - `STATUS` - Check debt/loan status
  - `BUAT_PERJANJIAN` - Create loan agreement
  - `CICILAN` - Check installment schedule
  - `BAYAR` - Payment confirmation
  - `KONFIRMASI_PEMBAYARAN` - Lender confirms payment
  - `GENERAL_CHAT` - Conversational responses

#### 3. Loan Interview Agent (`src/agents/loanInterviewAgent.js`)
- **Purpose:** 5-step interview workflow for loan creation
- **Steps:**
  1. Collect borrower name
  2. Collect loan amount
  3. Collect lender name & phone
  4. Calculate installments (30% debt ratio rule)
  5. Generate agreement summary

#### 4. Services Layer

| Service | File | Purpose |
|---------|------|---------|
| Loan Agreement | `loanAgreementService.js` | CRUD for agreements & installments |
| Policy | `policyService.js` | Runtime configuration management |
| OpenClaw | `openclawService.js` | Integration with OpenClaw Gateway |
| PDF Generator | `pdfGenerator.js` | Generate loan agreement PDFs |
| AI Service | `aiService.js` | Intent parsing & responses |

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐
│      users      │         │  loan_agreements    │         │installment_payments │
├─────────────────┤         ├─────────────────────┤         ├─────────────────────┤
│ id (PK)         │◀───────│ id (PK)             │◀────────│ id (PK)             │
│ phone_number    │    1:M  │ lender_id (FK)      │    1:M  │ agreement_id (FK)   │
│ name            │         │ borrower_name       │         │ installment_number  │
│ created_at      │         │ borrower_phone      │         │ amount              │
└─────────────────┘         │ total_amount        │         │ due_date            │
                            │ installment_amount  │         │ status              │
                            │ installment_count   │         │ paid_amount         │
                            │ status              │         │ paid_at             │
                            │ actual_lender_name  │         │ reminder_sent       │
                            │ actual_lender_phone │         └─────────────────────┘
                            │ created_at          │
                            └─────────────────────┘
```

### Table Definitions

#### users
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_number TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### loan_agreements
```sql
CREATE TABLE loan_agreements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lender_id INTEGER NOT NULL,              -- Admin ID (Single Admin Mode)
  borrower_name TEXT NOT NULL,
  borrower_phone TEXT,
  total_amount REAL NOT NULL,
  installment_amount REAL NOT NULL,
  installment_count INTEGER NOT NULL,
  interest_rate REAL,
  first_payment_date DATE,
  status TEXT DEFAULT 'draft',             -- draft, active, completed, cancelled
  actual_lender_name TEXT,                 -- Real lender name
  actual_lender_phone TEXT,                -- Real lender phone
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lender_id) REFERENCES users(id)
);
```

#### installment_payments
```sql
CREATE TABLE installment_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agreement_id INTEGER NOT NULL,
  installment_number INTEGER NOT NULL,
  amount REAL NOT NULL,
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'pending',           -- pending, paid, partial
  paid_amount REAL DEFAULT 0,
  paid_at DATETIME,
  reminder_sent INTEGER DEFAULT 0,
  FOREIGN KEY (agreement_id) REFERENCES loan_agreements(id)
);
```

#### policy (Runtime Configuration)
```sql
CREATE TABLE policy (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Default Policy Values

| Key | Value | Description |
|-----|-------|-------------|
| `reminder.check_interval_hours` | 6 | Check interval for reminders |
| `reminder.days_before_due` | 3 | Days before due to send reminder |
| `reminder.days_after_overdue` | 1 | Days after overdue to follow up |
| `installment.check_interval_hours` | 6 | Check interval for installments |
| `agreement.auto_activate` | true | Auto-activate after both parties approve |
| `system.max_retries` | 3 | Max retry attempts for failed sends |
| `system.retry_delay_ms` | 5000 | Delay between retries (ms) |

---

## API Documentation

### Public Endpoints (No Auth Required)

#### GET `/api/public/whatsapp/status`
Returns WhatsApp connection status and QR code.

**Response:**
```json
{
  "connected": false,
  "phoneNumber": null,
  "name": null,
  "qrCode": "data:image/png;base64,..."
}
```

#### POST `/api/public/whatsapp/logout`
Logout from WhatsApp and restart server.

**Response:**
```json
{
  "success": true,
  "message": "WhatsApp logged out. Server restarting..."
}
```

#### GET `/api/public/agreements`
Get all loan agreements.

**Response:**
```json
{
  "agreements": [
    {
      "id": 2,
      "borrower_name": "Budi Peminjam",
      "borrower_phone": "081312345678",
      "total_amount": 2000000,
      "installment_amount": 500000,
      "installment_count": 4,
      "status": "active",
      "actual_lender_name": "Ari Lender",
      "actual_lender_phone": "081298765432",
      "created_at": "2026-02-14 09:30:33"
    }
  ]
}
```

#### GET `/api/public/installments`
Get all installment payments.

**Response:**
```json
{
  "installments": [
    {
      "id": 5,
      "agreement_id": 2,
      "installment_number": 1,
      "due_date": "2026-02-21",
      "amount": 500000,
      "paid_amount": 0,
      "status": "pending",
      "borrower_name": "Budi Peminjam",
      "actual_lender_name": "Ari Lender"
    }
  ]
}
```

#### GET `/api/public/policy`
Get all policy configurations.

**Response:**
```json
{
  "policy": {
    "reminder.check_interval_hours": 6,
    "reminder.days_before_due": 3,
    ...
  }
}
```

#### GET `/api/public/agent-status`
Get agent/worker status and queue information.

**Response:**
```json
{
  "status": "active",
  "timestamp": "2026-02-14T12:49:12.455Z",
  "stats": {
    "activeAgreements": 1,
    "pendingInstallments": 4,
    "upcomingReminders": 1,
    "totalJobs": 0
  },
  "jobs": {
    "reminders": 0,
    "installments": 0,
    "total": 0
  },
  "nextCheck": "2026-02-14T18:49:12.455Z"
}
```

### OpenClaw Endpoints (API Key Required)

#### GET `/api/openclaw/jobs`
Get pending jobs for OpenClaw to process.

**Query Parameters:**
- `type`: `all` | `reminders` | `installments`
- `limit`: Number of jobs (default: 50)

**Response:**
```json
{
  "status": "ok",
  "count": 2,
  "jobs": [
    {
      "type": "SEND_INSTALLMENT_REMINDER",
      "jobId": "inst_5",
      "installmentId": 5,
      "debtorPhone": "081312345678",
      "debtorName": "Budi Peminjam",
      "amount": 500000,
      "dueDate": "2026-02-21"
    }
  ]
}
```

#### POST `/api/openclaw/report`
Report job completion status.

**Request Body:**
```json
{
  "jobId": "inst_5",
  "jobType": "SEND_INSTALLMENT_REMINDER",
  "status": "success",
  "error": null
}
```

#### POST `/api/whatsapp/send`
Send WhatsApp message (called by OpenClaw worker).

**Request Body:**
```json
{
  "phone": "081312345678",
  "message": "Your reminder text",
  "type": "text"
}
```

---

## WhatsApp Integration

### Message Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MESSAGE HANDLING FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. INCOMING MESSAGE                                                        │
│     │                                                                       │
│     ▼                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      MessageHandler.handle()                         │   │
│  │                                                                      │   │
│  │  Step 1: Check for confirmation context                              │   │
│  │     ├── If YES/NO response → Execute or cancel intent                │   │
│  │                                                                      │   │
│  │  Step 2: Check for borrower response (SETUJU/TOLAK)                  │   │
│  │     ├── If SETUJU → Activate agreement                               │   │
│  │     └── If TOLAK → Cancel agreement                                  │   │
│  │                                                                      │   │
│  │  Step 3: Check active interview                                      │   │
│  │     └── If in interview → Continue loanInterviewAgent                │   │
│  │                                                                      │   │
│  │  Step 4: Parse intent with AI                                        │   │
│  │     ├── Call aiService.parseIntent()                                 │   │
│  │     └── Get intent + entities + response                             │   │
│  │                                                                      │   │
│  │  Step 5: Execute or ask confirmation                                 │   │
│  │     ├── If needs_confirmation → Store context, wait for response     │   │
│  │     └── Otherwise → executeIntent()                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                             │                                               │
│                             ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Intent Handlers                                 │   │
│  │                                                                      │   │
│  │  PINJAM              → Handle borrower-initiated loan                │   │
│  │  STATUS              → Show debt/loan status                         │   │
│  │  BUAT_PERJANJIAN     → Start loan interview                          │   │
│  │  CICILAN             → Show installment schedule                     │   │
│  │  KONFIRMASI_PEMBAYARAN → Record payment, notify both parties         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Intent Examples

| Intent | Example Input | Action |
|--------|---------------|--------|
| `PINJAM` | "Mau pinjam 2 juta ke Ari" | Initiates loan request |
| `STATUS` | "Cek status hutang Budi" | Shows current status |
| `BUAT_PERJANJIAN` | "Buat perjanjian dengan Budi" | Starts interview |
| `CICILAN` | "Lihat jadwal cicilan" | Shows schedule |
| `KONFIRMASI_PEMBAYARAN` | "Budi sudah bayar cicilan pertama" | Records payment |

### Payment Confirmation Flow

```
Lender: "Budi sudah bayar cicilan pertama"
        │
        ▼
┌─────────────────────────────────────┐
│ AI Parse Intent                     │
│ • Intent: KONFIRMASI_PEMBAYARAN     │
│ • borrowerName: Budi                │
│ • installmentNumber: 1              │
│ • amount: 500000 (optional)         │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ Find Agreement & Installment        │
│ • Verify agreement exists           │
│ • Verify installment not paid       │
│ • Record payment                    │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ Update Database                     │
│ • Set status: 'paid'                │
│ • Set paid_amount                   │
│ • Set paid_at: NOW()                │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ Check Agreement Completion          │
│ • IF all installments paid          │
│   → Set agreement status: completed │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ Send Notifications                  │
│ • To Lender: Confirmation           │
│ • To Borrower: Payment receipt      │
└─────────────────────────────────────┘
```

---

## OpenClaw Integration

### Cron Job Configuration

OpenClaw is configured with cron jobs that call BukuHutang endpoints every 6 hours:

```json
{
  "name": "BukuHutang Reminder Check",
  "schedule": {
    "kind": "every",
    "everyMs": 21600000  // 6 hours
  },
  "payload": {
    "kind": "agentTurn",
    "message": "Check and send reminders"
  },
  "sessionTarget": "isolated"
}
```

### Worker Agent Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPENCLAW WORKER FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CRON TRIGGER (Every 6 hours)                                            │
│     │                                                                       │
│     ▼                                                                       │
│  2. CALL /api/openclaw/jobs                                                 │
│     │                                                                       │
│     ▼                                                                       │
│  3. GET JOB LIST                                                            │
│     ├── Type: SEND_REMINDER                                                 │
│     ├── Type: SEND_INSTALLMENT_REMINDER                                     │
│     └── ...                                                                 │
│     │                                                                       │
│     ▼                                                                       │
│  4. FOR EACH JOB:                                                           │
│     │                                                                       │
│     ├── Call /api/whatsapp/send                                             │
│     │   ├── Send message to debtor                                          │
│     │   └── Log response                                                    │
│     │                                                                       │
│     └── Call /api/openclaw/report                                           │
│         └── Mark job as completed                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Stateless Architecture Note

> **Important:** BukuHutang uses a **stateless API architecture** for OpenClaw integration.
> 
> - OpenClaw **calls** BukuHutang (not the other way around)
> - No `OPENCLAW_GATEWAY_URL` or `OPENCLAW_GATEWAY_TOKEN` needed
> - BukuHutang only exposes HTTP endpoints for OpenClaw to consume
> - All authentication is done via `API_KEY` header on incoming requests

```
Traditional: BukuHutang ──▶ OpenClaw Gateway
                    (needs URL + token)

Stateless:   OpenClaw ───▶ BukuHutang API
                    (OpenClaw knows BukuHutang URL)
```

### Job Types

| Job Type | Description | Data Included |
|----------|-------------|---------------|
| `SEND_DEBT_REMINDER` | Reminder for simple debt | debtorPhone, amount, dueDate |
| `SEND_INSTALLMENT_REMINDER` | Reminder for loan installment | installmentId, debtorPhone, amount, dueDate |

---

## Dashboard

### Tab Structure

| Tab | Content | Data Source |
|-----|---------|-------------|
| 👥 **Borrowers** | List of people who borrowed | `/api/public/agreements` |
| 💼 **Lenders** | List of people who lent money | `/api/public/agreements` |
| 📋 **Perjanjian** | All loan agreements | `/api/public/agreements` |
| 📅 **Cicilan** | Installment schedules | `/api/public/installments` |
| ⚙️ **Policy Config** | Runtime configuration | `/api/public/policy` |
| 🤖 **Agent Status** | Worker status & queue | `/api/public/agent-status` |

### Dashboard Features

1. **WhatsApp QR Code Display**
   - Auto-refresh every 5 seconds when not connected
   - Shows connection status
   - Logout button

2. **Real-time Statistics**
   - Total Piutang Aktif
   - Total Borrowers
   - Perjanjian Aktif
   - Cicilan Pending

3. **Mobile Responsive**
   - Horizontal scroll for tables
   - Sticky first column
   - Responsive tabs

---

## Deployment

### Environment Variables

```bash
# Server
PORT=3006
NODE_ENV=production

# WhatsApp
ADMIN_PHONE_NUMBER=081254653452
MOCK_MODE=false

# Database
DB_PATH=./data/bukuhutang.db

# Security (REQUIRED)
SUPER_ADMIN_API_KEY=your_secret_key        # For admin dashboard login
API_KEY=bukuhutang_openclaw_2026_secure    # For OpenClaw endpoint auth

# Note: OpenClaw integration is STATELESS
# OpenClaw calls BukuHutang via HTTP API
# No need for OPENCLAW_GATEWAY_URL or OPENCLAW_GATEWAY_TOKEN
```

### PM2 Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'bukuhutang',
    script: './src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

### Directory Structure

```
bukuhutang/
├── data/
│   ├── bukuhutang.db          # Main SQLite database
│   ├── agreements/            # Generated PDF agreements
│   └── tenants/               # Multi-tenant DB files (if enabled)
├── auth_info_baileys/         # WhatsApp auth session
├── logs/                      # PM2 logs
├── src/
│   ├── agents/                # AI agents
│   ├── api/                   # Express routes
│   ├── config/                # Configuration
│   ├── db/                    # Database connection & migrations
│   ├── middleware/            # Express middleware
│   ├── parser/                # Command parsers
│   ├── services/              # Business logic
│   └── whatsapp/              # WhatsApp client & handlers
├── public/
│   └── admin/                 # Dashboard files
├── scripts/                   # Migration & test scripts
└── tests/                     # Test files
```

### Deployment Commands

```bash
# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start with PM2
pm2 start ecosystem.config.js

# Or start directly
npm start
```

---

## Security Considerations

1. **API Key Protection**
   - OpenClaw endpoints require `X-API-Key` header
   - Public endpoints (dashboard) do not require auth

2. **WhatsApp Session**
   - Auth stored in `auth_info_baileys/`
   - Auto-restart on logout clears session

3. **Database**
   - SQLite with WAL mode for better concurrency
   - No sensitive data in logs

4. **CORS**
   - Configured for all origins (development)
   - Should be restricted in production

---

## Monitoring & Debugging

### Log Files

| File | Content |
|------|---------|
| `logs/out.log` | Application output |
| `logs/err.log` | Error messages |
| PM2 logs | Process management |

### Health Check

```bash
curl http://localhost:3006/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-14T12:00:00.000Z"
}
```

### Common Issues

| Issue | Solution |
|-------|----------|
| WhatsApp not connecting | Check QR code, restart server |
| Database locked | Restart PM2 process |
| API 401 error | Verify API key |
| Dashboard not loading | Check browser console for JS errors |

---

## Future Enhancements

1. **Multi-Tenant Mode** - Support for multiple admin numbers
2. **Payment Gateway** - Direct payment integration
3. **Analytics** - Advanced reporting and charts
4. **Mobile App** - Native app for easier access
5. **Blockchain** - Immutable loan records

---

## License

MIT License - See LICENSE file for details.

---

*Documentation generated on February 14, 2026*
