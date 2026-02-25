const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
// const helmet = require('helmet'); // Temporarily disabled to fix white screen
const { body, param, validationResult } = require('express-validator');
const { spawn, exec } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const { saveAlarmSession } = require('./server/alarmHelper');

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

// Function to get all hangars from hangars.json
function getAllHangars() {
  try {
    const hangarsDataPath = path.join(__dirname, 'data', 'hangars.json');
    const hangarsData = JSON.parse(fs.readFileSync(hangarsDataPath, 'utf8'));
    return hangarsData.hangars || [];
  } catch (error) {
    console.error('Error loading hangars from hangars.json:', error);
    return [];
  }
}

// Function to get hangar configuration from hangars.json
function getHangarConfig(hangarId) {
  try {
    const hangarsDataPath = path.join(__dirname, 'data', 'hangars.json');
    const hangarsData = JSON.parse(fs.readFileSync(hangarsDataPath, 'utf8'));
    const hangar = hangarsData.hangars.find(h => h.id === hangarId);
    
    if (!hangar) {
      // No fallback - hangar must exist in hangars.json
      console.error(`Hangar ${hangarId} not found in hangars.json`);
      return null;
    }
    
    // Build config from hangars.json data
    const hangarConfig = {
      id: hangar.id,
      label: hangar.label,
      ipAddress: hangar.ipAddress,
      assignedDrone: hangar.assignedDrone,
      operational: hangar.operational,
      status: hangar.status,
      folderName: hangar.folderName || hangar.label.replace(/[^a-zA-Z0-9]/g, ''), // Use folderName or sanitized label
      connection: {
        ssh_host: hangar.ipAddress ? `system@${hangar.ipAddress}` : '',
        ip: hangar.ipAddress || ''
      },
      lights: {
        // Default values
        enabled: false,
        endpoint: hangar.ipAddress ? `https://${hangar.ipAddress}:7548/hangar/lightson` : '',
        username: process.env.HANGAR_SYSTEM_USERNAME || 'system',
        password: process.env.HANGAR_SYSTEM_PASSWORD || '',
        waitTime: 9,  // Increased to 9s to allow cameras more time to adjust and prevent blurry images
        // Override with hangar-specific config if provided
        ...(hangar.lights || {})
      },
      cameraTransforms: hangar.cameraTransforms || {},
      // Add camera configuration for quick preview - using port 8083 for camera access
      cameras: hangar.ipAddress ? {
        RUL: {
          url: `https://${hangar.ipAddress}:8083/cgi-bin/api.cgi?cmd=Snap&channel=0&rs=wuuPhkmUCeI9WG7C`,
          username: process.env.CAMERA_ADMIN_USERNAME || 'admin',
          password: process.env.CAMERA_ADMIN_PASSWORD || ''
        }
      } : {}
    };
    
    return hangarConfig;
  } catch (error) {
    console.error('Error loading hangar config from hangars.json:', error);
    // No fallback - return null on error
    return null;
  }
}

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

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : ['http://localhost:3000', 'http://localhost:5001', 'http://172.20.1.254:5001'];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow credentials (cookies, authorization headers)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // Cache preflight response for 24 hours
};

// Rate Limiting Configuration
const createRateLimiter = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message,
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`[RATE_LIMIT] ${req.ip} exceeded limit on ${req.path}`);
    res.status(429).json({ 
      success: false, 
      message,
      retryAfter: Math.ceil(windowMs / 1000)
    });
  }
});

// Different rate limiters for different endpoints
const loginLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // max 5 attempts
  'Too many login attempts, please try again later'
);

const apiLimiter = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  100, // max 100 requests per minute
  'Too many requests, please slow down'
);

const captureLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutes  
  10, // max 10 capture requests
  'Too many capture requests, please wait before trying again'
);

// Middleware - Order matters!
app.use(cors(corsOptions));

// Request Size Limits
app.use(express.json({ limit: '10mb' })); // Limit JSON body size
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply general rate limiting to all API routes
app.use('/api/', apiLimiter);

// Add basic security headers manually for API routes
app.use('/api', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
// Serve public directory for additional static files  
app.use('/public', express.static('public'));

// Serve static files from build directory (but don't catch all routes yet)
app.use('/static', express.static(path.join(__dirname, 'build/static')));

// Serve session images from data/sessions directory
app.use('/data/sessions', express.static(path.join(__dirname, 'data/sessions')));

// Validation Middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log(`[VALIDATION_ERROR] ${req.path}:`, errors.array());
    return res.status(400).json({ 
      success: false, 
      message: 'Validation failed',
      errors: errors.array().map(e => ({ field: e.param, message: e.msg }))
    });
  }
  next();
};

// Validation Rules
const validationRules = {
  login: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Username must be 3-50 characters, alphanumeric with _ or -'),
    body('password')
      .isLength({ min: 6, max: 100 })
      .withMessage('Password must be 6-100 characters')
  ],
  
  capture: [
    body('hangar')
      .trim()
      .isLength({ min: 1, max: 50 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid hangar ID format'),
    body('drone')
      .trim()
      .isLength({ min: 1, max: 50 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid drone name format'),
    body('inspectionType')
      .optional()
      .isIn(['remote', 'remote-ti-inspection', 'initial-remote-ti-inspection', 'full-remote-ti-inspection', 'onsite-ti-inspection'])
      .withMessage('Invalid inspection type'),
    body('sessionName')
      .optional()
      .isLength({ max: 100 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid session name format')
  ],
  
  userId: [
    param('id')
      .matches(/^usr_[a-zA-Z0-9]+$/)
      .withMessage('Invalid user ID format')
  ],
  
  hangarId: [
    param('hangarId')
      .trim()
      .isLength({ min: 1, max: 50 })
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid hangar ID format')
  ]
};

// Initialize authentication system
auth.initializeUsersDB().catch(console.error);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication routes (with strict rate limiting and validation)
app.post('/api/auth/login', loginLimiter, validationRules.login, handleValidationErrors, auth.handleLogin);
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
app.post('/api/capture', captureLimiter, validationRules.capture, handleValidationErrors, async (req, res) => {
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
    
    // Use hangar ID directly as folder name
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

// Function to turn on hangar lights (using curl for better compatibility)
async function turnOnHangarLights(hangar) {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  const hangarConfig = getHangarConfig(hangar);
  
  if (!hangarConfig || !hangarConfig.lights || !hangarConfig.lights.enabled) {
    log('info', `Lights not configured or disabled for hangar: ${hangar}`);
    return false;
  }
  
  const { endpoint, username, password, waitTime } = hangarConfig.lights;
  
  // Use curl command for better compatibility with light controllers
  return new Promise(async (resolve) => {
    log('info', `Turning on lights for hangar: ${hangar} using curl`);
    log('debug', `Light control details - Endpoint: ${endpoint}, Username: ${username}`);
    
    try {
      // Build curl command that matches what works manually
      // Use base64 encoding to avoid shell escaping issues with special characters
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      const curlCmd = `curl -X PUT -k -H "Authorization: Basic ${auth}" '${endpoint}' -w "\\nHTTP_STATUS:%{http_code}" 2>/dev/null`;
      
      const { stdout, stderr } = await execAsync(curlCmd, { timeout: 10000 });
      
      // Parse response and status
      const lines = stdout.split('\n');
      const statusLine = lines.find(l => l.startsWith('HTTP_STATUS:'));
      const httpStatus = statusLine ? parseInt(statusLine.split(':')[1]) : 0;
      const responseBody = lines.filter(l => !l.startsWith('HTTP_STATUS:')).join('\n').trim();
      
      if (httpStatus === 200 || responseBody.includes('ok')) {
        log('info', `Lights turned on successfully for ${hangar} (status: ${httpStatus}, response: ${responseBody}), waiting ${waitTime}s`);
        setTimeout(() => resolve(true), waitTime * 1000);
      } else {
        log('warn', `Failed to turn on lights for ${hangar}: HTTP ${httpStatus}, response: ${responseBody}`);
        resolve(false);
      }
    } catch (error) {
      log('error', `Error turning on lights for ${hangar} with curl: ${error.message}`);
      
      // If curl times out or fails, the lights likely didn't turn on
      resolve(false);
    }
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
    global.captureProcesses[requestId].currentPhase = 'lights';
    await turnOnHangarLights(hangar);
    global.captureProcesses[requestId].currentPhase = 'connecting';
    
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
    const hangarConfig = getHangarConfig(hangar);
    const sshHost = hangarConfig?.connection?.ssh_host || `system@${hangarConfig?.ipAddress}` || hangar;
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
        hangars: getAllHangars().length,
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
    // Create the session folder directly using hangar ID
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
          let detailedStatus = null;
          
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
                
                // Determine the detailed inspection result status
                if (completedTasks === 0) {
                  inspectionStatus = 'not_started';
                  detailedStatus = 'pending';
                } else if (completedTasks === totalTasks) {
                  inspectionStatus = 'completed';
                  // Check for failures or partial completion
                  const failedTasks = inspectionData.tasks.filter(t => t.status === 'fail' || t.status === 'failed').length;
                  const skippedTasks = inspectionData.tasks.filter(t => t.status === 'na' || t.status === 'skip' || t.status === 'skipped').length;
                  
                  if (failedTasks > 0) {
                    detailedStatus = 'failed';
                  } else if (skippedTasks > 0) {
                    detailedStatus = 'partial';
                  } else {
                    detailedStatus = 'passed';
                  }
                } else {
                  inspectionStatus = 'in_progress';
                  detailedStatus = 'pending';
                }
              }
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
            inspectionDetailedStatus: inspectionFile ? detailedStatus : null,
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
      } else if (file === 'mission-reset.json') {
        type = 'mission-reset';
        name = 'Mission Reset';
        mode = 'onsite';
      } else if (file.includes('-ti-inspection')) {
        type = file.replace('-ti-inspection.json', '');
        name = type.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ') + ' TI Inspection';
        mode = ['onsite', 'basic', 'extended'].includes(type) ? 'onsite' : 'remote';
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
    
    // Get both hangar short name and drone ID
    const hangarShortName = hangarId.replace('hangar_', '').replace('_vpn', '');
    const droneId = alarmSession.droneId || 'unknown';
    const sessionName = `initial_remote_${hangarShortName}_${droneId}_${timestamp}`;
    
    // Use hangar ID directly as folder name
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
    saveAlarmSession(sessionPath, alarmSession);
    
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

// Single camera autofocus endpoint
app.post('/api/camera/autofocus', async (req, res) => {
  const { hangar, cameraName, cameraIp } = req.body;
  
  if (!hangar || !cameraName || !cameraIp) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required parameters' 
    });
  }
  
  try {
    log('info', `Triggering autofocus for camera ${cameraName} at ${cameraIp} in ${hangar}`);
    
    // Execute autofocus script
    const scriptPath = path.join(__dirname, 'camera_autofocus.sh');
    const command = `${scriptPath} ${hangar} ${cameraName} ${cameraIp}`;
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000, // 30 second timeout for autofocus
      maxBuffer: 10 * 1024 * 1024
    });
    
    if (stderr && !stderr.includes('Warning')) {
      log('error', `Autofocus error for ${cameraName}: ${stderr}`);
      return res.status(500).json({ 
        success: false, 
        error: stderr 
      });
    }
    
    log('info', `Autofocus completed for ${cameraName}`);
    res.json({ 
      success: true, 
      message: `Autofocus completed for ${cameraName}`,
      output: stdout
    });
  } catch (error) {
    log('error', `Autofocus failed for ${cameraName}:`, error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Single camera retake with autofocus endpoint
app.post('/api/camera/retake-with-focus', async (req, res) => {
  const { hangar, session, cameraName, cameraId } = req.body;
  
  if (!hangar || !session || !cameraName) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required parameters' 
    });
  }
  
  try {
    log('info', `Starting retake with focus for camera ${cameraName} in session ${session}`);
    
    // Get camera IP from configuration
    const cameraIPs = {
      'RUR': '10.20.1.201', 'FUR': '10.20.1.202', 'FUL': '10.20.1.203', 'RUL': '10.20.1.204',
      'RDR': '10.20.1.205', 'FDR': '10.20.1.206', 'FDL': '10.20.1.207', 'RDL': '10.20.1.208'
    };
    
    const cameraIp = cameraIPs[cameraName];
    if (!cameraIp) {
      return res.status(400).json({ 
        success: false, 
        error: `Unknown camera: ${cameraName}` 
      });
    }
    
    // Step 1: Trigger autofocus
    log('info', `Step 1/2: Triggering autofocus for ${cameraName}`);
    const autofocusScript = path.join(__dirname, 'camera_autofocus.sh');
    const autofocusCmd = `${autofocusScript} ${hangar} ${cameraName} ${cameraIp}`;
    
    try {
      const { stdout: afStdout, stderr: afStderr } = await execAsync(autofocusCmd, {
        timeout: 30000, // 30 second timeout for autofocus
        maxBuffer: 10 * 1024 * 1024
      });
      
      if (afStderr && !afStderr.includes('Warning') && !afStderr.includes('✅')) {
        log('warn', `Autofocus warning for ${cameraName}: ${afStderr}`);
      }
      log('info', `Autofocus completed for ${cameraName}`);
    } catch (afError) {
      log('error', `Autofocus failed for ${cameraName}: ${afError.message}`);
      // Continue anyway - might still get a decent image
    }
    
    // Step 2: Capture new image
    log('info', `Step 2/2: Capturing new image for ${cameraName}`);
    const sessionPath = `${hangar}/${session}`;
    const captureCmd = `${CAMERA_SCRIPT_PATH} ${hangar} ${session.split('_')[2]} ${cameraName} ${cameraIp} ${sessionPath}`;
    
    log('debug', `Executing capture command: ${captureCmd}`);
    
    const { stdout, stderr } = await execAsync(captureCmd, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 10 * 1024 * 1024
    });
    
    if (stderr && !stderr.includes('Warning') && !stderr.includes('SUCCESS')) {
      log('error', `Capture error for ${cameraName}: ${stderr}`);
      return res.status(500).json({ 
        success: false, 
        error: stderr 
      });
    }
    
    // Step 3: Update session JSON data
    const sessionFile = path.join(SNAPSHOTS_DIR, hangar, session, 'inspection.json');
    let sessionUpdated = false;
    
    try {
      if (fs.existsSync(sessionFile)) {
        const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        
        // Update timestamp for this camera in the session data
        if (!sessionData.cameraRetakes) {
          sessionData.cameraRetakes = {};
        }
        sessionData.cameraRetakes[cameraName] = {
          timestamp: new Date().toISOString(),
          cameraId: cameraId
        };
        
        fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));
        sessionUpdated = true;
        log('info', `Session data updated for retake of ${cameraName}`);
      }
    } catch (jsonError) {
      log('warn', `Could not update session JSON: ${jsonError.message}`);
    }
    
    log('info', `Retake with focus completed successfully for ${cameraName}`);
    res.json({ 
      success: true, 
      message: `Image retaken with focus for ${cameraName}`,
      sessionUpdated: sessionUpdated,
      output: stdout
    });
  } catch (error) {
    log('error', `Retake with focus failed for ${cameraName}:`, error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Single camera retake endpoint (without autofocus - keeping for backwards compatibility)
app.post('/api/camera/retake', async (req, res) => {
  const { hangar, session, cameraName, cameraId } = req.body;
  
  if (!hangar || !session || !cameraName) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required parameters' 
    });
  }
  
  try {
    log('info', `Retaking image for camera ${cameraName} in session ${session}`);
    
    // Get camera IP from configuration
    const cameraIPs = {
      'RUR': '10.20.1.201', 'FUR': '10.20.1.202', 'FUL': '10.20.1.203', 'RUL': '10.20.1.204',
      'RDR': '10.20.1.205', 'FDR': '10.20.1.206', 'FDL': '10.20.1.207', 'RDL': '10.20.1.208'
    };
    
    const cameraIp = cameraIPs[cameraName];
    if (!cameraIp) {
      return res.status(400).json({ 
        success: false, 
        error: `Unknown camera: ${cameraName}` 
      });
    }
    
    // Execute camera fetch script for single camera
    const sessionPath = `${hangar}/${session}`;
    const command = `${CAMERA_SCRIPT_PATH} ${hangar} ${session.split('_')[2]} ${cameraName} ${cameraIp} ${sessionPath}`;
    
    log('debug', `Executing retake command: ${command}`);
    
    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 10 * 1024 * 1024
    });
    
    if (stderr && !stderr.includes('Warning')) {
      log('error', `Retake error for ${cameraName}: ${stderr}`);
      return res.status(500).json({ 
        success: false, 
        error: stderr 
      });
    }
    
    log('info', `Image retaken successfully for ${cameraName}`);
    res.json({ 
      success: true, 
      message: `Image retaken for ${cameraName}`,
      output: stdout
    });
  } catch (error) {
    log('error', `Retake failed for ${cameraName}:`, error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Light control endpoint - manually control lights for a hangar (no auth required - lights have their own auth)
app.post('/api/hangar/:hangarId/lights', async (req, res) => {
  try {
    const { hangarId } = req.params;
    const { action = 'on' } = req.body; // 'on' or 'off', default to 'on'
    
    log('info', `Light control requested for hangar: ${hangarId}, action: ${action}`);
    
    // Get hangar configuration
    const hangarConfig = getHangarConfig(hangarId);
    if (!hangarConfig) {
      return res.status(404).json({ 
        success: false,
        error: 'Hangar not found' 
      });
    }
    
    if (!hangarConfig.lights || !hangarConfig.lights.enabled) {
      return res.status(400).json({ 
        success: false,
        error: 'Lights not configured for this hangar' 
      });
    }
    
    if (action === 'on') {
      // Turn on lights using the same function as camera capture
      const lightsOn = await turnOnHangarLights(hangarId);
      
      if (lightsOn) {
        log('info', `Lights successfully turned on for ${hangarId}`);
        res.json({ 
          success: true, 
          message: `Lights turned on for ${hangarId}`,
          waitTime: hangarConfig.lights.waitTime 
        });
      } else {
        log('error', `Failed to turn on lights for ${hangarId}`);
        res.status(500).json({ 
          success: false,
          error: 'Failed to turn on lights' 
        });
      }
    } else {
      // For now, we don't have an off endpoint, but we can add it later
      res.status(501).json({ 
        success: false,
        error: 'Light off functionality not implemented yet' 
      });
    }
  } catch (error) {
    log('error', `Error controlling lights for ${req.params.hangarId}:`, error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to control lights' 
    });
  }
});

// Quick camera preview endpoint - fetches RUL camera image without full capture process
app.get('/api/hangar/:hangarId/quick-preview', async (req, res) => {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  try {
    const { hangarId } = req.params;
    const { camera = 'RUL' } = req.query; // Default to RUL if not specified
    
    log('info', `Quick preview requested for hangar: ${hangarId}, camera: ${camera}`);
    
    // Get hangar configuration
    const hangarConfig = getHangarConfig(hangarId);
    if (!hangarConfig) {
      return res.status(404).json({ error: 'Hangar not found' });
    }
    
    if (!hangarConfig.ipAddress) {
      return res.status(400).json({ error: 'Hangar IP not configured' });
    }
    
    // Map camera names to IP addresses - using config from config.js
    const cameraIPs = {
      'FDR': '10.20.1.208', // Front Down Right
      'FUR': '10.20.1.209', // Front Upper Right
      'RUR': '10.20.1.210', // Rear Upper Right  
      'RDR': '10.20.1.211', // Rear Down Right
      'FDL': '10.20.1.212', // Front Down Left
      'FUL': '10.20.1.213', // Front Upper Left
      'RUL': '10.20.1.214', // Rear Upper Left (Default)
      'RDL': '10.20.1.215', // Rear Down Left
      'EXT1': '10.20.1.216', // External Camera 1 (Outside hangar)
      'EXT2': '10.20.1.217'  // External Camera 2 (Outside hangar)
    };
    
    const cameraIP = cameraIPs[camera] || cameraIPs['RUL']; // Default to RUL if unknown camera
    const hangarIP = hangarConfig.ipAddress;
    const username = process.env.CAMERA_ADMIN_USERNAME || 'admin';
    const password = process.env.CAMERA_ADMIN_PASSWORD || '';
    
    // Create a temporary file for the image
    const tempFile = `/tmp/preview_${hangarId}_${Date.now()}.jpg`;
    
    // SSH command to fetch image via curl on the hangar system
    const sshCommand = `ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no system@${hangarIP} "curl -sSLk --fail --connect-timeout 5 --max-time 10 'http://${cameraIP}/cgi-bin/api.cgi?cmd=Snap&channel=0&rs=wuuPhkmUCeI9WG7C&user=${username}&password=${password}' -o - 2>/dev/null" > ${tempFile}`;
    
    log('info', `Fetching ${camera} camera image (${cameraIP}) via SSH from ${hangarIP}`);
    
    try {
      await execAsync(sshCommand, { timeout: 15000 });
      
      // Check if file was created and has content
      const stats = fs.statSync(tempFile);
      if (stats.size === 0) {
        throw new Error('Empty image received');
      }
      
      // Send the image
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      
      const stream = fs.createReadStream(tempFile);
      stream.pipe(res);
      
      // Clean up temp file after sending
      stream.on('end', () => {
        fs.unlink(tempFile, (err) => {
          if (err) log('warn', `Failed to delete temp file: ${tempFile}`);
        });
      });
      
    } catch (cmdError) {
      log('error', `SSH command failed: ${cmdError.message}`);
      // Clean up temp file if it exists
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      throw cmdError;
    }
    
  } catch (error) {
    log('error', 'Error in quick preview:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to fetch preview. Camera might be offline.' });
    }
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
    
    const hangarConfig = getHangarConfig(hangarId);
    if (!hangarConfig) {
      return res.status(404).json({ error: `Hangar ${hangarId} not found` });
    }
    
    if (!transforms || typeof transforms !== 'object') {
      return res.status(400).json({ error: 'Invalid transforms data' });
    }
    
    // Update the transforms in the hangars.json file
    const hangarsDataPath = path.join(__dirname, 'data', 'hangars.json');
    const hangarsData = JSON.parse(fs.readFileSync(hangarsDataPath, 'utf8'));
    const hangarIndex = hangarsData.hangars.findIndex(h => h.id === hangarId);
    
    if (hangarIndex === -1) {
      return res.status(404).json({ error: `Hangar ${hangarId} not found in data` });
    }
    
    hangarsData.hangars[hangarIndex].cameraTransforms = transforms;
    fs.writeFileSync(hangarsDataPath, JSON.stringify(hangarsData, null, 2));
    
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
    hangars: getAllHangars().length,
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
    const { status, completedBy, note, comment } = req.body;
    // Support both 'note' and 'comment' field names for compatibility
    const taskNote = note || comment || '';
    
    log('info', `Updating task ${taskId} status to ${status} for session ${sessionFolder}`);
    log('info', `Note received: "${taskNote}" (note: "${note}", comment: "${comment}")`);
    log('info', `Request body:`, req.body);
    
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
    log('info', `Total tasks in inspection: ${inspectionData.tasks.length}`);
    log('info', `First 5 task IDs: ${inspectionData.tasks.slice(0, 5).map(t => t.id).join(', ')}`);
    
    const task = inspectionData.tasks.find(t => t.id === taskId);
    if (!task) {
      log('error', `Task not found. Available task IDs: ${inspectionData.tasks.map(t => t.id).join(', ')}`);
      return res.status(404).json({ error: 'Task not found', availableIds: inspectionData.tasks.map(t => t.id) });
    }
    
    // Update task completion data
    task.status = status;
    task.completion = {
      completedBy: completedBy || 'Unknown',
      completedAt: new Date().toISOString()
    };
    
    // Always update the note field (even if empty string)
    // Save as both 'note' (for onsite compatibility) and 'comment' (for camera inspection)
    task.note = taskNote;
    task.comment = taskNote;
    log('info', `Setting task.note/comment to: "${task.note}" (received note: "${note}", comment: "${comment}")`)
    
    // Log the task after update
    log('info', `Task after update:`, {
      id: task.id,
      status: task.status,
      note: task.note,
      completion: task.completion
    });
    
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
    
    // Log what was actually saved for this specific task
    const savedTask = inspectionData.tasks.find(t => t.id === taskId);
    log('info', `Task ${taskId} saved with note: "${savedTask?.note}"`);
    log('info', `Full saved task:`, JSON.stringify(savedTask, null, 2));
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

// Debug endpoint to check specific task
app.get(/^\/api\/inspection\/(.+)\/task\/(.+)\/debug$/, async (req, res) => {
  try {
    const sessionFolder = req.params[0];
    const taskId = req.params[1];
    
    const sessionPath = path.join(SNAPSHOTS_DIR, sessionFolder);
    const files = fs.readdirSync(sessionPath);
    const inspectionFile = files.find(f => f.endsWith('_inspection.json') || f === 'inspection.json');
    
    if (!inspectionFile) {
      return res.status(404).json({ error: 'Inspection file not found' });
    }
    
    const filePath = path.join(sessionPath, inspectionFile);
    const inspectionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const task = inspectionData.tasks.find(t => t.id === taskId);
    
    res.json({
      taskId,
      task: task || 'Task not found',
      hasNote: !!task?.note,
      noteValue: task?.note || 'No note field',
      noteLength: task?.note?.length || 0
    });
  } catch (err) {
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
    
    // Add images from the session folder
    const imageFiles = files.filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png'));
    if (imageFiles.length > 0) {
      inspectionData.images = {};
      imageFiles.forEach(imageFile => {
        // Extract camera ID from filename (e.g., "FDR_260220_075448.jpg" -> "FDR")
        const cameraId = imageFile.split('_')[0];
        if (cameraId) {
          // Store the relative path from the data/sessions directory
          inspectionData.images[cameraId] = `${sessionFolder}/${imageFile}`;
        }
      });
    }
    
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
      return res.status(400).json({ error: 'Mission Reset must be completed before starting Full RTI' });
    }
    
    // Start Full RTI phase
    alarmSession.workflow.phases.fullRTI = {
      status: 'in-progress',
      startTime: new Date().toISOString()
    };
    
    // Get drone ID from alarm session or hangar configuration
    let droneId = alarmSession.droneId;
    if (!droneId) {
      const hangarConfig = getHangarConfig(hangarId);
      droneId = hangarConfig?.assignedDrone || 'unknown';
    }
    
    // Create session directory with consistent naming (includes both hangar and drone)
    const now = new Date();
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const hangarShortName = hangarId.replace('hangar_', '').replace('_vpn', ''); 
    const sessionName = `full_remote_ti_${hangarShortName}_${droneId}_${dateStr}_${timeStr}`;
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
            saveAlarmSession(sessionPath, alarmSession);
            
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
    log('info', `Clear area request for hangar: ${hangarId}`);
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    
    // Find latest alarm session for this hangar
    const files = fs.readdirSync(alarmsDir)
      .filter(f => f.startsWith(`alarm_${hangarId}_`) && f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));
    
    log('info', `Found ${files.length} alarm files for ${hangarId}`);
    
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
    
    // Debug logging
    log('info', `Before setting alarm status - current status: ${alarmSession.status}`);
    
    // Mark entire alarm as completed
    alarmSession.status = 'completed';
    alarmSession.completedAt = new Date().toISOString();
    
    log('info', `Marking alarm as completed for ${hangarId}`);
    log('info', `After setting - Alarm status: ${alarmSession.status}, completedAt: ${alarmSession.completedAt}`);
    
    // Ensure the properties are actually set before saving
    // Force the status to be completed no matter what
    const finalSession = JSON.parse(JSON.stringify(alarmSession)); // Deep clone
    finalSession.status = 'completed';
    finalSession.completedAt = finalSession.completedAt || new Date().toISOString();
    
    // Double-check before saving
    if (finalSession.status !== 'completed') {
      log('error', `WARNING: Status not set properly! Status is: ${finalSession.status}`);
      finalSession.status = 'completed'; // Force it again
    }
    
    // Save updated session using helper that preserves completed status
    try {
      saveAlarmSession(sessionPath, finalSession);
      log('info', `File written successfully to ${sessionPath}`);
    } catch (writeError) {
      log('error', `Failed to write file: ${writeError.message}`);
      throw writeError;
    }
    
    log('info', `Alarm session saved successfully for ${hangarId} with status: ${finalSession.status}`);
    
    res.json({ 
      success: true, 
      message: 'Area cleared and workflow completed',
      workflow: finalSession.workflow,
      alarmStatus: finalSession.status
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
    
    // Get drone ID from alarm session or hangar configuration
    let droneId = alarmSession.droneId;
    if (!droneId) {
      // Try to get from hangar configuration
      const hangarConfig = getHangarConfig(hangarId);
      droneId = hangarConfig?.assignedDrone || 'unknown';
    }
    
    // Create session directory with consistent naming (includes both hangar and drone)
    const now = new Date();
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const hangarShortName = hangarId.replace('hangar_', '').replace('_vpn', '');
    const sessionName = `onsite_ti_${hangarShortName}_${droneId}_${dateStr}_${timeStr}`;
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
    saveAlarmSession(sessionPath, alarmSession);
    
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
      
      saveAlarmSession(sessionPath, alarmSession);
      
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
    
    saveAlarmSession(sessionPath, alarmSession);
    
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
      // Get drone ID from alarm session or hangar configuration
      let droneId = alarmSession.droneId;
      if (!droneId) {
        const hangarConfig = getHangarConfig(hangarId);
        droneId = hangarConfig?.assignedDrone || 'unknown';
      }
      
      // Create session directory with consistent naming format (includes both hangar and drone)
      const now = new Date();
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
      const timeStr = now.toISOString().slice(11, 19).replace(/:/g, ''); // HHMMSS
      const hangarShortName = hangarId.replace('hangar_', '').replace('_vpn', ''); // Extract short name
      const sessionName = `mission_reset_${hangarShortName}_${droneId}_${dateStr}_${timeStr}`;
      const sessionDir = path.join(BASE_DIR, 'data', 'sessions', hangarId, sessionName);
      
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      
      // Determine template based on route
      const templateName = route === 'basic-extended' ? 'extended-ti-inspection.json' : 'mission-reset.json';
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
      
      // Update alarm session with Mission Reset inspection info
      alarmSession.inspections.missionReset = {
        sessionId: sessionName,
        path: `${hangarId}/${sessionName}`,
        createdAt: new Date().toISOString(),
        type: route === 'basic-extended' ? 'extended-ti-inspection' : 'mission-reset',
        progress: '0%'
      };
      
      // Start Mission Reset phase
      alarmSession.workflow.phases.missionReset = {
        status: 'in-progress',
        startTime: new Date().toISOString()
      };
      
      log('info', `Created Basic TI inspection for ${hangarId}: ${sessionName}`);
    }
    
    // Save updated alarm session - preserve existing status
    // Don't overwrite if alarm is already completed
    if (!alarmSession.status) {
      alarmSession.status = 'active';
    }
    
    saveAlarmSession(sessionPath, alarmSession);
    
    log('info', `Route decision saved for ${hangarId}, alarm status: ${alarmSession.status}`);
    
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
      
      // Save updated alarm session - but don't overwrite completed status
      // Important: If alarm was already marked completed, preserve that status
      if (!alarmSession.status) {
        alarmSession.status = 'active'; // Only set if not already set
      }
      
      saveAlarmSession(alarmSessionPath, alarmSession);
      
      log('info', `Updated ${inspectionType} progress for ${sessionPath}: ${progress}% (${tasksCompleted}/${totalTasks})`);
      log('info', `Alarm status preserved as: ${alarmSession.status}`);
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

// API endpoint to delete an inspection session
app.delete('/api/inspection/:hangarId/:sessionName', async (req, res) => {
  try {
    const { hangarId, sessionName } = req.params;
    
    // Build the full path to the session
    const sessionPath = path.join(SNAPSHOTS_DIR, hangarId, sessionName);
    
    // Check if the session exists
    if (!fs.existsSync(sessionPath)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Delete the entire session directory recursively
    fs.rmSync(sessionPath, { recursive: true, force: true });
    
    log('info', `Deleted session: ${hangarId}/${sessionName}`);
    res.json({ success: true, message: 'Session deleted successfully' });
    
  } catch (error) {
    log('error', `Failed to delete session: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// API endpoint to get maintenance history by drone (auto-detected from completed inspections)
app.get('/api/maintenance-history', async (req, res) => {
  try {
    const maintenanceHistory = {};
    
    // Load hangar-drone mapping
    const hangarDroneMap = {};
    try {
      const hangarsData = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'data', 'hangars.json'), 'utf8'));
      hangarsData.hangars.forEach(hangar => {
        if (hangar.assignedDrone) {
          // Extract hangar name from ID (e.g., "hangar_forsaker_vpn" -> "forsaker")
          const hangarName = hangar.id.replace('hangar_', '').replace('_vpn', '');
          hangarDroneMap[hangarName] = hangar.assignedDrone;
        }
      });
    } catch (err) {
      log('warn', 'Could not load hangar-drone mapping:', err.message);
    }
    
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
              // For inspection sessions, look for drone ID in the naming pattern
              // New format: type_hangar_drone_date_time
              // Old format: type_drone_date_time or type_hangar_date_time
              let foundDrone = false;
              for (let i = 0; i < parts.length - 2; i++) {
                // Skip type prefixes
                if (!['onsite', 'ti', 'remote', 'full', 'initial', 'extended', 'service', 'mission', 'reset', 'basic', 'partner'].includes(parts[i].toLowerCase())) {
                  // Check next part - if it looks like a drone ID (e.g., e3002), use it
                  if (i + 1 < parts.length - 2 && parts[i + 1].match(/^[a-z]\d+$/i)) {
                    droneId = parts[i + 1];
                    foundDrone = true;
                    break;
                  }
                  // Otherwise check if this is a hangar name we can map
                  else if (hangarDroneMap[parts[i]]) {
                    droneId = hangarDroneMap[parts[i]];
                    foundDrone = true;
                    break;
                  }
                  // Or it might be the drone ID itself
                  else if (parts[i].match(/^[a-z]\d+$/i)) {
                    droneId = parts[i];
                    foundDrone = true;
                    break;
                  }
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
              const inspType = inspectionData.inspectionType || inspectionData.type;
              
              // Check for onsite TI (must be specifically onsite)
              if (sessionNameLower.includes('onsite') || inspType === 'onsite-ti-inspection' || inspType === 'onsite_ti_inspection') {
                type = 'onsite-ti';
              } 
              // Check for extended TI
              else if (sessionNameLower.includes('extended') || inspType === 'extended-ti-inspection' || inspType === 'extended_ti_inspection') {
                type = 'extended-ti';
              } 
              // Check for FULL remote TI (not initial remote)
              else if (sessionNameLower.includes('full_remote') || 
                       inspType === 'full-remote-ti-inspection' ||
                       inspType === 'full_remote_ti_inspection' ||
                       inspType === 'full_remote_inspection') {
                // Only full remote, NOT initial remote
                type = 'full-remote';
              } 
              // Skip initial remote - it should NOT count as full remote
              else if (sessionNameLower.includes('initial_remote') || inspType === 'initial_remote_inspection') {
                // Initial remote is a different type, skip it
                type = null;
              }
              // Service partner
              else if (sessionNameLower.includes('service_partner')) {
                type = 'service-partner';
              } 
              // Service inspection
              else if (sessionNameLower.includes('service') || inspType === 'service-inspection' || inspType === 'service_inspection') {
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
            lastOnsiteTISession: null,
            lastExtendedTI: null,
            lastExtendedTISession: null,
            lastService: null,
            lastServiceSession: null,
            lastFullRemoteTI: null,
            lastFullRemoteTISession: null
          };
        }
        
        if (session.type === 'onsite-ti') {
          if (!maintenanceHistory[session.droneId].lastOnsiteTI || 
              new Date(session.date) > new Date(maintenanceHistory[session.droneId].lastOnsiteTI)) {
            maintenanceHistory[session.droneId].lastOnsiteTI = session.date;
            maintenanceHistory[session.droneId].lastOnsiteTISession = `${session.hangarId}/${session.sessionName}`;
          }
        } else if (session.type === 'extended-ti') {
          if (!maintenanceHistory[session.droneId].lastExtendedTI || 
              new Date(session.date) > new Date(maintenanceHistory[session.droneId].lastExtendedTI)) {
            maintenanceHistory[session.droneId].lastExtendedTI = session.date;
            maintenanceHistory[session.droneId].lastExtendedTISession = `${session.hangarId}/${session.sessionName}`;
          }
        } else if (session.type === 'service') {
          // Only update lastService for real service inspections, not service_partner
          if (!maintenanceHistory[session.droneId].lastService || 
              new Date(session.date) > new Date(maintenanceHistory[session.droneId].lastService)) {
            maintenanceHistory[session.droneId].lastService = session.date;
            maintenanceHistory[session.droneId].lastServiceSession = `${session.hangarId}/${session.sessionName}`;
          }
        } else if (session.type === 'full-remote') {
          // Track Full Remote TI inspections
          if (!maintenanceHistory[session.droneId].lastFullRemoteTI || 
              new Date(session.date) > new Date(maintenanceHistory[session.droneId].lastFullRemoteTI)) {
            maintenanceHistory[session.droneId].lastFullRemoteTI = session.date;
            maintenanceHistory[session.droneId].lastFullRemoteTISession = `${session.hangarId}/${session.sessionName}`;
          }
        }
        // Note: service-partner type is ignored - it's a basic inspection, not maintenance
      }
    }
    
    // Also check alarm sessions for completed Onsite TI inspections
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    if (fs.existsSync(alarmsDir)) {
      const alarmFiles = fs.readdirSync(alarmsDir)
        .filter(f => f.startsWith('alarm_') && f.endsWith('.json'));
      
      for (const alarmFile of alarmFiles) {
        try {
          const alarmData = JSON.parse(fs.readFileSync(path.join(alarmsDir, alarmFile), 'utf8'));
          
          // Check if this alarm has a completed Onsite TI
          if (alarmData.inspections?.onsiteTI?.completedAt && alarmData.droneId) {
            const droneId = alarmData.droneId;
            const completedDate = alarmData.inspections.onsiteTI.completedAt;
            
            if (!maintenanceHistory[droneId]) {
              maintenanceHistory[droneId] = {
                lastOnsiteTI: null,
                lastOnsiteTISession: null,
                lastExtendedTI: null,
                lastExtendedTISession: null,
                lastService: null,
                lastServiceSession: null,
                lastFullRemoteTI: null,
                lastFullRemoteTISession: null
              };
            }
            
            // Update if this is more recent than the existing date
            if (!maintenanceHistory[droneId].lastOnsiteTI || 
                new Date(completedDate) > new Date(maintenanceHistory[droneId].lastOnsiteTI)) {
              maintenanceHistory[droneId].lastOnsiteTI = completedDate;
              log('info', `Updated lastOnsiteTI for ${droneId} from alarm session: ${completedDate}`);
            }
          }
          
          // Note: Mission Reset inspections are NOT counted as service
          // They are basic inspections performed during alarm workflows, not maintenance
        } catch (err) {
          // Ignore parsing errors
          log('warn', `Failed to parse alarm file ${alarmFile}:`, err.message);
        }
      }
    }
    
    res.json(maintenanceHistory);
    
  } catch (error) {
    log('error', 'Failed to get maintenance history:', error.message);
    res.status(500).json({ error: 'Failed to get maintenance history' });
  }
});

// NEW API endpoint to get maintenance history per hangar (only for assigned drone at that hangar)
app.get('/api/hangar-maintenance/:hangarId', async (req, res) => {
  try {
    const { hangarId } = req.params;
    
    // Input validation - sanitize hangar ID
    if (!hangarId || typeof hangarId !== 'string' || hangarId.length > 100) {
      return res.status(400).json({ error: 'Invalid hangar ID' });
    }
    
    // Validate hangar ID format (alphanumeric with underscores only)
    if (!/^[a-zA-Z0-9_]+$/.test(hangarId)) {
      return res.status(400).json({ error: 'Invalid hangar ID format' });
    }
    
    // Load hangar configuration to get the assigned drone
    const hangarsData = JSON.parse(fs.readFileSync(path.join(BASE_DIR, 'data', 'hangars.json'), 'utf8'));
    const hangar = hangarsData.hangars.find(h => h.id === hangarId);
    
    if (!hangar) {
      return res.status(404).json({ error: 'Hangar not found' });
    }
    
    if (!hangar.assignedDrone) {
      // No drone assigned, return empty maintenance history
      return res.json({
        hangarId,
        assignedDrone: null,
        lastOnsiteTI: null,
        lastExtendedTI: null,
        lastService: null,
        lastFullRemoteTI: null
      });
    }
    
    const maintenanceHistory = {
      hangarId,
      assignedDrone: hangar.assignedDrone,
      lastOnsiteTI: null,
      lastOnsiteTIStatus: null,
      lastExtendedTI: null,
      lastExtendedTIStatus: null,
      lastService: null,
      lastServiceStatus: null,
      lastFullRemoteTI: null,
      lastFullRemoteTIStatus: null
    };
    
    // Use the hangar ID directly as the folder name (folders are named like "hangar_forsaker_vpn")
    const hangarPath = path.join(SNAPSHOTS_DIR, hangarId);
    
    // Only look for sessions in THIS hangar's folder
    if (fs.existsSync(hangarPath)) {
      const sessions = fs.readdirSync(hangarPath)
        .filter(item => {
          const itemPath = path.join(hangarPath, item);
          return fs.statSync(itemPath).isDirectory();
        });
      
      for (const sessionName of sessions) {
        const sessionPath = path.join(hangarPath, sessionName);
        
        // Check if this session is for the currently assigned drone
        // Session names can be like: "e3002_241124_140000" or "onsite_ti_e3002_241124_140000"
        if (!sessionName.toLowerCase().includes(hangar.assignedDrone.toLowerCase())) {
          continue; // Skip sessions from other drones that were previously at this hangar
        }
        
        // Find inspection JSON file
        const files = fs.readdirSync(sessionPath);
        const inspectionFile = files.find(f => f.endsWith('_inspection.json'));
        
        if (!inspectionFile) continue;
        
        try {
          const inspectionData = JSON.parse(fs.readFileSync(path.join(sessionPath, inspectionFile), 'utf8'));
          
          // Verify drone ID matches (double-check)
          const sessionDrone = inspectionData.sessionInfo?.drone || inspectionData.metadata?.droneId;
          if (sessionDrone && sessionDrone !== hangar.assignedDrone) {
            continue; // Skip if drone doesn't match
          }
          
          // Check inspection status and completion
          const tasks = inspectionData.tasks || [];
          const completedTasks = tasks.filter(t => t.status === 'pass' || t.status === 'fail' || t.status === 'na');
          const isCompleted = inspectionData.completionStatus?.status === 'completed' || 
                             (tasks.length > 0 && tasks.length === completedTasks.length);
          
          // Determine the inspection result status
          let inspectionStatus = 'pending';
          if (isCompleted) {
            const failedTasks = tasks.filter(t => t.status === 'fail' || t.status === 'failed');
            const skippedTasks = tasks.filter(t => t.status === 'na' || t.status === 'skip' || t.status === 'skipped');
            
            if (failedTasks.length > 0) {
              inspectionStatus = 'failed';
            } else if (skippedTasks.length > 0) {
              inspectionStatus = 'partial';
            } else {
              inspectionStatus = 'passed';
            }
          } else if (tasks.length > 0 && completedTasks.length > 0) {
            // Partially completed but not finished
            inspectionStatus = 'pending';
            // Don't skip pending inspections - we want to show them
          } else {
            continue; // Skip if no tasks at all
          }
          
          const completionDate = inspectionData.completionStatus?.completedAt || 
                                fs.statSync(sessionPath).mtime.toISOString();
          
          // Determine inspection type and update if more recent
          const sessionNameLower = sessionName.toLowerCase();
          const inspType = inspectionData.inspectionType || inspectionData.type;
          
          // Check for onsite TI (must be specifically onsite)
          if (sessionNameLower.includes('onsite') || inspType === 'onsite-ti-inspection' || inspType === 'onsite_ti_inspection') {
            if (!maintenanceHistory.lastOnsiteTI || 
                new Date(completionDate) > new Date(maintenanceHistory.lastOnsiteTI)) {
              maintenanceHistory.lastOnsiteTI = completionDate;
              maintenanceHistory.lastOnsiteTIStatus = inspectionStatus;
              maintenanceHistory.lastOnsiteTISession = `${hangarId}/${sessionName}`;
            }
          } 
          // Check for extended TI
          else if (sessionNameLower.includes('extended') || inspType === 'extended-ti-inspection' || inspType === 'extended_ti_inspection') {
            if (!maintenanceHistory.lastExtendedTI || 
                new Date(completionDate) > new Date(maintenanceHistory.lastExtendedTI)) {
              maintenanceHistory.lastExtendedTI = completionDate;
              maintenanceHistory.lastExtendedTIStatus = inspectionStatus;
              maintenanceHistory.lastExtendedTISession = `${hangarId}/${sessionName}`;
            }
          } 
          // Check for FULL remote TI (not initial remote)
          else if (sessionNameLower.includes('full_remote') || 
                   inspType === 'full-remote-ti-inspection' ||
                   inspType === 'full_remote_ti_inspection' ||
                   inspType === 'full_remote_inspection') {
            if (!maintenanceHistory.lastFullRemoteTI || 
                new Date(completionDate) > new Date(maintenanceHistory.lastFullRemoteTI)) {
              maintenanceHistory.lastFullRemoteTI = completionDate;
              maintenanceHistory.lastFullRemoteTIStatus = inspectionStatus;
              maintenanceHistory.lastFullRemoteTISession = `${hangarId}/${sessionName}`;
            }
          }
          // Skip initial remote - it should NOT count as full remote
          else if (sessionNameLower.includes('initial_remote') || inspType === 'initial_remote_inspection') {
            // Initial remote is a different type, don't count it
          }
          // Service inspection
          else if (sessionNameLower.includes('service') && !sessionNameLower.includes('service_partner')) {
            if (!maintenanceHistory.lastService || 
                new Date(completionDate) > new Date(maintenanceHistory.lastService)) {
              maintenanceHistory.lastService = completionDate;
              maintenanceHistory.lastServiceStatus = inspectionStatus;
              maintenanceHistory.lastServiceSession = `${hangarId}/${sessionName}`;
            }
          }
        } catch (err) {
          // Ignore parsing errors
          log('warn', `Failed to parse inspection file ${inspectionFile}:`, err.message);
        }
      }
    }
    
    // Also check alarm sessions for this hangar
    const alarmsDir = path.join(BASE_DIR, 'data', 'sessions', 'alarms');
    if (fs.existsSync(alarmsDir)) {
      const alarmFiles = fs.readdirSync(alarmsDir)
        .filter(f => f.startsWith('alarm_') && f.endsWith('.json'));
      
      for (const alarmFile of alarmFiles) {
        try {
          const alarmData = JSON.parse(fs.readFileSync(path.join(alarmsDir, alarmFile), 'utf8'));
          
          // Check if this alarm is for the correct hangar and drone
          if (alarmData.hangarId === hangarId && 
              alarmData.droneId === hangar.assignedDrone &&
              alarmData.inspections?.onsiteTI?.completedAt) {
            
            const completedDate = alarmData.inspections.onsiteTI.completedAt;
            
            if (!maintenanceHistory.lastOnsiteTI || 
                new Date(completedDate) > new Date(maintenanceHistory.lastOnsiteTI)) {
              maintenanceHistory.lastOnsiteTI = completedDate;
            }
          }
        } catch (err) {
          log('warn', `Failed to parse alarm file ${alarmFile}:`, err.message);
        }
      }
    }
    
    res.json(maintenanceHistory);
    
  } catch (error) {
    log('error', 'Failed to get hangar maintenance history:', error.message);
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
        lastFullRemoteTI: null,
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
    } else if (type === 'full-remote-ti') {
      history[hangarId].lastFullRemoteTI = date;
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

// API endpoints for template management
app.get('/api/templates', async (req, res) => {
  try {
    const templatesDir = path.join(BASE_DIR, 'data', 'templates');
    const templateFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));
    const templates = {};
    
    for (const file of templateFiles) {
      const templatePath = path.join(templatesDir, file);
      const templateData = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
      const key = file.replace('.json', '');
      templates[key] = templateData;
    }
    
    res.json(templates);
  } catch (error) {
    log('error', 'Failed to fetch templates:', error.message);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

app.put('/api/templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const templateData = req.body;
    
    if (!templateData || !templateData.inspectionType) {
      return res.status(400).json({ error: 'Invalid template data' });
    }
    
    const templatePath = path.join(BASE_DIR, 'data', 'templates', `${templateId}.json`);
    
    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    // Save the updated template
    fs.writeFileSync(templatePath, JSON.stringify(templateData, null, 2));
    
    log('info', `Template ${templateId} updated successfully`);
    res.json({ success: true, message: 'Template updated successfully' });
    
  } catch (error) {
    log('error', 'Failed to update template:', error.message);
    res.status(500).json({ error: 'Failed to update template' });
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