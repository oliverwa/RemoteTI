#!/bin/bash

echo "🕵️ Camera API Traffic Capture"
echo "============================="
echo "This will monitor network traffic to the RUR camera"
echo "Use your camera app's manual controls now and I'll capture the API calls"
echo ""

CAMERA_IP="10.20.1.210"
HANGAR_HOST="hangar_sisjon_vpn"

echo "📡 Monitoring traffic to RUR camera ($CAMERA_IP)..."
echo "🎯 Use your app's manual focus/zoom controls NOW"
echo "📝 Press Ctrl+C when done to see captured commands"
echo ""

# Monitor HTTP/HTTPS traffic to the camera IP
# This will capture the actual API calls made by your app
sudo tcpdump -i any -A -s 0 "host $CAMERA_IP and (port 80 or port 443)" 2>/dev/null | \
while read line; do
    # Look for API calls
    if echo "$line" | grep -q "api.cgi\|cmd\|SetZoomFocus\|StartZoomFocus\|PtzCtrl\|AutoFocus"; then
        echo "🔍 Captured API call: $line"
    fi
done