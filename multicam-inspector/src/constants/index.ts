// Shared constants for the MultiCam Inspector
import type { HangarConfig } from '../types';

// Camera layout: Top row (RUR, FUR, FUL, RUL), Bottom row (RDR, FDR, FDL, RDL)
export const CAMERA_LAYOUT = [
  { id: 0, name: 'RUR' }, { id: 1, name: 'FUR' }, { id: 2, name: 'FUL' }, { id: 3, name: 'RUL' },
  { id: 4, name: 'RDR' }, { id: 5, name: 'FDR' }, { id: 6, name: 'FDL' }, { id: 7, name: 'RDL' }
];

// IMPORTANT: These are FALLBACK values only!
// The real hangar configuration is in data/hangars.json
// That file is the single source of truth for:
// - IP addresses (used for camera operations) 
// - Status (operational/maintenance/construction)
// - Camera transforms
// - Drone assignments (managed via admin panel)
// - All other hangar settings
// These constants are only used if the API fails to load
// DO NOT set assignedDrone here - it should only come from the admin panel
export const HANGARS: HangarConfig[] = [
  { 
    id: "hangar_sisjon_vpn", 
    label: "Mölndal",
    assignedDrone: undefined, // Managed via admin panel
    operational: true,
    status: "operational" as const,
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
  { 
    id: "hangar_rouen_vpn", 
    label: "Forges-les-Eaux",
    assignedDrone: undefined, // Managed via admin panel
    operational: true,
    status: "operational" as const,
    cameraTransforms: {
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
  { 
    id: "hangar_boras_vpn", 
    label: "Borås",
    assignedDrone: undefined, // Managed via admin panel
    operational: false,
    status: "construction" as const,
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
  { 
    id: "hangar_skovde_vpn", 
    label: "Skövde",
    assignedDrone: undefined, // Managed via admin panel
    operational: false,
    status: "construction" as const,
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
  { 
    id: "hangar_uddevalla_vpn", 
    label: "Uddevalla",
    assignedDrone: undefined, // Managed via admin panel
    operational: false,
    status: "construction" as const,
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
  { 
    id: "hangar_farsta_vpn", 
    label: "Farsta",
    assignedDrone: undefined, // Managed via admin panel
    operational: false,
    status: "construction" as const,
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
  { 
    id: "hangar_trollhattan_vpn", 
    label: "Trollhättan",
    assignedDrone: undefined, // Managed via admin panel
    operational: false,
    status: "construction" as const,
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
  { 
    id: "hangar_vanersborg_vpn", 
    label: "Vänersborg",
    assignedDrone: undefined, // Managed via admin panel
    operational: false,
    status: "construction" as const,
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
];

// DRONE_OPTIONS removed - drones are now managed entirely through the admin panel
// The admin panel's Drones tab is the single source of truth for available drones
// Use the API endpoint /api/drones to get the current list of drones

// Utility functions
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));