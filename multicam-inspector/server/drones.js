const fs = require('fs');
const path = require('path');

// Path to drones data file
const dronesFile = path.join(__dirname, '..', 'data', 'drones.json');

// Ensure data directory and file exist
function ensureDronesFile() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (!fs.existsSync(dronesFile)) {
    const initialData = {
      drones: []
    };
    fs.writeFileSync(dronesFile, JSON.stringify(initialData, null, 2));
  }
}

// Get all drones
function getDrones(req, res) {
  try {
    ensureDronesFile();
    const data = JSON.parse(fs.readFileSync(dronesFile, 'utf8'));
    res.json({ success: true, drones: data.drones });
  } catch (error) {
    console.error('Error reading drones:', error);
    res.status(500).json({ success: false, message: 'Failed to load drones' });
  }
}

// Get single drone
function getDrone(req, res) {
  try {
    ensureDronesFile();
    const data = JSON.parse(fs.readFileSync(dronesFile, 'utf8'));
    const drone = data.drones.find(d => d.id === req.params.id);
    
    if (!drone) {
      return res.status(404).json({ success: false, message: 'Drone not found' });
    }
    
    res.json({ success: true, drone });
  } catch (error) {
    console.error('Error reading drone:', error);
    res.status(500).json({ success: false, message: 'Failed to load drone' });
  }
}

// Create new drone
function createDrone(req, res) {
  try {
    ensureDronesFile();
    const data = JSON.parse(fs.readFileSync(dronesFile, 'utf8'));
    
    const newDrone = {
      id: req.body.id || req.body.label.toLowerCase().replace(/\s+/g, '_'),
      label: req.body.label,
      serialNumber: req.body.serialNumber || '',
      model: req.body.model || 'Everdrone Model X',
      status: req.body.status || 'available',
      currentHangar: req.body.currentHangar || null,
      lastMaintenanceDate: req.body.lastMaintenanceDate || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Check if drone with same ID already exists
    if (data.drones.find(d => d.id === newDrone.id)) {
      return res.status(400).json({ success: false, message: 'Drone with this ID already exists' });
    }
    
    data.drones.push(newDrone);
    fs.writeFileSync(dronesFile, JSON.stringify(data, null, 2));
    
    res.json({ success: true, drone: newDrone });
  } catch (error) {
    console.error('Error creating drone:', error);
    res.status(500).json({ success: false, message: 'Failed to create drone' });
  }
}

// Update existing drone
function updateDrone(req, res) {
  try {
    ensureDronesFile();
    const data = JSON.parse(fs.readFileSync(dronesFile, 'utf8'));
    const droneIndex = data.drones.findIndex(d => d.id === req.params.id);
    
    if (droneIndex === -1) {
      return res.status(404).json({ success: false, message: 'Drone not found' });
    }
    
    // Update drone data
    data.drones[droneIndex] = {
      ...data.drones[droneIndex],
      ...req.body,
      id: req.params.id, // Preserve ID
      updatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(dronesFile, JSON.stringify(data, null, 2));
    
    res.json({ success: true, drone: data.drones[droneIndex] });
  } catch (error) {
    console.error('Error updating drone:', error);
    res.status(500).json({ success: false, message: 'Failed to update drone' });
  }
}

// Delete drone
function deleteDrone(req, res) {
  try {
    ensureDronesFile();
    const data = JSON.parse(fs.readFileSync(dronesFile, 'utf8'));
    const droneIndex = data.drones.findIndex(d => d.id === req.params.id);
    
    if (droneIndex === -1) {
      return res.status(404).json({ success: false, message: 'Drone not found' });
    }
    
    // Check if drone is assigned to a hangar
    const drone = data.drones[droneIndex];
    if (drone.currentHangar) {
      // Also update the hangar to remove the drone assignment
      const hangarsFile = path.join(__dirname, '..', 'data', 'hangars.json');
      if (fs.existsSync(hangarsFile)) {
        const hangarData = JSON.parse(fs.readFileSync(hangarsFile, 'utf8'));
        const hangar = hangarData.hangars.find(h => h.id === drone.currentHangar);
        if (hangar && hangar.assignedDrone === drone.id) {
          hangar.assignedDrone = null;
          hangar.updatedAt = new Date().toISOString();
          fs.writeFileSync(hangarsFile, JSON.stringify(hangarData, null, 2));
        }
      }
    }
    
    data.drones.splice(droneIndex, 1);
    fs.writeFileSync(dronesFile, JSON.stringify(data, null, 2));
    
    res.json({ success: true, message: 'Drone deleted successfully' });
  } catch (error) {
    console.error('Error deleting drone:', error);
    res.status(500).json({ success: false, message: 'Failed to delete drone' });
  }
}

module.exports = {
  getDrones,
  getDrone,
  createDrone,
  updateDrone,
  deleteDrone
};