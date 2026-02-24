// Shared types for the MultiCam Inspector

export interface Cam {
  id: number;
  src: string;
  sourceUrl: string;
  zoom: number;
  pan: { x: number; y: number };
  isLoading?: boolean;
  isFocusing?: boolean;
  name: string;
}

export interface CameraTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipped?: boolean;
  opacity?: number;
}

export interface ValidationBox {
  id: string;
  // Normalized coordinates (0.0 to 1.0) relative to original image dimensions
  x: number;        // Left edge as percentage of image width
  y: number;        // Top edge as percentage of image height  
  width: number;    // Width as percentage of image width
  height: number;   // Height as percentage of image height
  label: string;
  description: string;
  validated?: boolean;
  // Legacy support for pixel-based coordinates (for migration)
  pixelX?: number;
  pixelY?: number;
  pixelWidth?: number;
  pixelHeight?: number;
}

export interface TIItem {
  id: string;
  title: string;
  detail: string;
  order: number;
  required: boolean;
  allowedStatuses: string[];
  status?: "pass" | "fail" | "na" | "" | undefined;
  note?: string;
  comment?: string;
  completedAt?: string;
  validationBoxes?: Partial<Record<string, ValidationBox[]>>;
  instructions?: string[];
  // camera-id → transform (legacy support)
  presets?: Record<number, { zoom: number; pan: { x: number; y: number } }>;
}

export interface HangarConfig {
  id: string;
  label: string;
  assignedDrone?: string;
  operational?: boolean;
  status?: 'operational' | 'maintenance' | 'construction';
  cameraTransforms: { [cameraId: number]: CameraTransform };
}

export interface InspectionMetadata {
  inspectorName: string;
  droneName: string;
  hangarName: string;
  startTime: string;
  completedTime?: string;
  sessionId: string;
}