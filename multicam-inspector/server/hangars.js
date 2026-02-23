const fs = require('fs');
const path = require('path');

const HANGARS_FILE = path.join(__dirname, '..', 'data', 'hangars.json');
const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data', 'sessions');

// Ensure hangars.json exists
function ensureHangarsFile() {
  if (!fs.existsSync(HANGARS_FILE)) {
    const defaultData = { hangars: [] };
    fs.writeFileSync(HANGARS_FILE, JSON.stringify(defaultData, null, 2));
  }
}

// Get maintenance history for a specific hangar
async function getHangarMaintenanceHistory(hangarId) {
  try {
    const maintenanceHistory = {
      lastOnsiteTI: null,
      lastOnsiteTISession: null,
      lastExtendedTI: null,
      lastExtendedTISession: null,
      lastService: null,
      lastServiceSession: null,
      lastFullRemoteTI: null,
      lastFullRemoteTISession: null
    };
    
    // Get hangar configuration
    const data = readHangars();
    const hangar = data.hangars.find(h => h.id === hangarId);
    if (!hangar || !hangar.assignedDrone) return maintenanceHistory;
    
    const hangarPath = path.join(SNAPSHOTS_DIR, hangarId);
    if (!fs.existsSync(hangarPath)) return maintenanceHistory;
    
    // Get all session folders for this hangar
    const sessions = fs.readdirSync(hangarPath)
      .filter(item => {
        const itemPath = path.join(hangarPath, item);
        return fs.statSync(itemPath).isDirectory();
      });
    
    for (const sessionName of sessions) {
      const sessionPath = path.join(hangarPath, sessionName);
      
      // Find inspection JSON file
      const files = fs.readdirSync(sessionPath);
      const inspectionFile = files.find(f => f.endsWith('_inspection.json'));
      
      if (!inspectionFile) continue;
      
      try {
        const inspectionData = JSON.parse(fs.readFileSync(path.join(sessionPath, inspectionFile), 'utf8'));
        
        // Verify drone ID matches (double-check)
        const sessionDrone = inspectionData.sessionInfo?.drone || inspectionData.metadata?.droneId;
        if (sessionDrone && sessionDrone !== hangar.assignedDrone && sessionDrone !== 'unknown') {
          continue; // Skip if drone doesn't match
        }
        
        // Check if inspection is completed
        const isCompleted = inspectionData.completionStatus?.status === 'completed' ||
                           (inspectionData.tasks && 
                            inspectionData.tasks.every(t => t.status === 'pass' || t.status === 'fail' || t.status === 'na'));
        
        if (!isCompleted) continue;
        
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
            maintenanceHistory.lastOnsiteTISession = `${hangarId}/${sessionName}`;
          }
        } 
        // Check for extended TI
        else if (sessionNameLower.includes('extended') || inspType === 'extended-ti-inspection' || inspType === 'extended_ti_inspection') {
          if (!maintenanceHistory.lastExtendedTI || 
              new Date(completionDate) > new Date(maintenanceHistory.lastExtendedTI)) {
            maintenanceHistory.lastExtendedTI = completionDate;
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
            maintenanceHistory.lastServiceSession = `${hangarId}/${sessionName}`;
          }
        }
      } catch (err) {
        // Ignore parsing errors
        console.warn(`Failed to parse inspection file ${inspectionFile}:`, err.message);
      }
    }
    
    return maintenanceHistory;
  } catch (error) {
    console.error(`Error getting maintenance history for ${hangarId}:`, error);
    return {
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

// Get all hangars with maintenance history
async function getHangars(req, res) {
  try {
    const data = readHangars();
    
    // Get maintenance history for each hangar
    const hangarsWithMaintenance = await Promise.all(data.hangars.map(async (hangar) => {
      const maintenanceHistory = await getHangarMaintenanceHistory(hangar.id);
      return {
        ...hangar,
        maintenanceHistory
      };
    }));
    
    res.json({
      success: true,
      hangars: hangarsWithMaintenance
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
    
    // Check if ID is being changed
    const newId = req.body.id || id;
    
    // If ID is changing, check for duplicates
    if (newId !== id && data.hangars.find(h => h.id === newId)) {
      return res.status(400).json({
        success: false,
        message: 'A hangar with this ID already exists'
      });
    }
    
    data.hangars[index] = {
      ...data.hangars[index],
      ...req.body,
      id: newId, // Allow ID to be changed
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

// Get hangar config from hangars.json
function getHangarFromConfig(hangarId) {
  try {
    const hangarsData = getHangars();
    return hangarsData.find(h => h.id === hangarId) || null;
  } catch (error) {
    console.error('Error reading hangar config:', error);
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