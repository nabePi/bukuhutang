require('dotenv').config();
const path = require('path');
const app = require(path.join(__dirname, '..', 'src', 'api', 'server'));

const server = app.listen(3992, () => console.log('Test server on 3992'));

setTimeout(async () => {
  const superAdminKey = '1cb534b5b6ed051d44179293da275eb5';
  
  try {
    console.log('\n🧪 Testing WhatsApp Status API...\n');
    
    // Test 1: WhatsApp status endpoint
    console.log('1️⃣ GET /api/admin/whatsapp/status');
    const response = await fetch('http://localhost:3992/api/admin/whatsapp/status', {
      headers: { 'X-API-Key': superAdminKey }
    });
    
    if (response.status === 200) {
      const data = await response.json();
      console.log('   Status:', data.connected ? '🟢 Connected' : '🟡 Not Connected');
      console.log('   Phone:', data.phoneNumber || '-');
      console.log('   Has QR:', data.qrCode ? '✅ Yes' : '❌ No');
      
      if (data.qrCode) {
        console.log('   📱 QR Code length:', data.qrCode.length, 'chars');
        console.log('   💡 QR Code ready to scan!');
      }
    } else if (response.status === 403) {
      console.log('   ❌ 403 Forbidden - Check API key');
    } else {
      console.log('   ❌ Error:', response.status);
      const text = await response.text();
      console.log('   Response:', text);
    }
    
    // Test 2: Check if QR code is properly formatted
    if (response.status === 200) {
      const data = await response.json();
      if (data.qrCode && data.qrCode.startsWith('data:image/png;base64,')) {
        console.log('\n   ✅ QR Code format valid (Base64 PNG)');
      } else if (data.qrCode) {
        console.log('\n   ⚠️ QR Code format:', data.qrCode.substring(0, 50) + '...');
      }
    }
    
    console.log('\n✅ API Test complete!');
    
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
  server.close();
  process.exit(0);
}, 1000);
