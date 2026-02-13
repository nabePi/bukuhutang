#!/bin/bash

DOMAIN=${1:-bukuhutang.yourdomain.com}
EMAIL=${2:-admin@yourdomain.com}

echo "Setting up SSL for $DOMAIN"

# Install certbot
apt-get update
apt-get install -y certbot

# Obtain certificate
certbot certonly --standalone -d $DOMAIN --agree-tos --email $EMAIL

# Create SSL directory for Nginx
mkdir -p nginx/ssl

# Copy certificates
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem nginx/ssl/

echo "SSL certificates copied to nginx/ssl/"
echo "Remember to renew with: certbot renew"
