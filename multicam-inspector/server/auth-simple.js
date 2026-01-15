/**
 * Simplified authentication module without external dependencies
 * For use on systems where bcrypt/jwt are not available
 */

const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');

// Simple password hashing using crypto (not as secure as bcrypt but no dependencies)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'everdrone-salt').digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// Simple token generation
function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    type: user.type,
    permissions: user.permissions,
    exp: Date.now() + (8 * 60 * 60 * 1000) // 8 hours
  };
  
  const token = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', 'jwt-secret-key')
    .update(token)
    .digest('base64');
  
  return `${token}.${signature}`;
}

function verifyToken(token) {
  try {
    const [payload, signature] = token.split('.');
    
    const expectedSignature = crypto.createHmac('sha256', 'jwt-secret-key')
      .update(payload)
      .digest('base64');
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    const data = JSON.parse(Buffer.from(payload, 'base64').toString());
    
    if (data.exp < Date.now()) {
      return null; // Token expired
    }
    
    return data;
  } catch (error) {
    return null;
  }
}

// Users database file
const USERS_DB_PATH = path.join(__dirname, '../data/users.json');

// Default users with simple hashed passwords
const DEFAULT_USERS = [
  {
    id: 'usr_001',
    username: 'admin',
    email: 'admin@everdrone.com',
    password: hashPassword('everdrone2024'),
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
    password: hashPassword('remote2024'),
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

// Initialize users database if it doesn't exist
async function initializeUsersDB() {
  if (!await fs.exists(USERS_DB_PATH)) {
    await fs.ensureDir(path.dirname(USERS_DB_PATH));
    await fs.writeJson(USERS_DB_PATH, { users: DEFAULT_USERS }, { spaces: 2 });
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
    return DEFAULT_USERS;
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

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Username and password are required'
    });
  }

  try {
    const user = await findUserByUsername(username);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password'
      });
    }

    const isValidPassword = verifyPassword(password, user.password);
    
    if (!isValidPassword) {
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
    const isValidPassword = verifyPassword(currentPassword, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    users[userIndex].password = hashPassword(newPassword);
    
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

module.exports = {
  initializeUsersDB,
  authenticateToken,
  requirePermission,
  handleLogin,
  handleValidateToken,
  handleChangePassword,
  findUserByUsername,
  generateToken
};