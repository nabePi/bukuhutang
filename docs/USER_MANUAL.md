# 📘 BukuHutang - Panduan Pengguna Lengkap

## Daftar Isi
1. [Pendahuluan](#pendahuluan)
2. [Persiapan](#persiapan)
3. [Perintah Dasar](#perintah-dasar)
4. [Cicilan & Perjanjian](#cicilan--perjanjian)
5. [Pelacakan Pembayaran](#pelacakan-pembayaran)
6. [Laporan & Export](#laporan--export)
7. [FAQ](#faq)
8. [Troubleshooting](#troubleshooting)
9. [Tips & Trik](#tips--trik)

---

## Pendahuluan

**BukuHutang** adalah aplikasi pencatat hutang/piutang berbasis WhatsApp yang dirancang untuk UMKM dan penggunaan pribadi di Indonesia. Dengan BukuHutang, Anda dapat mengelola peminjaman uang tanpa perlu aplikasi tambahan - cukup melalui chat WhatsApp!

### Fitur Utama
- ✅ Pencatatan hutang/piutang otomatis dengan AI
- ✅ Perjanjian pinjaman formal dengan sistem cicilan
- ✅ Analisis kemampuan bayar (affordability analysis max 30% pendapatan)
- ✅ Reminder otomatis via WhatsApp
- ✅ PDF perjanjian resmi
- ✅ Laporan bulanan dan export Excel
- ✅ Chat natural dengan AI
- ✅ Multi-tenant (untuk bisnis dengan cabang)

### Siapa yang Butuh BukuHutang?
- 💼 Pemilik UMKM yang sering memberi pinjaman ke pelanggan/karyawan
- 👥 Individu yang sering berhutang dengan teman/keluarga
- 🏦 Lender pribadi dengan banyak peminjam
- 🏪 Toko yang menyediakan sistem kredit

---

## Persiapan

### Untuk Pemilik Bot (Lender)

**1. Install BukuHutang**
```bash
cd /home/ubuntu/.openclaw/workspace/bukuhutang
npm install
```

**2. Konfigurasi Environment**
```bash
cp .env.example .env
# Edit .env dan isi:
# - GEMINI_API_KEY (untuk fitur AI)
# - PORT (default: 3000)
```

**3. Jalankan Aplikasi**
```bash
npm start        # Production mode
# atau
npm run dev      # Development mode dengan auto-restart
```

**4. Scan QR Code**
- QR code akan muncul di terminal
- Buka WhatsApp di HP → Menu → Perangkat Tertaut → Tautkan Perangkat
- Scan QR code yang muncul
- Tunggu sampai status "Connected"

**5. Verifikasi Database**
```bash
npm run db:migrate
```

### Untuk Peminjam (Borrower)

**Tidak perlu install apapun!** 📱
- Cukup punya WhatsApp aktif
- Terima pesan PDF perjanjian dari lender
- Balas `SETUJU` atau `TOLAK`
- Transfer sesuai jadwal yang disepakati

---

## Perintah Dasar

### 💬 Chat Natural dengan AI

BukuHutang dilengkapi AI yang memahami bahasa natural. Tidak perlu menghafal perintah khusus!

**Contoh Percakapan:**

```
Kamu: Saya mau pinjamin uang ke Budi 500 ribu selama 2 minggu untuk beli semen

Bot: Saya catat ya! Anda mau meminjamkan uang ke Budi sebesar Rp 500.000 selama 14 hari untuk beli semen. Benar kan?

Kamu: Iya betul

Bot: ✅ Piutang tercatat!
   Nama: Budi
   Jumlah: Rp 500.000
   Jatuh tempo: 27 Feb 2025
   Catatan: beli semen
   
   Saya akan ingatkan 1 hari sebelum jatuh tempo.
```

**Variasi Bahasa yang Dipahami AI:**
- ✅ "Pinjemin Budi 500k 14 hari"
- ✅ "Ahmad minjem 2jt sebulan"
- ✅ "Saya punya utang 1 juta ke Toko Maju"
- ✅ "Cek hutang saya dong"
- ✅ "Hutang Budi yang mana aja?"
- ✅ "Budi bayar 500 ribu"

### 📝 Perintah Manual (Command)

| Perintah | Fungsi | Contoh |
|----------|--------|--------|
| `PINJAM [nama] [jumlah] [hari]hari "[catatan]"` | Catat piutang (Anda meminjamkan) | `PINJAM Budi 500000 14hari "Beli semen"` |
| `HUTANG [nama] [jumlah] [hari]hari` | Catat hutang (Anda meminjam) | `HUTANG TokoA 2000000 30hari` |
| `STATUS` | Lihat ringkasan semua hutang/piutang | `STATUS` |
| `INGATKAN [nama]` | Kirim reminder ke peminjam | `INGATKAN Budi` |
| `HELP` | Tampilkan bantuan | `HELP` |

**Format Jumlah:**
- Bisa pakai angka murni: `500000`
- Tidak perlu tanda titik atau koma
- Maksimal: Rp 999.999.999

**Format Hari:**
- Minimal: 1 hari
- Maksimal: 365 hari
- Format: `[angka]hari` (tanpa spasi)

---

## Cicilan & Perjanjian

### 🔄 Alur Perjanjian Hutang Ber-cicil

```
[Lender/Pemberi Pinjaman]          [Borrower/Peminjam]
         │                                  │
         ├─ BUAT PERJANJIAN Ahmad 5000000 ─┤
         │   Jawab pertanyaan interview    │
         │   • Nomor WA peminjam           │
         │   • Sumber pendapatan           │
         │   • Tanggal gajian              │
         │   • Besaran pendapatan          │
         │   • Hutang lain                 │
         │                                  │
         ├─ SETUJU ────────────────────────┼─► Terima PDF perjanjian
         │                                  │   via WhatsApp
         │                                  ├─ Baca perjanjian
         │                                  ├─ Balas SETUJU
         │                                  │   (atau TOLAK)
         │                                  │
         ├─ Terima notifikasi ◄────────────┤ Perjanjian aktif!
         │   "Ahmad telah MENYETUJUI"      │
         │                                  │
         │◄──── Otomatis reminder ─────────┤ Setiap tanggal gajian
         │                                  ├─ Transfer cicilan
         ├─ Catat pembayaran ◄─────────────┤
         │   (BAYAR 1)                      │
         │                                  │
         ├─ Status: LUNAS ─────────────────┼─► Notifikasi lunas
         │                                  │
```

### 📋 Detail Perintah Perjanjian

**1. Membuat Perjanjian Baru**

Ketik: `BUAT PERJANJIAN [nama] [jumlah]`

Contoh:
```
BUAT PERJANJIAN Ahmad 5000000
```

Output:
```
📋 MEMBUAT PERJANJIAN HUTANG

Peminjam: Ahmad
Jumlah: Rp 5.000.000

Silakan masukkan nomor WhatsApp Ahmad (contoh: 08123456789)
```

**2. Jawab Pertanyaan Interview**

| Langkah | Pertanyaan | Contoh Jawaban |
|---------|------------|----------------|
| 1 | Nomor WA peminjam? | `08123456789` |
| 2 | Sumber pendapatan? | `GAJI` / `BISNIS` / `LAINNYA` |
| 3 | Tanggal menerima pendapatan? | `25` (tanggal 1-31) |
| 4 | Pendapatan per bulan? | `8000000` atau `SKIP` |
| 5 | Hutang lain per bulan? | `0` atau `1500000` |

**3. Review Rekomendasi Cicilan**

Setelah interview selesai, bot akan menampilkan analisis:

```
✅ ANALISIS KEMAMPUAN BAYAR

Berdasarkan data:
• Gaji: Rp 8.000.000/bulan
• Cicilan lain: Rp 1.500.000/bulan  
• Hutang baru: Rp 5.000.000

💰 REKOMENDASI CICILAN:
• Nominal cicilan: Rp 1.000.000/bulan
• Jumlah bulan: 5 kali
• Total bayar: Rp 5.000.000
• Tanggal bayar: Setiap tanggal 25
• Tingkat beban: NYAMAN ✅

Apakah setuju dengan cicilan di atas?
Ketik: SETUJU atau UBAH [nominal]
```

**Keterangan Tingkat Beban:**
- ✅ **NYAMAN** - Cicilan < 30% pendapatan bersih
- ⚠️ **CUKUP** - Cicilan 30-40% pendapatan bersih
- 🔴 **BERAT** - Cicilan > 40% pendapatan bersih

**4. Menyetujui atau Mengubah**

- Ketik `SETUJU` → Lanjut ke pembuatan PDF
- Ketik `UBAH [nominal]` → Ubah nominal cicilan
  - Contoh: `UBAH 500000` → Cicilan jadi Rp 500.000/bulan

**5. Peminjam Menerima dan Menyetujui**

PDF perjanjian akan dikirim langsung ke WhatsApp peminjam.

Peminjam membalas:
- `SETUJU` → Perjanjian aktif, cicilan dimulai
- `TOLAK` → Perjanjian dibatalkan

### 📋 Perintah Lain untuk Perjanjian

| Perintah | Fungsi |
|----------|--------|
| `PERJANJIAN` | Lihat semua perjanjian (aktif & selesai) |
| `CICILAN` | Lihat daftar cicilan yang aktif |
| `KIRIM [id]` | Kirim ulang PDF perjanjian |

---

## Pelacakan Pembayaran

### 💳 Mencatat Pembayaran Cicilan

**Format:** `BAYAR [nomor_cicilan]`

Contoh:
```
BAYAR 1
```

Output:
```
✅ PEMBAYARAN TERCATAT

Cicilan #1
Jumlah: Rp 1.000.000
Status: LUNAS ✅
Tanggal: 25/02/2025

Sisa cicilan: 4 lagi
```

**Catatan:**
- Pembayaran tercatat lunas untuk cicilan tersebut
- Peminjam otomatis menerima notifikasi konfirmasi
- Sisa cicilan akan otomatis dihitung ulang

### 📊 Mengecek Status Cicilan

**1. Status Cicilan per Orang**

Format: `STATUS CICILAN [nama]`

Contoh:
```
STATUS CICILAN Ahmad
```

Output:
```
📊 STATUS CICILAN: Ahmad

Total: Rp 5.000.000
Cicilan: Rp 1.000.000/bulan

✅ #1: Rp 1.000.000 (terbayar: Rp 1.000.000)
✅ #2: Rp 1.000.000 (terbayar: Rp 1.000.000)
⏳ #3: Rp 1.000.000 (terbayar: Rp 500.000)
⏸️ #4: Rp 1.000.000
⏸️ #5: Rp 1.000.000

Progress: 2.5/5 cicilan
```

**Keterangan Simbol:**
- ✅ Lunas
- ⏳ Sebagian (partial payment)
- ⏸️ Belum dibayar

**2. Riwayat Pembayaran**

Format: `RIWAYAT [nama]`

Contoh:
```
RIWAYAT Ahmad
```

Output:
```
📜 RIWAYAT PEMBAYARAN: Ahmad

✅ Cicilan #1
   Jumlah: Rp 1.000.000
   Tanggal: 25/01/2025

✅ Cicilan #2
   Jumlah: Rp 1.000.000
   Tanggal: 25/02/2025

✅ Cicilan #3
   Jumlah: Rp 500.000
   Tanggal: 20/03/2025

TOTAL TERBAYAR: Rp 2.500.000
```

---

## Laporan & Export

### 📈 Laporan Bulanan

**Format:** `LAPORAN [tahun] [bulan]`

Contoh:
```
LAPORAN 2025 2
```

Output:
```
📈 LAPORAN: 2/2025

💰 Total Terkumpul: Rp 3.000.000
💸 Total Dipinjam: Rp 5.000.000
📋 Piutang Aktif: 3
✅ Piutang Lunas: 2
📅 Cicilan Diterima: 3

Detail:
• 25/02 - Budi: Rp 500.000 (hutang)
• 20/02 - Ahmad: Rp 1.000.000 (cicilan #1)
• 15/02 - Sari: Rp 1.500.000 (hutang)
```

### 📊 Statistik Dashboard

**Perintah:** `STATISTIK`

Output:
```
📊 STATISTIK BUKUHUTANG

Total Dipinjam: Rp 15.000.000
Total Terkumpul: Rp 8.000.000
Perjanjian Aktif: 2
Jatuh Tempo: 1

💹 Posisi Bersih: -Rp 7.000.000
```

### 📤 Export Data

**Format:** `EXPORT [format]`

| Perintah | Output |
|----------|--------|
| `EXPORT excel` | File Excel (.xlsx) dengan semua data hutang |
| `EXPORT pdf` | File PDF dengan laporan ringkasan |

File akan disimpan di folder `data/reports/` dan bisa diunduh.

**Struktur Export Excel:**
- Sheet "Debts" - Data hutang/piutang
- Sheet "Agreements" - Data perjanjian cicilan
- Sheet "Payments" - Riwayat pembayaran

---

## FAQ

### Q: Apakah peminjam perlu install aplikasi?
**A:** Tidak! Peminjam hanya perlu WhatsApp biasa. Semua proses dilakukan via chat.

### Q: Bagaimana cara mengubah template reminder?
**A:** Ketik: `SETTING template [style]`

Pilihan style:
- `default` - Standar profesional
- `friendly` - Santai dengan emoji
- `formal` - Bahasa resmi bisnis

Contoh:
```
SETTING template friendly
```

### Q: Apakah data saya aman?
**A:** Ya! Data tersimpan di database SQLite lokal di server Anda (bukan di cloud pihak ketiga). Backup dilakukan otomatis setiap hari ke folder `data/backups/`.

### Q: Bagaimana jika peminjam tidak punya WhatsApp?
**A:** BukuHutang terintegrasi dengan WhatsApp, jadi peminjam wajib punya WhatsApp untuk menerima PDF dan reminder.

### Q: Apa yang terjadi jika peminjam tidak bayar?
**A:** Sistem akan terus mengirim reminder otomatis sesuai jadwal. Status tetap "pending" sampai Anda mencatat pembayaran dengan `BAYAR [nomor]`.

### Q: Bisakah saya edit atau hapus data yang sudah tercatat?
**A:** Saat ini tidak ada fitur edit/hapus via WhatsApp untuk keamanan. Untuk edit/hapus, Anda bisa:
1. Akses database SQLite langsung di `data/bukuhutang.db`
2. Gunakan tool seperti DB Browser for SQLite
3. Atau hubungi admin sistem

### Q: Berapa biaya AI-nya?
**A:** BukuHutang menggunakan Google Gemini API yang memiliki tier gratis (1 juta tokens/bulan). Untuk penggunaan normal UMKM, tier gratis sudah cukup.

### Q: Apakah bisa multi-user (banyak lender)?
**A:** Ya! Dengan fitur multi-tenant, setiap nomor WhatsApp yang berbeda dianggap lender terpisah dengan data terisolasi.

### Q: Bagaimana cara backup data?
**A:** Backup otomatis tersimpan di `data/backups/`. Untuk backup manual, copy file `data/bukuhutang.db` ke tempat aman.

### Q: Apakah bisa digunakan untuk pencatatan hutang yang saya pinjam (bukan meminjamkan)?
**A:** Ya! Gunakan perintah `HUTANG` untuk mencatat hutang Anda ke orang lain.

---

## Troubleshooting

### Bot tidak merespon sama sekali

**Solusi:**
1. Cek status server:
   ```bash
   pm2 status
   ```
2. Cek log error:
   ```bash
   pm2 logs bukuhutang
   ```
3. Restart aplikasi:
   ```bash
   pm2 restart bukuhutang
   ```

### WhatsApp terputus/QR muncul terus

**Solusi:**
1. Cek koneksi internet server
2. Jika QR muncul terus, hapus sesi lama:
   ```bash
   rm -rf auth_info_baileys/
   npm start
   ```
3. Scan QR baru dengan WhatsApp
4. Pastikan "Stay signed in" diaktifkan saat scan

### AI tidak mengerti pesan saya

**Solusi:**
1. Gunakan perintah manual (command-based) sebagai alternatif
2. Pastikan `GEMINI_API_KEY` di `.env` masih valid
3. Cek koneksi internet ke Google API
4. Coba restart aplikasi

### Database error / "database is locked"

**Solusi:**
1. Stop aplikasi:
   ```bash
   pm2 stop bukuhutang
   ```
2. Hapus file lock:
   ```bash
   rm data/*.db-journal data/*.db-wal data/*.db-shm 2>/dev/null
   ```
3. Start ulang:
   ```bash
   pm2 start bukuhutang
   ```

### PDF tidak terkirim ke peminjam

**Solusi:**
1. Pastikan nomor WA peminjam benar (10-13 digit)
2. Pastikan peminjam tidak memblokir nomor Anda
3. Cek folder `data/` memiliki izin tulis
4. Cek log dengan `pm2 logs`

### Reminder tidak terkirim otomatis

**Solusi:**
1. Pastikan aplikasi berjalan 24/7 (gunakan PM2 atau systemd)
2. Cek bahwa cron/reminder service aktif
3. Verifikasi bahwa reminder_time sudah tercatat di database

### Error "Cannot find module"

**Solusi:**
```bash
npm install
# atau jika masih error:
rm -rf node_modules package-lock.json
npm install
```

---

## Tips & Trik

### 🎯 Tips Efektif

1. **Gunakan Chat Natural**
   - AI akan memahami variasi bahasa Indonesia
   - Tidak perlu khawatir dengan typo kecil

2. **Selalu Konfirmasi**
   - Periksa detail perjanjian sebelum ketik `SETUJU`
   - Pastikan nominal dan jumlah cicilan sesuai

3. **Catat Segera**
   - Jangan tunggu lama mencatat transaksi
   - Semakin cepat tercatat, semakin akurat reminder-nya

4. **Backup Rutin**
   - Download backup mingguan untuk keamanan
   - Simpan di cloud storage (Google Drive, Dropbox)

5. **Gunakan Template Reminder yang Tepat**
   - `default` - Untuk hubungan bisnis formal
   - `friendly` - Untuk teman/keluarga
   - `formal` - Untuk klien korporat

### 💡 Shortcut dan Trik

**Cek Overview Harian:**
```
STATUS
```
Ketik setiap pagi untuk melihat ringkasan hutang yang jatuh tempo.

**Cek Siapa yang Sering Telat:**
```
RIWAYAT [nama]
```
Gunakan untuk mengidentifikasi peminjam yang sering terlambat bayar.

**Export untuk Pajak:**
```
EXPORT excel
```
Lakukan setiap akhir bulan untuk keperluan laporan keuangan/pajak.

**Ubah Gaya Reminder:**
```
SETTING template friendly
```
Sesuaikan tone reminder dengan hubungan Anda dan peminjam.

### 📱 Tips untuk Peminjam

1. Simpan PDF perjanjian sebagai bukti
2. Set reminder di kalender HP untuk tanggal cicilan
3. Jika terlambat, komunikasikan segera ke lender
4. Bayar sebelum tanggal jatuh tempo untuk hubungan baik

---

## Daftar Perintah Lengkap

### Hutang/Piutang Dasar
| Perintah | Deskripsi |
|----------|-----------|
| `PINJAM [nama] [jumlah] [hari]hari "[catatan]"` | Catat piutang |
| `HUTANG [nama] [jumlah] [hari]hari` | Catat hutang |
| `STATUS` | Lihat ringkasan |
| `INGATKAN [nama]` | Kirim reminder |

### Perjanjian Cicilan
| Perintah | Deskripsi |
|----------|-----------|
| `BUAT PERJANJIAN [nama] [jumlah]` | Buat perjanjian baru |
| `PERJANJIAN` | Lihat daftar perjanjian |
| `CICILAN` | Lihat cicilan aktif |
| `BAYAR [nomor]` | Catat pembayaran cicilan |
| `STATUS CICILAN [nama]` | Cek status per orang |
| `RIWAYAT [nama]` | Lihat riwayat pembayaran |

### Laporan
| Perintah | Deskripsi |
|----------|-----------|
| `LAPORAN [tahun] [bulan]` | Laporan bulanan |
| `STATISTIK` | Statistik keseluruhan |
| `EXPORT excel` | Export ke Excel |
| `EXPORT pdf` | Export ke PDF |

### Pengaturan
| Perintah | Deskripsi |
|----------|-----------|
| `SETTING template [style]` | Ubah gaya reminder |
| `HELP` | Tampilkan bantuan |

---

**Selamat menggunakan BukuHutang!** 🎉

Jika ada pertanyaan atau masalah, silakan:
1. Cek log aplikasi: `pm2 logs`
2. Baca ulang panduan ini
3. Hubungi administrator sistem

*Versi Dokumen: 1.0 | Terakhir update: Februari 2025*
