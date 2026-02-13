# BukuHutang Test Scenarios

## Test Environment Setup

### Prerequisites
1. BukuHutang running on localhost:3006
2. Redis running
3. WhatsApp Baileys connected
4. Gemini API key configured

### Test Data
```
Test Lender Phone: 08111111111 (Dani)
Test Borrower Phone: 08222222222 (Ahmad)
```

---

## Scenario 1: Basic Debt Tracking (PINJAM/HUTANG)

### Test Case 1.1: Create Simple Piutang
**Steps:**
1. Send: "Saya mau pinjamin uang ke Budi 500 ribu selama 2 minggu untuk beli semen"
2. Verify AI extracts: nama=Budi, jumlah=500000, durasi=14, catatan=beli semen
3. Confirm: "Iya betul"
4. Verify response: "✅ Piutang tercatat!"

**Expected Result:**
- Debt created in database
- Due date set to 14 days from now
- Reminder scheduled

### Test Case 1.2: Create Hutang
**Steps:**
1. Send: "Saya berhutang 2 juta sama Toko Makmur"
2. Confirm details
3. Verify response

**Expected Result:**
- Hutang tercatat with 30 days default

### Test Case 1.3: Check STATUS
**Steps:**
1. Send: "STATUS"
2. Verify summary shows all debts

**Expected Result:**
- Shows total piutang, hutang, overdue count

---

## Scenario 2: AI Conversational Features

### Test Case 2.1: Natural Language Variations
Test these inputs and verify AI understands:

| Input | Expected Intent | Entities |
|-------|----------------|----------|
| "Pinjemin Budi 500k 14 hari" | PINJAM | Budi, 500000, 14 |
| "Ahmad minjem 2jt sebulan" | PINJAM | Ahmad, 2000000, 30 |
| "Saya punya utang 1 juta ke Bank" | HUTANG | Bank, 1000000, 30 |
| "Cek hutang saya dong" | STATUS | - |
| "Halo, apa kabar?" | GENERAL_CHAT | - |

### Test Case 2.2: Confirmation Flow
**Steps:**
1. Send incomplete: "Saya mau pinjam uang"
2. Bot should ask: "Mau pinjamkan ke siapa dan berapa nominalnya?"
3. Provide details
4. Confirm

**Expected Result:** Multi-turn conversation works

### Test Case 2.3: Rejection/Correction
**Steps:**
1. Send: "Pinjemin Budi 500 ribu"
2. Bot asks confirmation
3. Reply: "Salah, maksudnya 1 juta"
4. Verify bot accepts correction

**Expected Result:** Context cleared, new input accepted

---

## Scenario 3: Loan Agreement with Installments

### Test Case 3.1: Create Agreement
**Steps:**
1. Send: "BUAT PERJANJIAN Ahmad 5000000"
2. Provide: phone=08222222222
3. Provide: income_source=GAJI
4. Provide: payment_day=25
5. Provide: monthly_income=8000000
6. Provide: other_debts=0
7. Verify recommendation shown
8. Reply: SETUJU
9. Verify PDF sent to Ahmad

**Expected Result:**
- Agreement created with status 'draft'
- Installments generated (5x Rp 1.000.000)
- PDF auto-sent to borrower

### Test Case 3.2: Borrower Approves
**Steps:**
1. From Ahmad's phone: "SETUJU"
2. Verify agreement status changes to 'active'
3. Verify both parties notified

**Expected Result:** Agreement active, cicilan dimulai

### Test Case 3.3: Borrower Rejects
**Steps:**
1. From Ahmad's phone: "TOLAK"
2. Verify agreement cancelled
3. Verify Dani notified

**Expected Result:** Agreement status 'cancelled'

---

## Scenario 4: Payment Tracking

### Test Case 4.1: Record Payment
**Prerequisite:** Active agreement exists

**Steps:**
1. Send: "BAYAR 1"
2. Verify payment recorded
3. Verify notification sent to Ahmad

**Expected Result:**
- Installment #1 marked as 'paid'
- paid_amount = installment_amount
- paid_at timestamp set

### Test Case 4.2: Check Payment Status
**Steps:**
1. Send: "STATUS CICILAN Ahmad"
2. Verify shows all installments with status

**Expected Result:** Visual progress shown (✅ for paid, ⏸️ for pending)

### Test Case 4.3: View Payment History
**Steps:**
1. Send: "RIWAYAT Ahmad"
2. Verify shows all payments with dates

**Expected Result:** Complete payment history displayed

---

## Scenario 5: Reports & Export

### Test Case 5.1: Monthly Report
**Steps:**
1. Send: "LAPORAN 2025 2"
2. Verify shows summary for February 2025

**Expected Result:**
- Total collected
- Total lent
- Active debts count
- Installments received

### Test Case 5.2: Export to Excel
**Steps:**
1. Send: "EXPORT excel"
2. Verify file generated in ./data/reports/

**Expected Result:** Excel file with debts/agreements data

### Test Case 5.3: Dashboard Statistics
**Steps:**
1. Send: "STATISTIK"
2. Verify shows:
   - Total lent
   - Total collected
   - Active agreements
   - Overdue debts
   - Net position

**Expected Result:** All stats displayed correctly

---

## Scenario 6: Reminders & Notifications

### Test Case 6.1: Manual Reminder
**Steps:**
1. Create debt with due date tomorrow
2. Send: "INGATKAN Budi"
3. Verify reminder sent to Budi

**Expected Result:** WhatsApp message delivered

### Test Case 6.2: Automatic Reminders
**Prerequisite:** Cron jobs running

**Steps:**
1. Create debt due in 1 day
2. Wait for OpenClaw cron (every 5 min)
3. Verify reminder auto-sent

**Expected Result:** OpenClaw spawns subagent, reminder delivered

### Test Case 6.3: Installment Reminders
**Prerequisite:** Active agreement with installment due

**Steps:**
1. Check OpenClaw cron (every 1 min)
2. Verify installment reminder sent to borrower

**Expected Result:** Borrower receives reminder before due date

---

## Scenario 7: Error Handling & Edge Cases

### Test Case 7.1: Invalid Amount
**Steps:**
1. Send: "Pinjamin Budi 9999999999"
2. Verify error or validation

**Expected Result:** Amount rejected (> 1 billion)

### Test Case 7.2: Non-existent Debtor
**Steps:**
1. Send: "INGATKAN OrangYangGakAda"
2. Verify appropriate error message

**Expected Result:** "Tidak menemukan piutang..."

### Test Case 7.3: AI Unavailable
**Steps:**
1. Disconnect internet/block Gemini API
2. Send natural language message
3. Verify fallback to regex parser works

**Expected Result:** Command still works via fallback

---

## Scenario 8: Settings & Templates

### Test Case 8.1: Change Template
**Steps:**
1. Send: "SETTING template friendly"
2. Create new debt
3. Verify reminder uses friendly template

**Expected Result:** Template changed, new reminders use friendly style

### Test Case 8.2: Help Command
**Steps:**
1. Send: "HELP"
2. Verify shows all commands with emojis

**Expected Result:** Help menu displayed

---

## Load Testing

### Test 9.1: Concurrent Users
**Steps:**
1. Simulate 10 users sending messages simultaneously
2. Verify all processed correctly
3. Check response time < 3 seconds

**Expected Result:** No errors, acceptable latency

### Test 9.2: AI Rate Limit
**Steps:**
1. Send 100 messages in 1 minute
2. Verify rate limiting works
3. Check fallback activates

**Expected Result:** Graceful handling of rate limits

---

## Regression Tests

### Test 10.1: Command Still Works
**Steps:**
1. Use old command: "PINJAM Budi 500000 14hari test"
2. Verify still works

**Expected Result:** Backward compatibility maintained

### Test 10.2: Database Integrity
**Steps:**
1. Create debt
2. Restart server
3. Verify data persists

**Expected Result:** Data intact after restart

---

## Pass Criteria

All tests must pass with:
- ✅ Correct response from bot
- ✅ Data correctly stored in SQLite
- ✅ Notifications delivered
- ✅ No errors in logs
