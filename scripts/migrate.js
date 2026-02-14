const { getConnection } = require('../src/db/connection');

const db = getConnection();

// Check if tenants table already exists (multi-tenant already applied)
const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'").get();

if (tableExists) {
  console.log('Multi-tenant migration already applied!');
  process.exit(0);
}

console.log('Applying multi-tenant migration...');

// Add tenant_id to existing tables
try {
  db.exec(`
    ALTER TABLE users ADD COLUMN tenant_id INTEGER DEFAULT 1;
    ALTER TABLE debts ADD COLUMN tenant_id INTEGER DEFAULT 1;
    ALTER TABLE loan_agreements ADD COLUMN lender_id INTEGER DEFAULT 1;
    ALTER TABLE installment_payments ADD COLUMN tenant_id INTEGER DEFAULT 1;
    ALTER TABLE credits ADD COLUMN tenant_id INTEGER DEFAULT 1;
    ALTER TABLE reminders ADD COLUMN tenant_id INTEGER DEFAULT 1;
  `);
  console.log('✅ Added tenant_id columns to existing tables');
} catch (error) {
  console.log('Note: Some columns may already exist:', error.message);
}

// Create indexes for tenant filtering
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_debts_tenant ON debts(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_agreements_lender ON loan_agreements(lender_id);
  CREATE INDEX IF NOT EXISTS idx_installments_tenant ON installment_payments(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_credits_tenant ON credits(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON reminders(tenant_id);
`);
console.log('✅ Created tenant indexes');

// Create tenants table
db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    whatsapp_session TEXT,
    status TEXT DEFAULT 'active',
    plan TEXT DEFAULT 'free',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_active DATETIME,
    ai_credits INTEGER DEFAULT 1000,
    max_debts INTEGER DEFAULT 100,
    max_agreements INTEGER DEFAULT 10
  );
`);
console.log('✅ Created tenants table');

// Create tenant_settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id INTEGER PRIMARY KEY,
    reminder_template TEXT DEFAULT 'default',
    auto_reminder BOOLEAN DEFAULT 1,
    language TEXT DEFAULT 'id',
    timezone TEXT DEFAULT 'Asia/Jakarta',
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );
`);
console.log('✅ Created tenant_settings table');

// Insert default tenant for existing data (migration)
const existingUser = db.prepare('SELECT phone_number FROM users LIMIT 1').get();
if (existingUser) {
  const result = db.prepare(`
    INSERT INTO tenants (phone_number, name, status, plan)
    VALUES (?, 'Default Tenant', 'active', 'pro')
  `).run(existingUser.phone_number);
  
  // Create default settings for the tenant
  db.prepare('INSERT INTO tenant_settings (tenant_id) VALUES (?)').run(result.lastInsertRowid);
  
  console.log(`✅ Created default tenant with phone: ${existingUser.phone_number}`);
} else {
  // Create a placeholder default tenant
  const result = db.prepare(`
    INSERT INTO tenants (phone_number, name, status, plan)
    VALUES ('0000000000', 'Default Tenant', 'active', 'pro')
  `).run();
  
  db.prepare('INSERT INTO tenant_settings (tenant_id) VALUES (?)').run(result.lastInsertRowid);
  console.log('✅ Created placeholder default tenant');
}

console.log('✅ Multi-tenant migration completed!');
