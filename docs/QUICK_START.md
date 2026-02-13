# 🚀 BukuHutang - Quick Start Guide

Mulai menggunakan BukuHutang dalam **5 menit**!

---

## ⚡ Install & Jalankan (3 Menit)

### 1. Clone & Install

```bash
cd /home/ubuntu/.openclaw/workspace/bukuhutang
npm install
```

### 2. Konfigurasi API Key

```bash
# Copy file environment
cp .env.example .env

# Edit .env dengan editor favorit Anda
nano .env
```

Isi minimal yang diperlukan:
```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

> 💡 **Dapatkan Gemini API Key gratis di:** https://ai.google.dev/

### 3. Jalankan Aplikasi

```bash
npm start
```

---

## 📱 Setup WhatsApp (2 Menit)

### 1. Scan QR Code

Setelah menjalankan `npm start`, Anda akan melihat QR code di terminal:

```
┌─────────────────────────────────────┐
│                                     │
│     ████████████████████████████    │
│     ██                        ██    │
│     ██  ████  ██  ████  ████  ██    │
│     ██  ██  ██  ██  ██  ██    ██    │
│     ██  ████  ██  ████  ████  ██    │
│     ██                        ██    │
│     ████████████████████████████    │
│                                     │
└─────────────────────────────────────┘
Scan QR with WhatsApp
```

### 2. Tautkan WhatsApp

1. Buka WhatsApp di HP Anda
2. Menu → Perangkat Tertaut → Tautkan Perangkat
3. Scan QR code yang muncul di terminal
4. Tunggu sampai muncul pesan **"Connected"**

### 3. Verifikasi

Kirim pesan ke nomor WhatsApp yang baru ditautkan:
```
Halo
```

Jika bot merespon, berarti **berhasil!** 🎉

---

## ✅ Test Pertama Kali

### Test 1: Chat Natural dengan AI

Kirim:
```
Saya mau pinjamin uang ke Budi 100 ribu selama 1 minggu
```

Bot akan memahami dan meminta konfirmasi!

### Test 2: Perintah Manual

Kirim:
```
PINJAM Andi 500000 14hari "Beli pulsa"
```

Bot akan mencatat piutang tersebut.

### Test 3: Cek Status

Kirim:
```
STATUS
```

Bot akan menampilkan ringkasan hutang/piutang Anda.

---

## 🎯 Perintah Penting untuk Pemula

| Perintah | Kapan Digunakan | Contoh |
|----------|-----------------|--------|
| `PINJAM` | Anda meminjamkan uang | `PINJAM Budi 1000000 30hari` |
| `HUTANG` | Anda meminjam uang | `HUTANG Bank 5000000 60hari` |
| `STATUS` | Cek ringkasan | `STATUS` |
| `BUAT PERJANJIAN` | Pinjaman dengan cicilan | `BUAT PERJANJIAN Ahmad 5000000` |
| `HELP` | Bantuan lengkap | `HELP` |

---

## 📋 Alur Kerja Umum

### Alur 1: Pencatatan Hutang Sederhana

```
Anda → Bot: PINJAM Budi 500000 14hari
Bot → Anda: ✅ Piutang tercatat! Jatuh tempo: [tanggal]
```

### Alur 2: Perjanjian dengan Cicilan

```
Anda → Bot: BUAT PERJANJIAN Ahmad 5000000
Bot → Anda: [Interview: nomor WA, gaji, tanggal gajian, dll]
Anda → Bot: [Jawab pertanyaan satu per satu]
Bot → Anda: [Tampilkan rekomendasi cicilan]
Anda → Bot: SETUJU
Bot → Ahmad: [Kirim PDF perjanjian]
Ahmad → Bot: SETUJU
Bot → Anda: 🎉 Ahmad telah MENYETUJUI perjanjian!
```

### Alur 3: Pencatatan Pembayaran

```
Ahmad → Anda: [Transfer cicilan pertama]
Anda → Bot: BAYAR 1
Bot → Anda: ✅ Cicilan #1 LUNAS
Bot → Ahmad: Terima kasih! Pembayaran diterima.
```

---

## 🔧 Perintah Produksi (Production)

Untuk menjalankan BukuHutang 24/7, gunakan PM2:

```bash
# Install PM2 secara global
npm install -g pm2

# Jalankan dengan PM2
pm2 start src/index.js --name bukuhutang

# Simpan konfigurasi PM2
pm2 save
pm2 startup

# Cek status
pm2 status

# Lihat log
pm2 logs bukuhutang

# Restart jika ada perubahan
pm2 restart bukuhutang
```

---

## 📁 Struktur Folder Penting

```
bukuhutang/
├── data/                  # Database & file data
│   ├── bukuhutang.db     # Database utama (SQLite)
│   ├── backups/          # Backup otomatis
│   └── reports/          # File export Excel/PDF
├── auth_info_baileys/    # Sesi WhatsApp (jangan dihapus!)
├── docs/                 # Dokumentasi
├── src/                  # Source code
│   ├── index.js         # Entry point
│   ├── whatsapp/        # WhatsApp handler
│   ├── services/        # Business logic
│   └── parser/          # Command parser
└── .env                 # Konfigurasi environment
```

---

## 🆘 Troubleshooting Cepat

### Masalah: Bot tidak merespon
```bash
pm2 restart bukuhutang
```

### Masalah: WhatsApp terputus
```bash
rm -rf auth_info_baileys/
pm2 restart bukuhutang
# Scan QR ulang
```

### Masalah: Database error
```bash
pm2 stop bukuhutang
rm data/*.db-journal data/*.db-wal data/*.db-shm 2>/dev/null
pm2 start bukuhutang
```

---

## 📚 Baca Selanjutnya

- [Panduan Lengkap (USER_MANUAL.md)](./USER_MANUAL.md) - Dokumentasi komprehensif
- [FAQ](./USER_MANUAL.md#faq) - Pertanyaan yang sering ditanyakan
- [Tips & Trik](./USER_MANUAL.md#tips--trik) - Cara menggunakan lebih efektif

---

## 🎉 Selamat!

BukuHutang Anda sudah siap digunakan!

**Langkah selanjutnya:**
1. Cobalah membuat perjanjian pinjaman dengan cicilan
2. Ajak teman/karyawan untuk test sebagai peminjam
3. Eksplor fitur export laporan bulanan

**Butuh bantuan?**
- Ketik `HELP` ke bot
- Baca [User Manual lengkap](./USER_MANUAL.md)
- Cek log: `pm2 logs bukuhutang`

---

*Selamat mengelola hutang/piutang dengan lebih mudah!* 💰
