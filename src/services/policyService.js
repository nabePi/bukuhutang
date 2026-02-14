const { getConnection } = require('../db/connection');

class PolicyService {
  constructor() {
    this.db = getConnection();
    this.cache = new Map();
    this.cacheTTL = 60000; // 1 minute cache
  }

  get(key, defaultValue = null) {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.value;
    }

    const stmt = this.db.prepare('SELECT value FROM ops_policy WHERE key = ?');
    const row = stmt.get(key);
    
    const value = row ? this.parseValue(row.value) : defaultValue;
    
    // Update cache
    this.cache.set(key, { value, timestamp: Date.now() });
    
    return value;
  }

  getAll() {
    const stmt = this.db.prepare('SELECT key, value FROM ops_policy');
    const rows = stmt.all();
    
    const policy = {};
    rows.forEach(row => {
      policy[row.key] = this.parseValue(row.value);
    });
    
    return policy;
  }

  set(key, value) {
    const stmt = this.db.prepare(`
      INSERT INTO ops_policy (key, value) 
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET 
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(key, String(value));
    
    // Update cache
    this.cache.set(key, { value, timestamp: Date.now() });
    
    return true;
  }

  parseValue(value) {
    // Try to parse as number
    if (!isNaN(value) && value.trim() !== '') {
      const num = Number(value);
      if (Number.isInteger(num)) return num;
      return num;
    }
    
    // Try to parse as boolean
    if (value === 'true') return true;
    if (value === 'false') return false;
    
    // Return as string
    return value;
  }

  clearCache() {
    this.cache.clear();
  }

  // Get reminder-specific config
  getReminderConfig() {
    return {
      checkIntervalHours: this.get('reminder.check_interval_hours', 6),
      daysBeforeDue: this.get('reminder.days_before_due', 3),
      daysAfterOverdue: this.get('reminder.days_after_overdue', 1)
    };
  }

  // Get installment-specific config
  getInstallmentConfig() {
    return {
      checkIntervalHours: this.get('installment.check_interval_hours', 6),
      daysBeforeDue: this.get('installment.days_before_due', 3)
    };
  }
}

module.exports = new PolicyService();
