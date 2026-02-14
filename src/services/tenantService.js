const { getConnection } = require('../db/connection');

// Legacy TenantService - keeping for backward compatibility
// New multi-tenant logic is in tenantRegistrationService.js

class TenantService {
  constructor() {
    this.db = getConnection();
  }
  
  getTenant(id) {
    // Forward to the new tenants table in main database
    const stmt = this.db.prepare('SELECT * FROM tenants WHERE id = ?');
    const tenant = stmt.get(id);
    if (tenant) {
      return {
        ...tenant,
        active: tenant.status === 'active'
      };
    }
    return null;
  }
  
  getTenantByPhone(phoneNumber) {
    const stmt = this.db.prepare('SELECT * FROM tenants WHERE phone_number = ?');
    const tenant = stmt.get(phoneNumber);
    if (tenant) {
      return {
        ...tenant,
        active: tenant.status === 'active'
      };
    }
    return null;
  }
  
  listTenants() {
    const stmt = this.db.prepare('SELECT * FROM tenants ORDER BY created_at DESC');
    const tenants = stmt.all();
    return tenants.map(t => ({
      ...t,
      active: t.status === 'active'
    }));
  }
  
  // Legacy compatibility methods
  createTenant(id, name, phoneNumber, plan = 'free') {
    const stmt = this.db.prepare(`
      INSERT INTO tenants (id, name, phone_number, plan, status)
      VALUES (?, ?, ?, ?, 'active')
    `);
    
    try {
      stmt.run(id, name, phoneNumber, plan);
      return { id, name, phoneNumber, plan, status: 'active' };
    } catch (error) {
      if (error.message.includes('UNIQUE')) {
        throw new Error('Tenant with this phone number already exists');
      }
      throw error;
    }
  }
  
  deactivateTenant(id) {
    const stmt = this.db.prepare('UPDATE tenants SET status = ? WHERE id = ?');
    stmt.run('inactive', id);
  }
  
  activateTenant(id) {
    const stmt = this.db.prepare('UPDATE tenants SET status = ? WHERE id = ?');
    stmt.run('active', id);
  }
}

module.exports = new TenantService();
