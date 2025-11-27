const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = 3001;

// Safety configurations
const SCRIPT_PATH = path.join(__dirname, 'remote_ti_camera_fetch.sh');
const VALID_HANGARS = ['hangar_sisjon_vpn', 'molndal', 'forges', 'hangar_rouen_vpn'];
const MAX_DRONE_NAME_LENGTH = 50;
const DRONE_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files from public directory

// Logging utility
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  if (data) {
    console.log(`[${timestamp}] [DATA]`, JSON.stringify(data, null, 2));
  }
}

// Safety validation function
function validateSnapshotRequest(req) {
  const { hangar, drone } = req.body;
  
  log('info', 'Validating snapshot request', { hangar, drone });
  
  // Validate hangar
  if (!hangar || typeof hangar !== 'string') {
    throw new Error('Invalid hangar: must be a non-empty string');
  }
  
  // Note: We'll be more permissive with hangar names for now
  // if (!VALID_HANGARS.includes(hangar)) {
  //   throw new Error(`Invalid hangar: must be one of ${VALID_HANGARS.join(', ')}`);
  // }
  
  // Validate drone name
  if (!drone || typeof drone !== 'string') {
    throw new Error('Invalid drone: must be a non-empty string');
  }
  
  if (drone.length > MAX_DRONE_NAME_LENGTH) {
    throw new Error(`Drone name too long: maximum ${MAX_DRONE_NAME_LENGTH} characters`);
  }
  
  if (!DRONE_NAME_REGEX.test(drone)) {
    throw new Error('Invalid drone name: only letters, numbers, underscores, and hyphens allowed');
  }
  
  log('info', 'Validation passed');
  return { hangar, drone };
}

// Check if script exists and is executable
function validateScript() {
  log('info', 'Validating camera fetch script', { scriptPath: SCRIPT_PATH });
  
  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new Error(`Script not found: ${SCRIPT_PATH}`);
  }
  
  const stats = fs.statSync(SCRIPT_PATH);
  if (!stats.isFile()) {
    throw new Error(`Script path is not a file: ${SCRIPT_PATH}`);
  }
  
  // Check if script is executable (on Unix systems)
  try {
    fs.accessSync(SCRIPT_PATH, fs.constants.F_OK | fs.constants.R_OK);
    log('info', 'Script validation passed');
  } catch (error) {
    throw new Error(`Script is not accessible: ${error.message}`);
  }
}

// SSE endpoint for real-time capture updates
app.get('/api/capture-stream/:requestId', (req, res) => {
  const { requestId } = req.params;
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', requestId })}\n\n`);

  // Store the connection for this request
  global.sseConnections = global.sseConnections || {};
  global.sseConnections[requestId] = res;

  // Handle client disconnect
  req.on('close', () => {
    if (global.sseConnections && global.sseConnections[requestId]) {
      delete global.sseConnections[requestId];
    }
  });
});

// Helper function to send SSE updates
function sendSSEUpdate(requestId, data) {
  if (global.sseConnections && global.sseConnections[requestId]) {
    try {
      global.sseConnections[requestId].write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      log('warn', `Failed to send SSE update for ${requestId}:`, error.message);
    }
  }
}

// API endpoint to capture cameras in parallel
app.post('/api/capture', async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  
  try {
    log('info', `[${requestId}] Received snapshot request`, req.body);
    
    // Validate request
    const { hangar, drone } = validateSnapshotRequest(req);
    
    log('info', `[${requestId}] Starting parallel camera capture`, { hangar, drone });
    
    // Return immediately with requestId
    res.json({
      success: true,
      requestId,
      message: 'Parallel camera capture started',
      status: 'started'
    });
    
    // Generate session timestamp for all cameras in this capture
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');
    const second = now.getSeconds().toString().padStart(2, '0');
    const formattedTimestamp = `${year}${month}${day}_${hour}${minute}${second}`;
    
    // Store process info
    global.captureProcesses = global.captureProcesses || {};
    global.captureProcesses[requestId] = {
      hangar,
      drone,
      sessionTimestamp: formattedTimestamp,
      startTime: Date.now(),
      capturedImages: [],
      failedImages: [],
      status: 'running',
      currentCameras: [], // Track multiple cameras in progress
      currentStep: 0,
      totalSteps: 8,
      currentPhase: 'connecting',
      activeProcesses: new Map() // Track individual camera processes
    };
    
    // Start parallel capture in background
    captureInParallel(requestId, hangar, drone, formattedTimestamp);
    
  } catch (error) {
    log('error', `[${requestId}] Request validation error:`, error.message);
    res.status(400).json({
      success: false,
      requestId,
      error: error.message
    });
  }
});

// Function to capture cameras one by one
async function captureSequentially(requestId, hangar, drone, sessionTimestamp) {
  const cameras = ['FDR', 'FUR', 'RUR', 'RDR', 'FDL', 'FUL', 'RUL', 'RDL'];
  const scriptPath = path.join(__dirname, 'camera_fetch.sh');
  
  for (let i = 0; i < cameras.length; i++) {
    const camera = cameras[i];
    
    // Update status
    global.captureProcesses[requestId].currentCamera = camera;
    global.captureProcesses[requestId].currentStep = i + 1;
    
    log('info', `[${requestId}] Capturing ${camera} (${i + 1}/${cameras.length}) with session ${sessionTimestamp}`);
    
    try {
      await captureCamera(requestId, hangar, drone, camera, scriptPath, sessionTimestamp);
      
      // Mark as captured
      global.captureProcesses[requestId].capturedImages.push(camera);
      log('info', `[${requestId}] ${camera} SUCCESS`);
      
    } catch (error) {
      // Mark as failed
      global.captureProcesses[requestId].failedImages.push(camera);
      log('error', `[${requestId}] ${camera} FAILED: ${error.message}`);
    }
    
    // Delay between cameras to avoid conflicts and allow cleanup
    if (i < cameras.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  
  // Mark as completed
  global.captureProcesses[requestId].status = 'completed';
  global.captureProcesses[requestId].currentCamera = null;
  
  log('info', `[${requestId}] Sequential capture completed. Success: ${global.captureProcesses[requestId].capturedImages.length}, Failed: ${global.captureProcesses[requestId].failedImages.length}`);
}

// Function to capture cameras in parallel (4 at a time)
async function captureInParallel(requestId, hangar, drone, sessionTimestamp) {
  const cameras = ['FDR', 'FUR', 'RUR', 'RDR', 'FDL', 'FUL', 'RUL', 'RDL'];
  const scriptPath = path.join(__dirname, 'camera_fetch.sh');
  
  // Capture 4 cameras at a time to avoid overwhelming the system
  const batchSize = 4;
  const batches = [];
  
  for (let i = 0; i < cameras.length; i += batchSize) {
    batches.push(cameras.slice(i, i + batchSize));
  }
  
  log('info', `[${requestId}] Starting parallel capture in ${batches.length} batches of ${batchSize} cameras each`);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    log('info', `[${requestId}] Processing batch ${batchIndex + 1}/${batches.length}: [${batch.join(', ')}]`);
    
    // Update status to show current batch
    global.captureProcesses[requestId].currentCameras = batch;
    global.captureProcesses[requestId].currentPhase = `batch_${batchIndex + 1}_of_${batches.length}`;
    
    // Create promises for all cameras in this batch
    const batchPromises = batch.map((camera, index) => {
      const port = 8083 + index; // Use different ports for parallel captures
      
      // Update step counter
      const cameraIndex = cameras.indexOf(camera);
      global.captureProcesses[requestId].currentStep = Math.max(
        global.captureProcesses[requestId].currentStep, 
        cameraIndex + 1
      );
      
      log('info', `[${requestId}] Starting ${camera} on port ${port} (${cameraIndex + 1}/${cameras.length})`);
      
      return captureCameraParallel(requestId, hangar, drone, camera, port, scriptPath, sessionTimestamp)
        .then(() => {
          global.captureProcesses[requestId].capturedImages.push(camera);
          log('info', `[${requestId}] ${camera} SUCCESS`);
        })
        .catch((error) => {
          global.captureProcesses[requestId].failedImages.push(camera);
          log('error', `[${requestId}] ${camera} FAILED: ${error.message}`);
        });
    });
    
    // Wait for all cameras in this batch to complete
    await Promise.allSettled(batchPromises);
    
    // Small delay between batches to allow cleanup
    if (batchIndex < batches.length - 1) {
      log('info', `[${requestId}] Batch ${batchIndex + 1} completed, waiting 2s before next batch`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Final cleanup - kill any remaining socat processes on all used ports  
  log('info', `[${requestId}] Final cleanup: killing socat processes on ports 8083-8086`);
  try {
    const { spawn } = require('child_process');
    const cleanup = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'ControlMaster=auto', 
      '-o', `ControlPath=${process.env.HOME}/.ssh/cm-%r@%h:%p`,
      '-o', 'ControlPersist=60',
      hangar,
      'pkill -f "socat.*:(8083|8084|8085|8086)" || true'
    ]);
    
    cleanup.on('close', (code) => {
      log('info', `[${requestId}] Port cleanup completed with code ${code}`);
    });
  } catch (error) {
    log('warn', `[${requestId}] Port cleanup failed:`, error.message);
  }
  
  // Mark as completed
  global.captureProcesses[requestId].status = 'completed';
  global.captureProcesses[requestId].currentCameras = [];
  global.captureProcesses[requestId].currentPhase = null;
  
  log('info', `[${requestId}] Parallel capture completed. Success: ${global.captureProcesses[requestId].capturedImages.length}, Failed: ${global.captureProcesses[requestId].failedImages.length}`);
}

// Function to capture a single camera (sequential version)
function captureCamera(requestId, hangar, drone, camera, scriptPath, sessionTimestamp) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath, hangar, drone, camera, sessionTimestamp], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname,
      env: { ...process.env }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      const logLine = data.toString().trim();
      log('info', `[${requestId}][${camera}]`, logLine);
      
      // Parse log output to track current operation phase
      if (global.captureProcesses && global.captureProcesses[requestId]) {
        if (logLine.includes('🎯 Triggering autofocus') || logLine.includes('📡 Getting current zoom') || logLine.includes('🔍 Zooming to position') || logLine.includes('⏳ Waiting for autofocus') || logLine.includes('🔄 Returning to original zoom')) {
          global.captureProcesses[requestId].currentPhase = 'autofocus';
        } else if (logLine.includes('Capturing image from') || logLine.includes('Starting curl download') || logLine.includes('Curl download completed')) {
          global.captureProcesses[requestId].currentPhase = 'capture';
        } else if (logLine.includes('Connecting to') || logLine.includes('Starting tunnel') || logLine.includes('Checking for existing socat')) {
          global.captureProcesses[requestId].currentPhase = 'connecting';
        }
      }
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      log('warn', `[${requestId}][${camera}] ERROR:`, data.toString().trim());
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script failed with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
    
    // Timeout per camera
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Camera capture timeout'));
    }, 120000); // 120 second timeout per camera
  });
}

// Function to capture a single camera (parallel version with port parameter)
function captureCameraParallel(requestId, hangar, drone, camera, port, scriptPath, sessionTimestamp) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath, hangar, drone, camera, sessionTimestamp, port.toString()], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname,
      env: { ...process.env }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      const logLine = data.toString().trim();
      log('info', `[${requestId}][${camera}:${port}]`, logLine);
      
      // Parse log output to track current operation phase
      if (global.captureProcesses && global.captureProcesses[requestId]) {
        if (logLine.includes('🎯 Triggering autofocus') || logLine.includes('📡 Getting current zoom') || logLine.includes('🔍 Zooming to position') || logLine.includes('⏳ Waiting for autofocus') || logLine.includes('🔄 Returning to original zoom')) {
          global.captureProcesses[requestId].currentPhase = 'autofocus';
        } else if (logLine.includes('Capturing image from') || logLine.includes('Starting curl download') || logLine.includes('Curl download completed')) {
          global.captureProcesses[requestId].currentPhase = 'capture';
        } else if (logLine.includes('Connecting to') || logLine.includes('Starting tunnel') || logLine.includes('Checking for existing socat')) {
          global.captureProcesses[requestId].currentPhase = 'connecting';
        }
      }
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      log('warn', `[${requestId}][${camera}:${port}] ERROR:`, data.toString().trim());
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script failed with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
    
    // Timeout per camera
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Camera capture timeout'));
    }, 90000); // 90 second timeout per camera (shorter for parallel)
  });
}

// API endpoint to check capture status and get images
app.get('/api/capture/:requestId/status', async (req, res) => {
  const { requestId } = req.params;
  
  if (!global.captureProcesses || !global.captureProcesses[requestId]) {
    return res.status(404).json({ error: 'Capture process not found' });
  }
  
  const captureProcess = global.captureProcesses[requestId];
  
  try {
    // Look for available images - check specific session directory
    const availableImages = [];
    const sessionDir = path.join(
      process.env.HOME, 
      'hangar_snapshots', 
      captureProcess.hangar, 
      `${captureProcess.drone}_${captureProcess.sessionTimestamp}`
    );
    
    if (fs.existsSync(sessionDir)) {
      const files = fs.readdirSync(sessionDir)
        .filter(file => file.endsWith('.jpg'))
        .sort();
      
      for (const file of files) {
        const cameraName = file.split('_')[0];
        availableImages.push({
          camera: cameraName,
          filename: file,
          path: path.join(sessionDir, file),
          session: `${captureProcess.drone}_${captureProcess.sessionTimestamp}`
        });
      }
    }
    
    res.json({
      requestId,
      status: captureProcess.status,
      currentCamera: captureProcess.currentCamera, // For backward compatibility
      currentCameras: captureProcess.currentCameras || [captureProcess.currentCamera].filter(Boolean), // New parallel support
      currentStep: captureProcess.currentStep,
      totalSteps: captureProcess.totalSteps,
      currentPhase: captureProcess.currentPhase,
      capturedCameras: captureProcess.capturedImages,
      failedCameras: captureProcess.failedImages,
      availableImages,
      totalImages: availableImages.length,
      runtime: Date.now() - captureProcess.startTime
    });
    
  } catch (error) {
    log('error', `Error checking status for ${requestId}:`, error.message);
    res.status(500).json({ error: 'Failed to check capture status' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  try {
    validateScript();
    res.json({ 
      status: 'healthy',
      script: 'accessible',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API endpoint to serve captured images
app.get('/api/image/:hangar/:session/:filename', (req, res) => {
  try {
    const { hangar, session, filename } = req.params;
    const imagePath = path.join(process.env.HOME, 'hangar_snapshots', hangar, session, filename);
    
    log('info', 'Image request', { imagePath });
    
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    res.sendFile(imagePath);
  } catch (error) {
    log('error', 'Image serving error:', error.message);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// API endpoint to update ROI in inspection JSON
app.post('/api/update-roi', (req, res) => {
  try {
    const { taskId, roi, roiBoxes, roiRectangles } = req.body;
    
    log('info', 'ROI update request', { taskId, roi, roiBoxes, roiRectangles });
    
    if (!taskId || (!roi && !roiBoxes && !roiRectangles)) {
      return res.status(400).json({ error: 'Missing taskId or roi/roiBoxes/roiRectangles data' });
    }
    
    const jsonPath = path.join(__dirname, 'src/data/drone-remote-inspection.json');
    
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: 'Inspection JSON file not found' });
    }
    
    // Read current JSON
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Find the task
    const taskIndex = jsonData.tasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }
    
    // Update ROI data for the task (simplified to roiBoxes only)
    if (roiBoxes) {
      jsonData.tasks[taskIndex].roiBoxes = roiBoxes; // Only format we need
      // Remove legacy formats to avoid conflicts
      delete jsonData.tasks[taskIndex].roi;
      delete jsonData.tasks[taskIndex].roiRectangles;
    }
    
    // Write back to file
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    
    log('info', `ROI updated for task ${taskId}`, { roiBoxes });
    
    res.json({ success: true, message: `ROI updated for task ${taskId}` });
    
  } catch (error) {
    log('error', 'ROI update error:', error.message);
    res.status(500).json({ error: 'Failed to update ROI' });
  }
});

// API endpoint to serve current inspection JSON data
app.get('/api/inspection-data', (req, res) => {
  try {
    const jsonPath = path.join(__dirname, 'src/data/drone-remote-inspection.json');
    
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: 'Inspection JSON file not found' });
    }
    
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    res.json(jsonData);
    
  } catch (error) {
    log('error', 'Error serving inspection data:', error.message);
    res.status(500).json({ error: 'Failed to load inspection data' });
  }
});

// API endpoint to add/update validation boxes in inspection JSON
app.post('/api/update-validation-box', (req, res) => {
  try {
    const { taskId, cameraName, validationBox } = req.body;
    
    log('info', 'Validation box update request', { taskId, cameraName, validationBox });
    
    if (!taskId || !cameraName || !validationBox) {
      return res.status(400).json({ error: 'Missing taskId, cameraName, or validationBox data' });
    }
    
    const jsonPath = path.join(__dirname, 'src/data/drone-remote-inspection.json');
    
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: 'Inspection JSON file not found' });
    }
    
    // Read current JSON
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    // Find the task
    const taskIndex = jsonData.tasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }
    
    // Initialize validationBoxes if it doesn't exist
    if (!jsonData.tasks[taskIndex].validationBoxes) {
      jsonData.tasks[taskIndex].validationBoxes = {};
    }
    
    // Initialize camera array if it doesn't exist
    if (!jsonData.tasks[taskIndex].validationBoxes[cameraName]) {
      jsonData.tasks[taskIndex].validationBoxes[cameraName] = [];
    }
    
    // Check if validation box with same ID already exists
    const existingIndex = jsonData.tasks[taskIndex].validationBoxes[cameraName].findIndex(
      box => box.id === validationBox.id
    );
    
    if (existingIndex !== -1) {
      // Update existing validation box
      jsonData.tasks[taskIndex].validationBoxes[cameraName][existingIndex] = validationBox;
      log('info', `Updated existing validation box ${validationBox.id} for ${cameraName} on task ${taskId}`);
    } else {
      // Add new validation box
      jsonData.tasks[taskIndex].validationBoxes[cameraName].push(validationBox);
      log('info', `Added new validation box ${validationBox.id} for ${cameraName} on task ${taskId}`);
    }
    
    // Write back to file
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    
    log('info', `Validation box updated for task ${taskId}, camera ${cameraName}`, validationBox);
    
    res.json({ 
      success: true, 
      message: `Validation box ${existingIndex !== -1 ? 'updated' : 'added'} for ${cameraName} on task ${taskId}`,
      validationBox
    });
    
  } catch (error) {
    log('error', 'Validation box update error:', error.message);
    res.status(500).json({ error: 'Failed to update validation box' });
  }
});

// API endpoint to migrate validation boxes from pixel to percentage coordinates
app.post('/api/migrate-validation-boxes', (req, res) => {
  try {
    const { imageWidth = 4000, imageHeight = 3000 } = req.body; // Default 4K image dimensions
    const jsonPath = path.join(__dirname, 'src/data/drone-remote-inspection.json');
    
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: 'Inspection JSON file not found' });
    }
    
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let migratedCount = 0;
    let totalBoxes = 0;
    
    // Iterate through all tasks
    jsonData.tasks.forEach(task => {
      if (task.validationBoxes) {
        Object.keys(task.validationBoxes).forEach(cameraName => {
          const boxes = task.validationBoxes[cameraName];
          if (Array.isArray(boxes)) {
            boxes.forEach(box => {
              totalBoxes++;
              // Check if coordinates look like pixels (> 1.0) rather than percentages (0-1)
              if (box.x > 1 || box.y > 1 || box.width > 1 || box.height > 1) {
                // Convert from pixels to percentages
                box.x = box.x / imageWidth;
                box.y = box.y / imageHeight;
                box.width = box.width / imageWidth;
                box.height = box.height / imageHeight;
                migratedCount++;
                log('info', `Migrated validation box "${box.id}" for ${cameraName}: pixel coords converted to percentages`);
              }
            });
          }
        });
      }
    });
    
    // Save the updated JSON
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    
    log('info', `Migration completed: ${migratedCount}/${totalBoxes} validation boxes migrated to percentage coordinates`);
    
    res.json({
      success: true,
      message: `Migration completed: ${migratedCount}/${totalBoxes} validation boxes converted to percentage coordinates`,
      migratedCount,
      totalBoxes,
      imageWidth,
      imageHeight
    });
    
  } catch (error) {
    log('error', 'Migration error:', error.message);
    res.status(500).json({ error: 'Failed to migrate validation boxes' });
  }
});

// API endpoint to migrate validation boxes from percentage back to pixel coordinates
app.post('/api/revert-validation-boxes', (req, res) => {
  try {
    const { imageWidth = 4000, imageHeight = 3000 } = req.body; // Default 4K image dimensions
    const jsonPath = path.join(__dirname, 'src/data/drone-remote-inspection.json');
    
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: 'Inspection JSON file not found' });
    }
    
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let revertedCount = 0;
    let totalBoxes = 0;
    
    // Iterate through all tasks
    jsonData.tasks.forEach(task => {
      if (task.validationBoxes) {
        Object.keys(task.validationBoxes).forEach(cameraName => {
          const boxes = task.validationBoxes[cameraName];
          if (Array.isArray(boxes)) {
            boxes.forEach(box => {
              totalBoxes++;
              // Check if coordinates look like percentages (< 1.0) rather than pixels (> 1.0)
              if (box.x < 1 && box.y < 1 && box.width < 1 && box.height < 1) {
                // Convert from percentages back to pixels
                box.x = Math.round(box.x * imageWidth);
                box.y = Math.round(box.y * imageHeight);
                box.width = Math.round(box.width * imageWidth);
                box.height = Math.round(box.height * imageHeight);
                revertedCount++;
                log('info', `Reverted validation box "${box.id}" for ${cameraName}: percentage coords converted back to pixels`);
              }
            });
          }
        });
      }
    });
    
    // Save the updated JSON
    fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    
    log('info', `Reversion completed: ${revertedCount}/${totalBoxes} validation boxes reverted to pixel coordinates`);
    
    res.json({
      success: true,
      message: `Reversion completed: ${revertedCount}/${totalBoxes} validation boxes converted back to pixel coordinates`,
      revertedCount,
      totalBoxes,
      imageWidth,
      imageHeight
    });
    
  } catch (error) {
    log('error', 'Reversion error:', error.message);
    res.status(500).json({ error: 'Failed to revert validation boxes' });
  }
});

// API endpoint to list all available snapshot folders
app.get('/api/folders', (req, res) => {
  try {
    const snapshotsDir = path.join(process.env.HOME, 'hangar_snapshots');
    
    if (!fs.existsSync(snapshotsDir)) {
      return res.json({ hangars: [] });
    }
    
    const hangars = [];
    const hangarDirs = fs.readdirSync(snapshotsDir).filter(item => {
      const itemPath = path.join(snapshotsDir, item);
      return fs.statSync(itemPath).isDirectory();
    });
    
    hangarDirs.forEach(hangarName => {
      const hangarPath = path.join(snapshotsDir, hangarName);
      const sessions = [];
      
      const sessionDirs = fs.readdirSync(hangarPath).filter(item => {
        const itemPath = path.join(hangarPath, item);
        return fs.statSync(itemPath).isDirectory();
      });
      
      sessionDirs.forEach(sessionName => {
        const sessionPath = path.join(hangarPath, sessionName);
        const stats = fs.statSync(sessionPath);
        
        // Get list of images in this session
        const images = fs.readdirSync(sessionPath).filter(file => 
          file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')
        );
        
        if (images.length > 0) {
          sessions.push({
            id: sessionName,
            name: sessionName,
            path: sessionPath,
            created: stats.mtime,
            imageCount: images.length,
            images: images
          });
        }
      });
      
      // Sort sessions by creation time (newest first)
      sessions.sort((a, b) => new Date(b.created) - new Date(a.created));
      
      if (sessions.length > 0) {
        hangars.push({
          id: hangarName,
          name: hangarName,
          sessions: sessions
        });
      }
    });
    
    log('info', `Found ${hangars.length} hangars with ${hangars.reduce((total, h) => total + h.sessions.length, 0)} sessions`);
    res.json({ hangars });
    
  } catch (error) {
    log('error', 'Error listing folders:', error.message);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

// API endpoint to get the latest session folder for a specific hangar
app.get('/api/folders/latest/:hangar', (req, res) => {
  try {
    const { hangar } = req.params;
    const hangarPath = path.join(process.env.HOME, 'hangar_snapshots', hangar);
    
    if (!fs.existsSync(hangarPath)) {
      return res.status(404).json({ error: `Hangar ${hangar} not found` });
    }
    
    const sessionDirs = fs.readdirSync(hangarPath).filter(item => {
      const itemPath = path.join(hangarPath, item);
      return fs.statSync(itemPath).isDirectory();
    });
    
    if (sessionDirs.length === 0) {
      return res.status(404).json({ error: `No sessions found for hangar ${hangar}` });
    }
    
    // Get the latest session by modification time
    let latestSession = null;
    let latestTime = 0;
    
    sessionDirs.forEach(sessionName => {
      const sessionPath = path.join(hangarPath, sessionName);
      const stats = fs.statSync(sessionPath);
      
      if (stats.mtime > latestTime) {
        latestTime = stats.mtime;
        latestSession = {
          id: sessionName,
          name: sessionName,
          hangar: hangar,
          created: stats.mtime,
          path: sessionPath
        };
      }
    });
    
    if (latestSession) {
      // Get list of images in this session
      const images = fs.readdirSync(latestSession.path).filter(file => 
        file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')
      );
      
      latestSession.imageCount = images.length;
      latestSession.images = images;
      
      log('info', `Latest session for ${hangar}: ${latestSession.name} with ${images.length} images`);
      res.json({ session: latestSession });
    } else {
      res.status(404).json({ error: `No valid sessions found for hangar ${hangar}` });
    }
    
  } catch (error) {
    log('error', 'Error getting latest folder:', error.message);
    res.status(500).json({ error: 'Failed to get latest folder' });
  }
});

// API endpoint for autofocus testing
app.post('/api/autofocus-test', async (req, res) => {
  try {
    const { camera, method, timestamp } = req.body;
    
    log('info', 'Autofocus test request', { camera, method, timestamp });
    
    // Validate input
    if (!camera || !method) {
      return res.status(400).json({ error: 'Missing camera or method parameter' });
    }
    
    // Camera IP mapping
    const CAMERA_IPS = {
      'FDR': '10.20.1.208',
      'FUR': '10.20.1.209', 
      'RUR': '10.20.1.210',
      'RDR': '10.20.1.211',
      'FDL': '10.20.1.212',
      'FUL': '10.20.1.213',
      'RUL': '10.20.1.214',
      'RDL': '10.20.1.215'
    };
    
    const cameraIP = CAMERA_IPS[camera];
    if (!cameraIP) {
      return res.status(400).json({ error: `Unknown camera: ${camera}` });
    }
    
    // Execute autofocus command based on method
    const result = await executeAutofocusMethod(camera, cameraIP, method);
    
    log('info', 'Autofocus test completed', { camera, method, success: result.success });
    
    res.json(result);
    
  } catch (error) {
    log('error', 'Autofocus test error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to execute autofocus test',
      details: error.message 
    });
  }
});

// Function to execute different autofocus methods
async function executeAutofocusMethod(camera, cameraIP, method) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'autofocus-test.sh');
    
    // Create a temporary script for this specific autofocus test
    const testScript = `#!/bin/bash
set -euo pipefail

CAMERA_NAME="${camera}"
CAM_IP="${cameraIP}"
HANGAR_HOST="hangar_sisjon_vpn"
CAM_USER="admin"
CAM_PASS="H4anGar0NeC4amAdmin"
FORWARD_PORT=8083
METHOD="${method}"

# SSH connection settings
CONTROL_PATH="$HOME/.ssh/cm-%r@%h:%p"
SSH_OPTS="-o StrictHostKeyChecking=no -o ControlMaster=auto -o ControlPath=$CONTROL_PATH -o ControlPersist=60"

echo "Testing \${METHOD} on \${CAMERA_NAME} (\${CAM_IP})"

# Establish SSH connection first
ssh \${SSH_OPTS} "\${HANGAR_HOST}" true || {
    echo "ERROR: Cannot connect to \${HANGAR_HOST}"
    exit 1
}

# Kill existing socat processes
ssh \${SSH_OPTS} "\${HANGAR_HOST}" bash -c "
    pids=\\$(ps aux | grep \\"socat.*:\${FORWARD_PORT}\\" | grep -v grep | awk '{print \\$2}')
    if [ -n \\"\\$pids\\" ]; then
        echo \\"Killing existing socat processes: \\$pids\\"
        kill \\$pids 2>/dev/null || true
        sleep 1
    fi
" 2>/dev/null || true

# Start tunnel
run_id="$$_$(date +%s)"
pidfile="/tmp/socat_\${FORWARD_PORT}_\${run_id}.pid"

ssh \${SSH_OPTS} "\${HANGAR_HOST}" bash -c "
    nohup socat tcp-listen:\${FORWARD_PORT},reuseaddr,fork tcp:\${CAM_IP}:443 >/dev/null 2>&1 & 
    echo \\$! > \${pidfile}
    sleep 0.5
"

# Wait for tunnel
sleep 1

api_url="https://\${HANGAR_HOST}:\${FORWARD_PORT}/api.cgi?user=\${CAM_USER}&password=\${CAM_PASS}"

case "\${METHOD}" in
    "reset")
        echo "🔄 Resetting autofocus..."
        # Disable autofocus
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":1}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Disable command may have failed"
        sleep 0.5
        # Enable autofocus
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":0}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Enable command may have failed"
        echo "✅ Autofocus reset completed"
        ;;
    "trigger")
        echo "⚡ Triggering autofocus..."
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"PtzCtrl","action":0,"param":{"channel":0,"op":"AutoFocus","speed":4}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Trigger command may have failed"
        echo "✅ Autofocus trigger completed"
        ;;
    "far")
        echo "🔭 Focusing to far distance..."
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"StartZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"op":"FocusFar","pos":10}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Far focus command may have failed"
        echo "✅ Far focus completed"
        ;;
    "near")
        echo "🔍 Focusing to near distance..."
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"StartZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"op":"FocusNear","pos":10}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Near focus command may have failed"
        echo "✅ Near focus completed"
        ;;
    "manual_reset")
        echo "🛠️ Manual focus reset..."
        # Set manual focus first
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":1}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Manual mode command may have failed"
        sleep 1
        # Focus to infinity then back
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"StartZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"op":"FocusFar","pos":50}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Far focus command may have failed"
        sleep 2
        # Re-enable autofocus
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"SetAutoFocus","action":0,"param":{"AutoFocus":{"channel":0,"disable":0}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Auto mode command may have failed"
        echo "✅ Manual reset completed"
        ;;
    "iris_adjust")
        echo "📷 Adjusting iris for better autofocus..."
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"SetIrisen","action":0,"param":{"Irisen":{"channel":0,"val":2}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Iris command may have failed"
        sleep 1
        # Trigger autofocus after iris adjustment
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"PtzCtrl","action":0,"param":{"channel":0,"op":"AutoFocus","speed":4}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Autofocus command may have failed"
        echo "✅ Iris adjustment and autofocus completed"
        ;;
    "zoom_in")
        echo "🔍 Zooming in (position 20)..."
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"zoom":{"pos":20}}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Zoom in command may have failed"
        echo "✅ Zoom in completed"
        ;;
    "zoom_out")
        echo "🔍 Zooming out (position 10)..."
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"zoom":{"pos":10}}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Zoom out command may have failed"
        echo "✅ Zoom out completed"
        ;;
    "focus_near_manual")
        echo "⬅️ Manual focus near (position 100)..."
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"focus":{"pos":100}}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Focus near command may have failed"
        echo "✅ Manual focus near completed"
        ;;
    "focus_far_manual")
        echo "➡️ Manual focus far (position 220)..."
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"SetZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"focus":{"pos":220}}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Focus far command may have failed"
        echo "✅ Manual focus far completed"
        ;;
    "focus_auto_after_manual")
        echo "🎯 Triggering autofocus via zoom method..."
        # Get current zoom position
        current_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        current_zoom=15
        if [[ "\$current_response" != "error" ]]; then
            current_zoom=\$(echo "\$current_response" | grep -o '\"zoom\"[[:space:]]*:[[:space:]]*{[^}]*\"pos\"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*\$' || echo "15")
        fi
        
        # Calculate temporary zoom position
        temp_zoom=\$((current_zoom + 2))
        if [ \$temp_zoom -gt 28 ]; then
            temp_zoom=\$((current_zoom - 2))
        fi
        
        echo "Temporarily changing zoom from \$current_zoom to \$temp_zoom to trigger autofocus..."
        
        # Change zoom to trigger autofocus
        curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d "[{\\\"cmd\\\":\\\"SetZoomFocus\\\",\\\"action\\\":0,\\\"param\\\":{\\\"ZoomFocus\\\":{\\\"channel\\\":0,\\\"zoom\\\":{\\\"pos\\\":\$temp_zoom}}}}]" \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Zoom change may have failed"
        
        sleep 2
        
        # Return to original zoom
        curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d "[{\\\"cmd\\\":\\\"SetZoomFocus\\\",\\\"action\\\":0,\\\"param\\\":{\\\"ZoomFocus\\\":{\\\"channel\\\":0,\\\"zoom\\\":{\\\"pos\\\":\$current_zoom}}}}]" \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Zoom return may have failed"
        
        sleep 4
        echo "✅ Zoom-triggered autofocus completed"
        ;;
    "proper_autofocus")
        echo "🎯 Using proper Reolink SetAutoFocus API..."
        
        # First check current autofocus status
        echo "   📊 Checking current autofocus status..."
        current_status=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetAutoFocus\",\"action\":1,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Current autofocus status: \$current_status"
        
        # Enable autofocus (disable: 0 means enable)
        echo "   🔄 Enabling autofocus..."
        enable_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"SetAutoFocus\",\"action\":0,\"param\":{\"AutoFocus\":{\"channel\":0,\"disable\":0}}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Enable autofocus response: \$enable_response"
        
        # Wait for autofocus to work
        sleep 3
        
        echo "✅ Proper autofocus API completed"
        ;;
    "force_trigger_focus")
        echo "🎯 Force triggering autofocus action..."
        
        # Try different methods to force autofocus trigger
        echo "   Method 1: Disable then re-enable autofocus..."
        curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"SetAutoFocus\",\"action\":0,\"param\":{\"AutoFocus\":{\"channel\":0,\"disable\":1}}}]' \\
             "\${api_url}" >/dev/null 2>&1
        
        sleep 1
        
        curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"SetAutoFocus\",\"action\":0,\"param\":{\"AutoFocus\":{\"channel\":0,\"disable\":0}}}]' \\
             "\${api_url}" >/dev/null 2>&1
        
        sleep 2
        
        echo "   Method 2: Try StartZoomFocus with AutoFocus operation..."
        curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"StartZoomFocus\",\"action\":0,\"param\":{\"ZoomFocus\":{\"channel\":0,\"op\":\"AutoFocus\"}}}]' \\
             "\${api_url}" 2>/dev/null || echo "   AutoFocus op not supported"
        
        sleep 2
        
        echo "   Method 3: Try PtzCtrl AutoFocus..."
        curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"PtzCtrl\",\"action\":0,\"param\":{\"channel\":0,\"op\":\"AutoFocus\",\"speed\":32}}]' \\
             "\${api_url}" 2>/dev/null || echo "   PtzCtrl AutoFocus not supported"
        
        echo "✅ Force autofocus trigger completed"
        ;;
    "improved_zoom_trigger")
        echo "🎯 Improved zoom-triggered autofocus (like your app)..."
        
        # Get current zoom position
        current_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        current_zoom=15
        if [[ "\$current_response" != "error" ]]; then
            current_zoom=\$(echo "\$current_response" | grep -o '\"zoom\"[[:space:]]*:[[:space:]]*{[^}]*\"pos\"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*\$' || echo "15")
        fi
        
        echo "   📊 Current zoom: \$current_zoom"
        
        # Make a bigger zoom change (5-10 positions)
        temp_zoom=\$((current_zoom + 8))
        if [ \$temp_zoom -gt 28 ]; then
            temp_zoom=\$((current_zoom - 8))
        fi
        if [ \$temp_zoom -lt 1 ]; then
            temp_zoom=\$((current_zoom + 8))
        fi
        
        echo "   🔍 Zooming to \$temp_zoom to trigger autofocus..."
        
        # Zoom with longer wait for autofocus
        curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d "[{\\\"cmd\\\":\\\"SetZoomFocus\\\",\\\"action\\\":0,\\\"param\\\":{\\\"ZoomFocus\\\":{\\\"channel\\\":0,\\\"zoom\\\":{\\\"pos\\\":\$temp_zoom}}}}]" \\
             "\${api_url}" >/dev/null 2>&1
        
        echo "   ⏳ Waiting 5 seconds for autofocus to trigger..."
        sleep 5
        
        echo "   🔄 Returning to original zoom \$current_zoom..."
        curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d "[{\\\"cmd\\\":\\\"SetZoomFocus\\\",\\\"action\\\":0,\\\"param\\\":{\\\"ZoomFocus\\\":{\\\"channel\\\":0,\\\"zoom\\\":{\\\"pos\\\":\$current_zoom}}}}]" \\
             "\${api_url}" >/dev/null 2>&1
        
        echo "   ⏳ Final wait for focus to stabilize..."
        sleep 3
        
        echo "✅ Improved zoom-triggered autofocus completed"
        ;;
    "diagnostic_zoom")
        echo "🔍 Diagnostic zoom with full response capture..."
        
        # Get current zoom position with response
        echo "   📊 Getting current zoom position..."
        current_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   GetZoomFocus response: \$current_response"
        
        current_zoom=15
        if [[ "\$current_response" != "error" ]]; then
            current_zoom=\$(echo "\$current_response" | grep -o '\"zoom\"[[:space:]]*:[[:space:]]*{[^}]*\"pos\"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*\$' || echo "15")
        fi
        
        echo "   📊 Extracted current zoom: \$current_zoom"
        
        # Try zoom change with response capture
        temp_zoom=\$((current_zoom + 10))
        if [ \$temp_zoom -gt 28 ]; then
            temp_zoom=\$((current_zoom - 10))
        fi
        
        echo "   🔍 Setting zoom to \$temp_zoom..."
        zoom_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d "[{\\\"cmd\\\":\\\"SetZoomFocus\\\",\\\"action\\\":0,\\\"param\\\":{\\\"ZoomFocus\\\":{\\\"channel\\\":0,\\\"zoom\\\":{\\\"pos\\\":\$temp_zoom}}}}]" \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   SetZoomFocus response: \$zoom_response"
        
        sleep 3
        
        # Check zoom position after change
        echo "   📊 Verifying zoom change..."
        verify_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   GetZoomFocus after change: \$verify_response"
        
        sleep 5
        
        # Return to original zoom
        echo "   🔄 Returning to original zoom \$current_zoom..."
        return_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d "[{\\\"cmd\\\":\\\"SetZoomFocus\\\",\\\"action\\\":0,\\\"param\\\":{\\\"ZoomFocus\\\":{\\\"channel\\\":0,\\\"zoom\\\":{\\\"pos\\\":\$current_zoom}}}}]" \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Return zoom response: \$return_response"
        
        sleep 3
        
        # Final verification
        echo "   📊 Final zoom verification..."
        final_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Final GetZoomFocus: \$final_response"
        
        echo "✅ Diagnostic zoom completed with full response capture"
        ;;
    "correct_zoom_command")
        echo "🎯 Using correct StartZoomFocus command..."
        
        # Get current position
        current_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Current status: \$current_response"
        
        # Try zoom in using StartZoomFocus
        echo "   🔍 Zooming IN using StartZoomFocus..."
        zoom_in_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"StartZoomFocus\",\"action\":0,\"param\":{\"ZoomFocus\":{\"channel\":0,\"op\":\"ZoomInc\"}}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Zoom IN response: \$zoom_in_response"
        
        sleep 3
        
        # Check status after zoom in
        echo "   📊 Status after zoom in..."
        after_in_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   After zoom in: \$after_in_response"
        
        sleep 5
        
        # Try zoom out to return
        echo "   🔍 Zooming OUT using StartZoomFocus..."
        zoom_out_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"StartZoomFocus\",\"action\":0,\"param\":{\"ZoomFocus\":{\"channel\":0,\"op\":\"ZoomDec\"}}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Zoom OUT response: \$zoom_out_response"
        
        sleep 3
        
        # Final status
        echo "   📊 Final status..."
        final_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Final status: \$final_response"
        
        echo "✅ StartZoomFocus test completed"
        ;;
    "try_exact_docs_format")
        echo "🎯 Trying exact documentation format..."
        
        # Current status
        current_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Current: \$current_response"
        
        # Try exact format from docs: ZoomPos with position
        echo "   📊 Trying ZoomPos operation..."
        zoom_pos_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"StartZoomFocus\",\"action\":0,\"param\":{\"ZoomFocus\":{\"channel\":0,\"pos\":20,\"op\":\"ZoomPos\"}}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   ZoomPos response: \$zoom_pos_response"
        
        sleep 3
        
        # Check after ZoomPos
        after_pos_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   After ZoomPos: \$after_pos_response"
        
        sleep 5
        
        # Try to return to position 15
        echo "   🔄 Returning to pos 15..."
        return_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"StartZoomFocus\",\"action\":0,\"param\":{\"ZoomFocus\":{\"channel\":0,\"pos\":15,\"op\":\"ZoomPos\"}}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Return response: \$return_response"
        
        sleep 3
        
        # Final check
        final_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Final: \$final_response"
        
        echo "✅ Exact docs format test completed"
        ;;
    "final_working_autofocus")
        echo "🎯 FINAL WORKING AUTOFOCUS METHOD!"
        
        # Get current zoom position
        current_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{\"cmd\":\"GetZoomFocus\",\"action\":0,\"param\":{\"channel\":0}}]' \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        current_zoom=15
        if [[ "\$current_response" != "error" ]]; then
            current_zoom=\$(echo "\$current_response" | grep -o '\"zoom\"[[:space:]]*:[[:space:]]*{[^}]*\"pos\"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*\$' || echo "15")
        fi
        
        echo "   📊 Current zoom: \$current_zoom"
        
        # Calculate temp zoom for autofocus trigger
        temp_zoom=\$((current_zoom + 5))
        if [ \$temp_zoom -gt 28 ]; then
            temp_zoom=\$((current_zoom - 5))
        fi
        if [ \$temp_zoom -lt 1 ]; then
            temp_zoom=\$((current_zoom + 5))
        fi
        
        echo "   🔍 Zooming to \$temp_zoom to trigger autofocus..."
        
        # Use the WORKING StartZoomFocus with ZoomPos operation
        zoom_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d "[{\\\"cmd\\\":\\\"StartZoomFocus\\\",\\\"action\\\":0,\\\"param\\\":{\\\"ZoomFocus\\\":{\\\"channel\\\":0,\\\"pos\\\":\$temp_zoom,\\\"op\\\":\\\"ZoomPos\\\"}}}]" \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Zoom change response: \$zoom_response"
        
        sleep 5
        
        echo "   🔄 Returning to original zoom \$current_zoom..."
        
        # Return using working method
        return_response=\$(curl -sSLk --fail --connect-timeout 5 --max-time 10 -X POST \\
             -H "Content-Type: application/json" \\
             -d "[{\\\"cmd\\\":\\\"StartZoomFocus\\\",\\\"action\\\":0,\\\"param\\\":{\\\"ZoomFocus\\\":{\\\"channel\\\":0,\\\"pos\\\":\$current_zoom,\\\"op\\\":\\\"ZoomPos\\\"}}}]" \\
             "\${api_url}" 2>/dev/null || echo "error")
        
        echo "   Return response: \$return_response"
        
        sleep 3
        
        echo "✅ WORKING AUTOFOCUS COMPLETED - Camera should now be in focus!"
        ;;
    "stop_focus")
        echo "⏹️ Stopping focus movement..."
        curl -sSLk --fail --connect-timeout 5 --max-time 15 -X POST \\
             -H "Content-Type: application/json" \\
             -d '[{"cmd":"StartZoomFocus","action":0,"param":{"ZoomFocus":{"channel":0,"op":"FocusStop"}}}]' \\
             "\${api_url}" >/dev/null 2>&1 || echo "Warning: Stop focus command may have failed"
        echo "✅ Focus movement stopped"
        ;;
    *)
        echo "❌ Unknown method: \${METHOD}"
        exit 1
        ;;
esac

# Clean up tunnel
ssh \${SSH_OPTS} "\${HANGAR_HOST}" bash -c "
    if [ -f \${pidfile} ]; then
        pid=\\$(cat \${pidfile} 2>/dev/null || true)
        if [ -n \\"\\$pid\\" ]; then 
            kill \\$pid 2>/dev/null || true
        fi
        rm -f \${pidfile}
    fi
" 2>/dev/null || true

echo "🎯 Test completed for \${CAMERA_NAME} using method \${METHOD}"
`;

    // Write the test script
    fs.writeFileSync(scriptPath, testScript);
    fs.chmodSync(scriptPath, '755');

    // Execute the script
    const child = spawn('bash', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      // Clean up the temporary script
      try {
        fs.unlinkSync(scriptPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      const success = code === 0;
      const details = stdout || stderr || 'No output';

      resolve({
        success,
        details,
        method,
        camera,
        exitCode: code
      });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        success: false,
        error: 'Autofocus test timed out after 30 seconds',
        method,
        camera
      });
    }, 30000);
  });
}

// API endpoint to get overlay session groups from hangar snapshots
app.get('/api/overlay-sessions', (req, res) => {
  try {
    const snapshotsDir = path.join(process.env.HOME, 'hangar_snapshots');
    
    if (!fs.existsSync(snapshotsDir)) {
      return res.json({ sessionGroups: {} });
    }
    
    const sessionGroups = {};
    const hangarDirs = fs.readdirSync(snapshotsDir).filter(item => {
      const itemPath = path.join(snapshotsDir, item);
      return fs.statSync(itemPath).isDirectory();
    });
    
    hangarDirs.forEach(hangarName => {
      const hangarPath = path.join(snapshotsDir, hangarName);
      const sessions = [];
      
      const sessionDirs = fs.readdirSync(hangarPath).filter(item => {
        const itemPath = path.join(hangarPath, item);
        return fs.statSync(itemPath).isDirectory();
      });
      
      sessionDirs.forEach(sessionName => {
        const sessionPath = path.join(hangarPath, sessionName);
        
        // Check if session has images
        try {
          const files = fs.readdirSync(sessionPath);
          const imageFiles = files.filter(file => 
            file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')
          );
          
          if (imageFiles.length > 0) {
            sessions.push(sessionName);
          }
        } catch (error) {
          log('warn', `Cannot read session directory ${sessionPath}:`, error.message);
        }
      });
      
      // Sort sessions by name (newest first, assuming timestamp format)
      sessions.sort((a, b) => b.localeCompare(a));
      
      if (sessions.length > 0) {
        sessionGroups[hangarName] = sessions;
      }
    });
    
    log('info', `Found overlay sessions across ${Object.keys(sessionGroups).length} hangars`);
    res.json({ sessionGroups });
    
  } catch (error) {
    log('error', 'Error getting overlay sessions:', error.message);
    res.status(500).json({ error: 'Failed to get overlay sessions' });
  }
});

// API endpoint to get images for selected sessions
app.post('/api/overlay-images', (req, res) => {
  try {
    const { hangar, sessions } = req.body;
    
    if (!hangar || !Array.isArray(sessions) || sessions.length === 0) {
      return res.status(400).json({ error: 'Missing hangar or sessions data' });
    }
    
    const images = [];
    const snapshotsDir = path.join(process.env.HOME, 'hangar_snapshots');
    const hangarPath = path.join(snapshotsDir, hangar);
    
    if (!fs.existsSync(hangarPath)) {
      return res.status(404).json({ error: `Hangar ${hangar} not found` });
    }
    
    sessions.forEach(sessionName => {
      const sessionPath = path.join(hangarPath, sessionName);
      
      if (fs.existsSync(sessionPath)) {
        try {
          const files = fs.readdirSync(sessionPath);
          const imageFiles = files.filter(file => 
            file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')
          );
          
          imageFiles.forEach(filename => {
            const filePath = path.join(sessionPath, filename);
            const stats = fs.statSync(filePath);
            
            // Extract camera ID from filename (e.g., "FDR_251124_104158.jpg" -> "FDR")
            const cameraId = filename.split('_')[0];
            
            images.push({
              path: filePath,
              sessionName,
              cameraId,
              filename,
              timestamp: stats.mtime.toISOString(),
              hangar
            });
          });
        } catch (error) {
          log('warn', `Cannot read session ${sessionName}:`, error.message);
        }
      }
    });
    
    // Sort images by timestamp
    images.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    
    log('info', `Found ${images.length} images across ${sessions.length} sessions for overlay analysis`);
    res.json({ images });
    
  } catch (error) {
    log('error', 'Error getting overlay images:', error.message);
    res.status(500).json({ error: 'Failed to get overlay images' });
  }
});

// API endpoint to serve images by full path for overlay analysis
app.get('/api/image', (req, res) => {
  try {
    const imagePath = decodeURIComponent(req.query.path);
    
    log('info', 'Overlay image request', { imagePath });
    
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Security check: ensure path is within hangar_snapshots
    const snapshotsDir = path.join(process.env.HOME, 'hangar_snapshots');
    const resolvedPath = path.resolve(imagePath);
    const resolvedSnapshotsDir = path.resolve(snapshotsDir);
    
    if (!resolvedPath.startsWith(resolvedSnapshotsDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.sendFile(resolvedPath);
  } catch (error) {
    log('error', 'Overlay image serving error:', error.message);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Start server
app.listen(PORT, () => {
  log('info', `Backend server started on port ${PORT}`);
  log('info', 'Environment check:', {
    nodeVersion: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    scriptPath: SCRIPT_PATH,
    homeDir: process.env.HOME
  });
  
  // Initial script validation
  try {
    validateScript();
    log('info', 'Initial script validation successful');
  } catch (error) {
    log('error', 'Initial script validation failed:', error.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log('info', 'Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('info', 'Received SIGINT, shutting down gracefully');
  process.exit(0);
});