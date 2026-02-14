// Using Gemini API (free tier available)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

class AIService {
  constructor() {
    this.conversationContext = new Map(); // phoneNumber -> context
  }

  // Parse user intent using AI
  async parseIntent(message, phoneNumber) {
    const context = this.getContext(phoneNumber);
    
    const prompt = `
Kamu adalah AI assistant KHUSUS untuk aplikasi BukuHutang (debt tracking/pencatatan hutang piutang).

**PERINGATAN PENTING:**
- Kamu HANYA boleh membantu tentang hutang, piutang, dan fitur BukuHutang
- Jika user bertanya di luar topik (cuaca, berita, umum), tolak dengan sopan dan arahkan kembali ke fitur BukuHutang
- Jangan berbasa-basi atau chat umum

**Fokus Utama:**
1. Mencatat hutang/piutang
2. Membuat perjanjian cicilan
3. Mengecek status pembayaran
4. Konfirmasi pembayaran
5. Memberikan informasi fitur BukuHutang

**Contoh penolakan sopan:**
- User: "Halo, apa kabar?"
- Kamu: "Halo! Saya siap membantu Anda mencatat hutang/piutang. Mau catat transaksi apa hari ini?"

- User: "Cuaca hari ini gimana?"
- Kamu: "Maaf, saya hanya bisa membantu tentang pencatatan hutang dan piutang. Ada yang bisa saya bantu terkait BukuHutang?"

- User: "Cerita lucu dong"
- Kamu: "Maaf, saya fokus membantu pencatatan hutang/piutang saja. Mau buat perjanjian pinjaman atau cek status cicilan?"

Pesan user: "${message}"

Konteks percakapan sebelumnya:
${context ? JSON.stringify(context, null, 2) : 'Tidak ada konteks'}

Jenis intent yang mungkin:
1. PINJAM - User meminjamkan uang ke orang lain (piutang)
2. HUTANG - User berhutang ke orang lain
3. STATUS - User ingin lihat ringkasan hutang/piutang
4. BUAT_PERJANJIAN - User mau buat perjanjian cicilan
5. BAYAR - User mau bayar cicilan
6. CICILAN - User ingin lihat status cicilan
7. GENERAL_CHAT - Chat umum/sapaan

Analisis pesan dan kembalikan JSON dengan format:
{
  "intent": "PINJAM|HUTANG|STATUS|BUAT_PERJANJIAN|BAYAR|CICILAN|GENERAL_CHAT",
  "entities": {
    "nama": "nama orang",
    "jumlah": 500000,
    "satuan": "ribu|ratus_ribu|juta",
    "durasi_hari": 14,
    "durasi_bulan": 0,
    "catatan": "keterangan"
  },
  "confidence": 0.95,
  "needs_confirmation": true|false,
  "response": "respon natural untuk user",
  "missing_fields": ["field1", "field2"] // jika ada yang kurang
}

Contoh:
User: "Saya mau pinjamin uang ke Budi 500 ribu selama 2 minggu untuk beli semen"
Response: {
  "intent": "PINJAM",
  "entities": {
    "nama": "Budi",
    "jumlah": 500000,
    "satuan": "ribu",
    "durasi_hari": 14,
    "durasi_bulan": 0,
    "catatan": "beli semen"
  },
  "confidence": 0.95,
  "needs_confirmation": true,
  "response": "Saya catat ya! Anda mau meminjamkan uang ke Budi sebesar Rp 500.000 selama 14 hari untuk beli semen. Benar kan?",
  "missing_fields": []
}

User: "Ahmad utang sama saya 2 juta 1 bulan"
Response: {
  "intent": "HUTANG",
  "entities": {
    "nama": "Ahmad",
    "jumlah": 2000000,
    "satuan": "juta",
    "durasi_hari": 30,
    "durasi_bulan": 1,
    "catatan": ""
  },
  "confidence": 0.92,
  "needs_confirmation": true,
  "response": "Oke, Ahmad berhutang Rp 2.000.000 ke Anda selama 1 bulan (30 hari). Sudah benar?",
  "missing_fields": []
}

User: "Halo, apa kabar?"
Response: {
  "intent": "GENERAL_CHAT",
  "entities": {},
  "confidence": 0.98,
  "needs_confirmation": false,
  "response": "Halo! Saya siap membantu pencatatan hutang/piutang. Silakan ketik PINJAM, HUTANG, STATUS, atau BUAT PERJANJIAN.",
  "missing_fields": []
}

User: "Bisa bantu apa?"
Response: {
  "intent": "GENERAL_CHAT",
  "entities": {},
  "confidence": 0.95,
  "needs_confirmation": false,
  "response": "Saya bisa membantu:\n• Mencatat piutang (PINJAM)\n• Mencatat hutang (HUTANG)\n• Cek status (STATUS)\n• Buat perjanjian cicilan (BUAT PERJANJIAN)\n• Konfirmasi pembayaran (BAYAR)\n\nMau yang mana?",
  "missing_fields": []
}

User: "Saya mau pinjam uang"
Response: {
  "intent": "PINJAM",
  "entities": {},
  "confidence": 0.80,
  "needs_confirmation": false,
  "response": "Baik, saya bantu catat. Mau pinjamkan ke siapa dan berapa nominalnya?",
  "missing_fields": ["nama", "jumlah"]
}

Jawaban dalam format JSON saja, tanpa markdown atau penjelasan lain.`;

    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates[0].content.parts[0].text;
      
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const result = JSON.parse(jsonMatch[0]);
      
      // Update context
      this.updateContext(phoneNumber, {
        lastIntent: result.intent,
        lastEntities: result.entities,
        awaitingConfirmation: result.needs_confirmation,
        lastMessage: message
      });
      
      return result;
      
    } catch (error) {
      console.error('AI parsing error:', error);
      // Fallback to regex parser
      return this.fallbackParse(message);
    }
  }

  // Fallback to simple regex if AI fails
  fallbackParse(message) {
    const text = message.toLowerCase();
    
    // Check for PINJAM intent
    if (text.includes('pinjam') || text.includes('pinjemin')) {
      const nameMatch = message.match(/(?:ke|sama)\s+(\w+)/i);
      const amountMatch = message.match(/(\d+)\s*(ribu|juta|ratus)?/i);
      const dayMatch = message.match(/(\d+)\s*hari/i);
      
      return {
        intent: 'PINJAM',
        entities: {
          nama: nameMatch ? nameMatch[1] : null,
          jumlah: amountMatch ? this.parseAmount(amountMatch[1], amountMatch[2]) : null,
          durasi_hari: dayMatch ? parseInt(dayMatch[1]) : 14,
          catatan: ''
        },
        confidence: 0.6,
        needs_confirmation: true,
        response: 'Saya catat ya! Mohon konfirmasi detailnya.',
        missing_fields: []
      };
    }
    
    // Default to GENERAL_CHAT with focused response
    return {
      intent: 'GENERAL_CHAT',
      entities: {},
      confidence: 0.5,
      needs_confirmation: false,
      response: 'Saya hanya bisa membantu pencatatan hutang/piutang. Silakan ketik:\n• PINJAM - catat piutang\n• HUTANG - catat hutang\n• STATUS - cek status\n• BUAT PERJANJIAN - buat cicilan\n• HELP - panduan lengkap',
      missing_fields: []
    };
  }

  parseAmount(number, unit) {
    const num = parseInt(number);
    if (!unit) return num;
    if (unit.includes('ribu')) return num * 1000;
    if (unit.includes('juta')) return num * 1000000;
    if (unit.includes('ratus')) return num * 100;
    return num;
  }

  getContext(phoneNumber) {
    return this.conversationContext.get(phoneNumber);
  }

  updateContext(phoneNumber, context) {
    this.conversationContext.set(phoneNumber, {
      ...this.getContext(phoneNumber),
      ...context,
      timestamp: Date.now()
    });
  }

  clearContext(phoneNumber) {
    this.conversationContext.delete(phoneNumber);
  }
}

module.exports = new AIService();
