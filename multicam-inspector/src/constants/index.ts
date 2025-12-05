// Shared constants for the MultiCam Inspector
import type { HangarConfig } from '../types';

// Camera layout: Top row (RUR, FUR, FUL, RUL), Bottom row (RDR, FDR, FDL, RDL)
export const CAMERA_LAYOUT = [
  { id: 0, name: 'RUR' }, { id: 1, name: 'FUR' }, { id: 2, name: 'FUL' }, { id: 3, name: 'RUL' },
  { id: 4, name: 'RDR' }, { id: 5, name: 'FDR' }, { id: 6, name: 'FDL' }, { id: 7, name: 'RDL' }
];

// Also make CAMERAS available as an alias for CAMERA_LAYOUT for backwards compatibility
export const CAMERAS = CAMERA_LAYOUT.map(cam => ({ ...cam, label: cam.name }));

export const HANGARS: HangarConfig[] = [
  { 
    id: "hangar_sisjon_vpn", 
    label: "Mölndal",
    assignedDrone: "bender",
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
  }
];

export const DRONE_OPTIONS = [
  { id: "bender", label: "Bender" },
  { id: "marvin", label: "Marvin" },
];

// Utility functions
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));