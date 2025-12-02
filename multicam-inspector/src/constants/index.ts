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
      0: { x: 73, y: -3, scale: 1.02, rotation: 1.0 },      // FDR (actually RUR in display order)
      1: { x: -30, y: -17, scale: 1.05, rotation: 2.3 },    // FUR
      2: { x: -29, y: 17, scale: 0.99, rotation: -3.9 },    // RUR (actually FUL in display order)
      3: { x: -94, y: -7, scale: 0.92, rotation: -1.8 },    // RDR (actually RUL in display order)
      4: { x: 0, y: -27, scale: 1.07, rotation: -1.3 },     // FDL (actually RDR in display order)
      5: { x: 7, y: -9, scale: 1.0, rotation: -5.8 },       // FUL (actually FDR in display order)
      6: { x: 1, y: -4, scale: 1.0, rotation: -5.1 },       // RUL (actually FDL in display order)
      7: { x: 66, y: -72, scale: 1.05, rotation: -9.1 },    // RDL
    }
  }
];

export const DRONE_OPTIONS = [
  { id: "bender", label: "Bender" },
  { id: "marvin", label: "Marvin" },
];

// Utility functions
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));