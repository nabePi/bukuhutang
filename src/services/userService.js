const { getConnection } = require('../db/connection');

class UserService {
  constructor() {
    this.db = getConnection();
  }

  createUser(phoneNumber, tenantId, businessName = null) {
    const stmt = this.db.prepare(`
      INSERT INTO users (phone_number, tenant_id, business_name)
      VALUES (?, ?, ?)
    `);
    
    try {
      const result = stmt.run(phoneNumber, tenantId, businessName);
      return this.getUserById(result.lastInsertRowid);
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return this.getUserByPhone(phoneNumber, tenantId);
      }
      throw error;
    }
  }

  getUserById(id) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  getUserByPhone(phoneNumber, tenantId) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE phone_number = ? AND tenant_id = ?');
    return stmt.get(phoneNumber, tenantId);
  }
  
  // Get user across all tenants (for admin purposes)
  getUserByPhoneGlobal(phoneNumber) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE phone_number = ?');
    return stmt.get(phoneNumber);
  }

  updateUserMode(userId, mode) {
    const stmt = this.db.prepare(`
      UPDATE users SET user_mode = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(mode, userId);
    return this.getUserById(userId);
  }

  updateUserSettings(userId, key, value) {
    const stmt = this.db.prepare(`
      UPDATE users SET ${key} = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(value, userId);
    return this.getUserById(userId);
  }
  
  // Get or create user for a tenant
  async getOrCreateUser(phoneNumber, tenantId, businessName = null) {
    let user = this.getUserByPhone(phoneNumber, tenantId);
    if (!user) {
      user = this.createUser(phoneNumber, tenantId, businessName);
    }
    return user;
  }
  
  // Get all users for a tenant
  getUsersByTenant(tenantId) {
    const stmt = this.db.prepare(`
      SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at DESC
    `);
    return stmt.all(tenantId);
  }
}

module.exports = new UserService();
