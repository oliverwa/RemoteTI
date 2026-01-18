const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');

// Try to load dotenv if available (for development)
try {
  require('dotenv').config();
} catch (e) {
  console.log('dotenv not available, using environment variables directly');
}

const app = express();

// Load unified configuration
const config = require('./config.js');
const PORT = process.env.PORT || config.server.port;

// Load authentication module - try full version first, fall back to simple
let auth;
try {
  auth = require('./server/auth.js');
  console.log('Using full authentication module with bcrypt/jwt');
} catch (e) {
  console.log('bcrypt/jwt not available, using simplified authentication');
  auth = require('./server/auth-simple.js');
}

// Derived configurations
const BASE_DIR = config.paths.base === '.' ? __dirname : config.paths.base;
const CAMERA_SCRIPT_PATH = path.join(BASE_DIR, config.paths.scripts.cameraFetch);
const INSPECTION_JSON_PATH = path.join(BASE_DIR, config.paths.data.inspectionJson);
const SNAPSHOTS_DIR = config.paths.snapshotsAbsolute || path.join(process.env.HOME, config.paths.snapshots);

// Middleware
app.use(cors());
app.use(express.json());
// Serve public directory for additional static files  
app.use('/public', express.static('public'));

// Serve static files from build directory (but don't catch all routes yet)
app.use('/static', express.static(path.join(__dirname, 'build/static')));

// Initialize authentication system
auth.initializeUsersDB().catch(console.error);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication routes
app.post('/api/auth/login', auth.handleLogin);
app.post('/api/auth/validate', auth.handleValidateToken);
app.post('/api/auth/change-password', auth.authenticateToken, auth.handleChangePassword);

// User management routes (admin only)
app.get('/api/users', auth.authenticateToken, auth.handleGetUsers);
app.post('/api/users', auth.authenticateToken, auth.handleCreateUser);
app.put('/api/users/:id', auth.authenticateToken, auth.handleUpdateUser);
app.delete('/api/users/:id', auth.authenticateToken, auth.handleDeleteUser);
app.put('/api/users/:id/password', auth.authenticateToken, auth.handleChangeUserPassword);

// Hangar management routes
const hangars = require('./server/hangars');
app.get('/api/hangars', hangars.getHangars); // Public read
app.get('/api/hangars/:id', hangars.getHangar); // Public read
app.post('/api/hangars', auth.authenticateToken, hangars.createHangar);
app.put('/api/hangars/:id', auth.authenticateToken, hangars.updateHangar);
app.delete('/api/hangars/:id', auth.authenticateToken, hangars.deleteHangar);

// Drone management routes
const drones = require('./server/drones');
app.get('/api/drones', drones.getDrones); // Public read
app.get('/api/drones/:id', drones.getDrone); // Public read
app.post('/api/drones', auth.authenticateToken, drones.createDrone);
app.put('/api/drones/:id', auth.authenticateToken, drones.updateDrone);
app.delete('/api/drones/:id', auth.authenticateToken, drones.deleteDrone);

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

function initializeCaptureProcess(requestId, hangar, drone, sessionFolder, inspectionType) {
  global.captureProcesses = global.captureProcesses || {};
  global.captureProcesses[requestId] = {
    hangar,
    drone,
    sessionFolder,
    inspectionType,
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
    
    const { hangar, drone, inspectionType = 'remote', sessionName: providedSessionName } = req.body;
    validateSnapshotRequest(req);
    
    log('info', `[${requestId}] Starting parallel camera capture`, { hangar, drone, inspectionType });
    
    res.json({
      success: true,
      requestId,
      message: 'Parallel camera capture started',
      status: 'started'
    });
    
    const sessionTimestamp = generateSessionTimestamp();
    const cleanType = inspectionType.replace('-ti-inspection', '').replace(/-/g, '_');
    // Use provided session name or generate one
    const sessionName = providedSessionName || `${cleanType}_${drone}_${sessionTimestamp}`;
    const sessionFolder = `${hangar}/${sessionName}`;
    
    // Create session directory and copy inspection template for remote inspections too
    const sessionPath = path.join(SNAPSHOTS_DIR, sessionFolder);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }
    
    // Copy the inspection template JSON
    const templateFile = path.join(BASE_DIR, 'data', 'templates', `${inspectionType}.json`);
    // Use session name for the filename if provided
    const destinationFile = path.join(sessionPath, providedSessionName ? `${sessionName}_inspection.json` : `${cleanType}_${drone}_${sessionTimestamp}_inspection.json`);
    
    if (fs.existsSync(templateFile)) {
      const templateData = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
      
      // Add session metadata
      templateData.sessionInfo = {
        inspectionType: inspectionType,
        hangar: hangar,
        drone: drone,
        sessionFolder: sessionFolder,
        sessionName: sessionName,
        createdAt: new Date().toISOString(),
        timestamp: sessionTimestamp
      };
      
      fs.writeFileSync(destinationFile, JSON.stringify(templateData, null, 2));
      log('info', `Created inspection file: ${destinationFile}`);
    }
    
    initializeCaptureProcess(requestId, hangar, drone, sessionFolder, inspectionType);
    
    // Start capture in background
    captureInParallel(requestId, hangar, drone, sessionFolder);
    
  } catch (error) {
    log('error', `[${requestId}] Request validation error:`, error.message);
    res.status(400).json({
      success: false,
      requestId,
      error: error.message
    });
  }
});

// Function to turn on hangar lights
async function turnOnHangarLights(hangar) {
  const hangarConfig = config.getHangar(hangar);
  
  if (!hangarConfig || !hangarConfig.lights || !hangarConfig.lights.enabled) {
    log('info', `Lights not configured or disabled for hangar: ${hangar}`);
    return false;
  }
  
  const { endpoint, username, password, waitTime } = hangarConfig.lights;
  
  return new Promise((resolve) => {
    log('info', `Turning on lights for hangar: ${hangar}`);
    
    const url = new URL(endpoint);
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`
      },
      rejectUnauthorized: false // Allow self-signed certificates
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          log('info', `Lights turned on successfully for ${hangar}, waiting ${waitTime}s`);
          setTimeout(() => resolve(true), waitTime * 1000);
        } else {
          log('warn', `Failed to turn on lights for ${hangar}: HTTP ${res.statusCode}`);
          resolve(false);
        }
      });
    });
    
    req.on('error', (error) => {
      log('error', `Error turning on lights for ${hangar}: ${error.message}`);
      resolve(false);
    });
    
    req.setTimeout(5000, () => {
      req.destroy();
      log('error', `Timeout turning on lights for ${hangar}`);
      resolve(false);
    });
    
    req.end();
  });
}

// Optimized parallel capture function
async function captureInParallel(requestId, hangar, drone, sessionFolder) {
  // Check if camera script exists
  if (!fs.existsSync(CAMERA_SCRIPT_PATH)) {
    log('error', `[${requestId}] Camera script not found at ${CAMERA_SCRIPT_PATH}`);
    
    // Update global capture process to indicate failure
    if (global.captureProcesses[requestId]) {
      global.captureProcesses[requestId].status = 'failed';
      global.captureProcesses[requestId].error = 'Camera capture system unavailable';
      global.captureProcesses[requestId].failedImages = CAMERAS.map(cam => ({
        camera: cam,
        error: 'Camera script not found'
      }));
    }
    
    // Send failure notification
    sendSSEUpdate(requestId, {
      type: 'capture-failed',
      requestId,
      error: 'Camera capture system is not available. Please ensure the camera system is properly installed.',
      details: `Camera script not found at: ${CAMERA_SCRIPT_PATH}`
    });
    
    return;
  }
  
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
    // Turn on hangar lights before starting capture
    await turnOnHangarLights(hangar);
    
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
      
      return captureCameraParallel(requestId, hangar, drone, camera, port, sessionFolder)
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
    
    // Send failure notification to frontend
    sendSSEUpdate(requestId, {
      type: 'capture-failed',
      requestId,
      error: `Capture failed: Only ${successCount} out of ${totalCameras} cameras succeeded`,
      successCount,
      failureCount,
      totalCameras,
      failedCameras: global.captureProcesses[requestId].failedImages
    });
  } else {
    global.captureProcesses[requestId].status = 'completed';
    log('info', `[${requestId}] Parallel capture completed. Success: ${successCount}, Failed: ${failureCount}`);
    
    // Send completion notification to frontend
    sendSSEUpdate(requestId, {
      type: 'capture-complete',
      requestId,
      sessionFolder: global.captureProcesses[requestId].sessionFolder,
      successCount,
      failureCount,
      totalCameras,
      capturedImages: global.captureProcesses[requestId].capturedImages,
      failedImages: global.captureProcesses[requestId].failedImages
    });
  }
  
  global.captureProcesses[requestId].currentCameras = [];
  global.captureProcesses[requestId].currentPhase = null;
  
  } catch (error) {
    log('error', `[${requestId}] Critical error in capture process:`, error.message);
    global.captureProcesses[requestId].status = 'failed';
    global.captureProcesses[requestId].error = `Critical capture error: ${error.message}`;
    global.captureProcesses[requestId].currentCameras = [];
    global.captureProcesses[requestId].currentPhase = null;
    
    // Send critical error notification to frontend
    sendSSEUpdate(requestId, {
      type: 'capture-failed',
      requestId,
      error: `Critical error during capture: ${error.message}`,
      critical: true
    });
  } finally {
    clearTimeout(globalTimeout);
  }
}

// Camera capture function
function captureCameraParallel(requestId, hangar, drone, camera, port, sessionFolder) {
  return new Promise((resolve, reject) => {
    const hangarConfig = config.getHangar(hangar);
    const sshHost = hangarConfig?.connection?.ssh_host || hangar;
    const cameraIP = config.getCameraIP(camera);
    
    if (!cameraIP) {
      reject(new Error(`Unknown camera ${camera}`));
      return;
    }
    
    const child = spawn('bash', [CAMERA_SCRIPT_PATH, sshHost, drone, camera, cameraIP, sessionFolder, port.toString()], {
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
// Health check endpoint - simple check that server is running
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    server: 'running'
  });
});

// Create inspection session for onsite/extended/service inspections
app.post('/api/create-inspection-session', async (req, res) => {
  const { inspectionType, hangar, drone, sessionFolder } = req.body;
  
  try {
    // Create the session folder
    const sessionPath = path.join(SNAPSHOTS_DIR, sessionFolder);
    
    // Create directory
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }
    
    // Copy the template JSON file to the session folder
    const templateFile = path.join(BASE_DIR, 'data', 'templates', `${inspectionType}.json`);
    // Extract just the folder name from the full path for the filename
    const folderName = sessionFolder.split('/').pop();
    const destinationFile = path.join(sessionPath, `${folderName}_inspection.json`);
    
    if (fs.existsSync(templateFile)) {
      // Read template
      const templateData = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
      
      // Add session metadata
      templateData.sessionInfo = {
        inspectionType: inspectionType,
        hangar: hangar,
        drone: drone,
        sessionFolder: sessionFolder,
        sessionName: folderName,
        createdAt: new Date().toISOString()
      };
      
      // Write to session folder
      fs.writeFileSync(destinationFile, JSON.stringify(templateData, null, 2));
      log('info', `Created inspection file: ${destinationFile}`);
    }
    
    res.json({ 
      success: true, 
      sessionPath: sessionPath,
      sessionFolder: sessionFolder 
    });
  } catch (error) {
    log('error', 'Error creating inspection session:', error);
    res.status(500).json({ error: error.message });
  }
});

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
      return res.json({ 
        hangars: [],
        categorized: {
          remote: [],
          onsite: [],
          extended: [],
          service: []
        }
      });
    }
    
    const hangars = [];
    const categorized = {
      remote: [],
      onsite: [],
      extended: [],
      service: [],
      basic: []
    };
    
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
        
        const files = fs.readdirSync(sessionPath);
        const images = files.filter(file => 
          config.validation.imageFormats.some(ext => file.toLowerCase().endsWith(ext))
        );
        
        // Include ALL sessions, even without images
        if (true) {
          // Check for inspection JSON and get status
          const inspectionFile = files.find(f => f.endsWith('_inspection.json'));
          let inspectionStatus = null;
          let completedTasks = 0;
          let totalTasks = 0;
          let inspectionType = null;
          let detectedCategory = 'unknown';
          
          // ALWAYS check session name FIRST for most reliable detection
          const nameLower = sessionName.toLowerCase();
          const firstPart = sessionName.split('_')[0].toLowerCase();
          
          // Check for new remote inspection types first (they contain 'remote' but have prefixes)
          if (nameLower.startsWith('initial_remote_')) {
            detectedCategory = 'remote';
          } else if (nameLower.startsWith('full_remote_')) {
            detectedCategory = 'remote';
          } else if (firstPart === 'remote' || nameLower.startsWith('remote_')) {
            detectedCategory = 'remote';
          } else if (firstPart === 'onsite' || nameLower.startsWith('onsite_')) {
            detectedCategory = 'onsite';
          } else if (firstPart === 'extended' || nameLower.startsWith('extended_')) {
            detectedCategory = 'extended';
          } else if (firstPart === 'service' || nameLower.startsWith('service_')) {
            detectedCategory = 'service';
          } else if (firstPart === 'basic' || nameLower.startsWith('basic_')) {
            detectedCategory = 'basic';
          } else {
            // Default to remote for legacy sessions without type prefix
            detectedCategory = 'remote';
          }
          
          // Read inspection file for additional metadata (but don't override category)
          if (inspectionFile) {
            try {
              const inspectionPath = path.join(sessionPath, inspectionFile);
              const inspectionData = JSON.parse(fs.readFileSync(inspectionPath, 'utf8'));
              
              inspectionType = inspectionData.type || 'Unknown';
              
              if (inspectionData.tasks) {
                totalTasks = inspectionData.tasks.length;
                completedTasks = inspectionData.tasks.filter(t => 
                  t.status === 'pass' || t.status === 'fail' || t.status === 'na'
                ).length;
              }
              
              inspectionStatus = inspectionData.completionStatus?.status || 
                (completedTasks === 0 ? 'not_started' : 
                 completedTasks === totalTasks ? 'completed' : 'in_progress');
            } catch (err) {
              console.error('Error reading inspection file:', err);
            }
          }
          
          const sessionData = {
            id: sessionName,
            name: sessionName,
            path: sessionPath,
            created: stats.mtime,
            imageCount: images.length,
            images: images,
            hasInspection: !!inspectionFile,
            inspectionType: inspectionType,
            inspectionStatus: inspectionStatus,
            inspectionCategory: detectedCategory,
            hangarId: hangarName,
            hangarName: hangarName,
            inspectionProgress: inspectionFile ? {
              completed: completedTasks,
              total: totalTasks,
              percentage: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
            } : null
          };
          
          sessions.push(sessionData);
          
          // Add to categorized structure
          if (detectedCategory !== 'unknown' && categorized[detectedCategory]) {
            categorized[detectedCategory].push(sessionData);
          }
        } // End of if (true) - processing all sessions
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
    
    // Sort categorized sessions by date
    Object.keys(categorized).forEach(category => {
      categorized[category].sort((a, b) => new Date(b.created) - new Date(a.created));
    });
    
    log('info', `Found ${hangars.length} hangars with ${hangars.reduce((total, h) => total + h.sessions.length, 0)} sessions`);
    log('info', 'Sessions by category:', {
      remote: categorized.remote.length,
      onsite: categorized.onsite.length,
      extended: categorized.extended.length,
      service: categorized.service.length,
      basic: categorized.basic.length
    });
    
    res.json({ hangars, categorized });
    
  } catch (error) {
    log('error', 'Error listing folders:', error.message);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

// List available inspection types
app.get('/api/inspection-types', (req, res) => {
  try {
    const templatesDir = path.join(BASE_DIR, 'data', 'templates');
    
    if (!fs.existsSync(templatesDir)) {
      return res.json([]);
    }
    
    const files = fs.readdirSync(templatesDir).filter(f => 
      f.endsWith('.json') && 
      !f.includes('alarm_reset') // Exclude the alarm_reset template
    );
    
    const inspectionTypes = files.map(file => {
      const filePath = path.join(templatesDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const taskCount = content.tasks ? content.tasks.length : 0;
      
      // Handle different naming patterns
      let type, name, mode;
      
      if (file === 'initial-remote-ti-inspection.json') {
        type = 'initial-remote';
        name = 'Initial Remote TI';
        mode = 'remote';
      } else if (file === 'full-remote-ti-inspection.json') {
        type = 'full-remote';
        name = 'Full Remote TI';
        mode = 'remote';
      } else if (file.includes('-ti-inspection')) {
        type = file.replace('-ti-inspection.json', '');
        name = type.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ') + ' TI Inspection';
        mode = ['onsite', 'basic'].includes(type) ? 'onsite' : 'remote';
      } else if (file.includes('-inspection')) {
        type = file.replace('-inspection.json', '');
        name = type.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ') + ' Inspection';
        mode = 'onsite';
      } else {
        type = file.replace('.json', '');
        name = type.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        mode = 'remote';
      }
      
      return {
        file: file.replace('.json', ''),
        type: type,
        name: name,
        description: content.description || `${name} technical inspection`,
        mode: mode,
        taskCount: taskCount
      };
    });
    
    res.json(inspectionTypes);
  } catch (error) {
    log('error', 'Error listing inspection types:', error.message);
    res.status(500).json({ error: 'Failed to list inspection types' });
  }
});

// Get latest alarm session for a hangar
app.get('/api/alarm-session/:hangarId', async (req, res) => {
  try {
    const { hangarId } = req.params;
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    
    if (!fs.existsSync(alarmsDir)) {
      return res.json({ session: null });
    }
    
    // Find all alarm files for this hangar
    const files = fs.readdirSync(alarmsDir)
      .filter(f => f.startsWith(`alarm_${hangarId}_`) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a)); // Sort newest first
    
    if (files.length === 0) {
      return res.json({ session: null });
    }
    
    // Get the most recent alarm
    const latestFile = files[0];
    const sessionPath = path.join(alarmsDir, latestFile);
    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    
    res.json({ 
      session: sessionData,
      filename: latestFile 
    });
    
  } catch (error) {
    log('error', 'Error getting alarm session:', error.message);
    res.status(500).json({ error: 'Failed to get alarm session' });
  }
});

// Generate Initial RTI inspection for alarm workflow
app.post('/api/alarm-session/:hangarId/generate-initial-rti', async (req, res) => {
  try {
    const { hangarId } = req.params;
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    
    // Find latest alarm session for this hangar
    const files = fs.readdirSync(alarmsDir)
      .filter(f => f.startsWith(`alarm_${hangarId}_`) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'No alarm session found' });
    }
    
    const latestFile = files[0];
    const sessionPath = path.join(alarmsDir, latestFile);
    const alarmSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    
    // Generate Initial RTI session
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');
    const second = now.getSeconds().toString().padStart(2, '0');
    const timestamp = `${year}${month}${day}_${hour}${minute}${second}`;
    
    const droneId = alarmSession.droneId || 'unknown';
    const sessionName = `initial_remote_${droneId}_${timestamp}`;
    const inspectionFolder = `${hangarId}/${sessionName}`;
    const inspectionPath = path.join(SNAPSHOTS_DIR, inspectionFolder);
    
    // Create inspection directory
    if (!fs.existsSync(inspectionPath)) {
      fs.mkdirSync(inspectionPath, { recursive: true });
    }
    
    // Copy Initial RTI template
    const templateFile = path.join(BASE_DIR, 'data', 'templates', 'initial-remote-ti-inspection.json');
    const destinationFile = path.join(inspectionPath, `${sessionName}_inspection.json`);
    
    if (fs.existsSync(templateFile)) {
      const templateData = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
      
      // Add session metadata
      templateData.sessionInfo = {
        inspectionType: 'initial-remote-ti-inspection',
        hangar: hangarId,
        drone: droneId,
        sessionFolder: inspectionFolder,
        sessionName: sessionName,
        createdAt: now.toISOString(),
        linkedAlarmSession: alarmSession.sessionId
      };
      
      fs.writeFileSync(destinationFile, JSON.stringify(templateData, null, 2));
      log('info', `Created Initial RTI inspection: ${sessionName}`);
    }
    
    // Trigger camera capture for the Initial RTI by calling the existing capture endpoint
    log('info', `Triggering camera capture for Initial RTI: ${sessionName}`);
    
    // Make an internal call to the existing capture endpoint
    // This is a bit ugly but reuses all the existing capture logic
    const http = require('http');
    
    const captureData = JSON.stringify({
      hangar: hangarId,
      drone: droneId,
      inspectionType: 'initial-remote-ti-inspection',
      sessionName: sessionName  // Pass the session name to ensure images go to correct folder
    });
    
    const captureOptions = {
      hostname: 'localhost',
      port: PORT,
      path: '/api/capture',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': captureData.length
      }
    };
    
    const capturePromise = new Promise((resolve, reject) => {
      const captureReq = http.request(captureOptions, (captureRes) => {
        let responseData = '';
        
        captureRes.on('data', (chunk) => {
          responseData += chunk;
        });
        
        captureRes.on('end', () => {
          try {
            const result = JSON.parse(responseData);
            if (result.success) {
              log('info', `Camera capture initiated for Initial RTI with requestId: ${result.requestId}`);
              
              // Wait a bit for the capture to complete (ugly but temporary)
              // The capture process usually takes 10-15 seconds
              setTimeout(() => {
                log('info', `Camera capture should be complete for Initial RTI`);
                resolve(result);
              }, 40000); // Wait 40 seconds for captures to complete
            } else {
              log('error', `Failed to initiate capture: ${responseData}`);
              resolve({ success: false, error: 'Failed to initiate capture' });
            }
          } catch (error) {
            log('error', `Error parsing capture response: ${error.message}`);
            resolve({ success: false, error: error.message });
          }
        });
      });
      
      captureReq.on('error', (error) => {
        log('error', `Error calling capture endpoint: ${error.message}`);
        resolve({ success: false, error: error.message });
      });
      
      captureReq.write(captureData);
      captureReq.end();
    });
    
    // Wait for the capture to complete
    const captureResult = await capturePromise;
    
    if (captureResult.success) {
      log('info', `Camera capture completed for Initial RTI`);
    } else {
      log('warn', `Camera capture failed for Initial RTI: ${captureResult.error}`);
    }
    
    // Update alarm session with inspection ID but keep as in-progress (inspection needs to be performed)
    alarmSession.workflow.phases.initialRTI.inspectionId = sessionName;
    alarmSession.workflow.phases.initialRTI.sessionPath = inspectionFolder;
    // Keep status as 'in-progress' since the inspection still needs to be performed
    // It will be marked as 'completed' when the inspection is actually finished
    alarmSession.inspections.initialRTI = {
      sessionId: sessionName,
      path: inspectionFolder,
      createdAt: now.toISOString()
    };
    
    // Save updated alarm session
    fs.writeFileSync(sessionPath, JSON.stringify(alarmSession, null, 2));
    
    res.json({ 
      success: true,
      inspectionId: sessionName,
      path: inspectionFolder,
      session: alarmSession 
    });
    
  } catch (error) {
    log('error', 'Error generating Initial RTI:', error.message);
    res.status(500).json({ error: 'Failed to generate Initial RTI' });
  }
});

// Update alarm session workflow phase
app.post('/api/alarm-session/:hangarId/update-phase', async (req, res) => {
  try {
    const { hangarId } = req.params;
    const { phase, updates } = req.body;
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    
    // Find latest session for this hangar
    const files = fs.readdirSync(alarmsDir)
      .filter(f => f.startsWith(`alarm_${hangarId}_`) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'No alarm session found' });
    }
    
    const latestFile = files[0];
    const sessionPath = path.join(alarmsDir, latestFile);
    const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    
    // Update the specified phase
    if (sessionData.workflow.phases[phase]) {
      Object.assign(sessionData.workflow.phases[phase], updates);
      
      // Update currentPhase if specified
      if (updates.currentPhase) {
        sessionData.workflow.currentPhase = updates.currentPhase;
      }
    }
    
    // Write back to file
    fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
    
    log('info', `Updated alarm session phase ${phase} for ${hangarId}`);
    
    res.json({ 
      success: true,
      session: sessionData 
    });
    
  } catch (error) {
    log('error', 'Error updating alarm session:', error.message);
    res.status(500).json({ error: 'Failed to update alarm session' });
  }
});

// Create alarm session when flight is triggered
app.post('/api/trigger-alarm', async (req, res) => {
  try {
    const { hangarId, droneId, alarmId } = req.body;
    
    if (!hangarId) {
      return res.status(400).json({ error: 'Hangar ID is required' });
    }
    
    // Generate timestamp for session
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');
    const second = now.getSeconds().toString().padStart(2, '0');
    const timestamp = `${year}${month}${day}_${hour}${minute}${second}`;
    
    // Create session name
    const sessionName = `alarm_${hangarId}_${timestamp}`;
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    const sessionPath = path.join(alarmsDir, `${sessionName}.json`);
    
    // Ensure alarms directory exists
    if (!fs.existsSync(alarmsDir)) {
      fs.mkdirSync(alarmsDir, { recursive: true });
    }
    
    // Read alarm_reset template
    const templatePath = path.join(BASE_DIR, 'data', 'templates', 'alarm_reset.json');
    if (!fs.existsSync(templatePath)) {
      return res.status(500).json({ error: 'Alarm template not found' });
    }
    
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    
    // Update template with session data
    template.sessionId = sessionName;
    template.createdAt = now.toISOString();
    template.hangarId = hangarId;
    template.droneId = droneId || null;
    template.alarmId = alarmId || `ALM-${timestamp}`;
    
    // Initialize workflow phases
    template.workflow.phases.flight.status = 'in-progress';
    template.workflow.phases.flight.startTime = now.toISOString();
    
    // Write session file
    fs.writeFileSync(sessionPath, JSON.stringify(template, null, 2));
    
    log('info', `Created alarm session: ${sessionName}`);
    
    res.json({
      success: true,
      sessionId: sessionName,
      path: sessionPath,
      message: 'Alarm session created successfully'
    });
    
  } catch (error) {
    log('error', 'Error creating alarm session:', error.message);
    res.status(500).json({ error: 'Failed to create alarm session' });
  }
});

// Get specific inspection template
app.get('/api/inspection-data/:type', (req, res) => {
  try {
    const inspectionType = req.params.type;
    const inspectionPath = path.join(BASE_DIR, 'data', 'templates', `${inspectionType}.json`);
    
    if (!fs.existsSync(inspectionPath)) {
      return res.status(404).json({ error: 'Inspection type not found' });
    }
    
    const jsonData = JSON.parse(fs.readFileSync(inspectionPath, 'utf8'));
    // Add cameras from config
    jsonData.cameras = config.cameras.details;
    res.json(jsonData);
    
  } catch (error) {
    log('error', 'Error serving inspection data:', error.message);
    res.status(500).json({ error: 'Failed to load inspection data' });
  }
});

// Get default inspection template (remote-ti-inspection)
app.get('/api/inspection-data', (req, res) => {
  try {
    const inspectionType = 'remote-ti-inspection';
    const inspectionPath = path.join(BASE_DIR, 'data', 'templates', `${inspectionType}.json`);
    
    if (!fs.existsSync(inspectionPath)) {
      return res.status(404).json({ error: 'Default inspection type not found' });
    }
    
    const jsonData = JSON.parse(fs.readFileSync(inspectionPath, 'utf8'));
    // Add cameras from config
    jsonData.cameras = config.cameras.details;
    res.json(jsonData);
  } catch (error) {
    log('error', 'Error serving default inspection data:', error.message);
    res.status(500).json({ error: 'Failed to load default inspection data' });
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

// Catch-all route removed to avoid conflicts with API endpoints on Pi

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

// API endpoint to update inspection task status in remote inspection JSON
// Modified to handle sessionFolder with slashes using regex
app.post(/^\/api\/inspection\/(.+)\/task\/(.+)\/status$/, async (req, res) => {
  try {
    const sessionFolder = req.params[0];  // First capture group
    const taskId = req.params[1];  // Second capture group
    const { status, completedBy, comment } = req.body;
    
    log('info', `Updating task ${taskId} status to ${status} for session ${sessionFolder}`);
    
    // Build the full path to the inspection JSON
    const sessionPath = path.join(SNAPSHOTS_DIR, sessionFolder);
    log('info', `Looking for session at: ${sessionPath}`);
    
    // Check if parent directory exists
    const parentDir = path.dirname(sessionPath);
    if (fs.existsSync(parentDir)) {
      const dirs = fs.readdirSync(parentDir).filter(f => fs.statSync(path.join(parentDir, f)).isDirectory());
      log('info', `Directories in ${parentDir}: ${dirs.join(', ')}`);
    }
    
    if (!fs.existsSync(sessionPath)) {
      log('error', `Session folder not found: ${sessionPath}`);
      // Try to list what IS in the parent directory to debug
      return res.status(404).json({ error: 'Session folder not found' });
    }
    
    const files = fs.readdirSync(sessionPath);
    log('info', `Files in session folder: ${files.join(', ')}`);
    const inspectionFile = files.find(f => f.endsWith('_inspection.json') || f === 'inspection.json');
    
    if (!inspectionFile) {
      log('error', 'No inspection JSON file found in session folder');
      return res.status(404).json({ error: 'Inspection file not found' });
    }
    
    const filePath = path.join(sessionPath, inspectionFile);
    log('info', `Reading inspection file: ${filePath}`);
    const inspectionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Find and update the task
    log('info', `Looking for task with ID: ${taskId}`);
    const task = inspectionData.tasks.find(t => t.id === taskId);
    if (!task) {
      log('error', `Task not found. Available task IDs: ${inspectionData.tasks.map(t => t.id).join(', ')}`);
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Update task completion data
    task.status = status;
    task.completion = {
      completedBy: completedBy || 'Unknown',
      completedAt: new Date().toISOString()
    };
    if (comment) {
      task.comment = comment;
    }
    
    // Update overall completion status
    const allTasks = inspectionData.tasks;
    const completedTasks = allTasks.filter(t => t.status === 'pass' || t.status === 'fail' || t.status === 'na');
    
    if (!inspectionData.completionStatus) {
      inspectionData.completionStatus = {
        status: 'not_started',
        startedBy: null,
        startedAt: null,
        completedBy: null,
        completedAt: null
      };
    }
    
    if (completedTasks.length === 0) {
      inspectionData.completionStatus.status = 'not_started';
    } else if (completedTasks.length === allTasks.length) {
      inspectionData.completionStatus.status = 'completed';
      inspectionData.completionStatus.completedBy = completedBy || 'Unknown';
      inspectionData.completionStatus.completedAt = new Date().toISOString();
    } else {
      inspectionData.completionStatus.status = 'in_progress';
      if (!inspectionData.completionStatus.startedBy) {
        inspectionData.completionStatus.startedBy = completedBy || 'Unknown';
        inspectionData.completionStatus.startedAt = new Date().toISOString();
      }
    }
    
    // Save the updated inspection data
    fs.writeFileSync(filePath, JSON.stringify(inspectionData, null, 2));
    
    log('info', `Task ${taskId} updated successfully`);
    
    res.json({ 
      success: true, 
      task: task,
      completionStatus: inspectionData.completionStatus,
      progress: {
        completed: completedTasks.length,
        total: allTasks.length
      }
    });
    
  } catch (err) {
    log('error', 'Error updating inspection task:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to get inspection data from a session
app.get(/^\/api\/inspection\/(.+)\/data$/, async (req, res) => {
  try {
    const sessionFolder = req.params[0];  // First capture group
    
    // Build the full path to the inspection JSON
    const sessionPath = path.join(SNAPSHOTS_DIR, sessionFolder);
    
    if (!fs.existsSync(sessionPath)) {
      return res.status(404).json({ error: 'Session folder not found' });
    }
    
    const files = fs.readdirSync(sessionPath);
    const inspectionFile = files.find(f => f.endsWith('_inspection.json') || f === 'inspection.json');
    
    if (!inspectionFile) {
      return res.status(404).json({ error: 'Inspection file not found' });
    }
    
    const filePath = path.join(sessionPath, inspectionFile);
    const inspectionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    res.json(inspectionData);
    
  } catch (err) {
    log('error', 'Error getting inspection data:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to get inspection session status
// Modified to handle sessionFolder with slashes using regex
app.get(/^\/api\/inspection\/(.+)\/status$/, async (req, res) => {
  try {
    const sessionFolder = req.params[0];  // First capture group
    
    // Build the full path to the inspection JSON
    const sessionPath = path.join(SNAPSHOTS_DIR, sessionFolder);
    
    if (!fs.existsSync(sessionPath)) {
      return res.status(404).json({ error: 'Session folder not found' });
    }
    
    const files = fs.readdirSync(sessionPath);
    const inspectionFile = files.find(f => f.endsWith('_inspection.json') || f === 'inspection.json');
    
    if (!inspectionFile) {
      return res.status(404).json({ error: 'Inspection file not found' });
    }
    
    const filePath = path.join(sessionPath, inspectionFile);
    const inspectionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const allTasks = inspectionData.tasks;
    const completedTasks = allTasks.filter(t => t.status === 'pass' || t.status === 'fail' || t.status === 'na');
    
    res.json({ 
      completionStatus: inspectionData.completionStatus || {
        status: 'not_started',
        startedBy: null,
        startedAt: null,
        completedBy: null,
        completedAt: null
      },
      progress: {
        completed: completedTasks.length,
        total: allTasks.length
      },
      tasks: allTasks.map(t => ({ 
        id: t.id,
        title: t.title,
        status: t.status,
        completion: t.completion
      }))
    });
    
  } catch (err) {
    log('error', 'Error getting inspection status:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Generate Full RTI inspection for alarm workflow
app.post('/api/alarm-session/:hangarId/generate-full-rti', async (req, res) => {
  try {
    const { hangarId } = req.params;
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    
    // Find latest alarm session for this hangar
    const files = fs.readdirSync(alarmsDir)
      .filter(f => f.startsWith(`alarm_${hangarId}_`) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'No alarm session found' });
    }
    
    const latestFile = files[0];
    const sessionPath = path.join(alarmsDir, latestFile);
    const alarmSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    
    // Check if Basic TI is completed
    if (alarmSession.workflow?.phases?.missionReset?.status !== 'completed') {
      return res.status(400).json({ error: 'Basic TI must be completed before starting Full RTI' });
    }
    
    // Start Full RTI phase
    alarmSession.workflow.phases.fullRTI = {
      status: 'in-progress',
      startTime: new Date().toISOString()
    };
    
    // Get drone ID from session
    const droneId = alarmSession.location?.drone || 'drone-001';
    
    // Create session directory with consistent naming
    const now = new Date();
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const hangarShortName = hangarId.replace('hangar_', '').replace('_vpn', ''); 
    const sessionName = `full_remote_ti_${hangarShortName}_${dateStr}_${timeStr}`;
    const sessionDir = path.join(BASE_DIR, 'data', 'sessions', hangarId, sessionName);
    
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    // Trigger camera capture for Full RTI using existing capture endpoint
    const http = require('http');
    const captureData = JSON.stringify({
      hangar: hangarId,
      drone: droneId,
      inspectionType: 'full-remote-ti-inspection',
      sessionName: sessionName  // Pass the session name to use the correct folder
    });
    
    const captureOptions = {
      hostname: 'localhost',
      port: PORT,
      path: '/api/capture',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': captureData.length
      }
    };
    
    // Create promise for capture completion
    const capturePromise = new Promise((resolve, reject) => {
      const captureReq = http.request(captureOptions, (captureRes) => {
        let data = '';
        captureRes.on('data', chunk => data += chunk);
        captureRes.on('end', () => {
          if (captureRes.statusCode === 200) {
            const captureResult = JSON.parse(data);
            
            // Create inspection with template
            const templatePath = path.join(BASE_DIR, 'data', 'templates', 'full-remote-ti-inspection.json');
            const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
            const inspection = {
              ...template,
              metadata: {
                ...template.metadata,
                sessionId: sessionName,
                hangarId: hangarId,
                droneId: droneId,
                createdAt: new Date().toISOString(),
                inspectorName: 'Remote Inspector',
                status: 'pending',
                alarmSessionId: latestFile.replace('.json', '')
              }
            };
            
            // Save inspection JSON
            const inspectionFileName = `${sessionName}_inspection.json`;
            const inspectionPath = path.join(sessionDir, inspectionFileName);
            fs.writeFileSync(inspectionPath, JSON.stringify(inspection, null, 2));
            
            // Copy captured images to session folder
            if (captureResult.images && captureResult.images.length > 0) {
              captureResult.images.forEach((imagePath, index) => {
                const sourceFile = path.join(BASE_DIR, imagePath);
                const destFile = path.join(sessionDir, `camera_${index + 1}.jpg`);
                if (fs.existsSync(sourceFile)) {
                  fs.copyFileSync(sourceFile, destFile);
                }
              });
            }
            
            // Update alarm session - initially without path to show progress bar
            alarmSession.inspections.fullRTI = {
              sessionId: sessionName,
              createdAt: new Date().toISOString(),
              type: 'full-remote-ti-inspection',
              progress: '0%',
              capturing: true  // Flag to indicate capture in progress
            };
            
            // Save updated session
            fs.writeFileSync(sessionPath, JSON.stringify(alarmSession, null, 2));
            
            // Set the path after a delay to allow progress bar to complete
            setTimeout(() => {
              try {
                const updatedSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
                if (updatedSession.inspections?.fullRTI) {
                  updatedSession.inspections.fullRTI.path = `${hangarId}/${sessionName}`;
                  delete updatedSession.inspections.fullRTI.capturing;
                  fs.writeFileSync(sessionPath, JSON.stringify(updatedSession, null, 2));
                  log('info', `Full RTI path set for ${hangarId}: ${hangarId}/${sessionName}`);
                }
              } catch (err) {
                log('error', 'Failed to update Full RTI path:', err.message);
              }
            }, 38000); // Set path after 38 seconds (allowing progress bar to nearly complete)
            
            const result = {
              success: true,
              message: 'Full RTI inspection created',
              sessionPath: `${hangarId}/${sessionName}`,
              capturedImages: captureResult.images?.length || 0
            };
            
            log('info', `Full RTI created for ${hangarId}: ${sessionName} with ${result.capturedImages} images`);
            resolve(result);
          } else {
            reject(new Error(`Capture failed: ${captureRes.statusCode}`));
          }
        });
      });
      
      captureReq.on('error', reject);
      captureReq.write(captureData);
      captureReq.end();
      
      // Wait 40 seconds for captures to complete
      setTimeout(() => {
        resolve({ 
          success: true, 
          message: 'Full RTI capture timeout - proceeding anyway',
          sessionPath: `${hangarId}/${sessionName}`
        });
      }, 40000);
    });
    
    // Wait for capture to complete
    const result = await capturePromise;
    res.json(result);
    
  } catch (error) {
    log('error', 'Failed to generate Full RTI:', error.message);
    res.status(500).json({ error: 'Failed to generate Full RTI' });
  }
});

// Clear area and mark workflow as complete
app.post('/api/alarm-session/:hangarId/clear-area', async (req, res) => {
  try {
    const { hangarId } = req.params;
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    
    // Find latest alarm session for this hangar
    const files = fs.readdirSync(alarmsDir)
      .filter(f => f.startsWith(`alarm_${hangarId}_`) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'No alarm session found' });
    }
    
    const latestFile = files[0];
    const sessionPath = path.join(alarmsDir, latestFile);
    const alarmSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    
    // Mark clearArea phase as completed
    if (!alarmSession.workflow) {
      alarmSession.workflow = { phases: {} };
    }
    if (!alarmSession.workflow.phases) {
      alarmSession.workflow.phases = {};
    }
    
    alarmSession.workflow.phases.clearArea = {
      status: 'completed',
      completedTime: new Date().toISOString()
    };
    
    // Mark workflow as complete
    alarmSession.workflow.status = 'completed';
    alarmSession.workflow.completedTime = new Date().toISOString();
    
    // Save updated session
    fs.writeFileSync(sessionPath, JSON.stringify(alarmSession, null, 2));
    
    res.json({ 
      success: true, 
      message: 'Area cleared and workflow completed',
      workflow: alarmSession.workflow
    });
    
  } catch (error) {
    log('error', 'Failed to clear area:', error.message);
    res.status(500).json({ error: 'Failed to clear area' });
  }
});

// Generate Onsite TI inspection
app.post('/api/alarm-session/:hangarId/generate-onsite-ti', async (req, res) => {
  try {
    const { hangarId } = req.params;
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    
    // Find latest alarm session for this hangar
    const files = fs.readdirSync(alarmsDir)
      .filter(f => f.startsWith(`alarm_${hangarId}_`) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'No alarm session found' });
    }
    
    const latestFile = files[0];
    const sessionPath = path.join(alarmsDir, latestFile);
    const alarmSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    
    // Start Onsite TI phase
    alarmSession.workflow.phases.onsiteTI = {
      status: 'in-progress',
      startTime: new Date().toISOString()
    };
    
    // Get drone ID from session
    const droneId = alarmSession.location?.drone || 'drone-001';
    
    // Create session directory with consistent naming
    const now = new Date();
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const hangarShortName = hangarId.replace('hangar_', '').replace('_vpn', '');
    const sessionName = `onsite_ti_${hangarShortName}_${dateStr}_${timeStr}`;
    const sessionDir = path.join(BASE_DIR, 'data', 'sessions', hangarId, sessionName);
    
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    // Create Onsite TI inspection from template
    const templatePath = path.join(BASE_DIR, 'data', 'templates', 'onsite-ti-inspection.json');
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const inspection = {
      ...template,
      metadata: {
        ...template.metadata,
        sessionId: sessionName,
        hangarId: hangarId,
        droneId: droneId,
        createdAt: new Date().toISOString(),
        inspectorName: 'Onsite Inspector',
        status: 'pending',
        alarmSessionId: latestFile.replace('.json', '')
      }
    };
    
    // Save inspection JSON
    const inspectionFileName = `${sessionName}_inspection.json`;
    const inspectionPath = path.join(sessionDir, inspectionFileName);
    fs.writeFileSync(inspectionPath, JSON.stringify(inspection, null, 2));
    
    // Update alarm session with Onsite TI reference
    alarmSession.inspections = alarmSession.inspections || {};
    alarmSession.inspections.onsiteTI = {
      sessionId: sessionName,
      path: `${hangarId}/${sessionName}`,
      createdAt: new Date().toISOString(),
      progress: '0%'
    };
    
    // Save updated alarm session
    fs.writeFileSync(sessionPath, JSON.stringify(alarmSession, null, 2));
    
    res.json({ 
      success: true, 
      message: 'Onsite TI created',
      sessionPath: `${hangarId}/${sessionName}`
    });
    
  } catch (error) {
    log('error', 'Failed to generate Onsite TI:', error.message);
    res.status(500).json({ error: 'Failed to generate Onsite TI' });
  }
});

// Update Onsite TI progress
app.post('/api/alarm-session/:hangarId/update-onsite-progress', async (req, res) => {
  try {
    const { hangarId } = req.params;
    const { progress } = req.body;
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    
    // Find latest alarm session for this hangar
    const sessionFiles = fs.readdirSync(alarmsDir)
      .filter(f => f.startsWith(`${hangarId}_`) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    
    if (sessionFiles.length === 0) {
      return res.status(404).json({ error: 'No alarm session found' });
    }
    
    const latestFile = sessionFiles[0];
    const sessionPath = path.join(alarmsDir, latestFile);
    const alarmSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    
    // Update Onsite TI progress
    if (alarmSession.inspections?.onsiteTI) {
      alarmSession.inspections.onsiteTI.progress = progress;
      alarmSession.inspections.onsiteTI.lastUpdated = new Date().toISOString();
      
      fs.writeFileSync(sessionPath, JSON.stringify(alarmSession, null, 2));
      
      log('info', `Updated Onsite TI progress for ${hangarId}: ${progress}`);
      res.json({ success: true, progress });
    } else {
      res.status(404).json({ error: 'Onsite TI not found in session' });
    }
  } catch (error) {
    log('error', 'Failed to update Onsite TI progress:', error.message);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// Complete Onsite TI
app.post('/api/alarm-session/:hangarId/complete-onsite-ti', async (req, res) => {
  try {
    const { hangarId } = req.params;
    const { progress, completedBy, completedAt } = req.body;
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    
    // Find latest alarm session for this hangar
    const sessionFiles = fs.readdirSync(alarmsDir)
      .filter(f => f.startsWith(`${hangarId}_`) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    
    if (sessionFiles.length === 0) {
      return res.status(404).json({ error: 'No alarm session found' });
    }
    
    const latestFile = sessionFiles[0];
    const sessionPath = path.join(alarmsDir, latestFile);
    const alarmSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    
    // Mark Onsite TI as completed
    if (alarmSession.workflow?.phases?.onsiteTI) {
      alarmSession.workflow.phases.onsiteTI.status = 'completed';
      alarmSession.workflow.phases.onsiteTI.completedTime = completedAt || new Date().toISOString();
    }
    
    if (alarmSession.inspections?.onsiteTI) {
      alarmSession.inspections.onsiteTI.progress = progress || '100%';
      alarmSession.inspections.onsiteTI.completedBy = completedBy;
      alarmSession.inspections.onsiteTI.completedAt = completedAt || new Date().toISOString();
    }
    
    fs.writeFileSync(sessionPath, JSON.stringify(alarmSession, null, 2));
    
    log('info', `Completed Onsite TI for ${hangarId}`);
    res.json({ success: true, message: 'Onsite TI marked as completed' });
    
  } catch (error) {
    log('error', 'Failed to complete Onsite TI:', error.message);
    res.status(500).json({ error: 'Failed to complete Onsite TI' });
  }
});

// Handle route decision and create corresponding inspection
app.post('/api/alarm-session/:hangarId/route-decision', async (req, res) => {
  try {
    const { hangarId } = req.params;
    const { route } = req.body;
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    
    // Find latest alarm session for this hangar
    const files = fs.readdirSync(alarmsDir)
      .filter(f => f.startsWith(`alarm_${hangarId}_`) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'No alarm session found' });
    }
    
    const latestFile = files[0];
    const sessionPath = path.join(alarmsDir, latestFile);
    const alarmSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    
    // Update workflow route decision
    alarmSession.workflow.routeDecision = route;
    alarmSession.workflow.phases.routeDecision = {
      status: 'completed',
      completedAt: new Date().toISOString()
    };
    
    // Create Basic TI inspection if route is 'basic' or 'basic-extended'
    if (route === 'basic' || route === 'basic-extended') {
      // Get drone ID from alarm session
      const droneId = alarmSession.location?.drone || 'drone-001';
      
      // Create session directory with consistent naming format
      const now = new Date();
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const timeStr = now.toISOString().slice(11, 19).replace(/:/g, ''); // HHMMSS
      const hangarShortName = hangarId.replace('hangar_', '').replace('_vpn', ''); // Extract short name
      const sessionName = `mission_reset_${hangarShortName}_${dateStr}_${timeStr}`;
      const sessionDir = path.join(BASE_DIR, 'data', 'sessions', hangarId, sessionName);
      
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      
      // Determine template based on route
      const templateName = route === 'basic-extended' ? 'extended-ti-inspection.json' : 'mission-reset-inspection.json';
      const templatePath = path.join(BASE_DIR, 'data', 'templates', templateName);
      
      // Create inspection JSON
      const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
      const inspection = {
        ...template,
        metadata: {
          ...template.metadata,
          sessionId: sessionName,
          hangarId: hangarId,
          droneId: droneId,
          createdAt: new Date().toISOString(),
          inspectorName: 'Remote Inspector',
          status: 'pending',
          alarmSessionId: latestFile.replace('.json', '')
        }
      };
      
      // Save inspection JSON with consistent naming
      const inspectionFileName = `${sessionName}_inspection.json`;
      const inspectionPath = path.join(sessionDir, inspectionFileName);
      fs.writeFileSync(inspectionPath, JSON.stringify(inspection, null, 2));
      
      // Update alarm session with Basic TI inspection info
      alarmSession.inspections.missionReset = {
        sessionId: sessionName,
        path: `${hangarId}/${sessionName}`,
        createdAt: new Date().toISOString(),
        type: route === 'basic-extended' ? 'extended-ti-inspection' : 'mission-reset-inspection',
        progress: '0%'
      };
      
      // Start Basic TI phase
      alarmSession.workflow.phases.missionReset = {
        status: 'in-progress',
        startTime: new Date().toISOString()
      };
      
      log('info', `Created Basic TI inspection for ${hangarId}: ${sessionName}`);
    }
    
    // Save updated alarm session
    fs.writeFileSync(sessionPath, JSON.stringify(alarmSession, null, 2));
    
    res.json({ 
      success: true, 
      message: 'Route decision saved',
      route: route,
      inspection: alarmSession.inspections.missionReset
    });
  } catch (error) {
    log('error', 'Failed to save route decision:', error.message);
    res.status(500).json({ error: 'Failed to save route decision' });
  }
});

// Update inspection progress and completion status
app.post('/api/inspection/update-progress', async (req, res) => {
  try {
    const { sessionPath, progress, completed, tasksCompleted, totalTasks } = req.body;
    
    if (!sessionPath) {
      return res.status(400).json({ error: 'Session path is required' });
    }
    
    // Parse hangar ID from session path (format: "hangarId/sessionName")
    const [hangarId] = sessionPath.split('/');
    
    // Find and update the alarm session
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    const files = fs.readdirSync(alarmsDir)
      .filter(f => f.startsWith(`alarm_${hangarId}_`) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'No alarm session found' });
    }
    
    const latestFile = files[0];
    const alarmSessionPath = path.join(alarmsDir, latestFile);
    const alarmSession = JSON.parse(fs.readFileSync(alarmSessionPath, 'utf8'));
    
    // Determine which inspection to update based on the session path
    let inspectionType = null;
    
    if (sessionPath.includes('initial_remote') || sessionPath.includes('initial_ti')) {
      inspectionType = 'initialRTI';
    } else if (sessionPath.includes('basic_ti') || sessionPath.includes('mission_reset')) {
      inspectionType = 'missionReset';
    } else if (sessionPath.includes('onsite_ti')) {
      inspectionType = 'onsiteTI';
    } else if (sessionPath.includes('full_remote') || sessionPath.includes('remote-ti')) {
      inspectionType = 'fullRTI';
    }
    
    // Update inspection progress
    if (inspectionType && alarmSession.inspections?.[inspectionType]) {
      // Store progress as a percentage string for consistency with UI
      alarmSession.inspections[inspectionType].progress = `${Math.round(progress || 0)}%`;
      alarmSession.inspections[inspectionType].tasksCompleted = tasksCompleted || 0;
      alarmSession.inspections[inspectionType].totalTasks = totalTasks || 0;
      
      // If inspection is completed, update the phase status
      if (completed && alarmSession.workflow?.phases?.[inspectionType]) {
        alarmSession.workflow.phases[inspectionType].status = 'completed';
        alarmSession.workflow.phases[inspectionType].endTime = new Date().toISOString();
        alarmSession.inspections[inspectionType].completedAt = new Date().toISOString();
      }
      
      // Save updated alarm session
      fs.writeFileSync(alarmSessionPath, JSON.stringify(alarmSession, null, 2));
      
      log('info', `Updated ${inspectionType} progress for ${sessionPath}: ${progress}% (${tasksCompleted}/${totalTasks})`);
      res.json({ success: true, message: 'Progress updated', inspectionType: inspectionType });
    } else {
      log('error', `Inspection not found in alarm session. Type: ${inspectionType}, Path: ${sessionPath}`);
      log('error', `Available inspections: ${JSON.stringify(Object.keys(alarmSession.inspections || {}))}`);
      res.status(404).json({ error: 'Inspection not found in alarm session' });
    }
  } catch (error) {
    log('error', 'Failed to update inspection progress:', error.message);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// API endpoint to get maintenance history by drone (auto-detected from completed inspections)
app.get('/api/maintenance-history', async (req, res) => {
  try {
    const maintenanceHistory = {};
    
    // Scan through all hangar folders to find drone sessions
    if (fs.existsSync(SNAPSHOTS_DIR)) {
      const hangarDirs = fs.readdirSync(SNAPSHOTS_DIR).filter(item => {
        const itemPath = path.join(SNAPSHOTS_DIR, item);
        return fs.statSync(itemPath).isDirectory();
      });
      
      // Collect all sessions from all hangars
      const allSessions = [];
      
      for (const hangarId of hangarDirs) {
        const hangarPath = path.join(SNAPSHOTS_DIR, hangarId);
        
        // Get all session folders for this hangar
        const sessions = fs.readdirSync(hangarPath)
          .filter(item => {
            const itemPath = path.join(hangarPath, item);
            return fs.statSync(itemPath).isDirectory();
          })
          .map(sessionName => {
            const sessionPath = path.join(hangarPath, sessionName);
            const stats = fs.statSync(sessionPath);
            
            // Extract drone ID from session name
            // Session names typically follow patterns like:
            // - "drone-001_251124_140000"
            // - "bender_251006_154641"
            // - "onsite_ti_drone-001_241124_140000"
            // - "full_remote_ti_bender_241124_140000"
            let droneId = null;
            const parts = sessionName.split('_');
            
            // Try to find the drone ID in the session name
            if (sessionName.toLowerCase().includes('onsite') || 
                sessionName.toLowerCase().includes('remote') ||
                sessionName.toLowerCase().includes('extended') ||
                sessionName.toLowerCase().includes('service') ||
                sessionName.toLowerCase().includes('mission') ||
                sessionName.toLowerCase().includes('basic')) {
              // For inspection sessions, drone ID is usually after the type prefix
              for (let i = 0; i < parts.length - 2; i++) {
                // Skip type prefixes and look for the drone ID
                if (!['onsite', 'ti', 'remote', 'full', 'initial', 'extended', 'service', 'mission', 'reset', 'basic'].includes(parts[i].toLowerCase())) {
                  droneId = parts[i];
                  break;
                }
              }
            } else {
              // For regular sessions, drone ID is usually the first part
              droneId = parts[0];
            }
            
            if (!droneId) return null;
            
            // Find inspection JSON file
            const files = fs.readdirSync(sessionPath);
            const inspectionFile = files.find(f => f.endsWith('_inspection.json'));
            
            if (!inspectionFile) return null;
            
            try {
              const inspectionData = JSON.parse(fs.readFileSync(path.join(sessionPath, inspectionFile), 'utf8'));
              
              // Also check if drone ID is in the inspection data
              if (inspectionData.sessionInfo?.drone) {
                droneId = inspectionData.sessionInfo.drone;
              } else if (inspectionData.metadata?.droneId) {
                droneId = inspectionData.metadata.droneId;
              }
              
              // Determine inspection type
              let type = null;
              const sessionNameLower = sessionName.toLowerCase();
              
              if (sessionNameLower.includes('onsite') || inspectionData.type === 'onsite-ti-inspection') {
                type = 'onsite-ti';
              } else if (sessionNameLower.includes('extended') || inspectionData.type === 'extended-ti-inspection') {
                type = 'extended-ti';
              } else if (sessionNameLower.includes('service') || inspectionData.type === 'service-inspection') {
                type = 'service';
              }
              
              // Check if inspection is completed
              const isCompleted = inspectionData.completionStatus?.status === 'completed' ||
                                 (inspectionData.tasks && 
                                  inspectionData.tasks.every(t => t.status === 'pass' || t.status === 'fail' || t.status === 'na'));
              
              if (type && isCompleted && droneId) {
                return {
                  droneId,
                  type,
                  date: inspectionData.completionStatus?.completedAt || stats.mtime.toISOString(),
                  sessionName,
                  hangarId
                };
              }
            } catch (err) {
              // Ignore parsing errors
            }
            
            return null;
          })
          .filter(Boolean);
        
        allSessions.push(...sessions);
      }
      
      // Group sessions by drone ID and find the most recent of each type
      for (const session of allSessions) {
        if (!maintenanceHistory[session.droneId]) {
          maintenanceHistory[session.droneId] = {
            lastOnsiteTI: null,
            lastExtendedTI: null,
            lastService: null
          };
        }
        
        if (session.type === 'onsite-ti') {
          if (!maintenanceHistory[session.droneId].lastOnsiteTI || 
              new Date(session.date) > new Date(maintenanceHistory[session.droneId].lastOnsiteTI)) {
            maintenanceHistory[session.droneId].lastOnsiteTI = session.date;
          }
        } else if (session.type === 'extended-ti') {
          if (!maintenanceHistory[session.droneId].lastExtendedTI || 
              new Date(session.date) > new Date(maintenanceHistory[session.droneId].lastExtendedTI)) {
            maintenanceHistory[session.droneId].lastExtendedTI = session.date;
          }
        } else if (session.type === 'service') {
          if (!maintenanceHistory[session.droneId].lastService || 
              new Date(session.date) > new Date(maintenanceHistory[session.droneId].lastService)) {
            maintenanceHistory[session.droneId].lastService = session.date;
          }
        }
      }
    }
    
    res.json(maintenanceHistory);
    
  } catch (error) {
    log('error', 'Failed to get maintenance history:', error.message);
    res.status(500).json({ error: 'Failed to get maintenance history' });
  }
});

// API endpoint to update maintenance history for a hangar
app.post('/api/maintenance-history/:hangarId', async (req, res) => {
  try {
    const { hangarId } = req.params;
    const { type, date, notes } = req.body;
    
    if (!type || !date) {
      return res.status(400).json({ error: 'Type and date are required' });
    }
    
    const historyFile = path.join(BASE_DIR, 'data', 'maintenance-history.json');
    let history = {};
    
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
    
    // Initialize hangar history if it doesn't exist
    if (!history[hangarId]) {
      history[hangarId] = {
        lastOnsiteTI: null,
        lastExtendedTI: null,
        lastService: null,
        history: []
      };
    }
    
    // Update the last maintenance date based on type
    if (type === 'onsite-ti') {
      history[hangarId].lastOnsiteTI = date;
    } else if (type === 'extended-ti') {
      history[hangarId].lastExtendedTI = date;
    } else if (type === 'service') {
      history[hangarId].lastService = date;
    }
    
    // Add to history log
    history[hangarId].history.push({
      type,
      date,
      notes,
      recordedAt: new Date().toISOString()
    });
    
    // Keep only last 100 history entries per hangar
    if (history[hangarId].history.length > 100) {
      history[hangarId].history = history[hangarId].history.slice(-100);
    }
    
    // Save updated history
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    
    log('info', `Updated maintenance history for ${hangarId}: ${type} on ${date}`);
    res.json({ success: true, hangarHistory: history[hangarId] });
    
  } catch (error) {
    log('error', 'Failed to update maintenance history:', error.message);
    res.status(500).json({ error: 'Failed to update maintenance history' });
  }
});

// Serve static files from React build
const buildPath = path.join(__dirname, 'build');
if (fs.existsSync(buildPath)) {
  // Serve static files
  app.use(express.static(buildPath));
  
  // Serve index.html for all non-API routes (SPA support)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      // Let API routes pass through
      next();
    } else if (req.method === 'GET') {
      // Serve React app for all other GET requests
      res.sendFile(path.join(buildPath, 'index.html'));
    } else {
      next();
    }
  });
  
  log('info', `Serving static files from: ${buildPath}`);
} else {
  log('warn', 'No build folder found. Run "npm run build" to create production build.');
}

process.on('SIGINT', () => {
  log('info', 'Received SIGINT, shutting down gracefully');
  process.exit(0);
});