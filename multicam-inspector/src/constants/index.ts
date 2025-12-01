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
    label: "Mölndal (hangar_sisjon_vpn) - BASELINE",
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
    label: "Forges-les-Eaux (hangar_rouen_vpn)",
    cameraTransforms: {
      0: { x: 42, y: -15, scale: 1.15, rotation: 1.2 },
      1: { x: 38, y: -12, scale: 1.12, rotation: 0.8 },
      2: { x: -35, y: -18, scale: 1.08, rotation: -0.9 },
      3: { x: -32, y: -14, scale: 1.05, rotation: -1.1 },
      4: { x: 28, y: 22, scale: 1.18, rotation: 2.1 },
      5: { x: 25, y: 18, scale: 1.14, rotation: 1.8 },
      6: { x: -28, y: 25, scale: 1.11, rotation: -1.5 },
      7: { x: -25, y: 20, scale: 1.09, rotation: -1.8 },
    }
  }
];

export const DRONE_OPTIONS = [
  { id: "bender", label: "Bender" },
  { id: "marvin", label: "Marvin" },
  { id: "demo", label: "Demo" },
];

// Utility functions
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));