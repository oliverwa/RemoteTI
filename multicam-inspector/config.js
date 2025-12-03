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
      cameraTransforms: {
        // Forges-les-Eaux calibrated alignment corrections
        0: { x: 73, y: -3, scale: 1.02, rotation: 1.0 },      // FDR
        1: { x: -30, y: -17, scale: 1.05, rotation: 2.3 },    // FUR  
        2: { x: -29, y: 17, scale: 0.99, rotation: -3.9 },    // RUR
        3: { x: -94, y: -7, scale: 0.92, rotation: -1.8 },    // RDR
        4: { x: 0, y: -27, scale: 1.07, rotation: -1.3 },     // FDL
        5: { x: 7, y: -9, scale: 1.0, rotation: -5.8 },      // FUL
        6: { x: 1, y: -4, scale: 1.0, rotation: -5.1 },      // RUL
        7: { x: 66, y: -72, scale: 1.05, rotation: -9.1 },   // RDL
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
    validHangars: ["hangar_sisjon_vpn", "molndal", "forges", "hangar_rouen_vpn"],
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
    paths: {
      base: process.cwd(),
      snapshots: path.join(process.env.HOME || os.homedir(), "hangar_snapshots"),
      snapshotsAbsolute: path.join(process.env.HOME || os.homedir(), "hangar_snapshots"),
      scripts: {
        cameraFetch: path.join(process.cwd(), "camera_fetch.sh")
      },
      data: {
        inspectionJson: "data/templates/remote-ti-inspection.json"
      }
    }
  },
  
  production: {
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

// Create final configuration
function createConfig() {
  const environment = detectEnvironment();
  const envConfig = environmentConfigs[environment] || environmentConfigs.dev;
  
  const finalConfig = {
    ...baseConfig,
    ...envConfig,
    environment,
    meta: {
      generatedAt: new Date().toISOString(),
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname()
    }
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