const fs = require('fs');
const path = require('path');

const HANGARS_FILE = path.join(__dirname, '..', 'data', 'hangars.json');

// Ensure hangars.json exists
function ensureHangarsFile() {
  if (!fs.existsSync(HANGARS_FILE)) {
    const defaultData = { hangars: [] };
    fs.writeFileSync(HANGARS_FILE, JSON.stringify(defaultData, null, 2));
  }
}

// Read hangars from file
function readHangars() {
  ensureHangarsFile();
  const data = fs.readFileSync(HANGARS_FILE, 'utf-8');
  return JSON.parse(data);
}

// Write hangars to file
function writeHangars(data) {
  fs.writeFileSync(HANGARS_FILE, JSON.stringify(data, null, 2));
}

// Get all hangars
async function getHangars(req, res) {
  try {
    const data = readHangars();
    res.json({
      success: true,
      hangars: data.hangars
    });
  } catch (error) {
    console.error('Error reading hangars:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to read hangars'
    });
  }
}

// Get single hangar
async function getHangar(req, res) {
  try {
    const { id } = req.params;
    const data = readHangars();
    const hangar = data.hangars.find(h => h.id === id);
    
    if (!hangar) {
      return res.status(404).json({
        success: false,
        message: 'Hangar not found'
      });
    }
    
    res.json({
      success: true,
      hangar
    });
  } catch (error) {
    console.error('Error reading hangar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to read hangar'
    });
  }
}

// Create new hangar
async function createHangar(req, res) {
  try {
    // Admin only
    if (req.user.type !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin privileges required'
      });
    }
    
    const data = readHangars();
    const newHangar = {
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Check if hangar ID already exists
    if (data.hangars.find(h => h.id === newHangar.id)) {
      return res.status(400).json({
        success: false,
        message: 'Hangar with this ID already exists'
      });
    }
    
    data.hangars.push(newHangar);
    writeHangars(data);
    
    res.json({
      success: true,
      hangar: newHangar
    });
  } catch (error) {
    console.error('Error creating hangar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create hangar'
    });
  }
}

// Update hangar
async function updateHangar(req, res) {
  try {
    // Admin only
    if (req.user.type !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin privileges required'
      });
    }
    
    const { id } = req.params;
    const data = readHangars();
    const index = data.hangars.findIndex(h => h.id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Hangar not found'
      });
    }
    
    data.hangars[index] = {
      ...data.hangars[index],
      ...req.body,
      id: id, // Ensure ID doesn't change
      updatedAt: new Date().toISOString()
    };
    
    writeHangars(data);
    
    res.json({
      success: true,
      hangar: data.hangars[index]
    });
  } catch (error) {
    console.error('Error updating hangar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update hangar'
    });
  }
}

// Delete hangar
async function deleteHangar(req, res) {
  try {
    // Admin only
    if (req.user.type !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin privileges required'
      });
    }
    
    const { id } = req.params;
    const data = readHangars();
    const index = data.hangars.findIndex(h => h.id === id);
    
    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Hangar not found'
      });
    }
    
    data.hangars.splice(index, 1);
    writeHangars(data);
    
    res.json({
      success: true,
      message: 'Hangar deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting hangar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete hangar'
    });
  }
}

// Update config.js with hangar changes
function updateConfigFile(hangar) {
  // Skip updating config.js since we're now using hangars.json
  // The config.js will load from hangars.json automatically
  console.log(`Hangar ${hangar.id} saved to hangars.json`);
}

// Get hangar config from config.js for compatibility
function getHangarFromConfig(hangarId) {
  try {
    const config = require('../config');
    return config.hangars[hangarId];
  } catch (error) {
    console.error('Error reading config:', error);
    return null;
  }
}

module.exports = {
  getHangars,
  getHangar,
  createHangar,
  updateHangar,
  deleteHangar,
  getHangarFromConfig
};