#!/bin/bash

echo "=== Remote TI Backend Monitor ==="
echo "This will show server status and activity"
echo "Press Ctrl+C to stop monitoring"
echo "=================================="
echo ""

# Check if server is running
if ! lsof -i:3001 >/dev/null 2>&1; then
    echo "❌ Backend server is not running on port 3001"
    echo "Start it first with: ./start-backend.sh"
    exit 1
fi

echo "✅ Backend server detected on port 3001"

# Get process info
PID=$(lsof -ti:3001)
if [ ! -z "$PID" ]; then
    echo "📊 Process ID: $PID"
    echo "📁 Working directory: $(pwdx $PID 2>/dev/null | cut -d: -f2- | xargs)"
fi

echo ""
echo "🌐 Server endpoints:"
echo "   • Backend API: http://localhost:3001"
echo "   • Health check: curl http://localhost:3001/health"
echo ""
echo "💡 Server logs are visible in the terminal where you started it"
echo "💡 Watch for camera snapshot requests and image processing"
echo ""

# Monitor with status updates
COUNTER=0
while true; do
    if ! lsof -i:3001 >/dev/null 2>&1; then
        echo ""
        echo "❌ Server stopped running at $(date)"
        exit 1
    fi
    
    COUNTER=$((COUNTER + 1))
    if [ $((COUNTER % 12)) -eq 0 ]; then
        echo "⏱️  $(date '+%H:%M:%S'): Server running for $((COUNTER * 5)) seconds"
    fi
    
    sleep 5
done