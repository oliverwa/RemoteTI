/**
 * Unified Configuration System for MultiCam Inspector
 * Single source of truth for all environment configurations
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Environment detection
function detectEnvironment() {
  // Check if we're running on a Raspberry Pi
  if (os.platform() === 'linux' && fs.existsSync('/home/pi')) {
    return 'pi';
  }
  
  // Check if we're in development (has node_modules, package.json)
  if (fs.existsSync(path.join(__dirname, 'node_modules'))) {
    return 'dev';
  }
  
  // Default to production
  return 'production';
}

// Base configuration (common across all environments)
const baseConfig = {
  server: {
    port: 3001,
    maxDroneNameLength: 50,
    droneNameRegex: "^[a-zA-Z0-9_-]+$"
  },
  
  cameras: {
    ids: ["FDR", "FUR", "RUR", "RDR", "FDL", "FUL", "RUL", "RDL"],
    details: [
      { id: "FDR", name: "Front Down Right", position: "front_down_right" },
      { id: "FUR", name: "Front Up Right", position: "front_up_right" },
      { id: "RUR", name: "Rear Up Right", position: "rear_up_right" },
      { id: "RDR", name: "Rear Down Right", position: "rear_down_right" },
      { id: "FDL", name: "Front Down Left", position: "front_down_left" },
      { id: "FUL", name: "Front Up Left", position: "front_up_left" },
      { id: "RUL", name: "Rear Up Left", position: "rear_up_left" },
      { id: "RDL", name: "Rear Down Left", position: "rear_down_left" }
    ],
    ips: {
      "FDR": "10.20.1.208",
      "FUR": "10.20.1.209", 
      "RUR": "10.20.1.210",
      "RDR": "10.20.1.211",
      "FDL": "10.20.1.212",
      "FUL": "10.20.1.213",
      "RUL": "10.20.1.214",
      "RDL": "10.20.1.215"
    },
    credentials: {
      username: "admin",
      password: "H4anGar0NeC4amAdmin"
    }
  },
  
  hangars: {
    hangar_sisjon_vpn: {
      id: "hangar_sisjon_vpn",
      label: "Mölndal (hangar_sisjon_vpn) - BASELINE",
      description: "Mölndal hangar",
      connection: {
        ssh_host: "system@10.0.10.113",
        ip: "10.0.10.113"
      },
      folderName: "Molndal", // What the server API returns
      lights: {
        enabled: true,
        endpoint: "https://10.0.10.113:7548/hangar/lightson",
        username: "system",
        password: "FJjf93/#",
        waitTime: 3 // seconds to wait after turning on lights
      },
      cameraTransforms: {
        // Baseline - no transforms needed
        0: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        1: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        2: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        3: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        4: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        5: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        6: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        7: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      }
    },
    hangar_rouen_vpn: {
      id: "hangar_rouen_vpn", 
      label: "Forges-les-Eaux (hangar_rouen_vpn)",
      description: "Rouen hangar",
      connection: {
        ssh_host: "system@10.0.10.172",
        ip: "10.0.10.172"
      },
      folderName: "Rouen", // What the server API returns
      lights: {
        enabled: true,
        endpoint: "https://10.0.10.172:7548/hangar/lightson",
        username: "system",
        password: "FJjf93/#",
        waitTime: 3 // seconds to wait after turning on lights
      },
      cameraTransforms: {
        // Forges-les-Eaux calibrated alignment corrections
        0: { x: -77, y: 11, scale: 1.0, rotation: -3.3 },     // RUR
        1: { x: -50, y: -75, scale: 1.0, rotation: 1.4 },     // FUR
        2: { x: 27, y: -11, scale: 0.99, rotation: -6.3 },    // FUL
        3: { x: 22, y: -13, scale: 0.98, rotation: -5.3 },    // RUL
        4: { x: -202, y: -29, scale: 0.97, rotation: -1.8 },  // RDR
        5: { x: 139, y: -7, scale: 0.98, rotation: 1.7 },     // FDR
        6: { x: 5, y: -30, scale: 0.99, rotation: -1.8 },     // FDL
        7: { x: 130, y: -132, scale: 1.0, rotation: -9.3 },   // RDL
      }
    },
    hangar_boras_vpn: {
      id: "hangar_boras_vpn",
      label: "Borås (hangar_boras_vpn)",
      description: "Borås hangar",
      connection: {
        ssh_host: "", // To be configured
        ip: "" // To be configured
      },
      folderName: "Boras",
      lights: {
        enabled: true,
        endpoint: "", // To be configured with IP
        username: "system",
        password: "FJjf93/#",
        waitTime: 3
      },
      cameraTransforms: {
        0: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        1: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        2: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        3: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        4: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        5: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        6: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        7: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      }
    },
    hangar_skovde_vpn: {
      id: "hangar_skovde_vpn",
      label: "Skövde (hangar_skovde_vpn)",
      description: "Skövde hangar",
      connection: {
        ssh_host: "", // To be configured
        ip: "" // To be configured
      },
      folderName: "Skovde",
      lights: {
        enabled: true,
        endpoint: "", // To be configured with IP
        username: "system",
        password: "FJjf93/#",
        waitTime: 3
      },
      cameraTransforms: {
        0: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        1: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        2: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        3: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        4: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        5: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        6: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        7: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      }
    },
    hangar_uddevalla_vpn: {
      id: "hangar_uddevalla_vpn",
      label: "Uddevalla (hangar_uddevalla_vpn)",
      description: "Uddevalla hangar",
      connection: {
        ssh_host: "", // To be configured
        ip: "" // To be configured
      },
      folderName: "Uddevalla",
      lights: {
        enabled: true,
        endpoint: "", // To be configured with IP
        username: "system",
        password: "FJjf93/#",
        waitTime: 3
      },
      cameraTransforms: {
        0: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        1: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        2: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        3: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        4: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        5: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        6: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        7: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      }
    },
    hangar_farsta_vpn: {
      id: "hangar_farsta_vpn",
      label: "Farsta (hangar_farsta_vpn)",
      description: "Farsta hangar",
      connection: {
        ssh_host: "", // To be configured
        ip: "" // To be configured
      },
      folderName: "Farsta",
      lights: {
        enabled: true,
        endpoint: "", // To be configured with IP
        username: "system",
        password: "FJjf93/#",
        waitTime: 3
      },
      cameraTransforms: {
        0: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        1: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        2: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        3: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        4: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        5: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        6: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        7: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      }
    },
    hangar_trollhattan_vpn: {
      id: "hangar_trollhattan_vpn",
      label: "Trollhättan (hangar_trollhattan_vpn)",
      description: "Trollhättan hangar",
      connection: {
        ssh_host: "", // To be configured
        ip: "" // To be configured
      },
      folderName: "Trollhattan",
      lights: {
        enabled: true,
        endpoint: "", // To be configured with IP
        username: "system",
        password: "FJjf93/#",
        waitTime: 3
      },
      cameraTransforms: {
        0: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        1: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        2: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        3: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        4: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        5: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        6: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        7: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      }
    },
    hangar_vanersborg_vpn: {
      id: "hangar_vanersborg_vpn",
      label: "Vänersborg (hangar_vanersborg_vpn)",
      description: "Vänersborg hangar",
      connection: {
        ssh_host: "", // To be configured
        ip: "" // To be configured
      },
      folderName: "Vanersborg",
      lights: {
        enabled: true,
        endpoint: "", // To be configured with IP
        username: "system",
        password: "FJjf93/#",
        waitTime: 3
      },
      cameraTransforms: {
        0: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        1: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        2: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        3: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        4: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        5: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        6: { x: 0, y: 0, scale: 1.0, rotation: 0 },
        7: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      }
    }
  },
  
  capture: {
    batchSize: 4,
    timeouts: {
      perCameraSequential: 120000,
      perCameraParallel: 90000,
      autofocusTest: 30000
    },
    ports: {
      start: 8083,
      count: 4
    },
    delays: {
      betweenCameras: 1500,
      betweenBatches: 2000
    },
    ssh: {
      strictHostKeyChecking: "no",
      controlMaster: "auto",
      controlPath: "${HOME}/.ssh/cm-%r@%h:%p",
      controlPersist: "60"
    }
  },
  
  validation: {
    validHangars: ["hangar_sisjon_vpn", "molndal", "forges", "hangar_rouen_vpn", "hangar_boras_vpn", "hangar_skovde_vpn", "hangar_uddevalla_vpn", "hangar_farsta_vpn", "hangar_trollhattan_vpn", "hangar_vanersborg_vpn"],
    imageFormats: [".jpg", ".jpeg"],
    defaultImageDimensions: {
      width: 4000,
      height: 3000
    }
  }
};

// Environment-specific overrides
const environmentConfigs = {
  pi: {
    api: {
      host: process.env.API_HOST || "http://localhost:3001",
      timeout: 30000
    },
    paths: {
      base: "/home/pi/RemoteTI",
      snapshots: "data/sessions",
      snapshotsAbsolute: "/home/pi/RemoteTI/data/sessions",
      scripts: {
        cameraFetch: "camera_fetch.sh"
      },
      data: {
        inspectionJson: "data/templates/remote-ti-inspection.json"
      }
    }
  },
  
  dev: {
    api: {
      host: process.env.API_HOST || "http://localhost:5001",
      timeout: 30000
    },
    paths: {
      base: process.cwd(),
      snapshots: "data/sessions",
      snapshotsAbsolute: path.join(process.cwd(), "data/sessions"),
      scripts: {
        cameraFetch: "camera_fetch.sh"
      },
      data: {
        inspectionJson: "data/templates/remote-ti-inspection.json"
      }
    }
  },
  
  production: {
    api: {
      host: process.env.API_HOST || "http://localhost:3001",
      timeout: 30000
    },
    paths: {
      base: "/opt/multicam-inspector",
      snapshots: "/opt/multicam-inspector/data/sessions",
      snapshotsAbsolute: "/opt/multicam-inspector/data/sessions",
      scripts: {
        cameraFetch: "/opt/multicam-inspector/camera_fetch.sh"
      },
      data: {
        inspectionJson: "/opt/multicam-inspector/data/templates/remote-ti-inspection.json"
      }
    }
  }
};

// Load hangars from hangars.json if available
function loadHangarsFromJson() {
  try {
    const hangarsPath = path.join(__dirname, 'data', 'hangars.json');
    if (fs.existsSync(hangarsPath)) {
      const data = JSON.parse(fs.readFileSync(hangarsPath, 'utf-8'));
      const hangarsObj = {};
      
      data.hangars.forEach(h => {
        hangarsObj[h.id] = {
          id: h.id,
          label: h.label,
          description: h.label + ' hangar',
          connection: {
            ssh_host: h.ipAddress ? `system@${h.ipAddress}` : '',
            ip: h.ipAddress || ''
          },
          folderName: h.folderName || h.label.replace(/[^a-zA-Z0-9]/g, ''),
          lights: {
            enabled: true,
            endpoint: h.ipAddress ? `https://${h.ipAddress}:7548/hangar/lightson` : '',
            username: 'system',
            password: 'FJjf93/#',
            waitTime: 3
          },
          cameraTransforms: h.cameraTransforms || {
            0: { x: 0, y: 0, scale: 1.0, rotation: 0 },
            1: { x: 0, y: 0, scale: 1.0, rotation: 0 },
            2: { x: 0, y: 0, scale: 1.0, rotation: 0 },
            3: { x: 0, y: 0, scale: 1.0, rotation: 0 },
            4: { x: 0, y: 0, scale: 1.0, rotation: 0 },
            5: { x: 0, y: 0, scale: 1.0, rotation: 0 },
            6: { x: 0, y: 0, scale: 1.0, rotation: 0 },
            7: { x: 0, y: 0, scale: 1.0, rotation: 0 }
          }
        };
      });
      
      return hangarsObj;
    }
  } catch (error) {
    console.log('Could not load hangars.json, using default configuration');
  }
  return null;
}

// Create final configuration
function createConfig() {
  const environment = detectEnvironment();
  const envConfig = environmentConfigs[environment] || environmentConfigs.dev;
  
  // Try to load hangars from JSON file
  const loadedHangars = loadHangarsFromJson();
  
  const finalConfig = {
    ...baseConfig,
    ...envConfig,
    environment,
    // Use loaded hangars from JSON if available, otherwise use defaults
    hangars: loadedHangars || baseConfig.hangars,
    meta: {
      generatedAt: new Date().toISOString(),
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname()
    }
  };
  
  // Add API endpoints configuration
  finalConfig.api = finalConfig.api || {};
  finalConfig.api.endpoints = {
    // Base endpoints
    health: `${finalConfig.api.host}/api/health`,
    
    // Inspection endpoints
    inspectionTypes: `${finalConfig.api.host}/api/inspection-types`,
    inspectionData: (type) => `${finalConfig.api.host}/api/inspection-data/${type}`,
    createSession: `${finalConfig.api.host}/api/create-inspection-session`,
    updateProgress: `${finalConfig.api.host}/api/inspection/update-progress`,
    
    // Folder endpoints
    folders: `${finalConfig.api.host}/api/folders`,
    
    // Task endpoints
    taskStatus: (sessionFolder, taskId) => 
      `${finalConfig.api.host}/api/inspection/${sessionFolder}/task/${taskId}/status`,
    sessionData: (sessionPath) => 
      `${finalConfig.api.host}/api/inspection/${sessionPath}/data`,
    
    // Alarm session endpoints
    alarmSession: (hangarId) => `${finalConfig.api.host}/api/alarm-session/${hangarId}`,
    updateOnsiteProgress: (hangarId) => 
      `${finalConfig.api.host}/api/alarm-session/${hangarId}/update-onsite-progress`,
    completeOnsiteTI: (hangarId) => 
      `${finalConfig.api.host}/api/alarm-session/${hangarId}/complete-onsite-ti`,
    generateFullRTI: (hangarId) => 
      `${finalConfig.api.host}/api/alarm-session/${hangarId}/generate-full-rti`,
    generateOnsiteTI: (hangarId) => 
      `${finalConfig.api.host}/api/alarm-session/${hangarId}/generate-onsite-ti`,
    clearArea: (hangarId) => 
      `${finalConfig.api.host}/api/alarm-session/${hangarId}/clear-area`,
    routeDecision: (hangarId) => 
      `${finalConfig.api.host}/api/alarm-session/${hangarId}/route-decision`,
    
    // Other endpoints
    triggerAlarm: `${finalConfig.api.host}/api/trigger-alarm`,
    captureFrame: `${finalConfig.api.host}/api/capture-frame`,
    saveImages: `${finalConfig.api.host}/api/save-captured-images`,
    updateRTIProgress: `${finalConfig.api.host}/api/update-rti-progress`,
    completeRTI: `${finalConfig.api.host}/api/complete-rti-inspection`
  };
  
  // Add helper functions
  finalConfig.getHangar = (id) => finalConfig.hangars[id];
  finalConfig.getAllHangars = () => Object.values(finalConfig.hangars);
  finalConfig.getCameraIP = (cameraId) => finalConfig.cameras.ips[cameraId];
  finalConfig.getHangarByFolderName = (folderName) => {
    return Object.values(finalConfig.hangars).find(h => h.folderName === folderName);
  };
  finalConfig.getFolderNameByHangarId = (hangarId) => {
    const hangar = finalConfig.hangars[hangarId];
    return hangar ? hangar.folderName : hangarId;
  };
  
  return finalConfig;
}

// Export the configuration
module.exports = createConfig();