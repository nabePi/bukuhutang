# BukuHutang OpenClaw Integration Guide

## Overview

BukuHutang sekarang menggunakan **OpenClaw** untuk orchestrasi reminder dan cron jobs. Arsitektur telah diubah dari internal cron (node-cron + Bull Queue) menjadi **stateless API dengan external cron trigger**.

## Arsitektur Baru

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   OpenClaw      │────▶│  BukuHutang API  │────▶│  SQLite DB      │
│   Gateway       │     │  (Stateless)     │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │
        │               ┌──────────────────┐
        └──────────────▶│  Worker Agent    │
           (cron job)   │  (Send WhatsApp) │
                        └──────────────────┘
```

### Komponen Utama

1. **BukuHutang API** (`/api/openclaw/*`)
   - Stateless, tidak punya internal scheduler
   - Menerima request dari OpenClaw untuk check reminders
   - Menyediakan jobs untuk worker

2. **OpenClaw Cron Jobs**
   - `bukuhutang-reminders-v2`: Check debt reminders setiap 6 jam
   - `bukuhutang-installments-v2`: Check installment reminders setiap 6 jam

3. **Worker Agent** (`skills/bukuhutang-worker/`)
   - Skill untuk OpenClaw agent
   - Fetch jobs dari API → Send WhatsApp → Report status

## API Endpoints

### 1. Get Jobs
```
GET /api/openclaw/jobs?type=all|reminders|installments&limit=50
Headers: X-API-Key: your-api-key
```

Response:
```json
{
  "status": "ok",
  "count": 2,
  "jobs": [
    {
      "type": "SEND_DEBT_REMINDER",
      "jobId": "debt_123",
      "tenantId": "tenant_456",
      "debtorPhone": "08123456789",
      "debtorName": "Budi",
      "amount": 1000000,
      "dueDate": "2026-02-20",
      "daysUntilDue": 3
    }
  ]
}
```

### 2. Report Job Status
```
POST /api/openclaw/report
Headers: X-API-Key: your-api-key
Content-Type: application/json

{
  "jobId": "debt_123",
  "jobType": "SEND_DEBT_REMINDER",
  "status": "success|failed",
  "error": null
}
```

### 3. Get System Status
```
GET /api/openclaw/status
Headers: X-API-Key: your-api-key
```

### 4. Get/Update Policy
```
GET /api/openclaw/policy
POST /api/openclaw/policy (body: {key, value})
Headers: X-API-Key: your-api-key
```

### 5. Send WhatsApp (Internal)
```
POST /api/whatsapp/send
Headers: X-API-Key: your-api-key
Content-Type: application/json

{
  "tenantId": "tenant_456",
  "phone": "08123456789",
  "message": "PENGINGAT HUTANG...",
  "type": "text"
}
```

## Policy Configuration

Policy table menyimpan runtime configuration:

| Key | Default | Description |
|-----|---------|-------------|
| `reminder.check_interval_hours` | 6 | Interval check reminders |
| `reminder.days_before_due` | 3 | Hari sebelum due date untuk kirim reminder |
| `reminder.days_after_overdue` | 1 | Hari setelah overdue untuk follow-up |
| `installment.check_interval_hours` | 6 | Interval check installments |
| `installment.days_before_due` | 3 | Hari sebelum due date untuk kirim reminder |
| `agreement.auto_activate` | true | Auto activate saat lender approve |
| `system.max_retries` | 3 | Max retry untuk failed operations |
| `system.retry_delay_ms` | 5000 | Delay antar retry |

## Cron Jobs

### Current Jobs

1. **bukuhutang-reminders-v2**
   - Schedule: Every 6 hours
   - Action: Run worker to check and send debt reminders

2. **bukuhutang-installments-v2**
   - Schedule: Every 6 hours  
   - Action: Run worker to check and send installment reminders

### Mengubah Schedule

```bash
# Lihat jobs
openclaw cron list

# Update interval
openclaw cron update --job-id <ID> --patch '{"schedule": {"kind": "every", "everyMs": 3600000}}'
```

## Worker Skill

Location: `/home/ubuntu/.openclaw/workspace/skills/bukuhutang-worker/`

### Manual Run
```bash
cd /home/ubuntu/.openclaw/workspace/skills/bukuhutang-worker
BUKUHUTANG_API_URL=http://localhost:3006 \
BUKUHUTANG_API_KEY=bukuhutang_openclaw_2026_secure \
node worker.js
```

### Environment Variables
- `BUKUHUTANG_API_URL`: URL BukuHutang API
- `BUKUHUTANG_API_KEY`: API Key untuk authentication

## Migration dari Arsitektur Lama

### Apa yang Berubah

| Sebelum | Sesudah |
|---------|---------|
| Bull Queue + Redis | Stateless API + OpenClaw Cron |
| Internal cron job | External OpenClaw cron |
| Tight coupling | Loose coupling via HTTP API |

### Tidak Ada Redis Lagi

```bash
# Removed dari package.json dependencies:
# - bull
# - ioredis
# - node-cron
```

### Database Tetap

SQLite tetap digunakan untuk:
- Debts, loan_agreements, installments
- Policy configuration
- Tenant data

## Testing

### Test API Endpoints
```bash
cd /home/ubuntu/.openclaw/workspace/bukuhutang

# Health check
curl http://localhost:3006/health

# Get jobs
curl -H "X-API-Key: bukuhutang_openclaw_2026_secure" \
  http://localhost:3006/api/openclaw/jobs?type=all

# Get policy
curl -H "X-API-Key: bukuhutang_openclaw_2026_secure" \
  http://localhost:3006/api/openclaw/policy
```

### Test Worker
```bash
cd /home/ubuntu/.openclaw/workspace/skills/bukuhutang-worker
node worker.js
```

## Troubleshooting

### API Key Invalid
- Pastikan `OPENCLAW_API_KEY` di .env sesuai
- Restart server setelah ubah .env

### Worker Tidak Jalan
- Check `BUKUHUTANG_API_URL` dan `BUKUHUTANG_API_KEY`
- Check API server running

### Reminder Tidak Terkirim
- Check cron job status: `openclaw cron list`
- Check logs: `tail -f /home/ubuntu/.openclaw/workspace/bukuhutang/logs/app.log`
- Check policy: `reminder.days_before_due`

## Environment Variables

```bash
PORT=3006
DB_PATH=./data/bukuhutang.db
OPENCLAW_API_KEY=bukuhutang_openclaw_2026_secure
SUPER_ADMIN_API_KEY=your-super-secret-key
OPENCLAW_GATEWAY_URL=http://localhost:8080
BUKUHUTANG_API_URL=http://localhost:3006
BUKUHUTANG_API_KEY=bukuhutang_openclaw_2026_secure
```
