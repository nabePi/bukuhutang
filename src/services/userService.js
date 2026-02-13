const { getConnection } = require('../db/connection');

class UserService {
  constructor() {
    this.db = getConnection();
  }

  createUser(phoneNumber, businessName = null) {
    const stmt = this.db.prepare(`
      INSERT INTO users (phone_number, business_name)
      VALUES (?, ?)
    `);
    
    try {
      const result = stmt.run(phoneNumber, businessName);
      return this.getUserById(result.lastInsertRowid);
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return this.getUserByPhone(phoneNumber);
      }
      throw error;
    }
  }

  getUserById(id) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  getUserByPhone(phoneNumber) {
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
    // For now, we'll store settings in a simple key-value format
    // If the users table has a settings column, update it
    // Otherwise, we might need to create a settings table
    const stmt = this.db.prepare(`
      UPDATE users SET ${key} = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(value, userId);
    return this.getUserById(userId);
  }
}

module.exports = new UserService();
