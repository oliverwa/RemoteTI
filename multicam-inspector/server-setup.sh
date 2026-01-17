#!/bin/bash

# Server setup script for MultiCam Inspector
# Run this on your server after extracting the deployment package

echo "🚀 Setting up MultiCam Inspector on server..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command succeeded
check_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1${NC}"
    else
        echo -e "${RED}✗ $1 failed${NC}"
        exit 1
    fi
}

# Step 1: Install Node.js dependencies
echo -e "${YELLOW}Installing production dependencies...${NC}"
npm install --production
check_status "Dependencies installed"

# Step 2: Create necessary directories
echo -e "${YELLOW}Creating required directories...${NC}"
mkdir -p data/sessions
mkdir -p data/sessions/alarms
mkdir -p logs
check_status "Directories created"

# Step 3: Set permissions
echo -e "${YELLOW}Setting permissions...${NC}"
chmod 755 data
chmod 755 data/sessions
chmod 755 logs
check_status "Permissions set"

# Step 4: Copy environment template if .env doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    if [ -f .env.production.template ]; then
        cp .env.production.template .env
        echo -e "${GREEN}✓ .env file created${NC}"
        echo -e "${YELLOW}⚠️  Please edit .env file with your configuration${NC}"
    else
        echo -e "${RED}✗ No .env.production.template found${NC}"
    fi
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Step 5: Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2 for process management...${NC}"
    npm install -g pm2
    check_status "PM2 installed"
fi

# Step 6: Create PM2 ecosystem file
echo -e "${YELLOW}Creating PM2 configuration...${NC}"
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'multicam-inspector',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5001
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
}
EOF
check_status "PM2 config created"

echo -e "${GREEN}✅ Server setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Edit the .env file with your configuration:"
echo -e "${YELLOW}   nano .env${NC}"
echo ""
echo "2. Start the application with PM2:"
echo -e "${YELLOW}   pm2 start ecosystem.config.js${NC}"
echo ""
echo "3. Save PM2 configuration to restart on boot:"
echo -e "${YELLOW}   pm2 startup"
echo "   pm2 save${NC}"
echo ""
echo "4. Check application status:"
echo -e "${YELLOW}   pm2 status"
echo "   pm2 logs${NC}"
echo ""
echo "5. Access the application at:"
echo -e "${GREEN}   http://your-server-ip:5001${NC}"
echo ""
echo "Optional: Set up nginx reverse proxy for port 80/443"