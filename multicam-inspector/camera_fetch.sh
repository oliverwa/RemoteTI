#!/usr/bin/env bash
# Simple camera fetch script: camera_fetch.sh <hangar> <drone> <camera_name> <camera_ip> [session_timestamp] [port]
set -euo pipefail

if [ $# -lt 4 ] || [ $# -gt 6 ]; then
    echo "Usage: $0 <hangar> <drone> <camera_name> <camera_ip> [session_timestamp] [port]"
    echo "Example: $0 hangar_sisjon_vpn bender FDR 10.20.1.208"
    echo "Example: $0 hangar_sisjon_vpn bender FDR 10.20.1.208 251006_203000"
    echo "Example: $0 hangar_sisjon_vpn bender FDR 10.20.1.208 251006_203000 8084"
    exit 1
fi

HANGAR_HOST="$1"
DRONE_NAME="$2" 
CAMERA_NAME="$3"
CAM_IP="$4"
SESSION_TIMESTAMP="${5:-}"
CUSTOM_PORT="${6:-}"

# Configuration
CAM_USER="admin"
CAM_PASS="H4anGar0NeC4amAdmin"
FORWARD_PORT="${CUSTOM_PORT:-8083}"  # Use custom port if provided, otherwise default to 8083
CURL_CONNECT_TIMEOUT=20
CURL_TOTAL_TIMEOUT=90
CURL_RETRIES=5

# Output directory - use provided session folder path
# The SESSION_TIMESTAMP parameter now contains the full subfolder path
# e.g., "hangar_sisjon_vpn/remote_bender_251204_093440"
if [ -n "${SESSION_TIMESTAMP}" ]; then
    OUT_DIR="${HOME}/Documents/GitHub/RemoteTI/multicam-inspector/data/sessions/${SESSION_TIMESTAMP}"
else
    # Fallback to old format if not provided
    RUN_STAMP="$(date +'%y%m%d_%H%M%S')"
    OUT_DIR="${HOME}/Documents/GitHub/RemoteTI/multicam-inspector/data/sessions/${HANGAR_HOST}/${DRONE_NAME}_${RUN_STAMP}"
fi

mkdir -p "${OUT_DIR}"

# Extract timestamp from folder name or use current time
if [[ "${SESSION_TIMESTAMP}" =~ ([0-9]{6}_[0-9]{6})$ ]]; then
    FILE_TIMESTAMP="${BASH_REMATCH[1]}"
else
    FILE_TIMESTAMP="$(date +'%y%m%d_%H%M%S')"
fi

OUTFILE="${OUT_DIR}/${CAMERA_NAME}_${FILE_TIMESTAMP}.jpg"

echo "Fetching ${CAMERA_NAME} from ${CAM_IP} via ${HANGAR_HOST}"

# SSH connection settings
CONTROL_PATH="${HOME}/.ssh/cm-%r@%h:%p"
SSH_OPTS="-o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath=${CONTROL_PATH} -o ControlPersist=60"

# Function to kill existing socat processes on the port
kill_existing_socat() {
    echo "Checking for existing socat processes on port ${FORWARD_PORT}..."
    ssh ${SSH_OPTS} "${HANGAR_HOST}" "
        pids=\$(ps aux | grep 'socat.*:${FORWARD_PORT}' | grep -v grep | awk '{print \$2}' || true)
        if [ -n \"\$pids\" ]; then
            echo \"Killing existing socat processes: \$pids\"
            kill \$pids 2>/dev/null || true
            sleep 1
        fi
    " 2>/dev/null || true
}

# Function to check if port is busy
port_busy() {
    ssh ${SSH_OPTS} "${HANGAR_HOST}" "
        if command -v ss >/dev/null 2>&1; then
            ss -lnt | awk '{print \$4}' | grep -q ':${FORWARD_PORT}\$'
        elif command -v netstat >/dev/null 2>&1; then
            netstat -lnt 2>/dev/null | awk '{print \$4}' | grep -q ':${FORWARD_PORT}\$'
        else
            exit 1
        fi
    " >/dev/null 2>&1
}

# Function to start SOCAT tunnel
start_tunnel() {
    local run_id="$$_$(date +%s)"
    local pidfile="/tmp/socat_${FORWARD_PORT}_${run_id}.pid"
    
    ssh ${SSH_OPTS} "${HANGAR_HOST}" "
        nohup socat tcp-listen:${FORWARD_PORT},reuseaddr,fork tcp:${CAM_IP}:443 >/dev/null 2>&1 & 
        echo \$! > ${pidfile}
        sleep 0.5
    "
    echo "$pidfile"
}

# Function to stop SOCAT tunnel  
stop_tunnel() {
    local pidfile="$1"
    ssh ${SSH_OPTS} "${HANGAR_HOST}" "
        if [ -f ${pidfile} ]; then
            pid=\$(cat ${pidfile} 2>/dev/null || true)
            if [ -n \"\$pid\" ]; then 
                kill \$pid 2>/dev/null || true
            fi
            rm -f ${pidfile}
        fi
    " 2>/dev/null || true
}

# Function to wait for file to be completely written
wait_for_complete_file() {
    local file="$1"
    local max_wait=30
    local wait_count=0
    local last_size=0
    local current_size=0
    local stable_count=0
    local min_size=10000  # Expect at least 10KB for a valid JPEG
    
    echo "Waiting for image to be completely written..."
    
    while [ $wait_count -lt $max_wait ]; do
        if [ -f "$file" ]; then
            current_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo "0")
            echo "File size: ${current_size} bytes (check $((wait_count+1))/${max_wait})"
            
            # If file size is stable for 3 consecutive checks and meets minimum size
            if [ "$current_size" -gt "$min_size" ] && [ "$current_size" -eq "$last_size" ]; then
                stable_count=$((stable_count + 1))
                if [ $stable_count -ge 3 ]; then
                    echo "File appears complete (${current_size} bytes, stable for 3 checks)"
                    return 0
                fi
            else
                stable_count=0
            fi
            
            last_size=$current_size
        else
            echo "File does not exist yet..."
        fi
        
        sleep 0.5
        wait_count=$((wait_count + 1))
    done
    
    echo "Warning: File may not be complete after ${max_wait}s wait (final size: ${current_size} bytes)"
    return 1
}

# Function to fetch image
fetch_image() {
    local url="https://${HANGAR_HOST}:${FORWARD_PORT}/cgi-bin/api.cgi?cmd=Snap&channel=0&rs=wuuPhkmUCeI9WG7C&user=${CAM_USER}&password=${CAM_PASS}"
    
    echo "Starting curl download..."
    if curl -sSLk --fail \
         --connect-timeout "${CURL_CONNECT_TIMEOUT}" \
         --max-time "${CURL_TOTAL_TIMEOUT}" \
         --retry "${CURL_RETRIES}" --retry-delay 1 \
         -o "${OUTFILE}" "${url}"; then
        echo "Curl download completed successfully"
        
        # Check if file was actually created and has content
        if [ ! -f "${OUTFILE}" ]; then
            echo "ERROR: File was not created by curl"
            return 1
        fi
        
        local initial_size=$(stat -f%z "${OUTFILE}" 2>/dev/null || stat -c%s "${OUTFILE}" 2>/dev/null || echo "0")
        echo "Initial file size after curl: ${initial_size} bytes"
        
        if [ "$initial_size" -eq 0 ]; then
            echo "ERROR: File is empty after curl"
            return 1
        fi
        
        # Wait for the file to be completely written
        wait_for_complete_file "${OUTFILE}"
    else
        echo "ERROR: Curl failed to download image"
        return 1
    fi
}

trigger_autofocus() {
    local cam_name="$1"
    echo "Triggering autofocus for ${cam_name}"
    
    local api_url="https://${HANGAR_HOST}:${FORWARD_PORT}/api.cgi?user=${CAM_USER}&password=${CAM_PASS}"
    
    # Get current zoom position first
    echo "Getting current zoom position"
    local current_zoom_response=$(curl -sSLk --fail \
         --connect-timeout 3 \
         --max-time 10 \
         -X POST \
         -H "Content-Type: application/json" \
         -d '[{"cmd":"GetZoomFocus","action":0,"param":{"channel":0}}]' \
         "${api_url}" 2>/dev/null || echo "error")
    
    # Extract current zoom position (default to 15 if can't get it)
    local current_zoom=15
    if [[ "$current_zoom_response" != "error" ]]; then
        current_zoom=$(echo "$current_zoom_response" | grep -o '"zoom"[[:space:]]*:[[:space:]]*{[^}]*"pos"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*$' || echo "15")
    fi
    
    echo "Current zoom position: $current_zoom"
    
    # Calculate temporary zoom position for autofocus trigger
    local temp_zoom=$((current_zoom + 5))
    if [ $temp_zoom -gt 28 ]; then
        temp_zoom=$((current_zoom - 5))
    fi
    if [ $temp_zoom -lt 1 ]; then
        temp_zoom=$((current_zoom + 5))
    fi
    
    echo "Zooming to position $temp_zoom to trigger autofocus"
    
    # Use working StartZoomFocus with ZoomPos operation
    curl -sSLk --fail \
         --connect-timeout 5 \
         --max-time 10 \
         -X POST \
         -H "Content-Type: application/json" \
         -d "[{\"cmd\":\"StartZoomFocus\",\"action\":0,\"param\":{\"ZoomFocus\":{\"channel\":0,\"pos\":$temp_zoom,\"op\":\"ZoomPos\"}}}]" \
         "${api_url}" >/dev/null 2>&1 || true

    # Wait for zoom change and autofocus trigger
    echo "Waiting for autofocus to trigger"
    sleep 2
    
    echo "Returning to original zoom position $current_zoom"
    
    # Return to original zoom position using working method
    curl -sSLk --fail \
         --connect-timeout 5 \
         --max-time 10 \
         -X POST \
         -H "Content-Type: application/json" \
         -d "[{\"cmd\":\"StartZoomFocus\",\"action\":0,\"param\":{\"ZoomFocus\":{\"channel\":0,\"pos\":$current_zoom,\"op\":\"ZoomPos\"}}}]" \
         "${api_url}" >/dev/null 2>&1 || true

    # Wait for autofocus to complete
    echo "Waiting for focus to stabilize"
    sleep 3
    echo "Autofocus completed for ${cam_name}"
}

# Main execution
echo "Fetching ${CAMERA_NAME} from ${CAM_IP} via ${HANGAR_HOST} on port ${FORWARD_PORT}"
echo "Start time: $(date '+%H:%M:%S')"
echo "Step 1/6: Establishing SSH connection"

# Establish SSH connection
ssh ${SSH_OPTS} "${HANGAR_HOST}" true || {
    echo "Error: Cannot connect to ${HANGAR_HOST}"
    exit 1
}
echo "SSH connection established ($(date '+%H:%M:%S'))"

# Kill any existing socat processes on our port
echo "Step 2/6: Cleaning up existing processes"
kill_existing_socat

# Check if port is still busy after cleanup
if port_busy; then
    echo "Port ${FORWARD_PORT} is still busy after cleanup, trying anyway..."
    sleep 1
fi

# Start tunnel
echo "Step 3/6: Starting tunnel for ${CAM_IP}"
pidfile=$(start_tunnel)
echo "Tunnel started ($(date '+%H:%M:%S'))"

# Wait a moment for tunnel to establish
sleep 1

# Trigger autofocus before capturing image
echo "Step 4/6: Triggering autofocus"
trigger_autofocus "${CAMERA_NAME}"
echo "Autofocus completed ($(date '+%H:%M:%S'))"

# Fetch the image
echo "Step 5/6: Capturing image from ${CAMERA_NAME}"
if fetch_image; then
    echo "SUCCESS: ${OUTFILE}"
    file_size=$(stat -f%z "${OUTFILE}" 2>/dev/null || stat -c%s "${OUTFILE}" 2>/dev/null || echo "unknown")
    echo "File size: ${file_size} bytes"
else
    echo "FAILED: Could not capture from ${CAMERA_NAME}"
    stop_tunnel "$pidfile"
    exit 1
fi

# Clean up tunnel
echo "Step 6/6: Cleaning up tunnel"
stop_tunnel "$pidfile"
echo "Cleanup completed ($(date '+%H:%M:%S'))"

echo "Done: ${CAMERA_NAME} -> ${OUTFILE}"
echo "Total capture time: Completed at $(date '+%H:%M:%S')"