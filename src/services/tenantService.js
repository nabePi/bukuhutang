const { getConnection } = require('../db/connection');

class TenantService {
  constructor() {
    this.adminDb = getConnection('admin');
    this.initAdminDb();
  }
  
  initAdminDb() {
    // Create tenants table
    this.adminDb.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone_number TEXT UNIQUE NOT NULL,
        plan TEXT DEFAULT 'free',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        active BOOLEAN DEFAULT 1
      );
    `);
  }
  
  createTenant(id, name, phoneNumber, plan = 'free') {
    const stmt = this.adminDb.prepare(`
      INSERT INTO tenants (id, name, phone_number, plan)
      VALUES (?, ?, ?, ?)
    `);
    
    try {
      stmt.run(id, name, phoneNumber, plan);
      
      // Initialize tenant database
      this.initTenantDb(id);
      
      return { id, name, phoneNumber, plan };
    } catch (error) {
      if (error.message.includes('UNIQUE')) {
        throw new Error('Tenant with this phone number already exists');
      }
      throw error;
    }
  }
  
  initTenantDb(tenantId) {
    // Run migrations for tenant
    const { runMigrations } = require('../db/migrations');
    runMigrations(tenantId);
  }
  
  getTenant(id) {
    const stmt = this.adminDb.prepare('SELECT * FROM tenants WHERE id = ?');
    return stmt.get(id);
  }
  
  getTenantByPhone(phoneNumber) {
    const stmt = this.adminDb.prepare('SELECT * FROM tenants WHERE phone_number = ?');
    return stmt.get(phoneNumber);
  }
  
  listTenants() {
    const stmt = this.adminDb.prepare('SELECT * FROM tenants ORDER BY created_at DESC');
    return stmt.all();
  }
  
  deactivateTenant(id) {
    const stmt = this.adminDb.prepare('UPDATE tenants SET active = 0 WHERE id = ?');
    stmt.run(id);
  }
}

module.exports = new TenantService();
