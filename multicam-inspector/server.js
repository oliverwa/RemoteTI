const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');

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
// Serve public directory for additional static files  
app.use('/public', express.static('public'));

// Serve static files from build directory (but don't catch all routes yet)
app.use('/static', express.static(path.join(__dirname, 'build/static')));


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

function initializeCaptureProcess(requestId, hangar, drone, sessionFolder) {
  global.captureProcesses = global.captureProcesses || {};
  global.captureProcesses[requestId] = {
    hangar,
    drone,
    sessionFolder,
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
    
    const { hangar, drone, inspectionType = 'remote' } = req.body;
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
    const sessionName = `${cleanType}_${drone}_${sessionTimestamp}`;
    const sessionFolder = `${hangar}/${sessionName}`;
    
    // Create session directory and copy inspection template for remote inspections too
    const sessionPath = path.join(SNAPSHOTS_DIR, sessionFolder);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }
    
    // Copy the inspection template JSON
    const templateFile = path.join(BASE_DIR, 'data', 'templates', `${inspectionType}.json`);
    const destinationFile = path.join(sessionPath, `${cleanType}_${drone}_${sessionTimestamp}_inspection.json`);
    
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
    
    initializeCaptureProcess(requestId, hangar, drone, sessionFolder);
    
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
          
          if (firstPart === 'remote' || nameLower.startsWith('remote_')) {
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
    
    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
    const inspectionTypes = files.map(file => {
      const filePath = path.join(templatesDir, file);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const taskCount = content.tasks ? content.tasks.length : 0;
      
      // Extract type from filename (e.g., "remote-ti-inspection.json" -> "remote")
      const type = file.replace('-ti-inspection.json', '').replace('-inspection.json', '');
      
      return {
        file: file.replace('.json', ''),
        type: type,
        name: type.charAt(0).toUpperCase() + type.slice(1) + ' TI Inspection',
        description: content.description || `${type.charAt(0).toUpperCase() + type.slice(1)} technical inspection`,
        mode: type === 'remote' ? 'remote' : 'onsite',
        taskCount: taskCount
      };
    });
    
    res.json(inspectionTypes);
  } catch (error) {
    log('error', 'Error listing inspection types:', error.message);
    res.status(500).json({ error: 'Failed to list inspection types' });
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
    const inspectionFile = files.find(f => f.endsWith('_inspection.json'));
    
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
    const inspectionFile = files.find(f => f.endsWith('_inspection.json'));
    
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
    const inspectionFile = files.find(f => f.endsWith('_inspection.json'));
    
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

// Note: Frontend serving removed to avoid conflicts with API endpoints
// The React app should be served from a separate process or different port

process.on('SIGINT', () => {
  log('info', 'Received SIGINT, shutting down gracefully');
  process.exit(0);
});