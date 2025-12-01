// Shared types for the MultiCam Inspector

export interface Cam {
  id: number;
  src: string;
  sourceUrl: string;
  zoom: number;
  pan: { x: number; y: number };
  isLoading?: boolean;
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
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  description: string;
  validated?: boolean;
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