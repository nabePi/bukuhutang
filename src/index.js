require('dotenv').config();

const fs = require('fs');
const path = require('path');
const app = require('./api/server');
const multiSessionManager = require('./whatsapp/multiSessionManager');
const multiTenantHandler = require('./whatsapp/multiTenantHandler');
const tenantRegistrationService = require('./services/tenantRegistrationService');

const PORT = process.env.PORT || 3000;
const MOCK_MODE = process.env.MOCK_MODE === 'true';

async function main() {
  console.log('🚀 Starting BukuHutang Multi-Tenant SaaS...');
  
  // Ensure directories exist
  const dirs = ['data', 'data/agreements', 'auth_sessions'];
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });

  // Initialize multi-tenant WhatsApp sessions for active tenants
  const tenants = tenantRegistrationService.listAllTenants();
  console.log(`📋 Found ${tenants.length} tenants`);

  if (!MOCK_MODE) {
    // Set up message handler for all tenants
    multiSessionManager.setMessageHandler('global', (tenantId, msg) => {
      return multiTenantHandler.handle(tenantId, msg);
    });
    
    // Reconnect existing active tenants
    for (const tenant of tenants) {
      if (tenant.status === 'active') {
        try {
          console.log(`🔗 Connecting WhatsApp for tenant ${tenant.id} (${tenant.name})...`);
          await multiSessionManager.createSession(tenant.id, tenant.phone_number);
        } catch (error) {
          console.error(`Failed to connect tenant ${tenant.id}:`, error.message);
        }
      }
    }
    
    console.log('✅ Multi-tenant WhatsApp sessions initialized');
  } else {
    console.log('📍 MOCK MODE: WhatsApp connection skipped');
    // Create a mock WhatsApp client for API testing
    global.whatsappClient = {
      sendMessage: async (jid, text) => {
        console.log(`[MOCK WA] To: ${jid}, Message: ${text}`);
        return { key: { id: 'mock-msg-id' } };
      }
    };
  }

  // Start API server
  app.listen(PORT, () => {
    console.log(`📡 API Server running on port ${PORT}`);
    console.log(`🔗 Admin Dashboard: http://localhost:${PORT}/admin`);
    console.log(`🔗 OpenClaw webhook: http://localhost:${PORT}/api/openclaw/webhook`);
    console.log('✅ BukuHutang Multi-Tenant SaaS ready!');
  });
}

main().catch(console.error);
