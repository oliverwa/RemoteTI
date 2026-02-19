# Deployment Security Guide for MultiCam Inspector

## Maintenance History Implementation

### What Changed
The maintenance history system now tracks inspections **per hangar location** rather than per drone. This ensures that when drones move between hangars, the maintenance history stays with the physical location where the work was performed.

### New API Endpoint
- **Endpoint**: `GET /api/hangar-maintenance/:hangarId`
- **Purpose**: Returns maintenance history for a specific hangar, only considering the currently assigned drone
- **Security**: Input validation and sanitization implemented

### How It Works
1. When fetching maintenance for a hangar, the system:
   - Identifies the currently assigned drone from `hangars.json`
   - Only searches in that specific hangar's folder (`/snapshots/hangar_name/`)
   - Only counts completed inspections for the current drone
   - Ignores sessions from other drones that were previously at that location

2. The frontend now:
   - Fetches maintenance per hangar (not per drone)
   - Displays "Time since last [inspection type] at this hangar"
   - Updates automatically when drone assignments change

## Security Recommendations

### 1. Non-Root Deployment
```bash
# Create dedicated user
sudo useradd -m -s /bin/bash multicam
sudo usermod -aG www-data multicam

# Set ownership
sudo chown -R multicam:www-data /root/multicam-inspector
sudo chmod 750 /root/multicam-inspector

# Run as non-root user
sudo -u multicam pm2 start server.js --name multicam
```

### 2. Environment Variables
```bash
# Never commit .env files
# Generate secure secrets
JWT_SECRET=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)

# Set restrictive permissions
chmod 600 .env
```

### 3. Rate Limiting (Future Enhancement)
```javascript
// Add to server.js
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

### 4. Input Validation
Already implemented in the new endpoint:
- Hangar ID length validation (max 100 chars)
- Alphanumeric format validation
- Path traversal prevention

### 5. Audit Logging
```javascript
// Log all maintenance updates
function logMaintenanceAccess(hangarId, droneId, action) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    hangarId,
    droneId,
    action,
    ip: req.ip
  };
  fs.appendFileSync('audit.log', JSON.stringify(logEntry) + '\n');
}
```

### 6. HTTPS Configuration
```javascript
// Use HTTPS in production
const https = require('https');
const privateKey = fs.readFileSync('sslcert/server.key', 'utf8');
const certificate = fs.readFileSync('sslcert/server.crt', 'utf8');
const credentials = { key: privateKey, cert: certificate };

const httpsServer = https.createServer(credentials, app);
httpsServer.listen(443);
```

### 7. CORS Restrictions
```javascript
// Restrict CORS to known origins
const corsOptions = {
  origin: ['https://your-frontend-domain.com'],
  credentials: true
};
app.use(cors(corsOptions));
```

## Testing Drone Movements

To verify the maintenance history works correctly when drones move:

1. **Test Scenario 1: Drone Movement**
   - Drone e3002 at Hangar A has maintenance on Jan 1
   - Move drone e3002 to Hangar B
   - Hangar A should show no maintenance (no drone assigned)
   - Hangar B should show no maintenance (e3002's work was at Hangar A)

2. **Test Scenario 2: New Drone Assignment**
   - Assign drone e3003 to Hangar A
   - Hangar A should show e3003's maintenance history at that location only
   - Previous e3002 maintenance at Hangar A is ignored

3. **Test Commands**
   ```bash
   # Check hangar maintenance
   curl http://localhost:5001/api/hangar-maintenance/hangar_forsaker_vpn
   
   # Update drone assignment in Admin Panel
   # Re-check maintenance - should reflect new drone's history at that location
   ```

## Monitoring

### Health Checks
- Monitor the `/api/health` endpoint
- Check for maintenance data consistency
- Alert on authentication failures

### Log Rotation
```bash
# Add to /etc/logrotate.d/multicam
/root/multicam-inspector/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 640 multicam www-data
}
```

## Backup Strategy

### Important Data
- `/snapshots/` - Inspection images and data
- `data/hangars.json` - Hangar configurations
- `data/drones.json` - Drone assignments
- `data/users.json` - User accounts
- `.env` - Environment secrets (store securely)

### Backup Script
```bash
#!/bin/bash
BACKUP_DIR="/backup/multicam"
DATE=$(date +%Y%m%d)

# Backup data files
tar -czf $BACKUP_DIR/data_$DATE.tar.gz \
    /root/multicam-inspector/data/*.json \
    /root/snapshots/

# Keep only last 30 days
find $BACKUP_DIR -name "data_*.tar.gz" -mtime +30 -delete
```

## Deployment Checklist

- [ ] Create non-root user for service
- [ ] Generate secure JWT/SESSION secrets
- [ ] Set proper file permissions
- [ ] Configure HTTPS certificates
- [ ] Set up log rotation
- [ ] Implement backup strategy
- [ ] Test maintenance history with drone movements
- [ ] Monitor health endpoints
- [ ] Document drone-hangar assignments