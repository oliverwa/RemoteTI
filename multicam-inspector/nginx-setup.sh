#!/bin/bash

# Nginx setup script for MultiCam Inspector
# Run this on your server after deploying the app

echo "Setting up Nginx for MultiCam Inspector..."

# Install Nginx
apt-get update
apt-get install -y nginx

# Create Nginx configuration
cat > /etc/nginx/sites-available/multicam-inspector << 'EOF'
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable the site
ln -s /etc/nginx/sites-available/multicam-inspector /etc/nginx/sites-enabled/

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Test configuration
nginx -t

# Reload Nginx
systemctl reload nginx

echo "Nginx configured! Your app will be available at http://yourdomain.com"
echo ""
echo "To add SSL (HTTPS):"
echo "1. Install certbot: apt-get install certbot python3-certbot-nginx"
echo "2. Get certificate: certbot --nginx -d yourdomain.com -d www.yourdomain.com"