#!/bin/bash

# Simple, reliable deployment script for MultiCam Inspector
# This script builds locally and copies directly to the server

# Configuration
SERVER="root@172.20.1.254"
REMOTE_DIR="/root/multicam-inspector"
LOCAL_BUILD="build"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 MultiCam Inspector - Simple Deployment"
echo "=========================================="
echo ""

# Step 1: Build the React app locally with production API
echo -e "${YELLOW}Step 1: Building React app with production settings...${NC}"
# Build with NODE_ENV=production to enable auto-detection of server IP
NODE_ENV=production npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed! Fix errors and try again.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Build successful${NC}"
echo ""

# Step 2: Test the server locally first
echo -e "${YELLOW}Step 2: Testing server locally...${NC}"
timeout 3 node server.js > /dev/null 2>&1
EXIT_CODE=$?
# timeout returns 124 when it times out (expected behavior for a server)
# any other non-zero exit code means the server crashed
if [ $EXIT_CODE -eq 124 ] || [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ Server starts without errors${NC}"
else
    echo -e "${RED}❌ Server has startup errors! Fix them first.${NC}"
    exit 1
fi
echo ""

# Step 3: Create the remote directory
echo -e "${YELLOW}Step 3: Setting up server directory...${NC}"
ssh $SERVER "mkdir -p $REMOTE_DIR/data/sessions"
echo -e "${GREEN}✅ Directory created${NC}"
echo ""

# Step 4: Copy essential files
echo -e "${YELLOW}Step 4: Copying files to server...${NC}"

# Copy built React app
echo "  📦 Copying build folder..."
scp -r build $SERVER:$REMOTE_DIR/

# Copy server files
echo "  📦 Copying server files..."
scp server.js package.json package-lock.json $SERVER:$REMOTE_DIR/

# Copy server directory
echo "  📦 Copying server modules..."
scp -r server $SERVER:$REMOTE_DIR/

# Copy configuration
echo "  📦 Copying configuration..."
scp config.js $SERVER:$REMOTE_DIR/

# Copy data templates only (preserve server data)
echo "  📦 Copying data templates..."
# Only copy templates folder, not the JSON files that store user data
scp -r data/templates $SERVER:$REMOTE_DIR/data/ 2>/dev/null || true

# Initialize data files if they don't exist on server
ssh $SERVER "cd $REMOTE_DIR && \
  [ ! -f data/users.json ] && [ -f data/users.json.example ] && cp data/users.json.example data/users.json || true; \
  [ ! -f data/drones.json ] && [ -f data/drones.json.example ] && cp data/drones.json.example data/drones.json || true; \
  [ ! -f data/hangars.json ] && [ -f data/hangars.json.example ] && cp data/hangars.json.example data/hangars.json || true"

# Copy scripts if they exist
echo "  📦 Copying scripts..."
scp camera_fetch.sh $SERVER:$REMOTE_DIR/ 2>/dev/null || true

# Copy example env file for reference
scp .env.example $SERVER:$REMOTE_DIR/ 2>/dev/null || true

# NEVER overwrite .env on server - it contains real credentials
echo "  📦 Checking production environment..."
ssh $SERVER "if [ -f $REMOTE_DIR/.env ]; then \
  echo '  ✓ Keeping existing .env on server (contains real credentials)'; \
else \
  echo '  ⚠️  WARNING: No .env file found on server!'; \
  echo '  ⚠️  You need to create one with real credentials:'; \
  echo '     ssh $SERVER'; \
  echo '     cd $REMOTE_DIR'; \
  echo '     cp .env.example .env'; \
  echo '     nano .env  # Add real passwords'; \
fi"

echo -e "${GREEN}✅ Files copied${NC}"
echo ""

# Step 5: Install dependencies on server
echo -e "${YELLOW}Step 5: Installing dependencies on server...${NC}"
ssh $SERVER "cd $REMOTE_DIR && npm install --production"
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 6: Setup environment file
echo -e "${YELLOW}Step 6: Setting up environment configuration...${NC}"
ssh $SERVER "cd $REMOTE_DIR && \
  if [ ! -f .env ]; then \
    echo 'Creating new .env file...'; \
    touch .env; \
  fi; \
  \
  # Check if JWT_SECRET is set, if not generate it
  if ! grep -q '^JWT_SECRET=' .env || [ \"\$(grep '^JWT_SECRET=' .env | cut -d= -f2)\" = \"\" ] || [ \"\$(grep '^JWT_SECRET=' .env | cut -d= -f2)\" = \"CHANGE_THIS_TO_RANDOM_STRING_AT_LEAST_32_CHARS\" ]; then \
    echo 'Generating JWT_SECRET...'; \
    JWT_SECRET=\$(openssl rand -base64 32); \
    if grep -q '^JWT_SECRET=' .env; then \
      sed -i \"s/^JWT_SECRET=.*/JWT_SECRET=\$JWT_SECRET/\" .env; \
    else \
      echo \"JWT_SECRET=\$JWT_SECRET\" >> .env; \
    fi; \
  fi; \
  \
  # Check if SESSION_SECRET is set, if not generate it
  if ! grep -q '^SESSION_SECRET=' .env || [ \"\$(grep '^SESSION_SECRET=' .env | cut -d= -f2)\" = \"\" ] || [ \"\$(grep '^SESSION_SECRET=' .env | cut -d= -f2)\" = \"CHANGE_THIS_TO_ANOTHER_RANDOM_STRING\" ]; then \
    echo 'Generating SESSION_SECRET...'; \
    SESSION_SECRET=\$(openssl rand -base64 32); \
    if grep -q '^SESSION_SECRET=' .env; then \
      sed -i \"s/^SESSION_SECRET=.*/SESSION_SECRET=\$SESSION_SECRET/\" .env; \
    else \
      echo \"SESSION_SECRET=\$SESSION_SECRET\" >> .env; \
    fi; \
  fi; \
  \
  # Ensure other required variables are set
  grep -q '^NODE_ENV=' .env || echo 'NODE_ENV=production' >> .env; \
  grep -q '^PORT=' .env || echo 'PORT=5001' >> .env; \
  # REACT_APP_API_HOST is now auto-detected, no need to set it \
  grep -q '^BCRYPT_ROUNDS=' .env || echo 'BCRYPT_ROUNDS=10' >> .env; \
  grep -q '^REQUIRE_AUTH=' .env || echo 'REQUIRE_AUTH=true' >> .env; \
  \
  echo 'Environment configuration complete'"
echo -e "${GREEN}✅ Environment ready with secure secrets${NC}"
echo ""

# Step 7: Test the server
echo -e "${YELLOW}Step 7: Testing server startup...${NC}"
ssh $SERVER "cd $REMOTE_DIR && timeout 3 node server.js" 2>/dev/null
if [ $? -eq 124 ]; then
    echo -e "${GREEN}✅ Server starts successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Server may have issues, check logs${NC}"
fi
echo ""

# Step 8: Final instructions
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "The server is ready to run at: http://172.20.1.254:5001"
echo ""
echo "To start the server:"
echo "1. SSH into server: ssh $SERVER"
echo "2. Navigate to app: cd $REMOTE_DIR"
echo "3. Start with PM2: pm2 start server.js --name multicam"
echo "   Or test mode: npm run server"
echo ""
echo "To update in the future, just run: ./deploy.sh"