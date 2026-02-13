// Multi-tenant middleware
const { getConnection } = require('../db/connection');

class TenantManager {
  constructor() {
    this.tenants = new Map();
  }
  
  // Get or create tenant database
  getTenantDb(tenantId) {
    if (!this.tenants.has(tenantId)) {
      const db = getConnection(tenantId);
      this.tenants.set(tenantId, db);
    }
    return this.tenants.get(tenantId);
  }
  
  // Extract tenant from request
  extractTenant(req) {
    // Option 1: From subdomain (tenant1.bukuhutang.com)
    const host = req.headers.host;
    const subdomain = host?.split('.')[0];
    if (subdomain && subdomain !== 'www') {
      return subdomain;
    }
    
    // Option 2: From header
    const tenantHeader = req.headers['x-tenant-id'];
    if (tenantHeader) return tenantHeader;
    
    // Option 3: From query param
    const tenantQuery = req.query.tenant;
    if (tenantQuery) return tenantQuery;
    
    // Default: single tenant mode
    return 'default';
  }
}

const tenantManager = new TenantManager();

function tenantMiddleware(req, res, next) {
  const tenantId = tenantManager.extractTenant(req);
  req.tenantId = tenantId;
  req.db = tenantManager.getTenantDb(tenantId);
  next();
}

module.exports = { tenantMiddleware, tenantManager };
