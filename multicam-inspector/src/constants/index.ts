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
// - All other hangar settings
// These constants are only used if the API fails to load
export const HANGARS: HangarConfig[] = [
  { 
    id: "hangar_sisjon_vpn", 
    label: "Mölndal",
    assignedDrone: "lancelot",
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
    assignedDrone: "marvin",
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
    assignedDrone: "E3-001",
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
    assignedDrone: "E3-002",
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
    assignedDrone: "E3-003",
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
    assignedDrone: "E3-004",
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
    assignedDrone: "E3-005",
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
    assignedDrone: "E3-006",
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

export const DRONE_OPTIONS = [
  { id: "bender", label: "Bender" },
  { id: "marvin", label: "Marvin" },
  { id: "lancelot", label: "Lancelot" },
  { id: "E3-001", label: "E3-001" },
  { id: "E3-002", label: "E3-002" },
  { id: "E3-003", label: "E3-003" },
  { id: "E3-004", label: "E3-004" },
  { id: "E3-005", label: "E3-005" },
  { id: "E3-006", label: "E3-006" },
  { id: "E3-007", label: "E3-007" },
];

// Utility functions
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));