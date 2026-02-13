# BukuHutang Production Deployment Guide

## Prerequisites

- VPS with Ubuntu 20.04+ (2GB RAM, 1 CPU minimum)
- Domain name pointed to VPS IP
- Root access

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/yourusername/bukuhutang.git
cd bukuhutang

# 2. Run deployment script
chmod +x scripts/deploy-production.sh
sudo ./scripts/deploy-production.sh

# 3. Configure environment
sudo nano /opt/bukuhutang/.env
# Add your GEMINI_API_KEY

# 4. Restart app
sudo pm2 restart bukuhutang

# 5. Scan QR code
sudo pm2 logs bukuhutang
# Wait for QR code, scan with WhatsApp
```

## Manual Docker Deployment

```bash
# 1. Copy environment
cp .env.example .env
# Edit .env with your keys

# 2. Start with Docker Compose
docker-compose -f docker-compose.prod.yml up -d

# 3. View logs
docker-compose -f docker-compose.prod.yml logs -f app
```

## SSL Certificate

### Option 1: Let's Encrypt (Free)
```bash
sudo certbot --nginx -d yourdomain.com
```

### Option 2: Cloudflare (Recommended)
1. Use Cloudflare proxy
2. Set SSL/TLS mode to "Full (strict)"
3. No certificate needed on server

## Monitoring

### PM2 Dashboard
```bash
pm2 monit
```

### View Logs
```bash
# App logs
tail -f /opt/bukuhutang/logs/app.log

# Error logs
tail -f /opt/bukuhutang/logs/error.log

# Nginx logs
tail -f /var/log/nginx/bukuhutang-error.log
```

## Backup & Restore

### Automatic Backup
Backups run daily at 2 AM to `/opt/bukuhutang/backups/`

### Manual Backup
```bash
/opt/bukuhutang/scripts/backup.sh
```

### Restore from Backup
```bash
# Stop app
pm2 stop bukuhutang

# Restore database
cp backup_file.db /opt/bukuhutang/data/bukuhutang.db

# Start app
pm2 start bukuhutang
```

## Troubleshooting

### App won't start
```bash
# Check logs
pm2 logs bukuhutang

# Check port
netstat -tlnp | grep 3005

# Restart
pm2 restart bukuhutang
```

### WhatsApp disconnected
```bash
# Remove auth folder and restart
rm -rf /opt/bukuhutang/auth_info_baileys
pm2 restart bukuhutang
# Scan QR code again
```

### Database locked
```bash
# Stop app
pm2 stop bukuhutang

# Remove lock files
rm -f /opt/bukuhutang/data/*.db-journal
rm -f /opt/bukuhutang/data/*.db-wal
rm -f /opt/bukuhutang/data/*.db-shm

# Start app
pm2 start bukuhutang
```

## Security Checklist

- [ ] Change default API keys
- [ ] Enable UFW firewall
- [ ] Configure fail2ban
- [ ] Regular backups enabled
- [ ] SSL certificate installed
- [ ] Rate limiting enabled
- [ ] Logs rotated
- [ ] Automatic updates configured
