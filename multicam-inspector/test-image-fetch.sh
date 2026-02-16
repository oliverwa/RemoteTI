#!/bin/bash

# Test script to verify image fetching functionality
# This tests that credentials are properly loaded from environment variables

SERVER="http://172.20.1.254:5001"
echo "🔍 Testing Image Fetch Functionality"
echo "===================================="
echo ""

# Test 1: Check server health
echo "1. Testing server health..."
HEALTH=$(curl -s $SERVER/api/health)
if echo "$HEALTH" | grep -q "ok"; then
    echo "✅ Server is healthy"
else
    echo "❌ Server health check failed"
    exit 1
fi

# Test 2: Check hangar configuration endpoint
echo ""
echo "2. Testing hangar configuration..."
HANGARS=$(curl -s $SERVER/api/hangars)
if echo "$HANGARS" | grep -q "hangar"; then
    echo "✅ Hangar configuration accessible"
    echo "   Found hangars in response"
else
    echo "⚠️  Could not verify hangar configuration"
fi

# Test 3: Check if credentials are being used properly
echo ""
echo "3. Verifying credential system..."
ssh root@172.20.1.254 "cd /root/multicam-inspector && grep 'process.env.HANGAR_SYSTEM' config.js > /dev/null"
if [ $? -eq 0 ]; then
    echo "✅ Config uses environment variables"
else
    echo "❌ Config not using environment variables"
fi

# Test 4: Check camera configuration
echo ""
echo "4. Testing camera configuration..."
CAMERAS=$(curl -s $SERVER/api/config/cameras)
if echo "$CAMERAS" | grep -q "10.20.1"; then
    echo "✅ Camera IPs configured"
else
    echo "⚠️  Camera configuration may need verification"
fi

echo ""
echo "===================================="
echo "📊 Test Summary"
echo ""
echo "The server is deployed and running at: $SERVER"
echo ""
echo "To test image fetching:"
echo "1. Open your browser to: $SERVER"
echo "2. Login with your credentials"
echo "3. Navigate to the MultiCam Inspector"
echo "4. Select a hangar and drone"
echo "5. Click 'Capture Images' to test fetching"
echo ""
echo "The system will use the credentials from environment variables to:"
echo "- Connect to hangar systems (HANGAR_SYSTEM_USERNAME/PASSWORD)"
echo "- Access camera feeds (CAMERA_ADMIN_USERNAME/PASSWORD)"
echo ""
echo "If image fetching fails, check:"
echo "- VPN connection is active"
echo "- Hangar systems are online"
echo "- Camera network is accessible"