const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs-extra');
const path = require('path');

// Try to load dotenv if available (for development)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not available, will use default values or environment variables
}

// JWT secret is required for security - fail if not provided
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('ERROR: JWT_SECRET environment variable is required for security');
  console.error('Please set JWT_SECRET in your .env file with a strong random value');
  console.error('You can generate one with: openssl rand -base64 32');
  process.exit(1);
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

// Users database file
const USERS_DB_PATH = path.join(__dirname, '../data/users.json');
const LOGIN_ATTEMPTS_PATH = path.join(__dirname, '../data/login_attempts.json');

// Track failed login attempts
const loginAttempts = new Map();

// Initialize users database if it doesn't exist
async function initializeUsersDB() {
  if (!await fs.exists(USERS_DB_PATH)) {
    const defaultUsers = [
      {
        id: 'usr_001',
        username: 'admin',
        email: 'admin@everdrone.com',
        phone: '+1-555-0101',
        password: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'everdrone2024', BCRYPT_ROUNDS),
        type: 'admin',
        permissions: {
          canCaptureImages: true,
          canBrowseSessions: true,
          canDeleteSessions: true,
          canExportData: true,
          canAccessAllHangars: true,
          canPerformInspections: true
        },
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr_002',
        username: 'remote_inspector',
        email: 'inspector@remote.com',
        phone: '+1-555-0102',
        password: await bcrypt.hash('remote2024', BCRYPT_ROUNDS),
        type: 'service_partner',
        permissions: {
          canCaptureImages: false,
          canBrowseSessions: true,
          canDeleteSessions: false,
          canExportData: true,
          canAccessAllHangars: false,
          allowedHangars: ['THN', 'VÄN'],
          canPerformInspections: true,
          inspectionTypes: ['remote-ti-inspection', 'initial-remote-ti-inspection', 'full-remote-ti-inspection']
        },
        createdAt: new Date().toISOString()
      }
    ];

    await fs.ensureDir(path.dirname(USERS_DB_PATH));
    await fs.writeJson(USERS_DB_PATH, { users: defaultUsers }, { spaces: 2 });
    console.log('Users database initialized with default users');
  }
}

// Load users from database
async function loadUsers() {
  try {
    const data = await fs.readJson(USERS_DB_PATH);
    const users = data.users || [];
    
    // Backward compatibility: map 'remote' to 'service_partner'
    return users.map(user => {
      if (user.type === 'remote') {
        return { ...user, type: 'service_partner' };
      }
      return user;
    });
  } catch (error) {
    console.error('Error loading users:', error);
    return [];
  }
}

// Save users to database
async function saveUsers(users) {
  try {
    await fs.writeJson(USERS_DB_PATH, { users }, { spaces: 2 });
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

// Find user by username
async function findUserByUsername(username) {
  const users = await loadUsers();
  return users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

// Verify password
async function verifyPassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}

// Generate JWT token
function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    type: user.type,
    permissions: user.permissions
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

// Login attempt tracking
async function logLoginAttempt(username, ipAddress, success, reason = null) {
  const timestamp = new Date().toISOString();
  const attempt = {
    timestamp,
    username: username.substring(0, 50), // Limit username length for logging
    ipAddress,
    success,
    reason
  };

  // Track in memory for rate limiting
  const key = `${username}:${ipAddress}`;
  if (!loginAttempts.has(key)) {
    loginAttempts.set(key, []);
  }
  
  const attempts = loginAttempts.get(key);
  attempts.push({ timestamp, success });
  
  // Keep only last 100 attempts per key in memory
  if (attempts.length > 100) {
    attempts.shift();
  }

  // Log to file for audit trail
  try {
    let logData = [];
    if (await fs.exists(LOGIN_ATTEMPTS_PATH)) {
      const fileContent = await fs.readFile(LOGIN_ATTEMPTS_PATH, 'utf8');
      logData = JSON.parse(fileContent);
    }
    
    logData.push(attempt);
    
    // Keep only last 10000 entries
    if (logData.length > 10000) {
      logData = logData.slice(-10000);
    }
    
    await fs.writeJson(LOGIN_ATTEMPTS_PATH, logData, { spaces: 2 });
  } catch (error) {
    console.error('Failed to log login attempt:', error);
  }
  
  // Log to console for immediate visibility
  const logLevel = success ? 'INFO' : 'WARN';
  console.log(`[${timestamp}] [${logLevel}] Login attempt - User: ${username}, IP: ${ipAddress}, Success: ${success}${reason ? `, Reason: ${reason}` : ''}`);
}

function getRecentFailedAttempts(username, ipAddress, minutes = 15) {
  const key = `${username}:${ipAddress}`;
  const attempts = loginAttempts.get(key) || [];
  const cutoff = Date.now() - (minutes * 60 * 1000);
  
  return attempts.filter(a => 
    !a.success && 
    new Date(a.timestamp).getTime() > cutoff
  ).length;
}

// Permission middleware
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions || !req.user.permissions[permission]) {
      return res.status(403).json({ 
        success: false, 
        message: `Permission denied: ${permission} required` 
      });
    }
    next();
  };
}

// Login endpoint handler
async function handleLogin(req, res) {
  const { username, password } = req.body;
  const ipAddress = req.ip || req.connection.remoteAddress;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required'
    });
  }

  try {
    // Check for too many recent failed attempts
    const recentFailures = getRecentFailedAttempts(username, ipAddress);
    if (recentFailures >= 5) {
      await logLoginAttempt(username, ipAddress, false, 'Account temporarily locked');
      return res.status(429).json({
        success: false,
        message: 'Too many failed login attempts. Please try again later.',
        retryAfter: 900 // 15 minutes in seconds
      });
    }

    const user = await findUserByUsername(username);
    
    if (!user) {
      await logLoginAttempt(username, ipAddress, false, 'User not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    const isValidPassword = await verifyPassword(password, user.password);
    
    if (!isValidPassword) {
      await logLoginAttempt(username, ipAddress, false, 'Invalid password');
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    // Update last login
    user.lastLogin = new Date().toISOString();
    const users = await loadUsers();
    const userIndex = users.findIndex(u => u.id === user.id);
    if (userIndex !== -1) {
      users[userIndex].lastLogin = user.lastLogin;
      await saveUsers(users);
    }

    // Generate token
    const token = generateToken(user);

    // Log successful login
    await logLoginAttempt(username, ipAddress, true);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      user: userWithoutPassword,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Token validation endpoint handler
async function handleValidateToken(req, res) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }

  const user = await findUserByUsername(decoded.username);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const { password: _, ...userWithoutPassword } = user;

  res.json({
    success: true,
    user: userWithoutPassword
  });
}

// Change password endpoint handler
async function handleChangePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'Current password and new password are required'
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'New password must be at least 8 characters long'
    });
  }

  try {
    const users = await loadUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = users[userIndex];
    const isValidPassword = await verifyPassword(currentPassword, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    users[userIndex].password = hashedPassword;
    
    await saveUsers(users);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// User management functions

// Get all users (admin only)
async function handleGetUsers(req, res) {
  if (req.user.type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }

  try {
    const users = await loadUsers();
    const usersWithoutPasswords = users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
    
    res.json({
      success: true,
      users: usersWithoutPasswords
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Create new user (admin only)
async function handleCreateUser(req, res) {
  if (req.user.type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }

  const { username, email, phone, password, type } = req.body;

  if (!username || !password || !type) {
    return res.status(400).json({
      success: false,
      message: 'Username, password, and type are required'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long'
    });
  }

  if (!['admin', 'everdrone', 'service_partner'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'Type must be "admin", "everdrone", or "service_partner"'
    });
  }

  try {
    const users = await loadUsers();
    
    // Check if username already exists
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Check if email already exists (only if email is provided)
    if (email && users.some(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Generate unique ID
    const newId = `usr_${String(Date.now()).slice(-6)}_${Math.random().toString(36).slice(-3)}`;

    // Set permissions based on user type
    let permissions;
    if (type === 'admin') {
      permissions = {
        canCaptureImages: true,
        canBrowseSessions: true,
        canDeleteSessions: true,
        canExportData: true,
        canAccessAllHangars: true,
        canPerformInspections: true
      };
    } else if (type === 'everdrone') {
      permissions = {
        canCaptureImages: true,
        canBrowseSessions: true,
        canDeleteSessions: true,
        canExportData: true,
        canAccessAllHangars: true,
        canPerformInspections: true
      };
    } else {
      // service_partner
      permissions = {
        canCaptureImages: false,
        canBrowseSessions: true,
        canDeleteSessions: false,
        canExportData: true,
        canAccessAllHangars: false,
        allowedHangars: ['hangar_sisjon_vpn', 'hangar_rouen_vpn'],
        canPerformInspections: true,
        inspectionTypes: ['remote-ti-inspection', 'initial-remote-ti-inspection', 'full-remote-ti-inspection']
      };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const newUser = {
      id: newId,
      username,
      ...(email && { email }),
      ...(phone && { phone }),
      password: hashedPassword,
      type,
      permissions,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    await saveUsers(users);

    // Return user without password
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Update user (admin only)
async function handleUpdateUser(req, res) {
  if (req.user.type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }

  const { id } = req.params;
  const { username, email, phone, type } = req.body;

  if (!username || !type) {
    return res.status(400).json({
      success: false,
      message: 'Username and type are required'
    });
  }

  if (!['admin', 'everdrone', 'service_partner'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'Type must be "admin", "everdrone", or "service_partner"'
    });
  }

  try {
    const users = await loadUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if username is taken by another user
    if (users.some(u => u.id !== id && u.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Username already exists'
      });
    }

    // Check if email is taken by another user (only if email is provided)
    if (email && users.some(u => u.id !== id && u.email && u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Update permissions based on user type
    let permissions;
    if (type === 'admin') {
      permissions = {
        canCaptureImages: true,
        canBrowseSessions: true,
        canDeleteSessions: true,
        canExportData: true,
        canAccessAllHangars: true,
        canPerformInspections: true
      };
    } else if (type === 'everdrone') {
      permissions = {
        canCaptureImages: true,
        canBrowseSessions: true,
        canDeleteSessions: true,
        canExportData: true,
        canAccessAllHangars: true,
        canPerformInspections: true
      };
    } else {
      // service_partner
      permissions = {
        canCaptureImages: false,
        canBrowseSessions: true,
        canDeleteSessions: false,
        canExportData: true,
        canAccessAllHangars: false,
        allowedHangars: ['hangar_sisjon_vpn', 'hangar_rouen_vpn'],
        canPerformInspections: true,
        inspectionTypes: ['remote-ti-inspection', 'initial-remote-ti-inspection', 'full-remote-ti-inspection']
      };
    }

    users[userIndex] = {
      ...users[userIndex],
      username,
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      type,
      permissions,
      updatedAt: new Date().toISOString()
    };

    await saveUsers(users);

    // Return user without password
    const { password, ...userWithoutPassword } = users[userIndex];

    res.json({
      success: true,
      message: 'User updated successfully',
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Delete user (admin only)
async function handleDeleteUser(req, res) {
  if (req.user.type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }

  const { id } = req.params;

  // Prevent admin from deleting themselves
  if (req.user.id === id) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete your own account'
    });
  }

  try {
    const users = await loadUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    users.splice(userIndex, 1);
    await saveUsers(users);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

// Change user password (admin only)
async function handleChangeUserPassword(req, res) {
  if (req.user.type !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }

  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({
      success: false,
      message: 'New password is required'
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long'
    });
  }

  try {
    const users = await loadUsers();
    const userIndex = users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    users[userIndex].password = hashedPassword;
    users[userIndex].updatedAt = new Date().toISOString();

    await saveUsers(users);

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Change user password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
}

module.exports = {
  initializeUsersDB,
  authenticateToken,
  requirePermission,
  handleLogin,
  handleValidateToken,
  handleChangePassword,
  findUserByUsername,
  generateToken,
  handleGetUsers,
  handleCreateUser,
  handleUpdateUser,
  handleDeleteUser,
  handleChangeUserPassword
};