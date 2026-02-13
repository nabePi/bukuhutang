#!/bin/bash
set -e

echo "🚀 BukuHutang Production Deployment"

# Configuration
APP_NAME="bukuhutang"
APP_DIR="/opt/bukuhutang"
DOMAIN="${DOMAIN:-bukuhutang.yourdomain.com}"
EMAIL="${EMAIL:-admin@yourdomain.com}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check root
if [ "$EUID" -ne 0 ]; then 
  log_error "Please run as root or with sudo"
  exit 1
fi

# Update system
log_info "Updating system packages..."
apt-get update && apt-get upgrade -y

# Install dependencies
log_info "Installing dependencies..."
apt-get install -y \
  curl \
  git \
  nginx \
  certbot \
  python3-certbot-nginx \
  sqlite3 \
  redis-server \
  pm2 \
  nodejs \
  npm

# Setup app directory
log_info "Setting up application directory..."
mkdir -p $APP_DIR
mkdir -p $APP_DIR/data
mkdir -p $APP_DIR/data/reports
mkdir -p $APP_DIR/data/agreements
mkdir -p $APP_DIR/logs

# Clone/pull latest code
if [ -d "$APP_DIR/.git" ]; then
  log_info "Pulling latest code..."
  cd $APP_DIR && git pull origin main
else
  log_info "Cloning repository..."
  git clone https://github.com/yourusername/bukuhutang.git $APP_DIR
fi

# Install dependencies
cd $APP_DIR
log_info "Installing Node.js dependencies..."
npm ci --production

# Setup environment
log_info "Setting up environment..."
if [ ! -f "$APP_DIR/.env" ]; then
  cat > $APP_DIR/.env << EOF
NODE_ENV=production
PORT=3005
DB_PATH=./data/bukuhutang.db
REDIS_HOST=localhost
REDIS_PORT=6379
OPENCLAW_API_KEY=$(openssl rand -hex 32)
GEMINI_API_KEY=your-gemini-api-key-here
RATE_LIMIT_ENABLED=true
EOF
  log_warn "Please edit $APP_DIR/.env and add your GEMINI_API_KEY"
fi

# Setup permissions
log_info "Setting up permissions..."
chown -R www-data:www-data $APP_DIR
chmod 755 $APP_DIR
chmod 644 $APP_DIR/.env

# Database migration
log_info "Running database migrations..."
cd $APP_DIR && npm run db:migrate

# Setup PM2
cd $APP_DIR
log_info "Setting up PM2 process manager..."
pm2 delete $APP_NAME 2>/dev/null || true
pm2 start src/index.js --name $APP_NAME \
  --log $APP_DIR/logs/app.log \
  --error $APP_DIR/logs/error.log \
  --max-memory-restart 512M \
  --restart-delay 3000 \
  --max-restarts 10

pm2 save
pm2 startup systemd -u www-data --hp /var/www

# Setup Nginx
log_info "Configuring Nginx..."
cat > /etc/nginx/sites-available/$APP_NAME << 'EOF'
upstream bukuhutang {
    server 127.0.0.1:3005;
    keepalive 32;
}

server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    access_log /var/log/nginx/bukuhutang-access.log;
    error_log /var/log/nginx/bukuhutang-error.log;

    location / {
        proxy_pass http://bukuhutang;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    location /health {
        proxy_pass http://bukuhutang/health;
        access_log off;
    }
}
EOF

# Replace domain placeholder
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" /etc/nginx/sites-available/$APP_NAME

# Enable site
ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
nginx -t

# Reload Nginx
systemctl reload nginx

# Setup SSL with Certbot
log_info "Setting up SSL certificate..."
if ! certbot certificates | grep -q "$DOMAIN"; then
  certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email $EMAIL
else
  log_info "SSL certificate already exists"
fi

# Auto-renewal cron
log_info "Setting up SSL auto-renewal..."
echo "0 3 * * * certbot renew --quiet" | crontab -

# Setup firewall
log_info "Configuring firewall..."
ufw allow 'Nginx Full'
ufw allow OpenSSH
ufw --force enable

# Create health check script
cat > $APP_DIR/scripts/health-check.sh << 'EOF'
#!/bin/bash
if ! curl -sf http://localhost:3005/health > /dev/null; then
  echo "$(date): Health check failed, restarting..." >> /opt/bukuhutang/logs/health-check.log
  pm2 restart bukuhutang
fi
EOF
chmod +x $APP_DIR/scripts/health-check.sh

# Health check cron
echo "*/5 * * * * /opt/bukuhutang/scripts/health-check.sh" | crontab -

# Create backup script
cat > $APP_DIR/scripts/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/bukuhutang/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
sqlite3 /opt/bukuhutang/data/bukuhutang.db ".backup '$BACKUP_DIR/bukuhutang_$DATE.db'"

# Backup agreements
tar -czf $BACKUP_DIR/agreements_$DATE.tar.gz -C /opt/bukuhutang/data agreements/

# Keep only last 7 days
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "$(date): Backup completed" >> /opt/bukuhutang/logs/backup.log
EOF
chmod +x $APP_DIR/scripts/backup.sh

# Backup cron (daily at 2 AM)
echo "0 2 * * * /opt/bukuhutang/scripts/backup.sh" | crontab -

# Final status
echo ""
echo "========================================"
echo "✅ Deployment Complete!"
echo "========================================"
echo ""
echo "📱 Application: https://$DOMAIN"
echo "🔧 API Endpoint: https://$DOMAIN/api/openclaw/webhook"
echo "💚 Health Check: https://$DOMAIN/health"
echo "📊 PM2 Dashboard: pm2 monit"
echo ""
echo "📋 Next Steps:"
echo "   1. Edit $APP_DIR/.env and add GEMINI_API_KEY"
echo "   2. Restart: pm2 restart bukuhutang"
echo "   3. Scan QR code with WhatsApp"
echo "   4. Test with: curl https://$DOMAIN/health"
echo ""
echo "📝 Logs:"
echo "   App: tail -f $APP_DIR/logs/app.log"
echo "   Error: tail -f $APP_DIR/logs/error.log"
echo "   Nginx: tail -f /var/log/nginx/bukuhutang-error.log"
echo "========================================"
