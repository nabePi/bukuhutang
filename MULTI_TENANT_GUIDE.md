# BukuHutang Multi-Tenant SaaS Architecture

## Overview

BukuHutang has been refactored from a single-tenant application to a multi-tenant SaaS platform. Multiple lenders (tenants) can now use a single instance with isolated data and dedicated WhatsApp numbers.

## Architecture Changes

### Database Schema

All tables now include `tenant_id` for data isolation:
- `users.tenant_id` - Links users to their tenant
- `debts.tenant_id` - Isolates debt records per tenant
- `loan_agreements.lender_id` - References the tenant (renamed from lender_id for clarity)
- `installment_payments.tenant_id` - Isolates payment records
- `credits.tenant_id` - Isolates credit records
- `reminders.tenant_id` - Isolates reminder logs

### New Tables

- `tenants` - Stores tenant information
  - `id` - Auto-increment primary key
  - `phone_number` - WhatsApp number (unique)
  - `name` - Business/tenant name
  - `email` - Contact email
  - `status` - active, inactive, pending_qr
  - `plan` - free, basic, pro, enterprise
  - `ai_credits` - AI request quota
  - `max_debts` - Maximum debt records allowed
  - `max_agreements` - Maximum loan agreements allowed

- `tenant_settings` - Per-tenant configuration
  - `reminder_template` - Default reminder style
  - `auto_reminder` - Enable automatic reminders
  - `language` - Language preference
  - `timezone` - Timezone setting

### Key Components

#### 1. MultiSessionManager (`src/whatsapp/multiSessionManager.js`)

Manages multiple WhatsApp sessions simultaneously:
```javascript
// Each tenant gets their own WhatsApp session
await multiSessionManager.createSession(tenantId, phoneNumber);

// Send message as specific tenant
await multiSessionManager.sendMessage(tenantId, jid, text);

// Get all active sessions
const sessions = multiSessionManager.getAllSessions();
```

#### 2. TenantRegistrationService (`src/services/tenantRegistrationService.js`)

Handles tenant lifecycle:
```javascript
// Register new tenant
const result = await tenantRegistrationService.registerTenant({
  phoneNumber: '08123456789',
  name: 'Dani Lending',
  email: 'dani@example.com'
});

// Activate after QR scan
await tenantRegistrationService.activateTenant(tenantId);

// Get tenant stats
const stats = tenantRegistrationService.getTenantStats(tenantId);
```

#### 3. MultiTenantMessageHandler (`src/whatsapp/multiTenantHandler.js`)

Routes incoming messages to the correct tenant:
- Identifies tenant from the session
- Distinguishes between lender (tenant owner) and borrowers
- Applies tenant-specific limits and settings

### API Changes

#### Admin Routes (Super Admin Only)

```
GET  /admin/stats              - System-wide statistics
GET  /admin/tenants            - List all tenants with WhatsApp status
POST /admin/tenants/register   - Register new tenant
GET  /admin/tenant/:id/qr      - Get QR code for pending tenant
POST /admin/tenant/:id/activate - Activate tenant after QR scan
POST /admin/tenant/:id/toggle  - Enable/disable tenant
POST /admin/tenant/:id/plan    - Update tenant plan
GET  /admin/tenant/:id         - Get tenant details
POST /admin/tenant/:id/credits - Add AI credits
GET  /admin/sessions           - List all WhatsApp sessions
```

## Migration Guide

### For Existing Installations

1. **Run the migration:**
   ```bash
   node scripts/migrate.js
   ```

2. **Update environment variables:**
   ```bash
   # Add super admin API key
   SUPER_ADMIN_API_KEY=your-secure-key-here
   ```

3. **Restart the application:**
   ```bash
   npm start
   ```

### For New Tenants

1. **Register via API:**
   ```bash
   curl -X POST http://localhost:3000/admin/tenants/register \
     -H "X-API-Key: $SUPER_ADMIN_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "phoneNumber": "08123456789",
       "name": "Dani Lending",
       "email": "dani@example.com"
     }'
   ```

2. **Get QR Code:**
   ```bash
   curl http://localhost:3000/admin/tenant/1/qr \
     -H "X-API-Key: $SUPER_ADMIN_API_KEY"
   ```

3. **Activate after scan:**
   ```bash
   curl -X POST http://localhost:3000/admin/tenant/1/activate \
     -H "X-API-Key: $SUPER_ADMIN_API_KEY"
   ```

## Tenant Plans

| Feature | Free | Basic | Pro | Enterprise |
|---------|------|-------|-----|------------|
| Max Debts | 50 | 200 | 1000 | Unlimited |
| Max Agreements | 5 | 20 | 100 | Unlimited |
| AI Credits/mo | 100 | 500 | 2000 | Unlimited |
| Auto Reminders | ✓ | ✓ | ✓ | ✓ |
| PDF Generation | 5/mo | 20/mo | 100/mo | Unlimited |
| Support | Community | Email | Priority | Dedicated |

## Data Isolation

Each tenant's data is completely isolated:
- Database queries always filter by `tenant_id`
- WhatsApp sessions are separate per tenant
- AI credit usage is tracked per tenant
- File storage can be partitioned by tenant (future enhancement)

## Security Considerations

1. **API Key Security:** Keep `SUPER_ADMIN_API_KEY` secure and rotate regularly
2. **WhatsApp Session Storage:** Auth sessions stored in `auth_sessions/{tenantId}/`
3. **Rate Limiting:** Applied per tenant based on their plan
4. **Data Access:** All service methods require explicit `tenantId` parameter

## Future Enhancements

- [ ] Custom domain support per tenant
- [ ] White-label mobile app
- [ ] Tenant-specific webhook endpoints
- [ ] Custom payment gateway integration
- [ ] Multi-currency support
- [ ] Tenant analytics dashboard
