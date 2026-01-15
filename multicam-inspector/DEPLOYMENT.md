# Deployment Guide for MultiCam Inspector

## Overview
This guide explains how to deploy the MultiCam Inspector application to a production server.

## Architecture
- **Frontend**: React app (built to static files, served by Express)
- **Backend**: Express.js server on port 5001
- **Data Storage**: Local JSON files in `data/` directory

## Prerequisites on Server
- Node.js 16+ and npm
- Git (optional, for pulling updates)
- PM2 (for process management) or systemd
- nginx or Apache (optional, for reverse proxy)

## Deployment Methods

### Method 1: Using Deployment Script (Recommended)

#### On your local machine:

1. **Edit the deployment script** with your server details:
```bash
nano deploy.sh
# Update SERVER_USER, SERVER_HOST, and SERVER_PATH
```

2. **Make the script executable**:
```bash
chmod +x deploy.sh
```

3. **Run the deployment script**:
```bash
./deploy.sh
```
This will:
- Build the React frontend
- Create a deployment package excluding sessions data
- Show you the commands to run next

4. **Copy the package to your server**:
```bash
scp multicam-inspector-deploy.tar.gz user@server:~/
```

#### On your server:

1. **Extract the package**:
```bash
mkdir -p /path/to/multicam-inspector
tar -xzf ~/multicam-inspector-deploy.tar.gz -C /path/to/multicam-inspector
cd /path/to/multicam-inspector
```

2. **Run the setup script**:
```bash
chmod +x server-setup.sh
./server-setup.sh
```

3. **Configure environment**:
```bash
nano .env
# Update with your server settings
```

4. **Start the application**:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow the instructions to enable startup on boot
```

### Method 2: Manual Deployment

1. **Build locally**:
```bash
npm run build
```

2. **Create archive** (excluding sessions):
```bash
tar -czf deploy.tar.gz \
  --exclude='node_modules' \
  --exclude='data/sessions/*' \
  --exclude='.git' \
  --exclude='.env' \
  .
```

3. **Copy to server and extract**:
```bash
scp deploy.tar.gz user@server:~/
ssh user@server
mkdir -p /path/to/app
tar -xzf ~/deploy.tar.gz -C /path/to/app
```

4. **Install and run**:
```bash
cd /path/to/app
npm install --production
npm run server
```

## Important Data Preservation

The `data/sessions/` folder contains inspection data and should **NEVER** be overwritten during updates.

### Updating the Application

When deploying updates:

1. **Backup current data**:
```bash
cp -r data/sessions data/sessions.backup
```

2. **Deploy new code** (using either method above)

3. **Restore sessions if needed**:
```bash
# The deployment scripts already exclude sessions, but if needed:
cp -r data/sessions.backup/* data/sessions/
```

## Server Configuration

### Nginx Reverse Proxy (Optional)

To serve on port 80/443:

```nginx
server {
    listen 80;
    server_name your-domain.com;

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
```

### Systemd Service (Alternative to PM2)

Create `/etc/systemd/system/multicam-inspector.service`:

```ini
[Unit]
Description=MultiCam Inspector
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/multicam-inspector
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=5001

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable multicam-inspector
sudo systemctl start multicam-inspector
```

## Environment Variables

Key variables to configure in `.env`:

- `NODE_ENV=production`
- `PORT=5001`
- `JWT_SECRET=<generate-random-string>`
- `SESSION_SECRET=<generate-random-string>`
- `REACT_APP_API_HOST=http://your-server:5001`

## Monitoring

### With PM2:
```bash
pm2 status          # Check status
pm2 logs            # View logs
pm2 monit           # Real-time monitoring
```

### With systemd:
```bash
sudo systemctl status multicam-inspector
sudo journalctl -u multicam-inspector -f
```

## Troubleshooting

1. **Port already in use**: Change PORT in .env file
2. **Permission denied**: Check data/ folder permissions
3. **Cannot connect**: Check firewall rules for port 5001
4. **Sessions not saving**: Ensure data/sessions/ is writable

## Security Checklist

- [ ] Change default passwords in `data/users.json`
- [ ] Set strong JWT_SECRET in `.env`
- [ ] Configure firewall rules
- [ ] Set up SSL certificate (via nginx/certbot)
- [ ] Restrict file permissions
- [ ] Enable application logs
- [ ] Regular backups of data/ folder

## Backup Strategy

Regular backup script example:
```bash
#!/bin/bash
BACKUP_DIR="/backups/multicam-inspector"
APP_DIR="/path/to/multicam-inspector"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/data_$DATE.tar.gz -C $APP_DIR data/
# Keep only last 30 days of backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

## Support

For issues or questions, check:
- Application logs in `logs/` directory
- PM2 logs: `pm2 logs`
- Server logs: `/var/log/nginx/error.log`