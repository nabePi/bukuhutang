# 📘 BukuHutang - Panduan Pengguna Lengkap

## Daftar Isi
1. [Pendahuluan](#pendahuluan)
2. [Persiapan](#persiapan)
3. [Perintah Dasar](#perintah-dasar)
4. [Cicilan & Perjanjian](#cicilan--perjanjian)
5. [Laporan & Export](#laporan--export)
6. [FAQ](#faq)
7. [Troubleshooting](#troubleshooting)

---

## Pendahuluan

**BukuHutang** adalah aplikasi WhatsApp-based untuk mencatat dan mengelola hutang/piutang dengan fitur:
- ✅ Pencatatan hutang/piutang otomatis
- ✅ Perjanjian cicilan dengan perhitungan AI
- ✅ Reminder otomatis via WhatsApp
- ✅ Laporan dan export Excel
- ✅ AI Conversational (chat natural)

### Siapa yang Butuh?
- 💼 Pemilik usaha yang sering pinjam-meminjam
- 👥 Teman/keluarga yang sering berhutang
- 🏦 Lender pribadi dengan banyak borrower

---

## Persiapan

### Untuk Pemilik Bot (Lender)

**1. Install BukuHutang**
```bash
cd /opt/bukuhutang
npm install
npm start
```

**2. Scan QR Code**
- Buka terminal
- Scan QR dengan WhatsApp → Menu → Perangkat Tertaut

**3. Siap!**

### Untuk Peminjam (Borrower)

**Tidak perlu install apapun!** 📱
- Cukup punya WhatsApp
- Terima PDF perjanjian
- Balas SETUJU/TOLAK
- Transfer sesuai jadwal

---

## Perintah Dasar

### 💬 Chat Natural dengan AI

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

**Variasi yang Bisa Dipahami AI:**
- ✅ "Pinjemin Budi 500k 14 hari"
- ✅ "Ahmad minjem 2jt sebulan"
- ✅ "Saya punya utang 1 juta ke Bank"
- ✅ "Cek hutang saya dong"

### 📝 Perintah Manual (Command)

| Perintah | Fungsi | Contoh |
|----------|--------|--------|
| `PINJAM [nama] [jumlah] [hari]hari "[catatan]"` | Catat piutang | `PINJAM Budi 500000 14hari "Beli semen"` |
| `HUTANG [nama] [jumlah] [hari]hari` | Catat hutang | `HUTANG TokoA 2000000 30hari` |
| `STATUS` | Lihat ringkasan | `STATUS` |
| `INGATKAN [nama]` | Kirim reminder | `INGATKAN Budi` |
| `HELP` | Bantuan | `HELP` |

---

## Cicilan & Perjanjian

### 🔄 Alur Perjanjian Hutang

```
[Dani - Pemberi Pinjaman]          [Ahmad - Peminjam]
         │                                  │
         ├─ BUAT PERJANJIAN Ahmad 5000000 ─┤
         ├─ Jawab pertanyaan bot           │
         │   (WA, gaji, tanggal gajian)    │
         ├─ SETUJU ────────────────────────┼─► Terima PDF
         │                                  ├─ Baca & SETUJU
         ├─ Terima notifikasi ◄────────────┤
         │                                  │
         │◄──── Otomatis reminder ─────────┤ (Tiap tanggal 25)
         │                                  ├─ Transfer cicilan
         ├─ BAYAR 1 ◄──────────────────────┤
         ├─ Status: LUNAS ─────────────────┼─► Notifikasi lunas
```

### 📋 Detail Perintahan Perjanjian

**1. Membuat Perjanjian**

Ketik: `BUAT PERJANJIAN [nama] [jumlah]`

Contoh:
```
BUAT PERJANJIAN Ahmad 5000000
```

**2. Jawab Pertanyaan Bot:**

| Pertanyaan | Contoh Jawaban |
|------------|----------------|
| Nomor WA peminjam? | `08123456789` |
| Sumber pendapatan? | `GAJI` / `BISNIS` / `LAINNYA` |
| Tanggal gajian? | `25` |
| Gaji per bulan? | `8000000` |
| Hutang lain? | `0` atau `1500000` |

**3. Konfirmasi Rekomendasi**

Bot akan menampilkan:
```
💰 REKOMENDASI CICILAN:
• Nominal: Rp 1.000.000/bulan
• Jumlah: 5 bulan
• Total: Rp 5.000.000
• Tanggal: Setiap tanggal 25
• Tingkat beban: NYAMAN ✅

Ketik: SETUJU atau UBAH [nominal]
```

**4. Setujui dan Kirim PDF**

Ketik: `SETUJU`

Bot akan:
- ✅ Buat PDF perjanjian
- ✅ Kirim langsung ke peminjam
- ✅ Tunggu persetujuan peminjam

**5. Peminjam Setujui**

Dari HP peminjam (Ahmad), balas:
- `SETUJU` → Perjanjian aktif! 🎉
- `TOLAK` → Perjanjian batal ❌

### 💳 Kelola Cicilan

| Perintah | Fungsi |
|----------|--------|
| `CICILAN` | Lihat semua cicilan aktif |
| `BAYAR [nomor]` | Catat pembayaran cicilan ke-X |
| `STATUS CICILAN [nama]` | Cek status pembayaran seseorang |
| `RIWAYAT [nama]` | Lihat history pembayaran |

**Contoh:**
```
Kamu: STATUS CICILAN Ahmad

Bot: 📊 STATUS CICILAN: Ahmad
Total: Rp 5.000.000
Cicilan: Rp 1.000.000/bulan

✅ #1: Rp 1.000.000 (terbayar: Rp 1.000.000)
⏸️ #2: Rp 1.000.000
⏸️ #3: Rp 1.000.000
⏸️ #4: Rp 1.000.000
⏸️ #5: Rp 1.000.000

Progress: 1/5 cicilan lunas
```

---

## Laporan & Export

### 📊 Lihat Laporan

**Laporan Bulanan:**
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
```

**Statistik Dashboard:**
```
STATISTIK
```

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

**Export ke Excel:**
```
EXPORT excel
```

File akan tersimpan dan bisa di-download.

---

## FAQ

### Q: Apakah peminjam perlu install aplikasi?
**A:** Tidak! Peminjam cukup punya WhatsApp biasa. Semua proses dilakukan via chat.

### Q: Bagaimana cara mengubah template reminder?
**A:** Ketik `SETTING template [style]`
- `default` - Standar
- `friendly` - Santai dengan emoji
- `formal` - Resmi

### Q: Apakah data saya aman?
**A:** Ya! Data tersimpan di SQLite lokal (bukan cloud). Backup otomatis berjalan setiap hari.

### Q: Bisakah saya menggunakan domain sendiri?
**A:** Ya! Edit konfigurasi di `.env` dan setup SSL dengan Certbot (gratis).

### Q: Apa yang terjadi jika peminjam tidak bayar?
**A:** Sistem akan terus mengirim reminder otomatis. Status akan tetap "pending" sampai Anda mencatat pembayaran.

### Q: Bisakah saya edit atau hapus data?
**A:** Saat ini tidak ada fitur edit/hapus via WhatsApp. Anda bisa edit langsung di database SQLite jika diperlukan.

### Q: Berapa biaya AI-nya?
**A:** Menggunakan Gemini API yang punya tier gratis (1M tokens/bulan). Untuk penggunaan normal, cukup pakai tier gratis.

---

## Troubleshooting

### Bot tidak merespon
1. Cek apakah server running: `pm2 status`
2. Cek log: `pm2 logs bukuhutang`
3. Restart: `pm2 restart bukuhutang`

### WhatsApp terputus
1. Cek log untuk QR code baru
2. Scan ulang QR code
3. Jika masih bermasalah, hapus folder `auth_info_baileys` dan scan lagi

### Database error
1. Stop aplikasi: `pm2 stop bukuhutang`
2. Hapus file lock: `rm data/*.db-journal data/*.db-wal data/*.db-shm`
3. Start ulang: `pm2 start bukuhutang`

### AI tidak mengerti pesan saya
1. Coba gunakan perintah manual (command-based)
2. Pastikan `GEMINI_API_KEY` valid di `.env`
3. Cek koneksi internet

---

## Tips & Tricks

### 🎯 Tips Efektif
1. **Gunakan chat natural** - AI akan memahami variasi bahasa
2. **Selalu konfirmasi** - Periksa detail sebelum SETUJU
3. **Catat segera** - Jangan tunggu lama untuk mencatat transaksi
4. **Backup rutin** - Download backup mingguan untuk keamanan

### 💡 Shortcut
- Ketik `STATUS` setiap pagi untuk cek overview
- Gunakan `RIWAYAT` untuk melihat siapa yang sering telat bayar
- Export data bulanan untuk keperluan pajak

---

## Kontak & Support

Jika ada masalah:
1. Cek log: `pm2 logs`
2. Baca dokumentasi lengkap di `/docs`
3. Hubungi admin

---

**Selamat menggunakan BukuHutang!** 🎉
