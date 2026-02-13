# BukuHutang

WhatsApp-based debt tracker for UMKM and personal use.

## Features

- Track debts and receivables via WhatsApp
- Automated reminders for due payments
- Generate PDF reports
- Multi-user support

## Loan Agreement Feature

BukuHutang now supports formal loan agreements with installment tracking!

### New Commands:
- `BUAT PERJANJIAN [nama] [jumlah]` - Create loan agreement with interview
- `PERJANJIAN` - List all agreements
- `CICILAN` - View active installments
- `BAYAR CICILAN [nomor]` - Pay installment

### Features:
- Interview-based installment calculation
- Smart affordability analysis (max 30% of income)
- PDF agreement generation
- Automatic installment reminders
- Payment tracking

## Installation

```bash
npm install
```

## Usage

```bash
npm run dev    # Development mode with nodemon
npm start      # Production mode
npm test       # Run tests
```

## License

MIT
