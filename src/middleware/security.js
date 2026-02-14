const crypto = require('crypto');

// API Key authentication
const API_KEYS = new Set([
  process.env.OPENCLAW_API_KEY || 'default-dev-key',
  process.env.SUPER_ADMIN_API_KEY
].filter(Boolean));

function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  if (!API_KEYS.has(apiKey)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  
  next();
}

// Rate limiting (simple in-memory)
const requestCounts = new Map();
const RATE_LIMIT = 100; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

function rateLimit(req, res, next) {
  const clientId = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  
  if (!requestCounts.has(clientId)) {
    requestCounts.set(clientId, { count: 1, resetTime: now + RATE_WINDOW });
  } else {
    const client = requestCounts.get(clientId);
    
    if (now > client.resetTime) {
      client.count = 1;
      client.resetTime = now + RATE_WINDOW;
    } else {
      client.count++;
      if (client.count > RATE_LIMIT) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil((client.resetTime - now) / 1000)
        });
      }
    }
  }
  
  next();
}

// Input validation
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>]/g, '')
    .trim()
    .substring(0, 1000); // max 1000 chars
}

function validateRequest(req, res, next) {
  // Sanitize all body params
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeInput(req.body[key]);
      }
    }
  }
  
  next();
}

// Request logging
function requestLogger(req, res, next) {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip}`);
  next();
}

module.exports = {
  authenticateApiKey,
  rateLimit,
  validateRequest,
  requestLogger
};
