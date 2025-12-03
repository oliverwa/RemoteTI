const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');

const app = express();

// Load unified configuration
const config = require('./config.js');
const PORT = config.server.port;

// Derived configurations
const BASE_DIR = config.paths.base === '.' ? __dirname : config.paths.base;
const CAMERA_SCRIPT_PATH = path.join(BASE_DIR, config.paths.scripts.cameraFetch);
const INSPECTION_JSON_PATH = path.join(BASE_DIR, config.paths.data.inspectionJson);
const SNAPSHOTS_DIR = config.paths.snapshotsAbsolute || path.join(process.env.HOME, config.paths.snapshots);

// Middleware
app.use(cors());
app.use(express.json());
// Serve built React app
app.use(express.static('build'));

// Serve public directory for additional static files
app.use('/public', express.static('public'));


// Logging utility
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  if (data) {
    console.log(`[${timestamp}] [DATA]`, JSON.stringify(data, null, 2));
  }
}

// Validation functions
function validateSnapshotRequest(req) {
  const { hangar, drone } = req.body;
  
  log('info', 'Validating snapshot request', { hangar, drone });
  
  if (!hangar || typeof hangar !== 'string') {
    throw new Error('Invalid hangar: must be a non-empty string');
  }
  
  if (!drone || typeof drone !== 'string') {
    throw new Error('Invalid drone: must be a non-empty string');
  }
  
  if (drone.length > config.server.maxDroneNameLength) {
    throw new Error(`Drone name too long: maximum ${config.server.maxDroneNameLength} characters`);
  }
  
  const droneRegex = new RegExp(config.server.droneNameRegex);
  if (!droneRegex.test(drone)) {
    throw new Error('Invalid drone name: only letters, numbers, underscores, and hyphens allowed');
  }
  
  log('info', 'Validation passed');
  return { hangar, drone };
}

function validateScript() {
  log('info', 'Validating camera fetch script', { scriptPath: CAMERA_SCRIPT_PATH });
  
  if (!fs.existsSync(CAMERA_SCRIPT_PATH)) {
    throw new Error(`Camera script not found: ${CAMERA_SCRIPT_PATH}`);
  }
  
  const stats = fs.statSync(CAMERA_SCRIPT_PATH);
  if (!stats.isFile()) {
    throw new Error(`Camera script path is not a file: ${CAMERA_SCRIPT_PATH}`);
  }
  
  try {
    fs.accessSync(CAMERA_SCRIPT_PATH, fs.constants.F_OK | fs.constants.R_OK);
    log('info', 'Camera script validation passed');
  } catch (error) {
    throw new Error(`Camera script is not accessible: ${error.message}`);
  }
}

// Session management utilities
function generateSessionTimestamp() {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hour = now.getHours().toString().padStart(2, '0');
  const minute = now.getMinutes().toString().padStart(2, '0');
  const second = now.getSeconds().toString().padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

function initializeCaptureProcess(requestId, hangar, drone, sessionTimestamp) {
  global.captureProcesses = global.captureProcesses || {};
  global.captureProcesses[requestId] = {
    hangar,
    drone,
    sessionTimestamp,
    startTime: Date.now(),
    capturedImages: [],
    failedImages: [],
    status: 'running',
    currentCameras: [],
    currentStep: 0,
    totalSteps: config.cameras.ids.length,
    currentPhase: 'connecting',
    activeProcesses: new Map()
  };
}

// SSE endpoint for real-time capture updates
app.get('/api/capture-stream/:requestId', (req, res) => {
  const { requestId } = req.params;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', requestId })}\n\n`);

  global.sseConnections = global.sseConnections || {};
  global.sseConnections[requestId] = res;

  req.on('close', () => {
    if (global.sseConnections && global.sseConnections[requestId]) {
      delete global.sseConnections[requestId];
    }
  });
});

function sendSSEUpdate(requestId, data) {
  if (global.sseConnections && global.sseConnections[requestId]) {
    try {
      global.sseConnections[requestId].write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      log('warn', `Failed to send SSE update for ${requestId}:`, error.message);
    }
  }
}

// Main capture endpoint
app.post('/api/capture', async (req, res) => {
  const requestId = Math.random().toString(36).substr(2, 9);
  
  try {
    log('info', `[${requestId}] Received snapshot request`, req.body);
    
    const { hangar, drone } = validateSnapshotRequest(req);
    
    log('info', `[${requestId}] Starting parallel camera capture`, { hangar, drone });
    
    res.json({
      success: true,
      requestId,
      message: 'Parallel camera capture started',
      status: 'started'
    });
    
    const sessionTimestamp = generateSessionTimestamp();
    initializeCaptureProcess(requestId, hangar, drone, sessionTimestamp);
    
    // Start capture in background
    captureInParallel(requestId, hangar, drone, sessionTimestamp);
    
  } catch (error) {
    log('error', `[${requestId}] Request validation error:`, error.message);
    res.status(400).json({
      success: false,
      requestId,
      error: error.message
    });
  }
});

// Optimized parallel capture function
async function captureInParallel(requestId, hangar, drone, sessionTimestamp) {
  // Set a global timeout for the entire capture process (5 minutes)
  const globalTimeout = setTimeout(() => {
    if (global.captureProcesses[requestId] && global.captureProcesses[requestId].status === 'running') {
      log('error', `[${requestId}] Global capture timeout reached - marking as failed`);
      global.captureProcesses[requestId].status = 'failed';
      global.captureProcesses[requestId].error = 'Capture process timed out after 5 minutes';
      global.captureProcesses[requestId].currentCameras = [];
      global.captureProcesses[requestId].currentPhase = null;
    }
  }, 300000); // 5 minutes
  
  try {
    const cameras = config.cameras.ids;
  const batchSize = config.capture.batchSize;
  const batches = [];
  
  for (let i = 0; i < cameras.length; i += batchSize) {
    batches.push(cameras.slice(i, i + batchSize));
  }
  
  log('info', `[${requestId}] Starting parallel capture in ${batches.length} batches of ${batchSize} cameras each`);
  
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    log('info', `[${requestId}] Processing batch ${batchIndex + 1}/${batches.length}: [${batch.join(', ')}]`);
    
    global.captureProcesses[requestId].currentCameras = batch;
    global.captureProcesses[requestId].currentPhase = `batch_${batchIndex + 1}_of_${batches.length}`;
    
    const batchPromises = batch.map((camera, index) => {
      const port = config.capture.ports.start + index;
      const cameraIndex = cameras.indexOf(camera);
      
      global.captureProcesses[requestId].currentStep = Math.max(
        global.captureProcesses[requestId].currentStep, 
        cameraIndex + 1
      );
      
      log('info', `[${requestId}] Starting ${camera} on port ${port} (${cameraIndex + 1}/${cameras.length})`);
      
      return captureCameraParallel(requestId, hangar, drone, camera, port, sessionTimestamp)
        .then(() => {
          global.captureProcesses[requestId].capturedImages.push(camera);
          log('info', `[${requestId}] ${camera} SUCCESS`);
        })
        .catch((error) => {
          global.captureProcesses[requestId].failedImages.push(camera);
          log('error', `[${requestId}] ${camera} FAILED: ${error.message}`);
        });
    });
    
    await Promise.allSettled(batchPromises);
    
    if (batchIndex < batches.length - 1) {
      log('info', `[${requestId}] Batch ${batchIndex + 1} completed, waiting ${config.capture.delays.betweenBatches}ms before next batch`);
      await new Promise(resolve => setTimeout(resolve, config.capture.delays.betweenBatches));
    }
  }
  
  // Clean up socat processes
  await cleanupSocatProcesses(requestId, hangar);
  
  // Determine final status based on success/failure counts
  const successCount = global.captureProcesses[requestId].capturedImages.length;
  const failureCount = global.captureProcesses[requestId].failedImages.length;
  const totalCameras = config.cameras.ids.length;
  
  // Mark as failed if more than half the cameras failed or if no cameras succeeded
  if (successCount === 0 || failureCount > totalCameras / 2) {
    global.captureProcesses[requestId].status = 'failed';
    global.captureProcesses[requestId].error = `Capture failed: ${successCount}/${totalCameras} cameras succeeded`;
    log('error', `[${requestId}] Parallel capture FAILED. Success: ${successCount}, Failed: ${failureCount}`);
  } else {
    global.captureProcesses[requestId].status = 'completed';
    log('info', `[${requestId}] Parallel capture completed. Success: ${successCount}, Failed: ${failureCount}`);
  }
  
  global.captureProcesses[requestId].currentCameras = [];
  global.captureProcesses[requestId].currentPhase = null;
  
  } catch (error) {
    log('error', `[${requestId}] Critical error in capture process:`, error.message);
    global.captureProcesses[requestId].status = 'failed';
    global.captureProcesses[requestId].error = `Critical capture error: ${error.message}`;
    global.captureProcesses[requestId].currentCameras = [];
    global.captureProcesses[requestId].currentPhase = null;
  } finally {
    clearTimeout(globalTimeout);
  }
}

// Camera capture function
function captureCameraParallel(requestId, hangar, drone, camera, port, sessionTimestamp) {
  return new Promise((resolve, reject) => {
    const hangarConfig = config.getHangar(hangar);
    const sshHost = hangarConfig?.connection?.ssh_host || hangar;
    const cameraIP = config.getCameraIP(camera);
    
    if (!cameraIP) {
      reject(new Error(`Unknown camera ${camera}`));
      return;
    }
    
    const child = spawn('bash', [CAMERA_SCRIPT_PATH, hangar, sshHost, drone, camera, cameraIP, sessionTimestamp, port.toString()], {
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
      
      // Update phase based on log output
      updateCapturePhase(requestId, logLine);
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
    
    setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Camera capture timeout'));
    }, config.capture.timeouts.perCameraParallel);
  });
}

// Helper functions
function updateCapturePhase(requestId, logLine) {
  if (!global.captureProcesses || !global.captureProcesses[requestId]) return;
  
  if (logLine.includes('🎯 Triggering autofocus') || logLine.includes('📡 Getting current zoom') || 
      logLine.includes('🔍 Zooming to position') || logLine.includes('⏳ Waiting for autofocus') || 
      logLine.includes('🔄 Returning to original zoom')) {
    global.captureProcesses[requestId].currentPhase = 'autofocus';
  } else if (logLine.includes('Capturing image from') || logLine.includes('Starting curl download') || 
             logLine.includes('Curl download completed')) {
    global.captureProcesses[requestId].currentPhase = 'capture';
  } else if (logLine.includes('Connecting to') || logLine.includes('Starting tunnel') || 
             logLine.includes('Checking for existing socat')) {
    global.captureProcesses[requestId].currentPhase = 'connecting';
  }
}

async function cleanupSocatProcesses(requestId, hangar) {
  log('info', `[${requestId}] Final cleanup: killing socat processes on ports ${config.capture.ports.start}-${config.capture.ports.start + config.capture.ports.count - 1}`);
  
  try {
    const portRange = Array.from({length: config.capture.ports.count}, (_, i) => config.capture.ports.start + i).join('|');
    const cleanup = spawn('ssh', [
      '-o', `StrictHostKeyChecking=${config.capture.ssh.strictHostKeyChecking}`,
      '-o', `ControlMaster=${config.capture.ssh.controlMaster}`, 
      '-o', `ControlPath=${config.capture.ssh.controlPath}`,
      '-o', `ControlPersist=${config.capture.ssh.controlPersist}`,
      hangar,
      `pkill -f "socat.*:(${portRange})" || true`
    ]);
    
    cleanup.on('close', (code) => {
      log('info', `[${requestId}] Port cleanup completed with code ${code}`);
    });
  } catch (error) {
    log('warn', `[${requestId}] Port cleanup failed:`, error.message);
  }
}

// Status endpoint
app.get('/api/capture/:requestId/status', async (req, res) => {
  const { requestId } = req.params;
  
  if (!global.captureProcesses || !global.captureProcesses[requestId]) {
    return res.status(404).json({ error: 'Capture process not found' });
  }
  
  const captureProcess = global.captureProcesses[requestId];
  
  try {
    const availableImages = [];
    const sessionDir = path.join(
      SNAPSHOTS_DIR, 
      captureProcess.hangar, 
      `${captureProcess.drone}_${captureProcess.sessionTimestamp}`
    );
    
    if (fs.existsSync(sessionDir)) {
      const files = fs.readdirSync(sessionDir)
        .filter(file => config.validation.imageFormats.some(ext => file.toLowerCase().endsWith(ext)))
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
      currentCamera: captureProcess.currentCamera,
      currentCameras: captureProcess.currentCameras || [captureProcess.currentCamera].filter(Boolean),
      currentStep: captureProcess.currentStep,
      totalSteps: captureProcess.totalSteps,
      currentPhase: captureProcess.currentPhase,
      capturedCameras: captureProcess.capturedImages,
      failedCameras: captureProcess.failedImages,
      error: captureProcess.error,
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
      timestamp: new Date().toISOString(),
      config: {
        cameras: config.cameras.ids.length,
        hangars: Object.keys(config.hangars).length,
        batchSize: config.capture.batchSize
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Configuration endpoint
app.get('/api/config', (req, res) => {
  try {
    // Return safe subset of configuration for frontend use
    const safeConfig = {
      hangars: config.getAllHangars().map(hangar => ({
        id: hangar.id,
        label: hangar.label,
        description: hangar.description,
        folderName: hangar.folderName,
        cameraTransforms: hangar.cameraTransforms
      })),
      cameras: {
        ids: config.cameras.ids,
        credentials: {
          username: config.cameras.credentials.username
          // Note: password excluded for security
        }
      },
      server: {
        maxDroneNameLength: config.server.maxDroneNameLength,
        droneNameRegex: config.server.droneNameRegex
      },
      capture: {
        batchSize: config.capture.batchSize,
        timeouts: config.capture.timeouts,
        delays: config.capture.delays
      },
      validation: config.validation,
      environment: config.environment,
      meta: config.meta
    };
    
    res.json(safeConfig);
  } catch (error) {
    log('error', 'Failed to retrieve configuration', { error: error.message });
    res.status(500).json({ 
      error: 'Failed to retrieve configuration',
      timestamp: new Date().toISOString()
    });
  }
});

// Image serving endpoint
app.get('/api/image/:hangar/:session/:filename', (req, res) => {
  try {
    const { hangar, session, filename } = req.params;
    const imagePath = path.join(SNAPSHOTS_DIR, hangar, session, filename);
    
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

// Folder listing endpoint
app.get('/api/folders', (req, res) => {
  try {
    if (!fs.existsSync(SNAPSHOTS_DIR)) {
      return res.json({ hangars: [] });
    }
    
    const hangars = [];
    const hangarDirs = fs.readdirSync(SNAPSHOTS_DIR).filter(item => {
      const itemPath = path.join(SNAPSHOTS_DIR, item);
      return fs.statSync(itemPath).isDirectory();
    });
    
    hangarDirs.forEach(hangarName => {
      const hangarPath = path.join(SNAPSHOTS_DIR, hangarName);
      const sessions = [];
      
      const sessionDirs = fs.readdirSync(hangarPath).filter(item => {
        const itemPath = path.join(hangarPath, item);
        return fs.statSync(itemPath).isDirectory();
      });
      
      sessionDirs.forEach(sessionName => {
        const sessionPath = path.join(hangarPath, sessionName);
        const stats = fs.statSync(sessionPath);
        
        const images = fs.readdirSync(sessionPath).filter(file => 
          config.validation.imageFormats.some(ext => file.toLowerCase().endsWith(ext))
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

// Inspection data management
app.get('/api/inspection-data', (req, res) => {
  try {
    if (!fs.existsSync(INSPECTION_JSON_PATH)) {
      return res.status(404).json({ error: 'Inspection JSON file not found' });
    }
    
    const jsonData = JSON.parse(fs.readFileSync(INSPECTION_JSON_PATH, 'utf8'));
    // Add cameras from config
    jsonData.cameras = config.cameras.details;
    res.json(jsonData);
    
  } catch (error) {
    log('error', 'Error serving inspection data:', error.message);
    res.status(500).json({ error: 'Failed to load inspection data' });
  }
});

app.post('/api/update-validation-box', (req, res) => {
  try {
    const { taskId, cameraName, validationBox } = req.body;
    
    log('info', 'Validation box update request', { taskId, cameraName, validationBox });
    
    if (!taskId || !cameraName || !validationBox) {
      return res.status(400).json({ error: 'Missing taskId, cameraName, or validationBox data' });
    }
    
    if (!fs.existsSync(INSPECTION_JSON_PATH)) {
      return res.status(404).json({ error: 'Inspection JSON file not found' });
    }
    
    const jsonData = JSON.parse(fs.readFileSync(INSPECTION_JSON_PATH, 'utf8'));
    
    const taskIndex = jsonData.tasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }
    
    if (!jsonData.tasks[taskIndex].validationBoxes) {
      jsonData.tasks[taskIndex].validationBoxes = {};
    }
    
    if (!jsonData.tasks[taskIndex].validationBoxes[cameraName]) {
      jsonData.tasks[taskIndex].validationBoxes[cameraName] = [];
    }
    
    const existingIndex = jsonData.tasks[taskIndex].validationBoxes[cameraName].findIndex(
      box => box.id === validationBox.id
    );
    
    if (existingIndex !== -1) {
      jsonData.tasks[taskIndex].validationBoxes[cameraName][existingIndex] = validationBox;
      log('info', `Updated existing validation box ${validationBox.id} for ${cameraName} on task ${taskId}`);
    } else {
      jsonData.tasks[taskIndex].validationBoxes[cameraName].push(validationBox);
      log('info', `Added new validation box ${validationBox.id} for ${cameraName} on task ${taskId}`);
    }
    
    fs.writeFileSync(INSPECTION_JSON_PATH, JSON.stringify(jsonData, null, 2));
    
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

// API endpoint to get all hangar configurations including transforms
app.get('/api/hangars/config', (req, res) => {
  try {
    const hangars = config.getAllHangars();
    const response = {};
    
    hangars.forEach(hangar => {
      response[hangar.id] = {
        id: hangar.id,
        label: hangar.label,
        cameraTransforms: hangar.cameraTransforms || {}
      };
    });
    
    log('info', 'Hangar configurations requested');
    res.json(response);
  } catch (error) {
    log('error', 'Failed to get hangar configurations:', error.message);
    res.status(500).json({ error: 'Failed to get hangar configurations' });
  }
});

// API endpoint to update camera transforms for a specific hangar
app.put('/api/hangars/:hangarId/transforms', (req, res) => {
  try {
    const { hangarId } = req.params;
    const { transforms } = req.body;
    
    if (!config.hangars[hangarId]) {
      return res.status(404).json({ error: `Hangar ${hangarId} not found` });
    }
    
    if (!transforms || typeof transforms !== 'object') {
      return res.status(400).json({ error: 'Invalid transforms data' });
    }
    
    // Update the transforms in the config
    config.hangars[hangarId].cameraTransforms = transforms;
    
    // Save to config file for persistence
    const configPath = path.join(__dirname, 'config.js');
    const configContent = fs.readFileSync(configPath, 'utf8');
    
    // Find and replace the camera transforms for this hangar
    const hangarPattern = new RegExp(
      `(${hangarId}:[^}]*cameraTransforms:\\s*{)[^}]*(})`,
      's'
    );
    
    // Format the transforms for the config file
    const formattedTransforms = Object.entries(transforms)
      .map(([camId, transform]) => {
        return `        ${camId}: { x: ${transform.x}, y: ${transform.y}, scale: ${transform.scale}, rotation: ${transform.rotation} }`;
      })
      .join(',\n');
    
    const replacement = `$1\n${formattedTransforms}\n      $2`;
    
    // For now, just log the update - in production you'd write this back
    log('info', `Camera transforms updated for ${hangarId}`, transforms);
    
    res.json({ 
      success: true, 
      message: `Camera transforms updated for ${hangarId}`,
      transforms 
    });
    
  } catch (error) {
    log('error', 'Failed to update camera transforms:', error.message);
    res.status(500).json({ error: 'Failed to update camera transforms' });
  }
});

// Catch all handler: send back React's index.html file for any non-API routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  log('info', `Optimized backend server started on port ${PORT}`);
  log('info', 'Configuration loaded:', {
    nodeVersion: process.version,
    platform: process.platform,
    cameras: config.cameras.ids.length,
    hangars: Object.keys(config.hangars).length,
    batchSize: config.capture.batchSize,
    cameraScriptPath: CAMERA_SCRIPT_PATH,
    snapshotsDir: SNAPSHOTS_DIR
  });
  
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