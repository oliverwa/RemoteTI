import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import inspectionData from '../data/drone-remote-inspection.json';
import jsPDF from 'jspdf';

// ---------------------------------------------------------
// Hangar MultiCam Inspector – 4×2 Grid + TI Checklist + ROI Presets (v8.6)
// ---------------------------------------------------------
// • 4×2 grid layout
// • Zoom-to-center (scroll/pinch), pan on drag, dblclick reset
// • F = fullscreen (hovered / main), Esc = close + reset view
// • Snapshot (cache-bust sourceUrl) + Reset All
// • TI checklist BELOW cameras (original wording, left-aligned)
//   Timeline with 27 dots (centered), active highlighted, clickable jump
//   Pass/Fail big buttons, N/A radio; Pass/Fail auto-advance with slide-up
// • ROI presets per task & camera
//   - R = record ROI (hovered camera → current task)
//   - G = apply ROI for current task (manual, ignores Auto ROI toggle)
//   - Button: SAVE ZOOM/PAN FOR TASK (saves all 8 cams to the current task)
// • Auto ROI toggle next to layout (decide if presets should auto-apply on task change)
// • ROI persistence in localStorage (defaults applied once on load)
// ---------------------------------------------------------

// --- Consts & utils ---
interface CameraTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  flipped?: boolean;
  opacity?: number;
}

interface HangarConfig {
  id: string;
  label: string;
  cameraTransforms: { [cameraId: number]: CameraTransform };
}

const HANGARS: HangarConfig[] = [
  { 
    id: "hangar_sisjon_vpn", 
    label: "Mölndal (hangar_sisjon_vpn) - BASELINE",
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
  { 
    id: "hangar_rouen_vpn", 
    label: "Forges-les-Eaux (hangar_rouen_vpn)",
    cameraTransforms: {
      // Example with some alignment corrections
      0: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      1: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      2: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      3: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      4: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      5: { x: 0, y: 0, scale: 1.0, rotation: 0 },
      6: { x: 118, y: -65, scale: 1.10, rotation: -1.4 },
      7: { x: 0, y: 0, scale: 1.0, rotation: 0 },
    }
  },
];
const DRONE_OPTIONS = [
  { id: "bender", label: "Bender" },
  { id: "marvin", label: "Marvin" },
];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// --- Validation Box Type ---
interface ValidationBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  description: string;
  validated?: boolean;
}

// --- ROI Box Type (New relative coordinate system) ---
interface ROIBox {
  id: string;
  x: number;        // 0-1, left edge of ROI relative to image
  y: number;        // 0-1, top edge of ROI relative to image
  width: number;    // 0-1, width relative to image
  height: number;   // 0-1, height relative to image
  label?: string;   // Optional label for the ROI
}

// --- ROI Rectangle Type (Pixel coordinate system like validation boxes) ---
interface ROIRectangle {
  id: string;
  x: number;        // pixel X coordinate (left edge)
  y: number;        // pixel Y coordinate (top edge)  
  width: number;    // pixel width
  height: number;   // pixel height
  label?: string;   // Optional label for the ROI
}

// --- TI Checklist items ---
interface TIItem {
  id: string;
  title: string;
  detail: string;
  category: string;
  order: number;
  required: boolean;
  allowedStatuses: string[];
  status?: "pass" | "fail" | "na" | "" | undefined;
  note?: string;
  comment?: string;
  completedAt?: string;
  roi?: Partial<Record<string, { zoom: number; panX: number; panY: number }>>; // Legacy ROI system
  roiBoxes?: Partial<Record<string, ROIBox[]>>; // New ROI system
  roiRectangles?: Partial<Record<string, ROIRectangle[]>>; // Rectangle ROI system (pixel coordinates)
  validationBoxes?: Partial<Record<string, ValidationBox[]>>;
  instructions?: string[];
  // camera-id → transform (legacy support)
  presets?: Record<number, { zoom: number; pan: { x: number; y: number } }>;
}

// --- Inspection metadata ---
interface InspectionMetadata {
  inspectorName: string;
  droneName: string;
  hangarName: string;
  startTime: string;
  completedTime?: string;
  sessionId: string;
}

// Convert JSON tasks to TIItem format
const TI_ITEMS: TIItem[] = inspectionData.tasks.map(task => ({
  id: task.id,
  title: task.title,
  detail: task.description,
  category: task.category,
  order: task.order,
  required: task.required,
  allowedStatuses: task.allowedStatuses,
  status: undefined,
  roi: task.roi,
  validationBoxes: (task as any).validationBoxes,
  instructions: task.instructions
}));

function tone(s?: string) {
  return s === "pass"
    ? "bg-green-50 border-green-200"
    : s === "fail"
    ? "bg-red-50 border-red-200"
    : "bg-white border-neutral-200";
}

function getCategoryInfo(categoryId: string) {
  const category = inspectionData.categories.find(c => c.id === categoryId);
  return category || { id: categoryId, name: categoryId.replace('_', ' '), color: '#6b7280' };
}

// --- Types ---
type Cam = { 
  id: number; 
  src: string; 
  sourceUrl: string; 
  zoom: number; 
  pan: { x: number; y: number };
  isLoading?: boolean;
  name: string;
};

// Camera layout: Top row (RUR, FUR, FUL, RUL), Bottom row (RDR, FDR, FDL, RDL)
const CAMERA_LAYOUT = [
  { id: 0, name: 'RUR' }, { id: 1, name: 'FUR' }, { id: 2, name: 'FUL' }, { id: 3, name: 'RUL' },
  { id: 4, name: 'RDR' }, { id: 5, name: 'FDR' }, { id: 6, name: 'FDL' }, { id: 7, name: 'RDL' }
];

// Also make CAMERAS available as an alias for CAMERA_LAYOUT for backwards compatibility
const CAMERAS = CAMERA_LAYOUT.map(cam => ({ ...cam, label: cam.name }));

const defaultCam = (i: number): Cam => ({ 
  id: i, 
  src: "", 
  sourceUrl: "", 
  zoom: 1, 
  pan: { x: 0, y: 0 },
  isLoading: false,
  name: CAMERA_LAYOUT[i].name
});
const toDataUrl = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });

export default function MultiCamInspector() {
  // --- Cameras ---
  const [cams, setCams] = useState<Cam[]>(() => Array.from({ length: 8 }, (_, i) => defaultCam(i)));
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [fsId, setFsId] = useState<number | null>(null);
  
  // Snapshot modal state
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [snapshotHangar, setSnapshotHangar] = useState<string>("");
  const [snapshotDrone, setSnapshotDrone] = useState("");
  
  // Camera transform settings
  const [showTransformModal, setShowTransformModal] = useState(false);
  const [selectedHangarTab, setSelectedHangarTab] = useState('molndal');
  
  // Camera calibration modal state
  const [showCalibrateSelectionModal, setCalibrateSelectionModal] = useState(false);
  const [showCalibrateModal, setCalibrateModal] = useState(false);
  const [calibrateHangar, setCalibrateHangar] = useState("");
  const [calibrateCamera, setCalibrateCamera] = useState(0);
  const [calibrationTransform, setCalibrationTransform] = useState<CameraTransform>({ x: 0, y: 0, scale: 1, rotation: 0 });
  const [molndalImage, setMolndalImage] = useState<string>("");
  const [hangarImage, setHangarImage] = useState<string>("");
  const [loadingImages, setLoadingImages] = useState(false);
  
  // Image enhancement controls
  const [brightness, setBrightness] = useState(100); // 100 = normal (100%)
  const [contrast, setContrast] = useState(100); // 100 = normal (100%)
  
  // Brightness and contrast adjustment functions
  const adjustBrightness = (delta: number) => {
    setBrightness(prev => Math.max(50, Math.min(150, prev + delta)));
  };
  
  const adjustContrast = (delta: number) => {
    setContrast(prev => Math.max(50, Math.min(150, prev + delta)));
  };

  // Debug effect for calibration state
  useEffect(() => {
    if (showCalibrateModal) {
      console.log('🔧 Calibration modal state:', { 
        loadingImages, 
        molndalImageSet: !!molndalImage, 
        hangarImageSet: !!hangarImage, 
        molndalImagePreview: molndalImage ? molndalImage.substring(0, 50) + '...' : 'empty',
        hangarImagePreview: hangarImage ? hangarImage.substring(0, 50) + '...' : 'empty'
      });
    }
  }, [showCalibrateModal, loadingImages, molndalImage, hangarImage]);
  const [hangarTransforms, setHangarTransforms] = useState<{ [hangarId: string]: { [cameraId: number]: CameraTransform } }>(() => {
    // Try to load from localStorage first
    const saved = localStorage.getItem('hangar_camera_transforms');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.warn('Failed to parse saved camera transforms:', e);
      }
    }
    
    // Initialize with default HANGARS config if no saved data
    const defaultTransforms: { [hangarId: string]: { [cameraId: number]: CameraTransform } } = {};
    HANGARS.forEach(hangar => {
      defaultTransforms[hangar.id] = { ...hangar.cameraTransforms };
    });
    return defaultTransforms;
  });
  const [isCapturing, setIsCapturing] = useState(false);
  
  // Delayed display state
  const [pendingImages, setPendingImages] = useState<Map<string, string>>(new Map());
  const [progressText, setProgressText] = useState("");
  const [isWaitingToDisplay, setIsWaitingToDisplay] = useState(false);
  const [captureStartTime, setCaptureStartTime] = useState<number | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
  const [showNoImagesModal, setShowNoImagesModal] = useState(false);

  // Dark image detection state
  const [showDarkImageModal, setShowDarkImageModal] = useState(false);
  const [darkImageDetails, setDarkImageDetails] = useState<{
    darkCount: number;
    totalImages: number;
    sessionPath: string;
    hangar: string;
    session: string;
    analysisResults?: Array<{
      cameraName: string;
      brightness: number;
      isDark: boolean;
    }>;
  } | null>(null);
  const [currentSessionName, setCurrentSessionName] = useState<string>("");

  // Countdown timer effect - decreases estimate every second when capturing
  useEffect(() => {
    if (!isCapturing || estimatedTimeRemaining === null) {
      return;
    }

    const countdownInterval = setInterval(() => {
      setEstimatedTimeRemaining(prev => {
        if (prev === null || prev <= 0) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [isCapturing]); // Only depend on isCapturing, not estimatedTimeRemaining
  
  // Inspection mode toggle
  const [inspectionMode, setInspectionMode] = useState<'classic' | 'innovative'>('classic');
  
  // Laptop mode toggle for zoom buttons
  const [laptopMode, setLaptopMode] = useState(false);
  
  // Validation box tracking for innovative mode
  const [validatedBoxes, setValidatedBoxes] = useState<Record<string, Set<string>>>({}); // taskId -> Set of validated box IDs
  
  // Log state
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  
  // Helper function to add logs
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev.slice(-49), logEntry]); // Keep last 50 logs
  }, []);

  // Folder browser state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<any[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [currentSession, setCurrentSession] = useState<{name: string, hangar: string} | null>(null);

  // --- TI checklist state ---
  const [items, setItems] = useState<TIItem[]>(TI_ITEMS);
  const [idx, setIdx] = useState(0); // current
  const [leaving, setLeaving] = useState(false);
  const didInitialApply = useRef(false);

  // Handle validation box clicks (moved after state declarations)  
  const lastClickRef = useRef<{ boxId: string; timestamp: number } | null>(null);
  
  // Validation box creation state
  const [isCreatingValidationBox, setIsCreatingValidationBox] = useState(false);
  const [validationBoxCreation, setValidationBoxCreation] = useState<{
    id: string;
    label: string; 
    description: string;
    startX?: number;
    startY?: number;
    currentX?: number;
    currentY?: number;
    cameraId?: number;
  } | null>(null);
  
  // Handle validation box creation clicks and updates
  const handleValidationBoxCreation = useCallback((cameraId: number, imageX: number, imageY: number) => {
    if (!validationBoxCreation) return;
    
    console.log(`📦 Validation box creation at image(${imageX}, ${imageY}) on camera ${cameraId}`);
    
    if (!validationBoxCreation.startX) {
      // First click - start the box
      setValidationBoxCreation(prev => prev ? {
        ...prev,
        startX: imageX,
        startY: imageY,
        currentX: imageX,
        currentY: imageY,
        cameraId
      } : null);
      addLog(`📦 Start validation box at (${imageX}, ${imageY}) on camera ${cameraId}`);
    } else if (validationBoxCreation.startX !== undefined && validationBoxCreation.startY !== undefined) {
      // Second click - finish the box
      const startX = Math.min(validationBoxCreation.startX, imageX);
      const startY = Math.min(validationBoxCreation.startY, imageY);
      const endX = Math.max(validationBoxCreation.startX, imageX);
      const endY = Math.max(validationBoxCreation.startY, imageY);
      const width = endX - startX;
      const height = endY - startY;
      
      // Only create box if it has reasonable size
      if (width > 10 && height > 10) {
        const currentTask = items[idx];
        const cameraName = CAMERA_LAYOUT.find(c => c.id === cameraId)?.name || `Camera${cameraId}`;
        
        const validationBox = {
          id: validationBoxCreation.id,
          x: startX,
          y: startY,
          width,
          height,
          label: validationBoxCreation.label,
          description: ''
        };
        
        addLog(`📦 Validation Box Created for ${cameraName} on task ${currentTask?.id}:`);
        addLog(`   ${JSON.stringify(validationBox)}`);
        
        // Automatically save to JSON file via API
        saveValidationBoxToFile(currentTask.id, cameraName, validationBox);
      } else {
        addLog('❌ Validation box too small - minimum size is 10x10 pixels');
      }
      
      // Reset creation mode
      setIsCreatingValidationBox(false);
      setValidationBoxCreation(null);
    }
  }, [validationBoxCreation, items, idx, addLog]);
  
  // Handle validation box position updates during dragging
  const handleValidationBoxUpdate = useCallback((cameraId: number, imageX: number, imageY: number) => {
    if (!validationBoxCreation || !isCreatingValidationBox || validationBoxCreation.cameraId !== cameraId) return;
    
    // Update current position for live preview
    setValidationBoxCreation(prev => prev ? {
      ...prev,
      currentX: imageX,
      currentY: imageY
    } : null);
  }, [validationBoxCreation, isCreatingValidationBox]);
  
  const handleValidationBoxClick = useCallback((boxId: string) => {
    const currentTask = items[idx];
    if (!currentTask) return;
    
    // Prevent double clicks within 100ms
    const now = Date.now();
    if (lastClickRef.current && 
        lastClickRef.current.boxId === boxId && 
        now - lastClickRef.current.timestamp < 100) {
      console.log(`🚫 Ignoring rapid double click on ${boxId}`);
      return;
    }
    lastClickRef.current = { boxId, timestamp: now };
    
    console.log(`🎮 handleValidationBoxClick called with boxId: ${boxId}, currentTask: ${currentTask.id}`);
    
    // Use functional state update to avoid race conditions
    setValidatedBoxes(prev => {
      const updated = { ...prev };
      if (!updated[currentTask.id]) {
        updated[currentTask.id] = new Set();
      }
      
      console.log(`📋 Current validations for task ${currentTask.id}:`, Array.from(updated[currentTask.id]));
      
      // Create a new Set to ensure React detects the change
      const newValidations = new Set(updated[currentTask.id]);
      
      if (newValidations.has(boxId)) {
        newValidations.delete(boxId);
        addLog(`🔲 Unchecked validation: ${boxId}`);
        console.log(`❌ Removed ${boxId} from validations`);
      } else {
        newValidations.add(boxId);
        addLog(`✅ Validated: ${boxId}`);
        console.log(`✅ Added ${boxId} to validations`);
      }
      
      updated[currentTask.id] = newValidations;
      console.log(`📋 Updated validations for task ${currentTask.id}:`, Array.from(updated[currentTask.id]));
      return updated;
    });
  }, [idx, items, addLog]);

  // Reload JSON data from server
  const reloadInspectionData = useCallback(async () => {
    try {
      const response = await fetch('/src/data/drone-remote-inspection.json?t=' + Date.now());
      if (response.ok) {
        const freshData = await response.json();
        setItems(freshData.tasks);
        addLog(`🔄 Inspection data reloaded`);
        return true;
      }
    } catch (error) {
      console.warn('Failed to reload inspection data:', error);
    }
    return false;
  }, [addLog]);

  // Save validation box to JSON file via API
  const saveValidationBoxToFile = useCallback(async (taskId: string, cameraName: string, validationBox: any) => {
    try {
      addLog(`💾 Saving validation box "${validationBox.id}" to JSON file...`);
      
      const response = await fetch('http://localhost:3001/api/update-validation-box', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId,
          cameraName,
          validationBox
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save validation box');
      }
      
      const result = await response.json();
      addLog(`✅ Validation box "${validationBox.id}" saved for ${cameraName} on task ${taskId}`);
      
      // Automatically reload the JSON data to show the new validation box immediately
      setTimeout(async () => {
        const reloaded = await reloadInspectionData();
        if (reloaded) {
          addLog(`📦 Validation box "${validationBox.id}" now visible in UI`);
        }
      }, 100); // Small delay to ensure the file has been written
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`❌ Failed to save validation box "${validationBox.id}": ${errorMessage}`);
    }
  }, [addLog, reloadInspectionData]);
  
  // --- Inspection metadata ---
  const [inspectionMeta, setInspectionMeta] = useState<InspectionMetadata>({
    inspectorName: '',
    droneName: '',
    hangarName: '',
    startTime: '', // Will be set when images are loaded
    sessionId: Math.random().toString(36).substr(2, 9)
  });
  
  // --- Report generation state ---
  const [showReportModal, setShowReportModal] = useState(false);

  // --- Core camera ops ---
  const resetView = useCallback((id: number) =>
    setCams((prev) => prev.map((c) => (c.id === id ? { ...c, zoom: 1, pan: { x: 0, y: 0 } } : c))), []);
  
  // --- ROI helpers ---
  const applyTaskPresets = useCallback((taskIndex: number, animated = true) => {
    if (!animated) {
      // Immediate application (for initial load)
      setCams((prev) =>
        prev.map((c) => {
          const task = items[taskIndex];
          
          // Try new ROI rectangles format first (pixel coordinates - easiest to use!)
          if (task?.roiRectangles?.[c.name]?.[0]) {
            const roiRect = task.roiRectangles[c.name]![0];
            const containerElement = document.querySelector(`[data-camera-id="${c.id}"]`) as HTMLElement;
            if (containerElement) {
              const containerRect = containerElement.getBoundingClientRect();
              if (containerRect.width > 0 && containerRect.height > 0) {
                // Get image dimensions
                let imageWidth = 3840;
                let imageHeight = 2160;
                const imageElements = document.querySelectorAll('img');
                for (let i = 0; i < imageElements.length; i++) {
                  const img = imageElements[i];
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    imageWidth = img.naturalWidth;
                    imageHeight = img.naturalHeight;
                    break;
                  }
                }
                const viewport = roiRectangleToViewport(roiRect, containerRect, imageWidth, imageHeight);
                return { ...c, zoom: viewport.zoom, pan: viewport.pan };
              }
            }
          }
          
          // Try ROI boxes format second (relative coordinates)
          if (task?.roiBoxes?.[c.name]?.[0]) {
            const roiBox = task.roiBoxes[c.name]![0];
            const containerElement = document.querySelector(`[data-camera-id="${c.id}"]`) as HTMLElement;
            if (containerElement) {
              const containerRect = containerElement.getBoundingClientRect();
              if (containerRect.width > 0 && containerRect.height > 0) {
                const viewport = roiBoxToViewport(roiBox, containerRect);
                return { ...c, zoom: viewport.zoom, pan: viewport.pan };
              }
            }
          }
          
          // Try legacy ROI format third
          if (task?.roi?.[c.name]) {
            const roi = task.roi[c.name]!;
            return { ...c, zoom: roi.zoom, pan: { x: roi.panX, y: roi.panY } };
          }
          
          // Fallback to legacy presets format
          const p = task?.presets?.[c.id];
          if (p) {
            return { ...c, zoom: p.zoom, pan: { ...p.pan } };
          }
          
          // Default reset view
          return { ...c, zoom: 1, pan: { x: 0, y: 0 } };
        })
      );
      return;
    }

    // Get current state for animation start points
    setCams((prevCams) => {
      // Calculate target positions for each camera
      const animationTargets = prevCams.map((c) => {
        const task = items[taskIndex];
        let targetZoom = 1;
        let targetPan = { x: 0, y: 0 };
        
        // Determine target values
        // Try new ROI rectangles format first (pixel coordinates)
        if (task?.roiRectangles?.[c.name]?.[0]) {
          const roiRect = task.roiRectangles[c.name]![0];
          const containerElement = document.querySelector(`[data-camera-id="${c.id}"]`) as HTMLElement;
          if (containerElement) {
            const containerRect = containerElement.getBoundingClientRect();
            if (containerRect.width > 0 && containerRect.height > 0) {
              // Get image dimensions
              let imageWidth = 3840;
              let imageHeight = 2160;
              const imageElements = document.querySelectorAll('img');
              for (let i = 0; i < imageElements.length; i++) {
                const img = imageElements[i];
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  imageWidth = img.naturalWidth;
                  imageHeight = img.naturalHeight;
                  break;
                }
              }
              const viewport = roiRectangleToViewport(roiRect, containerRect, imageWidth, imageHeight);
              targetZoom = viewport.zoom;
              targetPan = viewport.pan;
            }
          }
        } else if (task?.roiBoxes?.[c.name]?.[0]) {
          const roiBox = task.roiBoxes[c.name]![0];
          const containerElement = document.querySelector(`[data-camera-id="${c.id}"]`) as HTMLElement;
          if (containerElement) {
            const containerRect = containerElement.getBoundingClientRect();
            if (containerRect.width > 0 && containerRect.height > 0) {
              const viewport = roiBoxToViewport(roiBox, containerRect);
              targetZoom = viewport.zoom;
              targetPan = viewport.pan;
            }
          }
        } else if (task?.roi?.[c.name]) {
          const roi = task.roi[c.name]!;
          targetZoom = roi.zoom;
          targetPan = { x: roi.panX, y: roi.panY };
        } else if (task?.presets?.[c.id]) {
          const p = task.presets[c.id];
          targetZoom = p.zoom;
          targetPan = { ...p.pan };
        }

        return {
          camId: c.id,
          startZoom: c.zoom,
          startPan: { ...c.pan },
          targetZoom,
          targetPan
        };
      });

      // Start animation
      const duration = 800; // milliseconds
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-out)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        setCams((currentCams) =>
          currentCams.map((c) => {
            const target = animationTargets.find(t => t.camId === c.id);
            if (!target) return c;
            
            const newZoom = target.startZoom + (target.targetZoom - target.startZoom) * easeOut;
            const newPan = {
              x: target.startPan.x + (target.targetPan.x - target.startPan.x) * easeOut,
              y: target.startPan.y + (target.targetPan.y - target.startPan.y) * easeOut
            };
            
            return { ...c, zoom: newZoom, pan: newPan };
          })
        );
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      requestAnimationFrame(animate);
      return prevCams; // Keep current state for smooth start
    });
  }, [items]);

  const resetAll = () => setCams((prev) => prev.map((c) => ({ ...c, zoom: 1, pan: { x: 0, y: 0 } })));

  // --- Hotkeys: fullscreen + ROI calibration --- (moved after selectStatus definition)

  const onDropFile = async (id: number, file?: File) => {
    if (!file) return;
    const url = await toDataUrl(file);
    setCams((p) => p.map((c) => (c.id === id ? { ...c, src: url } : c)));
  };

  // Simple zoom functions - no wheel zoom, just buttons
  const zoomIn = (id: number) => {
    setCams(prev => prev.map(cam => 
      cam.id === id 
        ? { ...cam, zoom: Math.min(cam.zoom + 0.5, 10) }
        : cam
    ));
  };

  const zoomOut = (id: number) => {
    setCams(prev => prev.map(cam => 
      cam.id === id 
        ? { ...cam, zoom: Math.max(cam.zoom - 0.5, 1.0), pan: cam.zoom - 0.5 <= 1.0 ? { x: 0, y: 0 } : cam.pan }
        : cam
    ));
  };

  const resetZoom = (id: number) => {
    setCams(prev => prev.map(cam => 
      cam.id === id 
        ? { ...cam, zoom: 1, pan: { x: 0, y: 0 } }
        : cam
    ));
  };


  const onWheel = (id: number, e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const cam = cams[id];
    if (!cam) return;
    
    // Determine zoom direction and amount
    const zoomDelta = e.deltaY > 0 ? 0.8 : 1.25; // Scroll down = zoom out, scroll up = zoom in
    const newZoom = clamp(cam.zoom * zoomDelta, 1.0, 10);
    
    let newPan: { x: number; y: number };
    if (newZoom <= 1.0) {
      // Always reset to center when at 1.0 zoom
      newPan = { x: 0, y: 0 };
    } else {
      // Zoom towards the center of the viewport for consistent behavior
      const rect = e.currentTarget.getBoundingClientRect();
      const zoomFactor = newZoom / cam.zoom;
      
      // Adjust pan to keep the viewport center point in the same position
      // When zooming in, we want to keep what's currently at viewport center visible
      const newPanX = cam.pan.x * zoomFactor;
      const newPanY = cam.pan.y * zoomFactor;
      
      newPan = clampPan({ x: newPanX, y: newPanY }, newZoom, rect, true);
    }
    
    setCams(prev => prev.map(c => 
      c.id === id 
        ? { ...c, zoom: newZoom, pan: newPan }
        : c
    ));
  };

  // Pinch zoom (Safari gesture events)
  const onPinch = (id: number, rect: DOMRect, factor: number) => {
    setCams((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const z0 = c.zoom;
        const z1 = clamp(z0 * factor, 1.0, 10); // Min 1.0x (no zoom-out), Max 10x
        const pan2 = z1 <= 1.0 ? { x: 0, y: 0 } : clampPan(c.pan, z1, rect, true);
        return { ...c, zoom: z1, pan: pan2 };
      })
    );
  };

  // Disabled drag functionality for now - basic image viewing only
  const onDrag = (id: number, e: React.MouseEvent<HTMLDivElement>) => {
    const cam = cams[id];
    if (cam.zoom === 1) return; // Only allow pan when zoomed in or out (not at 1.0x)
    
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startPanX = cam.pan.x;
    const startPanY = cam.pan.y;
    const containerRect = e.currentTarget.getBoundingClientRect();
    let hasMoved = false;
    
    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      
      // Mark as moved if we've dragged more than a few pixels
      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        hasMoved = true;
      }
      
      // Scale pan sensitivity with zoom level for responsive panning at all zoom levels
      const sensitivity = 1.5 * cam.zoom;
      
      setCams(prev => prev.map(c => {
        if (c.id !== id) return c;
        
        const newPan = {
          x: startPanX + deltaX * sensitivity, 
          y: startPanY + deltaY * sensitivity 
        };
        
        // Use the container rect captured at drag start for proper bounds
        const clampedPan = clampPan(newPan, c.zoom, containerRect, true);
        
        return { ...c, pan: clampedPan };
      }));
    };
    
    const onMouseUp = (upEvent: MouseEvent) => {
      upEvent.preventDefault();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      
      // If we didn't move much, it wasn't a real drag
      if (!hasMoved) {
        console.log('Click detected, not a drag');
      }
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'grabbing';
  };

  // API-based dark image detection (same as the working standalone version)
  const checkForDarkImages = async (hangar: string, session: string) => {
    try {
      addLog(`🌙 Checking for dark images in session: ${session}`);
      
      // Construct session path based on hangar structure
      const sessionPath = `/Users/oliverwallin/hangar_snapshots/${hangar}/${session}`;
      
      const response = await fetch('http://localhost:3002/api/analyze-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionPath: sessionPath,
          method: 'average',
          threshold: 100, // Brightness threshold (same as our working version)
          blurThreshold: 100 // Not used
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Dark image detection failed: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      
      // Check for dark images or incomplete image count (should be 8)
      const hasDarkImages = result.darkImageCount > 0;
      const hasIncompleteImages = result.images.length !== 8;
      
      if (hasDarkImages || hasIncompleteImages) {
        addLog(`⚠️ Issues detected - Dark: ${result.darkImageCount}, Total: ${result.images.length}/8`);
        
        // Convert API results to our format
        const analysisResults = result.images.map((img: any) => ({
          cameraName: img.name.substring(0, 3), // Extract camera name (FDL, FDR, etc.)
          brightness: img.brightness,
          isDark: img.isDark
        }));
        
        setDarkImageDetails({
          darkCount: result.darkImageCount,
          totalImages: result.images.length,
          sessionPath: sessionPath,
          hangar: hangar,
          session: session,
          analysisResults: analysisResults
        });
        
        setShowDarkImageModal(true);
        return true; // Issues found
      } else {
        addLog(`✅ Image quality check passed - No dark images, ${result.images.length}/8 images`);
        
        // Show success popup too
        const analysisResults = result.images.map((img: any) => ({
          cameraName: img.name.substring(0, 3),
          brightness: img.brightness,
          isDark: false
        }));
        
        setDarkImageDetails({
          darkCount: 0,
          totalImages: result.images.length,
          sessionPath: sessionPath,
          hangar: hangar,
          session: session,
          analysisResults: analysisResults
        });
        
        setShowDarkImageModal(true);
        return false; // No issues
      }
      
    } catch (error) {
      console.error('Dark image detection error:', error);
      addLog(`❌ Dark image detection failed: ${error instanceof Error ? error.message : String(error)}`);
      return false; // Assume no issues on error
    }
  };

  // Function to delete the current session folder
  const deleteSessionFolder = async () => {
    if (!darkImageDetails) return;

    try {
      addLog(`🗑️ Deleting session folder: ${darkImageDetails.session}`);
      
      const response = await fetch('http://localhost:3002/api/delete-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionPaths: [darkImageDetails.sessionPath],
          confirmBackup: true,
          confirmDelete: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Deletion failed: ${errorData.error || response.statusText}`);
      }

      const result = await response.json();
      addLog(`✅ Session folder deleted successfully`);
      
      // Close the modal and clear images from UI
      setShowDarkImageModal(false);
      setDarkImageDetails(null);
      
      // Clear the camera images since the session was deleted
      setCams(prev => prev.map(cam => ({ ...cam, src: "", isLoading: false })));
      
      return true;
    } catch (error) {
      console.error('Session deletion error:', error);
      addLog(`❌ Failed to delete session: ${error instanceof Error ? error.message : String(error)}`);
      alert(`Failed to delete session: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const snapshotAll = () => {
    addLog("Snapshot button clicked - opening configuration modal");
    // Reset modal fields and show modal
    setSnapshotHangar(HANGARS[0].id);
    setSnapshotDrone("");
    setShowSnapshotModal(true);
  };

  const executeSnapshot = async () => {
    if (!snapshotHangar || !snapshotDrone.trim()) {
      addLog("❌ Snapshot cancelled - missing hangar or drone name");
      alert("Please select a hangar and a drone name");
      return;
    }

    addLog(`📸 Starting fast camera capture for ${snapshotDrone} at ${snapshotHangar}`);
    addLog("🔗 Connecting to backend API...");
    
    // Reset session name for new capture
    setCurrentSessionName("");
    
    setIsCapturing(true);
    setShowSnapshotModal(false);
    
    // Update inspection metadata with capture info
    setInspectionMeta(prev => ({
      ...prev,
      droneName: snapshotDrone,
      hangarName: snapshotHangar
    }));
    
    // Reset delayed display state
    setPendingImages(new Map());
    setProgressText("");
    setIsWaitingToDisplay(false);
    setCaptureStartTime(Date.now());
    setEstimatedTimeRemaining(30); // Initial estimate: 30 seconds for parallel processing
    
    // Set all cameras to loading state and clear existing images
    setCams(prev => prev.map(cam => ({ ...cam, isLoading: true, src: "" })));
    
    try {
      // Start the capture process (non-blocking)
      const response = await fetch('http://localhost:3001/api/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hangar: snapshotHangar,
          drone: snapshotDrone
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${errorData.error || response.statusText}`);
      }
      
      const result = await response.json();
      const requestId = result.requestId;
      
      if (!requestId) {
        throw new Error('No request ID received from server');
      }
      
      addLog(`🚀 Capture process started (ID: ${requestId}) - polling for images...`);
      
      // Track which cameras we've already loaded to avoid duplicates
      const loadedCameras = new Set<string>();
      
      // Fast polling for image updates
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`http://localhost:3001/api/capture/${requestId}/status`);
          if (!statusResponse.ok) {
            throw new Error('Failed to get capture status');
          }
          
          const status = await statusResponse.json();
          
          // Update progress text based on current camera(s) and phase
          const currentCameras = status.currentCameras || (status.currentCamera ? [status.currentCamera] : []);
          
          if (currentCameras.length > 0) {
            const cameraList = currentCameras.join(', ');
            const isParallel = currentCameras.length > 1;
            
            if (status.currentPhase?.startsWith('batch_')) {
              setProgressText(`🚀 Parallel batch ${status.currentPhase.replace('batch_', '').replace('_of_', '/')} - Processing: [${cameraList}]`);
            } else if (status.currentPhase === 'autofocus') {
              setProgressText(isParallel ? `🎯 Focusing multiple: [${cameraList}]...` : `🎯 Focusing ${cameraList}...`);
            } else if (status.currentPhase === 'capture') {
              setProgressText(isParallel ? `📷 Capturing multiple: [${cameraList}]...` : `📷 Capturing ${cameraList}...`);
            } else if (status.currentPhase === 'connecting') {
              setProgressText(isParallel ? `🔗 Connecting to multiple: [${cameraList}]...` : `🔗 Connecting to ${cameraList}...`);
            } else {
              setProgressText(isParallel ? `⚙️ Processing: [${cameraList}]... (${status.currentStep}/8)` : `⚙️ Processing ${cameraList}... (${status.currentStep}/8)`);
            }
          } else if (status.status === 'running') {
            setProgressText(`🔄 Processing cameras... (${loadedCameras.size}/8)`);
          }
          
          // Update ETA countdown based on progress
          if (captureStartTime && status.status === 'running') {
            const capturedCount = (status.capturedCameras?.length || 0) + (status.failedCameras?.length || 0);
            const totalCameras = 8;
            const elapsed = Date.now() - captureStartTime;
            
            if (capturedCount > 0) {
              // Calculate average time per camera and estimate remaining
              const avgTimePerCamera = elapsed / capturedCount;
              const remainingCameras = totalCameras - capturedCount;
              const newEstimate = Math.round((remainingCameras * avgTimePerCamera) / 1000);
              
              // Only update estimate if it's significantly different (more than 3 seconds difference)
              // or if we don't have an estimate yet, to avoid disrupting the countdown
              setEstimatedTimeRemaining(prev => {
                if (prev === null) return Math.max(newEstimate, 0);
                const diff = Math.abs(newEstimate - prev);
                if (diff > 3) return Math.max(newEstimate, 0);
                return prev; // Keep current countdown going
              });
            } else if (elapsed > 10000 && estimatedTimeRemaining === null) {
              // Only set fallback estimate if we don't have one yet
              setEstimatedTimeRemaining(Math.max(15, Math.round((25000 - elapsed) / 1000)));
            }
          }

          // Debug logging
          console.log('Poll status:', {
            status: status.status,
            availableImages: status.availableImages?.length || 0,
            totalImages: status.totalImages,
            capturedCameras: status.capturedCameras,
            currentCamera: status.currentCamera,
            currentCameras: status.currentCameras,
            currentStep: status.currentStep,
            currentPhase: status.currentPhase,
            isParallel: (status.currentCameras?.length || 0) > 1,
            etaRemaining: estimatedTimeRemaining
          });
          
          // Store new images in pending state instead of displaying immediately
          for (const imageInfo of status.availableImages || []) {
            const cameraName = imageInfo.camera;
            
            if (!loadedCameras.has(cameraName)) {
              loadedCameras.add(cameraName);
              
              addLog(`📷 ${cameraName} image captured - storing for delayed display`);
              
              // Wait a moment to ensure file is completely written and stable
              setTimeout(() => {
                // Find the camera layout position
                const cameraPosition = CAMERA_LAYOUT.find(c => c.name === cameraName);
                if (cameraPosition) {
                  // Add cache-busting parameter to ensure fresh load
                  const timestamp = Date.now();
                  const imageUrl = `http://localhost:3001/api/image/${snapshotHangar}/${imageInfo.session}/${imageInfo.filename}?t=${timestamp}`;
                  
                  console.log(`Storing image for ${cameraName}:`, imageUrl);
                  
                  // Capture session name from the first image processed
                  if (!currentSessionName) {
                    setCurrentSessionName(imageInfo.session);
                    console.log(`Captured session name: ${imageInfo.session}`);
                  }
                  
                  // Store in pending images instead of displaying
                  setPendingImages(prev => {
                    const newMap = new Map(prev);
                    newMap.set(cameraName, imageUrl);
                    return newMap;
                  });
                  
                  addLog(`📦 ${cameraName} stored (${loadedCameras.size}/8)`);
                } else {
                  console.warn(`Camera position not found for ${cameraName}`);
                }
              }, 1000); // 1 second delay for file stability
            }
          }
          
          // Check if capture is complete - require both server completion AND all 8 images loaded
          const hasAllImages = loadedCameras.size >= 8;
          
          if (status.status === 'completed' && hasAllImages) {
            clearInterval(pollInterval);
            setEstimatedTimeRemaining(null); // Clear ETA timer
            addLog(`🎉 All cameras completed! Total: ${status.totalImages} images (${loadedCameras.size}/8 loaded)`);
            addLog(`⏳ Waiting 2 seconds before displaying all images...`);
            
            setIsWaitingToDisplay(true);
            
            // Wait 2 seconds then display all pending images
            setTimeout(() => {
              addLog(`🖼️ Displaying all images now!`);
              
              // Capture current pending images state
              setPendingImages(currentPendingImages => {
                addLog(`📦 Applying ${currentPendingImages.size} pending images to cameras`);
                
                // Apply all pending images to cameras
                setCams(prev => prev.map(cam => {
                  const cameraPosition = CAMERA_LAYOUT.find(c => c.id === cam.id);
                  if (cameraPosition) {
                    const pendingUrl = currentPendingImages.get(cameraPosition.name);
                    if (pendingUrl) {
                      addLog(`🖼️ Applying ${cameraPosition.name}: ${pendingUrl.substring(0, 80)}...`);
                      return {
                        ...cam,
                        isLoading: false,
                        src: pendingUrl,
                        sourceUrl: pendingUrl
                      };
                    }
                  }
                  return { ...cam, isLoading: false };
                }));
                
                setIsCapturing(false);
                setIsWaitingToDisplay(false);
                
                // Set inspection start time when images are ready for inspection
                setInspectionMeta(prev => ({
                  ...prev,
                  startTime: prev.startTime || new Date().toISOString() // Only set if not already set
                }));
                
                addLog(`✅ All images displayed successfully!`);
                addLog(`🚀 Inspection officially started - images ready for review`);
                
                // Check for dark images after successful capture
                setTimeout(async () => {
                  console.log('🕐 Dark image check timer triggered!');
                  console.log(`Debug: snapshotHangar=${snapshotHangar}, currentSessionName="${currentSessionName}"`);
                  
                  if (snapshotHangar && currentSessionName) {
                    console.log(`✅ Starting dark image check for session: ${currentSessionName} in hangar: ${snapshotHangar}`);
                    addLog(`🔍 Starting dark image analysis...`);
                    await checkForDarkImages(snapshotHangar, currentSessionName);
                  } else {
                    console.log(`❌ Cannot start dark image check - missing hangar (${snapshotHangar}) or session name (${currentSessionName})`);
                    addLog(`⚠️ Dark image check skipped - missing session information`);
                  }
                }, 3000); // 3 second delay
                
                // Clear pending images
                return new Map();
              });
            }, 2000); // 2 second delay
            
          } else if (status.status === 'completed' && !hasAllImages) {
            // Server says complete but we don't have all images yet - keep polling
            addLog(`⚠️ Server reports complete but only ${loadedCameras.size}/8 images loaded - continuing to poll...`);
            
          } else if (hasAllImages && status.status !== 'completed') {
            // We have all images but server hasn't marked as complete yet - keep polling briefly
            addLog(`📷 All 8 images loaded, waiting for server completion status...`);
            
          } else if (status.status === 'failed' || status.status === 'error') {
            clearInterval(pollInterval);
            addLog(`❌ Capture failed: ${status.error || 'Unknown error'}`);
            
            setCams(prev => prev.map(cam => ({ ...cam, isLoading: false })));
            setIsCapturing(false);
            setCaptureStartTime(null);
            setEstimatedTimeRemaining(null);
          }
          
        } catch (error) {
          console.error('Polling error:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          addLog(`⚠️ Polling error: ${errorMessage}`);
          // Continue polling - don't stop on temporary errors
        }
      }, 500); // Poll every 500ms for debugging
      
      // Safety timeout
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isCapturing) {
          addLog("⏰ Capture timeout - stopping polling");
          setCams(prev => prev.map(cam => ({ ...cam, isLoading: false })));
          setIsCapturing(false);
          setCaptureStartTime(null);
          setEstimatedTimeRemaining(null);
        }
      }, 300000); // 5 minute timeout
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Snapshot capture failed: ${errorMessage}`);
      console.error('Capture error details:', error);
      alert(`Failed to capture snapshots: ${errorMessage}`);
      
      // Clear loading state on error
      setCams(prev => prev.map(cam => ({ ...cam, isLoading: false })));
      setIsCapturing(false);
      setCaptureStartTime(null);
      setEstimatedTimeRemaining(null);
    }
  };

  // Load the latest folder across ALL hangars
  const loadLatestFolderGlobally = async () => {
    try {
      addLog(`🔄 Looking for latest session across all hangars...`);
      
      const response = await fetch(`http://localhost:3001/api/folders`);
      if (!response.ok) {
        throw new Error(`Failed to load folders: ${response.statusText}`);
      }
      
      const data = await response.json();
      const hangars = data.hangars;
      
      if (!hangars || hangars.length === 0) {
        addLog(`⚠️ No hangars found`);
        return;
      }
      
      // Find the most recent session across all hangars
      let latestSession: any = null;
      let latestHangar: string | null = null;
      let latestTime = 0;
      
      for (const hangar of hangars) {
        for (const session of hangar.sessions) {
          const sessionTime = new Date(session.created).getTime();
          if (sessionTime > latestTime) {
            latestTime = sessionTime;
            latestSession = session;
            latestHangar = hangar.id;
          }
        }
      }
      
      if (!latestSession || !latestHangar) {
        addLog(`⚠️ No sessions found in any hangar`);
        return;
      }
      
      addLog(`📂 Found latest session: ${latestSession.name} from ${latestHangar} with ${latestSession.imageCount} images`);
      
      // Load images from this session
      const timestamp = Date.now();
      const newCams = cams.map((cam, index) => {
        // Use the correct camera layout order
        const cameraName = CAMERA_LAYOUT[index]?.name;
        const imageFile = latestSession.images.find((img: string) => img.startsWith(cameraName));
        
        if (imageFile) {
          const imageUrl = `http://localhost:3001/api/image/${latestHangar}/${latestSession.name}/${imageFile}?t=${timestamp}`;
          return { ...cam, src: imageUrl, isLoading: false };
        } else {
          return { ...cam, src: "", isLoading: false };
        }
      });
      
      setCams(newCams);
      setSnapshotHangar(latestHangar);
      setSnapshotDrone(latestSession.name.split('_')[0]); // Extract drone name from session
      setCurrentSession({ name: latestSession.name, hangar: latestHangar });
      
      addLog(`✅ Loaded ${latestSession.imageCount} images from latest session`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Failed to load latest folder: ${errorMessage}`);
      console.error('Load latest error:', error);
    }
  };

  // Load latest folder from a specific hangar
  const loadLatestFolder = async (hangar: string) => {
    try {
      addLog(`🔄 Loading latest folder for ${hangar}...`);
      
      const response = await fetch(`http://localhost:3001/api/folders/latest/${hangar}`);
      if (!response.ok) {
        throw new Error(`Failed to load latest folder: ${response.statusText}`);
      }
      
      const data = await response.json();
      const session = data.session;
      
      addLog(`📂 Found latest session: ${session.name} with ${session.imageCount} images`);
      
      // Load images from this session
      const timestamp = Date.now();
      const newCams = cams.map((cam, index) => {
        // Use the correct camera layout order
        const cameraName = CAMERA_LAYOUT[index]?.name;
        const imageFile = session.images.find((img: string) => img.startsWith(cameraName));
        
        if (imageFile) {
          const imageUrl = `http://localhost:3001/api/image/${session.hangar}/${session.name}/${imageFile}?t=${timestamp}`;
          return { ...cam, src: imageUrl, sourceUrl: imageUrl };
        }
        return cam;
      });
      
      setCams(newCams);
      setCurrentSession({ name: session.name, hangar: session.hangar });
      addLog(`✅ Loaded ${session.imageCount} images from ${session.name}`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Failed to load latest folder: ${errorMessage}`);
      alert(`Failed to load latest folder: ${errorMessage}`);
    }
  };

  // Load folders for browsing
  const loadAvailableFolders = async () => {
    try {
      setLoadingFolders(true);
      addLog('📁 Loading available folders...');
      
      const response = await fetch('http://localhost:3001/api/folders');
      if (!response.ok) {
        throw new Error(`Failed to load folders: ${response.statusText}`);
      }
      
      const data = await response.json();
      setAvailableFolders(data.hangars);
      addLog(`📁 Found ${data.hangars.length} hangars with sessions`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Failed to load folders: ${errorMessage}`);
      alert(`Failed to load folders: ${errorMessage}`);
    } finally {
      setLoadingFolders(false);
    }
  };

  // Load images from a specific session
  const loadSessionImages = async (hangar: string, sessionName: string, images: string[]) => {
    try {
      addLog(`📂 Loading session: ${sessionName} from ${hangar}...`);
      
      const timestamp = Date.now();
      const newCams = cams.map((cam, index) => {
        // Use the correct camera layout order
        const cameraName = CAMERA_LAYOUT[index]?.name;
        const imageFile = images.find((img: string) => img.startsWith(cameraName));
        
        if (imageFile) {
          const imageUrl = `http://localhost:3001/api/image/${hangar}/${sessionName}/${imageFile}?t=${timestamp}`;
          return { ...cam, src: imageUrl, sourceUrl: imageUrl };
        }
        return cam;
      });
      
      setCams(newCams);
      setCurrentSession({ name: sessionName, hangar: hangar });
      setShowFolderModal(false);
      addLog(`✅ Loaded ${images.length} images from ${sessionName}`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Failed to load session images: ${errorMessage}`);
      alert(`Failed to load session images: ${errorMessage}`);
    }
  };

  // Save current 8 cams' zoom/pan into current task presets
  const saveTaskPresetsAll = () => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const presets = { ...(it.presets || {}) } as Record<number, { zoom: number; pan: { x: number; y: number } }>;
        for (const c of cams) presets[c.id] = { zoom: c.zoom, pan: { ...c.pan } };
        return { ...it, presets };
      })
    );
  };

  // Check if images are loaded
  const areImagesLoaded = () => {
    return cams.every(cam => cam.src && cam.src !== "");
  };

  // Auto-load calibration images
  const loadCalibrationImages = async (hangarId: string, cameraIndex: number) => {
    console.log('🔧 Starting loadCalibrationImages', { hangarId, cameraIndex });
    setLoadingImages(true);
    
    try {
      // Camera name mapping
      const cameraNames = ['FDR', 'FUR', 'RUR', 'RDR', 'FDL', 'FUL', 'RUL', 'RDL'];
      const cameraName = cameraNames[cameraIndex];
      console.log('🔧 Using camera name:', cameraName);
      
      // Load Mölndal baseline image
      const baselineUrl = `http://localhost:3001/api/image/hangar_sisjon_vpn/bender_251007_080145/${cameraName}_251007_080145.jpg?t=${Date.now()}`;
      console.log('🔧 Baseline URL:', baselineUrl);
      setMolndalImage(baselineUrl);
      addLog(`📍 Loading baseline: ${cameraName} from Mölndal`);
      
      // Get latest session for selected hangar
      const latestUrl = `http://localhost:3001/api/folders/latest/${hangarId}`;
      console.log('🔧 Latest session URL:', latestUrl);
      const latestResponse = await fetch(latestUrl);
      
      if (latestResponse.ok) {
        const response = await latestResponse.json();
        console.log('🔧 Latest API response:', response);
        
        const latestData = response.session || response; // Handle both response formats
        console.log('🔧 Latest session data:', latestData);
        
        // Find the image for this camera - the images array contains filenames
        const targetImageFilename = latestData.images?.find((filename: string) => filename.startsWith(cameraName));
        console.log('🔧 Target image filename:', targetImageFilename);
        
        if (targetImageFilename) {
          const hangarImageUrl = `http://localhost:3001/api/image/${hangarId}/${latestData.name}/${targetImageFilename}?t=${Date.now()}`;
          console.log('🔧 Hangar image URL:', hangarImageUrl);
          setHangarImage(hangarImageUrl);
          addLog(`🎯 Loading target: ${cameraName} from ${latestData.name}`);
        } else {
          addLog(`⚠️ No image found for ${cameraName} in latest session from ${hangarId}`);
          console.log('🔧 Available images in session:', latestData.images);
        }
      } else {
        addLog(`❌ Failed to load latest session from ${hangarId} - Status: ${latestResponse.status}`);
        console.log('🔧 Latest response error:', await latestResponse.text());
      }
    } catch (error) {
      addLog(`❌ Error loading calibration images: ${error}`);
      console.error('🔧 LoadCalibrationImages error:', error);
    }
    
    setLoadingImages(false);
    console.log('🔧 Finished loadCalibrationImages, setting loadingImages to false');
  };

  // TI status change with auto-advance
  const selectStatus = (s: "pass" | "fail" | "na") => {
    // Check if images are loaded for pass/fail actions
    if ((s === "pass" || s === "fail") && !areImagesLoaded()) {
      setShowNoImagesModal(true);
      return;
    }
    
    // Validation gate logic for innovative mode - only block PASS, allow FAIL
    if (inspectionMode === 'innovative' && s === 'pass') {
      const currentTask = items[idx];
      const currentValidations = validatedBoxes[currentTask.id] || new Set();
      const totalBoxes = Object.values(currentTask.validationBoxes || {}).reduce((sum, boxes) => sum + (boxes?.length || 0), 0);
      
      if (totalBoxes > 0 && currentValidations.size !== totalBoxes) {
        addLog(`⚠️ Cannot PASS: Must validate all ${totalBoxes} inspection areas first (${currentValidations.size}/${totalBoxes} completed)`);
        return; // Block only PASS decision
      }
    }
    
    if (idx >= items.length) return;
    const i = idx;
    addLog(`📋 Task ${i + 1}: ${s.toUpperCase()} - ${items[i].title.substring(0, 40)}...`);
    setItems((prev) => prev.map((x, k) => (k === i ? { 
      ...x, 
      status: s, 
      completedAt: new Date().toISOString() 
    } : x)));
    
    if (s === "pass" || s === "fail") {
      setLeaving(true);
      setTimeout(() => {
        setLeaving(false);
        setIdx((prev) => {
          const next = Math.min(prev + 1, items.length);
          if (next < items.length) {
            addLog(`➡️ Advanced to task ${next + 1}: ${items[next]?.title.substring(0, 40)}...`);
          } else {
            addLog("🎉 All TI tasks completed!");
            // Mark inspection as completed
            setInspectionMeta(prevMeta => ({
              ...prevMeta,
              completedTime: new Date().toISOString()
            }));
          }
          return next;
        });
      }, 360);
    }
  };

  // --- Hotkeys: fullscreen + ROI calibration ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key?.toLowerCase?.();
      // Handle fullscreen mode keys
      if (fsId != null) {
        if (k === "escape") {
          resetView(fsId);
          setFsId(null);
        }
        if (k === "arrowleft") setFsId((p) => (p == null ? p : (p + 7) % 8));
        if (k === "arrowright") setFsId((p) => (p == null ? p : (p + 1) % 8));
        return;
      }
      
      // Handle ESC for closing modals
      if (k === "escape") {
        if (showTransformModal) {
          setShowTransformModal(false);
          addLog("⚙️ Camera Alignment settings closed");
          return;
        }
        if (showCalibrateSelectionModal) {
          setCalibrateSelectionModal(false);
          addLog("🎯 Camera Calibration selection closed");
          return;
        }
        if (showCalibrateModal) {
          setCalibrateModal(false);
          setCalibrationTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
          setMolndalImage("");
          setHangarImage("");
          addLog("🎯 Camera Calibration closed");
          return;
        }
      }
      
      // Keyboard shortcuts when not in fullscreen
      if (k === "f") {
        // F = Fullscreen (show hovered camera, or first camera if none hovered)
        const targetId = hoverId !== null ? hoverId : 0;
        setFsId(targetId);
      } else if (k === "r") {
        // R = Reset all cameras (same as Reset All button)
        resetAll();
      } else if (k === "i") {
        // I = Toggle between Classic and Innovative inspection mode
        setInspectionMode(inspectionMode === 'classic' ? 'innovative' : 'classic');
        addLog(`🔄 Switched to ${inspectionMode === 'classic' ? 'Innovative' : 'Classic'} inspection mode`);
      } else if (k === "l") {
        // L = Toggle laptop mode (zoom buttons)
        setLaptopMode(!laptopMode);
        addLog(`💻 Laptop mode ${!laptopMode ? 'enabled' : 'disabled'} - zoom buttons ${!laptopMode ? 'shown' : 'hidden'}`);
      } else if (k === "d") {
        // D = Toggle debug mode (logs)
        setShowLogs(!showLogs);
        addLog(`🐛 Debug mode ${!showLogs ? 'enabled' : 'disabled'}`);
      } else if (k === "p") {
        // P = Pass current inspection task
        selectStatus("pass");
      } else if (k === "x") {
        // X = Fail current inspection task
        selectStatus("fail");
      } else if (k === "a") {
        // A = Open Camera Alignment settings
        setShowTransformModal(true);
        addLog("⚙️ Camera Alignment settings opened");
      } else if (k === "c") {
        // C = Open Camera Calibration selection
        setCalibrateSelectionModal(true);
        addLog("🎯 Camera Calibration selection opened");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hoverId, fsId, resetView, resetAll, inspectionMode, addLog, laptopMode, showLogs, selectStatus]);
  
  // Update task comment
  const updateTaskComment = (comment: string) => {
    if (idx >= items.length) return;
    setItems((prev) => prev.map((x, k) => (k === idx ? { ...x, comment } : x)));
  };

  // Generate PDF report with enhanced styling and images
  const generatePDFReport = async () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - 2 * margin;
      let currentY = margin;
      
      // Helper function to add new page with header
      const addPageWithHeader = () => {
        pdf.addPage();
        currentY = margin;
        
        // Page header
        pdf.setDrawColor(70, 130, 180);
        pdf.setLineWidth(0.5);
        pdf.line(margin, currentY, pageWidth - margin, currentY);
        currentY += 8;
        
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);
        pdf.text('Drone Remote Inspection Report', margin, currentY);
        pdf.text(`Session: ${inspectionMeta.sessionId}`, pageWidth - margin - 50, currentY);
        currentY += 15;
        
        pdf.setTextColor(0, 0, 0);
      };
      
      // Header with branding
      pdf.setFillColor(70, 130, 180);
      pdf.rect(0, 0, pageWidth, 25, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(24);
      pdf.text('DRONE INSPECTION REPORT', margin, 18);
      
      currentY = 35;
      pdf.setTextColor(0, 0, 0);
      
      // Report metadata box
      pdf.setFillColor(248, 249, 250);
      pdf.rect(margin, currentY, contentWidth, 25, 'F');
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(margin, currentY, contentWidth, 25);
      
      currentY += 8;
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      const reportDate = new Date().toLocaleString();
      pdf.text(`Generated: ${reportDate}`, margin + 5, currentY);
      pdf.text(`Report ID: ${inspectionMeta.sessionId}`, pageWidth - margin - 60, currentY);
      currentY += 5;
      pdf.text(`Page 1 of Multiple`, margin + 5, currentY);
      
      currentY += 20;
      pdf.setTextColor(0, 0, 0);
      
      // Inspection Details Section
      pdf.setFillColor(45, 55, 72);
      pdf.rect(margin, currentY, contentWidth, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.text('INSPECTION DETAILS', margin + 5, currentY + 6);
      
      currentY += 15;
      pdf.setTextColor(0, 0, 0);
      pdf.setFillColor(250, 250, 250);
      pdf.rect(margin, currentY, contentWidth, 35, 'F');
      
      currentY += 8;
      pdf.setFontSize(11);
      
      // Create two columns for inspection details
      const leftCol = margin + 5;
      const rightCol = margin + contentWidth/2 + 5;
      
      pdf.setFont('helvetica', 'bold');
      pdf.text('Inspector:', leftCol, currentY);
      pdf.text('Drone:', rightCol, currentY);
      pdf.setFont('helvetica', 'normal');
      pdf.text(inspectionMeta.inspectorName || 'Not specified', leftCol + 25, currentY);
      pdf.text(inspectionMeta.droneName || 'Not specified', rightCol + 20, currentY);
      
      currentY += 8;
      pdf.setFont('helvetica', 'bold');
      pdf.text('Hangar:', leftCol, currentY);
      pdf.text('Session ID:', rightCol, currentY);
      pdf.setFont('helvetica', 'normal');
      pdf.text(inspectionMeta.hangarName || 'Not specified', leftCol + 25, currentY);
      pdf.text(inspectionMeta.sessionId, rightCol + 30, currentY);
      
      currentY += 8;
      pdf.setFont('helvetica', 'bold');
      pdf.text('Started:', leftCol, currentY);
      pdf.setFont('helvetica', 'normal');
      
      if (inspectionMeta.startTime) {
        const startTime = new Date(inspectionMeta.startTime).toLocaleString();
        pdf.text(startTime, leftCol + 25, currentY);
      } else {
        pdf.text('Pending image capture', leftCol + 25, currentY);
      }
      
      if (inspectionMeta.completedTime) {
        const completedTime = new Date(inspectionMeta.completedTime).toLocaleString();
        
        pdf.setFont('helvetica', 'bold');
        pdf.text('Completed:', rightCol, currentY);
        pdf.setFont('helvetica', 'normal');
        pdf.text(completedTime, rightCol + 30, currentY);
        
        currentY += 8;
        pdf.setFont('helvetica', 'bold');
        pdf.text('Duration:', leftCol, currentY);
        pdf.setFont('helvetica', 'normal');
        
        if (inspectionMeta.startTime) {
          const duration = new Date(inspectionMeta.completedTime).getTime() - new Date(inspectionMeta.startTime).getTime();
          const durationMinutes = Math.round(duration / 60000);
          pdf.text(`${durationMinutes} minutes`, leftCol + 25, currentY);
        } else {
          pdf.text('Unable to calculate', leftCol + 25, currentY);
        }
      }
      
      currentY += 20;
      
      // Summary Section with visual stats
      pdf.setFillColor(34, 197, 94);
      pdf.rect(margin, currentY, contentWidth, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.text('INSPECTION SUMMARY', margin + 5, currentY + 6);
      
      currentY += 15;
      pdf.setTextColor(0, 0, 0);
      
      const completedTasks = items.filter(item => !!item.status);
      const passedTasks = items.filter(item => item.status === 'pass');
      const failedTasks = items.filter(item => item.status === 'fail');
      const naTasks = items.filter(item => item.status === 'na');
      
      // Summary boxes
      const boxWidth = (contentWidth - 15) / 4;
      const boxHeight = 25;
      
      // Total Tasks
      pdf.setFillColor(59, 130, 246);
      pdf.rect(margin, currentY, boxWidth, boxHeight, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.text(items.length.toString(), margin + boxWidth/2 - 5, currentY + 12);
      pdf.setFontSize(9);
      pdf.text('TOTAL TASKS', margin + boxWidth/2 - 15, currentY + 20);
      
      // Passed
      pdf.setFillColor(34, 197, 94);
      pdf.rect(margin + boxWidth + 5, currentY, boxWidth, boxHeight, 'F');
      pdf.setFontSize(20);
      pdf.text(passedTasks.length.toString(), margin + boxWidth + 5 + boxWidth/2 - 5, currentY + 12);
      pdf.setFontSize(9);
      pdf.text('PASSED', margin + boxWidth + 5 + boxWidth/2 - 10, currentY + 20);
      
      // Failed
      pdf.setFillColor(239, 68, 68);
      pdf.rect(margin + 2*boxWidth + 10, currentY, boxWidth, boxHeight, 'F');
      pdf.setFontSize(20);
      pdf.text(failedTasks.length.toString(), margin + 2*boxWidth + 10 + boxWidth/2 - 5, currentY + 12);
      pdf.setFontSize(9);
      pdf.text('FAILED', margin + 2*boxWidth + 10 + boxWidth/2 - 8, currentY + 20);
      
      // N/A
      pdf.setFillColor(156, 163, 175);
      pdf.rect(margin + 3*boxWidth + 15, currentY, boxWidth, boxHeight, 'F');
      pdf.setFontSize(20);
      pdf.text(naTasks.length.toString(), margin + 3*boxWidth + 15 + boxWidth/2 - 5, currentY + 12);
      pdf.setFontSize(9);
      pdf.text('N/A', margin + 3*boxWidth + 15 + boxWidth/2 - 5, currentY + 20);
      
      currentY += 35;
      pdf.setTextColor(0, 0, 0);
      
      // Camera Images Section
      if (cams.some(cam => cam.src)) {
        pdf.setFillColor(168, 85, 247);
        pdf.rect(margin, currentY, contentWidth, 8, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(14);
        pdf.text('CAMERA IMAGES', margin + 5, currentY + 6);
        
        currentY += 15;
        pdf.setTextColor(0, 0, 0);
        
        const imagesWithData = cams.filter(cam => cam.src);
        if (imagesWithData.length > 0) {
          const imageSize = 35;
          const imagesPerRow = 4;
          let imageX = margin;
          let imageRow = 0;
          
          for (let i = 0; i < imagesWithData.length; i++) {
            const cam = imagesWithData[i];
            
            if (i > 0 && i % imagesPerRow === 0) {
              imageRow++;
              imageX = margin;
              currentY += imageSize + 15;
              
              // Check if we need a new page
              if (currentY + imageSize > pageHeight - margin) {
                addPageWithHeader();
                imageRow = 0;
              }
            }
            
            try {
              // Add image with border
              pdf.setDrawColor(200, 200, 200);
              pdf.rect(imageX, currentY, imageSize, imageSize);
              
              if (cam.src) {
                pdf.addImage(cam.src, 'JPEG', imageX + 1, currentY + 1, imageSize - 2, imageSize - 2);
              }
              
              // Camera label
              pdf.setFontSize(8);
              pdf.setFont('helvetica', 'bold');
              pdf.text(cam.name, imageX + imageSize/2 - 5, currentY + imageSize + 5);
              
            } catch (error) {
              console.warn(`Failed to add image for camera ${cam.name}:`, error);
              // Add placeholder
              pdf.setFillColor(240, 240, 240);
              pdf.rect(imageX + 1, currentY + 1, imageSize - 2, imageSize - 2, 'F');
              pdf.setFontSize(10);
              pdf.text('No Image', imageX + imageSize/2 - 10, currentY + imageSize/2);
            }
            
            imageX += imageSize + 5;
          }
          
          currentY += imageSize + 20;
        }
      }
      
      // Start new page for task details
      addPageWithHeader();
      
      // Task Details Section
      pdf.setFillColor(234, 88, 12);
      pdf.rect(margin, currentY, contentWidth, 8, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.text('DETAILED TASK RESULTS', margin + 5, currentY + 6);
      
      currentY += 20;
      pdf.setTextColor(0, 0, 0);
      
      items.forEach((item, index) => {
        // Check if we need a new page
        if (currentY > pageHeight - 60) {
          addPageWithHeader();
        }
        
        // Task box - set status color
        if (item.status === 'pass') {
          pdf.setFillColor(34, 197, 94);
        } else if (item.status === 'fail') {
          pdf.setFillColor(239, 68, 68);
        } else if (item.status === 'na') {
          pdf.setFillColor(156, 163, 175);
        } else {
          pdf.setFillColor(209, 213, 219);
        }
        pdf.rect(margin, currentY, 8, 8, 'F');
        
        // Task header
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        const statusIcon = item.status === 'pass' ? '✓' : item.status === 'fail' ? '✗' : item.status === 'na' ? 'N/A' : '○';
        const statusText = `${index + 1}. ${item.title} [${statusIcon}]`;
        pdf.text(statusText, margin + 12, currentY + 6);
        currentY += 10;
        
        // Category badge
        const category = getCategoryInfo(item.category);
        pdf.setFillColor(243, 244, 246);
        pdf.rect(margin + 5, currentY, 40, 6, 'F');
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${category.name}`, margin + 7, currentY + 4);
        currentY += 10;
        
        // Description
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        const descriptionLines = pdf.splitTextToSize(item.detail, contentWidth - 10);
        pdf.text(descriptionLines, margin + 5, currentY);
        currentY += Math.max(descriptionLines.length * 3.5, 10);
        
        // Completion time and comment in a box
        if (item.completedAt || (item.comment && item.comment.trim())) {
          pdf.setFillColor(249, 250, 251);
          const boxHeight = (item.completedAt ? 6 : 0) + (item.comment?.trim() ? 15 : 0);
          pdf.rect(margin + 5, currentY, contentWidth - 10, boxHeight, 'F');
          
          currentY += 4;
          
          if (item.completedAt) {
            const completedTime = new Date(item.completedAt).toLocaleString();
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Completed:', margin + 8, currentY);
            pdf.setFont('helvetica', 'normal');
            pdf.text(completedTime, margin + 30, currentY);
            currentY += 5;
          }
          
          if (item.comment && item.comment.trim()) {
            pdf.setFontSize(8);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Inspector Comment:', margin + 8, currentY);
            currentY += 4;
            pdf.setFont('helvetica', 'normal');
            const commentLines = pdf.splitTextToSize(item.comment, contentWidth - 20);
            pdf.text(commentLines, margin + 10, currentY);
            currentY += commentLines.length * 3;
          }
          
          currentY += 5;
        }
        
        currentY += 8; // Space between tasks
      });
      
      // Footer on last page
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text('Generated by MultiCam Inspection System', margin, pageHeight - 10);
      pdf.text(new Date().toLocaleString(), pageWidth - margin - 40, pageHeight - 10);
      
      // Save the PDF
      const filename = `DroneInspection_${inspectionMeta.droneName || 'Unknown'}_${inspectionMeta.sessionId}_${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(filename);
      
      addLog(`📄 Enhanced PDF report generated: ${filename}`);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`❌ Failed to generate PDF report: ${errorMessage}`);
      alert(`Failed to generate PDF report: ${errorMessage}`);
    }
  };


  // --- Persist ROI presets ---
  useEffect(() => {
    try {
      const payload = items.map((it) => it.presets ?? null);
      localStorage.setItem("ti_presets_v1", JSON.stringify(payload));
    } catch {
      /* ignore quota/private mode */
    }
  }, [items]);

  // --- Load ROI presets on mount ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ti_presets_v1");
      if (raw) {
        const arr = JSON.parse(raw) as Array<Record<number, { zoom: number; pan: { x: number; y: number } }> | null>;
        setItems((prev) => prev.map((it, i) => ({ ...it, presets: arr?.[i] ?? it.presets })));
      }
    } catch {
      /* ignore parse errors */
    }
  }, []);

  // --- Backend health check ---
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/health');
        if (response.ok) {
          const health = await response.json();
          addLog("🔗 Backend API connected successfully");
          addLog(`📜 Camera script status: ${health.script}`);
        } else {
          addLog("⚠️ Backend API not responding - camera capture will not work");
        }
      } catch (error) {
        addLog("❌ Backend API connection failed - start the server with 'npm run server'");
      }
    };
    
    checkBackendHealth();
  }, [addLog]);

  // --- One-time initial apply of presets ---
  useEffect(() => {
    if (!didInitialApply.current && items.length > 0) {
      addLog("🚀 MultiCam Inspector initialized - 8 cameras ready");
      addLog(`📋 TI Checklist loaded - ${items.length} tasks`);
      applyTaskPresets(idx, false); // No animation on initial load
      didInitialApply.current = true;
    }
  }, [items, idx, applyTaskPresets, addLog]);

  // --- Apply ROI settings when task changes ---
  useEffect(() => {
    if (didInitialApply.current && items.length > 0) {
      addLog(`🎬 Animating to ROI for task ${idx + 1}: ${items[idx]?.title?.substring(0, 40)}...`);
      applyTaskPresets(idx, true); // Animated transitions between tasks
    }
  }, [idx, applyTaskPresets, items, addLog]);

  // --- Render ---
  return (
    <div className="w-full h-full p-3 space-y-3 bg-white text-black">
      {/* Header – main controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Button 
          onClick={snapshotAll} 
          disabled={isCapturing || isWaitingToDisplay}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 font-semibold"
        >
          {isWaitingToDisplay ? "PREPARING..." : (isCapturing ? "CAPTURING..." : "📸 SNAPSHOT")}
        </Button>

        {/* Current Session - Inline and Subtle */}
        {currentSession && (
          <div className="text-xs text-gray-500 font-medium">
            📂 {currentSession.name} <span className="text-gray-400">({currentSession.hangar})</span>
          </div>
        )}

        {/* Image Enhancement Controls */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <label className="text-gray-600">💡 Bright:</label>
            <button
              onClick={() => adjustBrightness(-5)}
              className="px-1 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 rounded border"
              title="Decrease brightness by 5%"
            >
              −
            </button>
            <span className="text-gray-700 w-12 text-center font-medium">{brightness}%</span>
            <button
              onClick={() => adjustBrightness(5)}
              className="px-1 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 rounded border"
              title="Increase brightness by 5%"
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-gray-600">🎨 Contrast:</label>
            <button
              onClick={() => adjustContrast(-5)}
              className="px-1 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 rounded border"
              title="Decrease contrast by 5%"
            >
              −
            </button>
            <span className="text-gray-700 w-12 text-center font-medium">{contrast}%</span>
            <button
              onClick={() => adjustContrast(5)}
              className="px-1 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 rounded border"
              title="Increase contrast by 5%"
            >
              +
            </button>
          </div>
        </div>
        
        {showLogs && (
          <>
            <Button 
              variant="outline" 
              size="sm"
              onClick={async () => {
                const currentTask = items[idx];
                if (!currentTask) {
                  addLog("❌ No current task to store ROI for");
                  return;
                }
                
                const taskInfo = `Task ${idx + 1} (${currentTask.id})`;
                
                // Get actual image dimensions
                let imageWidth = 3840;
                let imageHeight = 2160;
                const imageElements = document.querySelectorAll('img');
                for (let i = 0; i < imageElements.length; i++) {
                  const img = imageElements[i];
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    imageWidth = img.naturalWidth;
                    imageHeight = img.naturalHeight;
                    break;
                  }
                }
                
                // Build legacy ROI object with only cameras that have adjustments
                const newRoi: Record<string, { zoom: number; panX: number; panY: number }> = {};
                
                // Build new ROI boxes object using relative coordinates
                const newRoiBoxes: Record<string, ROIBox[]> = {};
                
                // Build new ROI rectangles object using pixel coordinates
                const newRoiRectangles: Record<string, ROIRectangle[]> = {};
                
                cams.forEach(cam => {
                  // Only store ROI if camera is adjusted from default
                  if (cam.zoom !== 1 || cam.pan.x !== 0 || cam.pan.y !== 0) {
                    // Legacy format (for backwards compatibility)
                    newRoi[cam.name] = {
                      zoom: cam.zoom,
                      panX: cam.pan.x,
                      panY: cam.pan.y
                    };
                    
                    const containerElement = document.querySelector(`[data-camera-id="${cam.id}"]`) as HTMLElement;
                    if (containerElement) {
                      const containerRect = containerElement.getBoundingClientRect();
                      if (containerRect.width > 0 && containerRect.height > 0) {
                        // ROI boxes format (relative coordinates)
                        const roiBox = viewportToROIBox(
                          cam.zoom,
                          cam.pan,
                          containerRect,
                          `roi-${Date.now()}`,
                          `ROI for ${cam.name}`
                        );
                        newRoiBoxes[cam.name] = [roiBox];
                        
                        // ROI rectangles format (pixel coordinates) - NEW!
                        const roiRect = viewportToROIRectangle(
                          cam.zoom,
                          cam.pan,
                          containerRect,
                          imageWidth,
                          imageHeight,
                          `roi-rect-${Date.now()}`,
                          `ROI Rectangle for ${cam.name}`
                        );
                        newRoiRectangles[cam.name] = [roiRect];
                      }
                    }
                  }
                });
                
                try {
                  // Update JSON file via API (include both legacy and new ROI data)
                  const response = await fetch('http://localhost:3001/api/update-roi', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      taskId: currentTask.id,
                      roi: newRoi,                    // Legacy format
                      roiBoxes: newRoiBoxes,          // Relative coordinate format
                      roiRectangles: newRoiRectangles // Pixel coordinate format (NEW!)
                    })
                  });
                  
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to update ROI');
                  }
                  
                  // Update local state with both formats
                  setItems(prev => prev.map((item, i) => {
                    if (i === idx) {
                      return { 
                        ...item, 
                        roi: newRoi,
                        roiBoxes: newRoiBoxes,
                        roiRectangles: newRoiRectangles
                      };
                    }
                    return item;
                  }));
                  
                  const roiData = cams
                    .filter(cam => cam.zoom !== 1 || cam.pan.x !== 0 || cam.pan.y !== 0)
                    .map(cam => `${cam.name},${cam.zoom.toFixed(1)},${cam.pan.x.toFixed(0)},${cam.pan.y.toFixed(0)}`)
                    .join(' ');
                  
                  if (roiData) {
                    addLog(`✅ ROI ${taskInfo}: ${roiData} - SAVED TO JSON`);
                  } else {
                    addLog(`✅ ROI ${taskInfo}: Reset to default (1.0,0,0) - SAVED TO JSON`);
                  }
                  
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                  addLog(`❌ Failed to save ROI for ${taskInfo}: ${errorMessage}`);
                }
              }}
            >
              Store ROI
            </Button>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                if (isCreatingValidationBox) {
                  // Cancel validation box creation
                  setIsCreatingValidationBox(false);
                  setValidationBoxCreation(null);
                  addLog('❌ Validation box creation cancelled');
                  return;
                }
                
                const currentTask = items[idx];
                if (!currentTask) {
                  addLog('❌ Store Validation Box: No current task');
                  return;
                }
                
                // Auto-generate unique validation box ID using timestamp
                const timestamp = Date.now();
                const id = `box_${timestamp}`;
                
                setValidationBoxCreation({ id, label: '', description: '' });
                setIsCreatingValidationBox(true);
                addLog(`📦 Creating validation box "${id}" - click and drag on any camera image to define the area`);
              }}
              className={isCreatingValidationBox ? 'bg-orange-100 border-orange-300' : ''}
            >
              {isCreatingValidationBox ? 'Cancel Validation Box' : 'Store Validation Box'}
            </Button>
            
          </>
        )}
        
        <div className="ml-auto relative group">
          <button className="text-xs text-neutral-400 hover:text-neutral-600 px-2 py-1 rounded border border-neutral-200 hover:border-neutral-300 transition-colors">
            ?
          </button>
          <div className="absolute right-0 top-8 bg-white border border-neutral-200 rounded-lg shadow-lg p-3 text-xs text-neutral-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
            <div className="font-semibold mb-2">Keyboard Shortcuts</div>
            <div className="space-y-1">
              <div>Scroll = zoom</div>
              <div>Drag = pan</div>
              <div>Double-click = reset</div>
              <div>F = fullscreen</div>
              <div>R = reset view</div>
              <div>Esc = close modal/fullscreen</div>
              <div>I = innovative mode</div>
              <div>L = laptop mode</div>
              <div>D = debug mode</div>
              <div>P = pass</div>
              <div>X = fail</div>
              <div>A = camera alignment</div>
              <div>C = calibrate camera</div>
            </div>
          </div>
        </div>
      </div>


      {/* ETA Countdown Display */}
      {(isCapturing || isWaitingToDisplay) && (
        <div className="bg-gray-100 rounded-lg p-3">
          <div className="flex items-center justify-center">
            {isWaitingToDisplay ? (
              <span className="text-sm font-medium text-gray-700">
                Preparing images for display...
              </span>
            ) : estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 ? (
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700">
                  🚀 Parallel capture in progress
                </span>
                <span className="text-lg font-bold text-blue-600">
                  {estimatedTimeRemaining}s
                </span>
                <span className="text-sm text-gray-600">
                  remaining
                </span>
              </div>
            ) : isCapturing ? (
              <span className="text-sm font-medium text-gray-700">
                ✅ Capture completed - processing images...
              </span>
            ) : (
              <span className="text-sm font-medium text-gray-700">
                Starting capture...
              </span>
            )}
          </div>
          {isWaitingToDisplay && (
            <div className="text-xs text-gray-600 mt-2 text-center">
              All images captured successfully. Waiting 2 seconds for image stabilization before display...
            </div>
          )}
        </div>
      )}

      {/* Grid 4×2 */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {cams.map((cam) => {
            // Get current hangar (use current session hangar or default to first)
            const currentHangarId = currentSession?.hangar || HANGARS[0].id;
            const transform = hangarTransforms[currentHangarId]?.[cam.id] || { x: 0, y: 0, scale: 1, rotation: 0 };
            
            return (
              <Card key={cam.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <CamTile
                    cam={cam}
                    transform={transform}
                    brightness={brightness}
                    contrast={contrast}
                    onWheel={(e) => onWheel(cam.id, e)}
                    onDragStart={(e) => onDrag(cam.id, e)}
                    onDropFile={(f) => onDropFile(cam.id, f)}
                    onDoubleClick={() => resetView(cam.id)}
                    onHover={() => setHoverId(cam.id)}
                    onPinch={(rect, fac) => onPinch(cam.id, rect, fac)}
                  onZoomIn={() => {
                    // Direct zoom manipulation instead of fake wheel events
                    setCams(prev => prev.map(c => {
                      if (c.id !== cam.id) return c;
                      const newZoom = Math.min(c.zoom * 1.2, 10); // 20% increase, max 10x
                      const rect = document.querySelector(`[data-camera-id="${cam.id}"]`)?.getBoundingClientRect();
                      if (rect) {
                        const newPan = newZoom <= 1.0 ? { x: 0, y: 0 } : clampPan(c.pan, newZoom, rect, true);
                        return { ...c, zoom: newZoom, pan: newPan };
                      }
                      return { ...c, zoom: newZoom };
                    }));
                  }}
                  onZoomOut={() => {
                    // Direct zoom manipulation instead of fake wheel events
                    setCams(prev => prev.map(c => {
                      if (c.id !== cam.id) return c;
                      const newZoom = Math.max(c.zoom / 1.2, 1); // 20% decrease, min 1x
                      const rect = document.querySelector(`[data-camera-id="${cam.id}"]`)?.getBoundingClientRect();
                      if (rect) {
                        const newPan = newZoom <= 1.0 ? { x: 0, y: 0 } : clampPan(c.pan, newZoom, rect, true);
                        return { ...c, zoom: newZoom, pan: newPan };
                      }
                      return { ...c, zoom: newZoom };
                    }));
                  }}
                  onResetView={() => resetView(cam.id)}
                  showLogs={showLogs}
                  laptopMode={laptopMode}
                  inspectionMode={inspectionMode}
                  items={items}
                  idx={idx}
                  validatedBoxes={validatedBoxes}
                  handleValidationBoxClick={handleValidationBoxClick}
                  isCreatingValidationBox={isCreatingValidationBox}
                  validationBoxCreation={validationBoxCreation}
                  onValidationBoxCreation={handleValidationBoxCreation}
                  onValidationBoxUpdate={handleValidationBoxUpdate}
                />
              </CardContent>
            </Card>
            );
          })}
        </div>
      </div>

      {/* Log Panel */}
      {showLogs && (
        <div className="bg-gray-900 text-green-400 rounded p-3 font-mono text-xs max-h-32 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300 font-semibold">Activity Log</span>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLogs([])}
              className="text-xs h-6 px-2"
            >
              Clear
            </Button>
          </div>
          <div className="space-y-1">
            {logs.length === 0 ? (
              <div className="text-gray-500 italic">No activity yet...</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="text-green-400">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* --- TI Checklist BELOW cameras --- */}
      <div className="bg-white border rounded p-3">
        <div className="mb-2 text-sm">
          <div className="flex items-center justify-between">
            <div>TI – Task {Math.min(idx + 1, items.length)}/{items.length}</div>
            {/* Timeline overview */}
            <div className="mt-1 flex-1 flex justify-center">
              <div className="flex items-center gap-2 flex-wrap">
                {items.map((it, i) => {
                  const c = it.status === "pass" ? "bg-green-500" : it.status === "fail" ? "bg-red-500" : it.status === "na" ? "bg-yellow-400" : "bg-neutral-300";
                  const active = i === idx ? "ring-2 ring-blue-500 scale-110" : "opacity-80 hover:opacity-100";
                  return (
                    <button
                      title={`${i + 1}. ${it.title}`}
                      key={i}
                      className={`w-3 h-3 rounded-full ${c} ${active} shrink-0 outline-none focus:ring-2 focus:ring-blue-400 transition-transform`}
                      onClick={() => {
                        setIdx(i);
                        setLeaving(false);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {items.some(item => !item.status) ? (
          <div className="px-4 md:px-8 lg:px-12">
            <div
              className={`border rounded p-4 shadow ${tone(items[idx].status)} w-full`}
              style={{
                transition: "transform 340ms ease, opacity 340ms ease",
                transform: leaving ? "translateY(-8px) scale(0.98)" : "none",
                opacity: leaving ? 0.15 : 1,
              }}
            >
            {inspectionMode === 'classic' ? (
              /* Classic Mode - Compact Layout */
              <div className="space-y-3">
                {/* Header Section */}
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-semibold text-gray-900">{items[idx].title}</h2>
                      <span 
                        className="px-2 py-1 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: getCategoryInfo(items[idx].category).color }}
                      >
                        {getCategoryInfo(items[idx].category).name}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 whitespace-pre-line">
                      {items[idx].detail}
                    </div>
                  </div>
                  
                  {/* Status Buttons - Top Right - Compact */}
                  <div className="ml-6 flex gap-2">
                    <Button 
                      onClick={() => {
                        console.log('PASS clicked for task', idx);
                        selectStatus("pass");
                      }} 
                      className={`w-20 h-10 text-sm font-bold rounded ${
                        items[idx].status === "pass" 
                          ? "bg-green-600 hover:bg-green-700 text-white" 
                          : "bg-gray-100 hover:bg-gray-200 text-gray-700 border"
                      }`}
                    >
                      ✓ PASS
                    </Button>
                    <Button 
                      onClick={() => {
                        console.log('FAIL clicked for task', idx);
                        selectStatus("fail");
                      }} 
                      className={`w-20 h-10 text-sm font-bold rounded ${
                        items[idx].status === "fail" 
                          ? "bg-red-600 hover:bg-red-700 text-white" 
                          : "bg-gray-100 hover:bg-gray-200 text-gray-700 border"
                      }`}
                    >
                      ✗ FAIL
                    </Button>
                    <label className={`flex items-center justify-center gap-1 w-16 h-10 border rounded cursor-pointer hover:bg-gray-50 ${
                      items[idx].status === "na" ? "bg-blue-100 border-blue-300" : ""
                    }`}>
                      <input 
                        type="radio" 
                        name={`task-${idx}`}
                        checked={items[idx].status === "na"}
                        onChange={() => selectStatus("na")}
                        className="text-blue-600 w-3 h-3"
                      />
                      <span className={`text-xs font-bold ${items[idx].status === "na" ? "text-blue-700" : ""}`}>
                        N/A
                      </span>
                    </label>
                  </div>
                </div>

                {/* Content - Inline Layout */}
                <div className="flex gap-4">
                  {/* Instructions - If present */}
                  {items[idx].instructions && items[idx].instructions!.length > 0 && (
                    <div className="bg-blue-50 p-3 rounded flex-shrink-0 w-64">
                      <div className="text-xs font-semibold text-blue-900 mb-2">📋 Instructions</div>
                      <ul className="text-xs text-blue-800 space-y-1">
                        {items[idx].instructions!.map((instruction, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <span className="text-blue-600 mt-0.5 text-xs">•</span>
                            <span>{instruction}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Comments - Flexible width */}
                  <div className="bg-gray-50 p-3 rounded flex-1">
                    <div className="text-xs font-semibold text-gray-900 mb-2">💬 Inspector Comments</div>
                    <textarea
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm resize-none bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={2}
                      placeholder="Add detailed comments, observations, or notes for this inspection task..."
                      value={items[idx].comment || ''}
                      onChange={(e) => updateTaskComment(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Innovative Mode - Compact Layout */
              <div className="space-y-3">
                {/* Header Section - Compact */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900">{items[idx].title}</h2>
                    <span 
                      className="px-2 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: getCategoryInfo(items[idx].category).color }}
                    >
                      {getCategoryInfo(items[idx].category).name}
                    </span>
                    <span className="text-purple-600 font-medium text-xs">🚀 Innovative</span>
                  </div>
                </div>

                {/* Validation Progress - Inline */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-3 rounded border-l-4 border-purple-500">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-purple-900">📋 Validation Progress</div>
                    {(() => {
                      const currentValidations = validatedBoxes[items[idx].id] || new Set();
                      const totalBoxes = Object.values(items[idx].validationBoxes || {}).reduce((sum, boxes) => sum + (boxes?.length || 0), 0);
                      const completedBoxes = currentValidations.size;
                      const isComplete = totalBoxes > 0 && completedBoxes === totalBoxes;
                      
                      return (
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-purple-700">
                            {completedBoxes}/{totalBoxes} validated
                          </div>
                          {isComplete && <div className="text-green-600 text-xs">✅ Ready</div>}
                        </div>
                      );
                    })()}
                  </div>
                  
                  {(() => {
                    const currentValidations = validatedBoxes[items[idx].id] || new Set();
                    const totalBoxes = Object.values(items[idx].validationBoxes || {}).reduce((sum, boxes) => sum + (boxes?.length || 0), 0);
                    const completedBoxes = currentValidations.size;
                    const progressPercent = totalBoxes > 0 ? (completedBoxes / totalBoxes) * 100 : 0;
                    
                    return (
                      <div className="w-full bg-purple-200 rounded-full h-1">
                        <div 
                          className="bg-gradient-to-r from-purple-500 to-indigo-500 h-1 rounded-full transition-all duration-300" 
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    );
                  })()}
                </div>

                {/* Bottom Section - Inline Layout */}
                <div className="flex gap-4">
                  {/* Comments */}
                  <div className="bg-gray-50 p-3 rounded flex-1">
                    <div className="text-xs font-semibold text-gray-900 mb-2">💬 Inspector Comments</div>
                    <textarea
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm resize-none bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={2}
                      placeholder="Add detailed comments, observations, or notes for this inspection task..."
                      value={items[idx].comment || ''}
                      onChange={(e) => updateTaskComment(e.target.value)}
                    />
                  </div>

                  {/* Status Buttons - Right Side - Compact */}
                  <div className="flex flex-col gap-2 w-32">
                    <div className="text-xs font-semibold text-gray-900">🎯 Decision</div>
                    {(() => {
                      const currentValidations = validatedBoxes[items[idx].id] || new Set();
                      const totalBoxes = Object.values(items[idx].validationBoxes || {}).reduce((sum, boxes) => sum + (boxes?.length || 0), 0);
                      const isValidationComplete = totalBoxes === 0 || currentValidations.size === totalBoxes;
                      
                      return (
                        <>
                          <Button 
                            onClick={() => {
                              console.log('PASS clicked for task', idx);
                              selectStatus("pass");
                            }} 
                            disabled={!isValidationComplete}
                            className={`w-full h-10 text-sm font-bold rounded-lg ${
                              items[idx].status === "pass" 
                                ? "bg-green-600 hover:bg-green-700 text-white" 
                                : isValidationComplete
                                  ? "bg-gray-100 hover:bg-gray-200 text-gray-700 border"
                                  : "bg-gray-50 text-gray-400 border cursor-not-allowed"
                            }`}
                          >
                            ✓ PASS {!isValidationComplete && "🔒"}
                          </Button>
                          <Button 
                            onClick={() => {
                              console.log('FAIL clicked for task', idx);
                              selectStatus("fail");
                            }} 
                            disabled={false}
                            className={`w-full h-10 text-sm font-bold rounded-lg ${
                              items[idx].status === "fail" 
                                ? "bg-red-600 hover:bg-red-700 text-white" 
                                : "bg-gray-100 hover:bg-gray-200 text-gray-700 border"
                            }`}
                          >
                            ✗ FAIL
                          </Button>
                          <label className={`flex items-center justify-center gap-2 w-full h-10 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                            items[idx].status === "na" ? "bg-blue-100 border-blue-300" : ""
                          }`}>
                            <input 
                              type="radio" 
                              name={`task-${idx}`}
                              checked={items[idx].status === "na"}
                              onChange={() => selectStatus("na")}
                              className="text-blue-600"
                            />
                            <span className={`text-sm font-bold ${items[idx].status === "na" ? "text-blue-700" : ""}`}>
                              N/A
                            </span>
                          </label>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-lg font-semibold text-green-700 mb-4">🎉 Inspection Complete!</div>
            <div className="text-sm text-green-600 mb-6">All {items.length} tasks have been processed.</div>
            
            <Button
              onClick={() => setShowReportModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 text-lg font-semibold"
            >
              📊 Generate Inspection Report
            </Button>
            
            <div className="mt-4 text-xs text-gray-500">
              Generate a comprehensive PDF report with all task results, comments, and metadata
            </div>
          </div>
        )}
      </div>

      {fsId != null && (
        <Fullscreen
          cam={cams[fsId]}
          brightness={brightness}
          contrast={contrast}
          onClose={() => {
            resetView(fsId);
            setFsId(null);
          }}
          onWheel={(e) => onWheel(fsId, e)}
          onDragStart={(e) => onDrag(fsId, e)}
        />
      )}

      {/* Snapshot Modal */}
      {showSnapshotModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Snapshot Configuration</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Hangar</label>
                <div className="space-y-2">
                  {HANGARS.map((h) => (
                    <label key={h.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="hangar-selection"
                        className="text-blue-600 focus:ring-blue-500"
                        checked={snapshotHangar === h.id}
                        onChange={() => setSnapshotHangar(h.id)}
                      />
                      <span className="text-sm">{h.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Drone Name</label>
                <select 
                  className="w-full border rounded px-3 py-2" 
                  value={snapshotDrone} 
                  onChange={(e) => setSnapshotDrone(e.target.value)}
                >
                  <option value="">Select drone...</option>
                  {DRONE_OPTIONS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="space-y-3 mt-6">
              {/* Primary actions */}
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowSnapshotModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={executeSnapshot}
                  className="flex-1"
                  disabled={!snapshotHangar || !snapshotDrone.trim()}
                >
                  Capture
                </Button>
              </div>
              
              {/* Alternative actions */}
              <div className="flex gap-2 pt-2 border-t border-gray-200">
                <Button 
                  variant="outline"
                  onClick={() => {
                    setShowSnapshotModal(false);
                    loadLatestFolderGlobally();
                  }}
                  className="flex-1 bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                >
                  🔄 Latest
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setShowSnapshotModal(false);
                    loadAvailableFolders();
                    setShowFolderModal(true);
                  }}
                  className="flex-1 bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                >
                  📁 Browse
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Camera Transform Settings Modal */}
      {showTransformModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 w-[900px] max-w-full mx-4 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-2">⚙️ Camera Alignment Settings</h2>
            <p className="text-xs text-gray-600 mb-3">
              Configure camera transform corrections for each hangar to compensate for drone positioning differences.
            </p>
            
            {/* Hangar Tabs */}
            <div className="border-b mb-3">
              <div className="flex space-x-1 overflow-x-auto">
                {HANGARS.map((hangar) => (
                  <button
                    key={hangar.id}
                    onClick={() => setSelectedHangarTab(hangar.id)}
                    className={`px-2 py-1 text-xs font-medium rounded-t-lg whitespace-nowrap ${
                      selectedHangarTab === hangar.id
                        ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-600'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    📍 {hangar.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Camera Settings Table for Selected Hangar */}
            {(() => {
              const selectedHangar = HANGARS.find(h => h.id === selectedHangarTab);
              if (!selectedHangar) return null;
              
              return (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-blue-700">
                    📍 {selectedHangar.label} - Camera Transforms
                  </h3>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-1 font-medium text-gray-700">Camera</th>
                          <th className="text-center p-1 font-medium text-gray-700">X (px)</th>
                          <th className="text-center p-1 font-medium text-gray-700">Y (px)</th>
                          <th className="text-center p-1 font-medium text-gray-700">Scale</th>
                          <th className="text-center p-1 font-medium text-gray-700">Rot (°)</th>
                          <th className="text-left p-1 font-medium text-gray-700">Values</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 8 }, (_, camIndex) => {
                          const transform = hangarTransforms[selectedHangar.id]?.[camIndex] || { x: 0, y: 0, scale: 1, rotation: 0 };
                          
                          return (
                            <tr key={camIndex} className="border-b hover:bg-gray-50">
                              <td className="p-1 font-medium text-gray-700">
                                📷 {CAMERA_LAYOUT[camIndex]?.name || `Cam${camIndex + 1}`}
                              </td>
                              <td className="p-1">
                                <input
                                  type="number"
                                  className="w-16 text-xs border rounded px-1 py-0.5 text-center"
                                  value={transform.x}
                                  onChange={(e) => {
                                    const newTransforms = { ...hangarTransforms };
                                    if (!newTransforms[selectedHangar.id]) newTransforms[selectedHangar.id] = {};
                                    newTransforms[selectedHangar.id][camIndex] = {
                                      ...transform,
                                      x: parseFloat(e.target.value) || 0
                                    };
                                    setHangarTransforms(newTransforms);
                                  }}
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="number"
                                  className="w-16 text-xs border rounded px-1 py-0.5 text-center"
                                  value={transform.y}
                                  onChange={(e) => {
                                    const newTransforms = { ...hangarTransforms };
                                    if (!newTransforms[selectedHangar.id]) newTransforms[selectedHangar.id] = {};
                                    newTransforms[selectedHangar.id][camIndex] = {
                                      ...transform,
                                      y: parseFloat(e.target.value) || 0
                                    };
                                    setHangarTransforms(newTransforms);
                                  }}
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  className="w-16 text-xs border rounded px-1 py-0.5 text-center"
                                  value={transform.scale}
                                  onChange={(e) => {
                                    const newTransforms = { ...hangarTransforms };
                                    if (!newTransforms[selectedHangar.id]) newTransforms[selectedHangar.id] = {};
                                    newTransforms[selectedHangar.id][camIndex] = {
                                      ...transform,
                                      scale: parseFloat(e.target.value) || 1
                                    };
                                    setHangarTransforms(newTransforms);
                                  }}
                                />
                              </td>
                              <td className="p-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  className="w-16 text-xs border rounded px-1 py-0.5 text-center"
                                  value={transform.rotation}
                                  onChange={(e) => {
                                    const newTransforms = { ...hangarTransforms };
                                    if (!newTransforms[selectedHangar.id]) newTransforms[selectedHangar.id] = {};
                                    newTransforms[selectedHangar.id][camIndex] = {
                                      ...transform,
                                      rotation: parseFloat(e.target.value) || 0
                                    };
                                    setHangarTransforms(newTransforms);
                                  }}
                                />
                              </td>
                              <td className="p-2 text-xs text-gray-500">
                                X:{transform.x}, Y:{transform.y}, S:{transform.scale}, R:{transform.rotation}°
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
            
            <div className="flex gap-2 pt-3 border-t mt-4">
              <Button
                variant="outline"
                onClick={() => setShowTransformModal(false)}
                className="flex-1 text-xs py-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  // Save transforms to localStorage
                  localStorage.setItem('hangar_camera_transforms', JSON.stringify(hangarTransforms));
                  addLog('💾 Camera transform settings saved');
                  setShowTransformModal(false);
                }}
                className="flex-1 text-xs py-1"
              >
                💾 Save Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Calibration Selection Modal */}
      {showCalibrateSelectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-[600px] max-w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">🎯 Select Camera to Calibrate</h2>
            <p className="text-sm text-gray-600 mb-6">
              Choose which hangar and camera you want to calibrate against the Mölndal baseline.
            </p>

            <div className="space-y-4">
              {/* Hangar Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Hangar:
                </label>
                <select
                  value={calibrateHangar}
                  onChange={(e) => setCalibrateHangar(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Choose a hangar...</option>
                  {HANGARS.map((hangar) => (
                    <option key={hangar.id} value={hangar.id}>
                      {hangar.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Camera Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Camera:
                </label>
                <select
                  value={calibrateCamera}
                  onChange={(e) => setCalibrateCamera(parseInt(e.target.value))}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {inspectionData.cameras.map((camera, index) => (
                    <option key={camera.id} value={index}>
                      {camera.name} ({camera.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setCalibrateSelectionModal(false);
                  setCalibrateHangar("");
                  setCalibrateCamera(0);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (calibrateHangar) {
                    setCalibrateSelectionModal(false);
                    loadCalibrationImages(calibrateHangar, calibrateCamera);
                    setCalibrateModal(true);
                  }
                }}
                disabled={!calibrateHangar}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Start Calibration
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Calibration Modal */}
      {showCalibrateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 w-[1100px] max-w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-2">🎯 Camera Calibration - {inspectionData.cameras[calibrateCamera]?.name || 'Camera'} in {HANGARS.find(h => h.id === calibrateHangar)?.label || 'Hangar'}</h2>
            <p className="text-sm text-gray-600 mb-4">
              Align the {HANGARS.find(h => h.id === calibrateHangar)?.label || 'hangar'} image with the Mölndal baseline. Drag to pan or use controls.
            </p>

            {loadingImages ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600 mt-4">Loading images...</p>
              </div>
            ) : molndalImage && hangarImage ? (
              <div className="space-y-6">
                {/* Main Alignment Interface */}
                <div className="grid grid-cols-4 gap-6">
                  {/* Image Comparison - Larger */}
                  <div className="col-span-3">
                    <div 
                      className="relative bg-black rounded overflow-hidden border-2 border-gray-300" 
                      style={{ height: '500px' }}
                      onMouseDown={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const startTransformX = calibrationTransform.x;
                        const startTransformY = calibrationTransform.y;

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                          const deltaX = moveEvent.clientX - startX;
                          const deltaY = moveEvent.clientY - startY;
                          setCalibrationTransform(prev => ({
                            ...prev,
                            x: startTransformX + deltaX,
                            y: startTransformY + deltaY
                          }));
                        };

                        const handleMouseUp = () => {
                          document.removeEventListener('mousemove', handleMouseMove);
                          document.removeEventListener('mouseup', handleMouseUp);
                        };

                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                    >
                      {/* Reference layer (Mölndal) - Gray baseline */}
                      <div className="absolute inset-0" style={{ opacity: 0.6 }}>
                        <img 
                          src={molndalImage} 
                          alt="Mölndal baseline" 
                          className="w-full h-full object-contain"
                          style={{ filter: 'grayscale(100%)' }}
                        />
                      </div>
                      
                      {/* Current layer (Forges-les-Eaux) - Colored overlay */}
                      <div 
                        className="absolute inset-0 cursor-move"
                        style={{
                          transform: `translate(${calibrationTransform.x}px, ${calibrationTransform.y}px) scale(${calibrationTransform.flipped ? -1 : 1}, 1) scale(${calibrationTransform.scale}) rotate(${calibrationTransform.rotation}deg)`,
                          transformOrigin: '50% 50%',
                          opacity: 0.7
                        }}
                      >
                        <img 
                          src={hangarImage} 
                          alt="Forges-les-Eaux to align" 
                          className="w-full h-full object-contain pointer-events-none"
                        />
                      </div>
                    </div>
                    
                    {/* Instructions */}
                    <div className="mt-3 text-center">
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Drag to pan</span> • 
                        <span className="font-medium"> Use sliders for precision</span> • 
                        <span className="font-medium"> Gray = Baseline</span> • 
                        <span className="font-medium"> Color = Target</span>
                      </div>
                    </div>
                  </div>

                  {/* Controls Panel */}
                  <div className="space-y-4">
                    {/* Compact Controls Grid */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium mb-1">🔍 Opacity</label>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={calibrationTransform.opacity || 70}
                          className="w-full"
                          onChange={(e) => {
                            const opacity = parseInt(e.target.value);
                            setCalibrationTransform(prev => ({ ...prev, opacity }));
                            // Update the overlay opacity in real-time
                            const overlay = document.querySelector('.absolute.inset-0.cursor-move') as HTMLElement;
                            if (overlay) overlay.style.opacity = (opacity / 100).toString();
                          }}
                        />
                        <div className="text-xs text-gray-500 text-center">{calibrationTransform.opacity || 70}%</div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">📍 X Position</label>
                        <input
                          type="range"
                          min="-300"
                          max="300"
                          value={calibrationTransform.x}
                          className="w-full"
                          onChange={(e) => setCalibrationTransform(prev => ({ ...prev, x: parseInt(e.target.value) }))}
                        />
                        <div className="text-xs text-gray-500 text-center">{calibrationTransform.x}px</div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">📍 Y Position</label>
                        <input
                          type="range"
                          min="-300"
                          max="300"
                          value={calibrationTransform.y}
                          className="w-full"
                          onChange={(e) => setCalibrationTransform(prev => ({ ...prev, y: parseInt(e.target.value) }))}
                        />
                        <div className="text-xs text-gray-500 text-center">{calibrationTransform.y}px</div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">🔄 Rotation</label>
                        <input
                          type="range"
                          min="-15"
                          max="15"
                          step="0.1"
                          value={calibrationTransform.rotation}
                          className="w-full"
                          onChange={(e) => setCalibrationTransform(prev => ({ ...prev, rotation: parseFloat(e.target.value) }))}
                        />
                        <div className="text-xs text-gray-500 text-center">{calibrationTransform.rotation.toFixed(1)}°</div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">📏 Scale</label>
                        <input
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.01"
                          value={calibrationTransform.scale}
                          className="w-full"
                          onChange={(e) => setCalibrationTransform(prev => ({ ...prev, scale: parseFloat(e.target.value) }))}
                        />
                        <div className="text-xs text-gray-500 text-center">{calibrationTransform.scale.toFixed(2)}x</div>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-xs font-medium"
                        onClick={() => setCalibrationTransform(prev => ({ ...prev, flipped: !prev.flipped }))}
                      >
                        {calibrationTransform.flipped ? '↔ Unflip' : '↔ Flip'}
                      </button>
                      <button
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-xs font-medium"
                        onClick={() => setCalibrationTransform({ x: 0, y: 0, scale: 1, rotation: 0, flipped: false })}
                      >
                        ↺ Reset
                      </button>
                    </div>

                    {/* Current Values - Compact */}
                    <div className="bg-gray-50 p-2 rounded text-xs">
                      <div className="font-medium mb-1">📊 Values</div>
                      <div className="text-xs text-gray-600 font-mono leading-tight space-y-1">
                        <div className="grid grid-cols-2 gap-x-2">
                          <div>X: {calibrationTransform.x}px</div>
                          <div>Y: {calibrationTransform.y}px</div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-2">
                          <div>S: {calibrationTransform.scale.toFixed(2)}</div>
                          <div>R: {calibrationTransform.rotation.toFixed(1)}°</div>
                        </div>
                        <div className="text-center">Flip: {calibrationTransform.flipped ? 'Yes' : 'No'}</div>
                      </div>
                    </div>
                    
                    {/* Save Actions in controls panel to avoid scrolling */}
                    <div className="pt-2 border-t space-y-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCalibrateModal(false);
                          setCalibrationTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
                          setMolndalImage("");
                          setHangarImage("");
                        }}
                        className="w-full text-xs py-1"
                      >
                        Cancel
                      </Button>
                      {molndalImage && hangarImage && (
                        <Button
                          onClick={() => {
                            // Convert from inspectionData.cameras index to CAMERA_LAYOUT index
                            const selectedCameraName = inspectionData.cameras[calibrateCamera]?.id;
                            const cameraLayoutIndex = CAMERA_LAYOUT.findIndex(layout => layout.name === selectedCameraName);
                            
                            // Save the calibration to the hangar transforms
                            const newTransforms = { ...hangarTransforms };
                            if (!newTransforms[calibrateHangar]) newTransforms[calibrateHangar] = {};
                            newTransforms[calibrateHangar][cameraLayoutIndex] = { ...calibrationTransform };
                            setHangarTransforms(newTransforms);
                            
                            // Save to localStorage
                            localStorage.setItem('hangar_camera_transforms', JSON.stringify(newTransforms));
                            
                            addLog(`🎯 Calibration saved for ${inspectionData.cameras[calibrateCamera]?.name || 'Camera'} in ${HANGARS.find(h => h.id === calibrateHangar)?.label || 'Hangar'}`);
                            
                            // Reset and close
                            setCalibrateModal(false);
                            setCalibrationTransform({ x: 0, y: 0, scale: 1, rotation: 0 });
                            setMolndalImage("");
                            setHangarImage("");
                          }}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-xs py-1"
                        >
                          💾 Save Calibration
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>Failed to load images. Please try again.</p>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Generate Inspection Report</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Inspector Name</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  placeholder="Your name"
                  value={inspectionMeta.inspectorName}
                  onChange={(e) => setInspectionMeta(prev => ({ ...prev, inspectorName: e.target.value }))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Drone Name</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., bender"
                  value={inspectionMeta.droneName}
                  onChange={(e) => setInspectionMeta(prev => ({ ...prev, droneName: e.target.value }))}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Hangar</label>
                <select 
                  className="w-full border rounded px-3 py-2" 
                  value={inspectionMeta.hangarName} 
                  onChange={(e) => setInspectionMeta(prev => ({ ...prev, hangarName: e.target.value }))}
                >
                  <option value="">Select hangar...</option>
                  {HANGARS.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
                <div className="font-medium mb-2">Report Summary:</div>
                <div>Total Tasks: {items.length}</div>
                <div>Completed: {items.filter(item => !!item.status).length}</div>
                <div>Session ID: {inspectionMeta.sessionId}</div>
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <Button 
                variant="outline" 
                onClick={() => setShowReportModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  generatePDFReport();
                  setShowReportModal(false);
                }}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                Generate PDF
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Browser Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-4/5 max-w-4xl max-h-4/5 mx-4 overflow-hidden flex flex-col">
            <h2 className="text-lg font-semibold mb-4">Browse Snapshot Folders</h2>
            
            {loadingFolders ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl mb-2">📁</div>
                  <div>Loading folders...</div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {availableFolders.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    No snapshot folders found
                  </div>
                ) : (
                  availableFolders.map((hangar) => (
                    <div key={hangar.id} className="mb-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 border-b pb-2">
                        📍 {hangar.name}
                      </h3>
                      <div className="grid gap-3 max-h-64 overflow-y-auto">
                        {hangar.sessions.map((session: any) => (
                          <div 
                            key={session.id}
                            className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => loadSessionImages(hangar.id, session.name, session.images)}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-gray-900">{session.name}</div>
                                <div className="text-sm text-gray-500">
                                  {session.imageCount} images • {new Date(session.created).toLocaleString()}
                                </div>
                              </div>
                              <div className="text-blue-600">
                                →
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            
            <div className="flex gap-2 mt-4 pt-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => setShowFolderModal(false)}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* No Images Modal */}
      {showNoImagesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <div className="text-center">
              <div className="text-2xl mb-4">📷</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Images Required</h3>
              <p className="text-gray-600 mb-6">
                You need to capture camera images before you can mark this task as pass or fail. 
                Please take a snapshot first to inspect the drone.
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => {
                    setShowNoImagesModal(false);
                    setShowSnapshotModal(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Take Snapshot
                </Button>
                <Button
                  onClick={() => setShowNoImagesModal(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Analysis Results Modal */}
      {showDarkImageModal && darkImageDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="text-center">
              <div className="text-4xl mb-4">
                {darkImageDetails.darkCount > 0 ? '⚠️' : darkImageDetails.totalImages !== 8 ? '⚠️' : '✅'}
              </div>
              <h2 className={`text-xl font-bold mb-4 ${
                darkImageDetails.darkCount > 0 || darkImageDetails.totalImages !== 8 
                  ? 'text-red-600' 
                  : 'text-green-600'
              }`}>
                Image Analysis Results
              </h2>
              
              <div className="text-left mb-6">
                <p className="text-gray-700 mb-4">
                  <strong>Analysis Summary:</strong><br/>
                  • Found {darkImageDetails.totalImages} images (expected 8)<br/>
                  • {darkImageDetails.darkCount} images are too dark (brightness &lt; 100)<br/>
                  • {darkImageDetails.totalImages - darkImageDetails.darkCount} images have good brightness
                </p>
                
                {darkImageDetails.analysisResults && (
                  <div className="bg-gray-50 rounded p-4 mb-4">
                    <h3 className="font-semibold mb-2">Detailed Results:</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {darkImageDetails.analysisResults.map((result, index) => (
                        <div key={index} className={`p-2 rounded ${
                          result.isDark ? 'bg-red-100 border border-red-200' : 'bg-green-100 border border-green-200'
                        }`}>
                          <div className="font-medium">{result.cameraName}</div>
                          <div className="text-xs">
                            Brightness: {result.brightness}
                            <span className={`ml-2 ${result.isDark ? 'text-red-600' : 'text-green-600'}`}>
                              {result.isDark ? '🔴 Too Dark' : '✅ Good'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <p className="text-gray-600 mb-4">
                  <strong>Session:</strong> {darkImageDetails.session}<br/>
                  <strong>Hangar:</strong> {darkImageDetails.hangar}
                </p>
              </div>
              
              <div className="flex gap-3 justify-center">
                {(darkImageDetails.darkCount > 0 || darkImageDetails.totalImages !== 8) && (
                  <Button
                    onClick={deleteSessionFolder}
                    className="bg-red-600 hover:bg-red-700 text-white px-6"
                  >
                    Delete Session & Try Again
                  </Button>
                )}
                <Button
                  onClick={() => setShowDarkImageModal(false)}
                  variant="outline"
                >
                  {darkImageDetails.darkCount > 0 || darkImageDetails.totalImages !== 8 ? 'Keep Session Anyway' : 'Continue'}
                </Button>
              </div>
              
              {(darkImageDetails.darkCount > 0 || darkImageDetails.totalImages !== 8) && (
                <p className="text-sm text-gray-500 mt-4">
                  💡 Turn on the hangar lights and capture a new session for better results.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <pre className="text-[10px] text-neutral-400">(Open console for smoke tests)</pre>
    </div>
  );
}

// --- Subcomponents ---
function CamTile({
  cam,
  transform,
  brightness = 100,
  contrast = 100,
  onWheel,
  onDragStart,
  onDropFile,
  onDoubleClick,
  onHover,
  onPinch,
  onZoomIn,
  onZoomOut,
  onResetView,
  big,
  showLogs,
  laptopMode = false,
  inspectionMode,
  items,
  idx,
  validatedBoxes,
  handleValidationBoxClick,
  isCreatingValidationBox,
  validationBoxCreation,
  onValidationBoxCreation,
  onValidationBoxUpdate,
  }: {
    cam: Cam;
    transform?: CameraTransform;
    brightness?: number;
    contrast?: number;
    onWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
    onDragStart: (e: React.MouseEvent<HTMLDivElement>) => void;
    onDropFile: (f?: File) => void;
    onDoubleClick: () => void;
    onHover: () => void;
    onPinch: (rect: DOMRect, fac: number) => void;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onResetView?: () => void;
    big?: boolean;
    showLogs?: boolean;
    laptopMode?: boolean;
    inspectionMode: 'classic' | 'innovative';
    items: TIItem[];
    idx: number;
    validatedBoxes: Record<string, Set<string>>;
    handleValidationBoxClick: (boxId: string) => void;
    isCreatingValidationBox: boolean;
    validationBoxCreation: { id: string; label: string; description: string; startX?: number; startY?: number; currentX?: number; currentY?: number; cameraId?: number; } | null;
    onValidationBoxCreation: (cameraId: number, imageX: number, imageY: number) => void;
    onValidationBoxUpdate: (cameraId: number, imageX: number, imageY: number) => void;
  }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastScale = useRef(1);

  // DnD load
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) onDropFile(f);
    };
    el.addEventListener("dragover", over);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("drop", drop);
    };
  }, [onDropFile]);

  // Safari pinch gestures
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const prevent = (e: Event) => e.preventDefault();
    const start = (e: any) => {
      lastScale.current = 1;
      prevent(e);
    };
    const change = (e: any) => {
      prevent(e);
      const rect = el.getBoundingClientRect();
      const fac = e.scale / (lastScale.current || 1);
      lastScale.current = e.scale;
      onPinch?.(rect, fac);
    };
    el.addEventListener("gesturestart", start as any, { passive: false } as any);
    el.addEventListener("gesturechange", change as any, { passive: false } as any);
    el.addEventListener("gestureend", prevent as any, { passive: false } as any);
    return () => {
      el.removeEventListener("gesturestart", start as any);
      el.removeEventListener("gesturechange", change as any);
      el.removeEventListener("gestureend", prevent as any);
    };
  }, [onPinch]);

  return (
    <div
      ref={rootRef}
      className={`relative w-full ${big ? "aspect-[16/9] md:aspect-[16/9]" : "aspect-[16/9]"} bg-black overflow-hidden`}
      onWheel={onWheel}
      onMouseDown={onDragStart}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onHover}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        cursor: cam.zoom !== 1 ? "grab" : "default",
        touchAction: "none",
        overscrollBehavior: "contain",
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        {cam.isLoading ? (
          <div className="w-full h-full grid place-items-center bg-gray-800">
            <div className="text-center text-white text-sm">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-3"></div>
              <div className="font-semibold">{cam.name}</div>
              <div className="text-gray-300 text-xs">Loading image...</div>
            </div>
          </div>
        ) : cam.src ? (
          <CanvasImage 
            src={cam.src}
            zoom={cam.zoom}
            panX={cam.pan.x}
            panY={cam.pan.y}
            transform={transform}
            brightness={brightness}
            contrast={contrast}
            validationBoxes={inspectionMode === 'innovative' ? items[idx]?.validationBoxes?.[cam.name] || [] : []}
            validatedBoxIds={validatedBoxes[items[idx]?.id] || new Set()}
            onBoxClick={handleValidationBoxClick}
            showValidationBoxes={inspectionMode === 'innovative'}
            cameraId={cam.id}
            isCreatingValidationBox={isCreatingValidationBox}
            validationBoxCreation={validationBoxCreation}
            onValidationBoxCreation={onValidationBoxCreation}
            onValidationBoxUpdate={onValidationBoxUpdate}
          />
        ) : (
          <div className="w-full h-full grid place-items-center">
            <div className="text-center text-white/60 text-xs">
              <div className="mb-2 font-semibold text-white/80">{cam.name}</div>
              <div>Drag image here</div>
            </div>
          </div>
        )}
      </div>

      {/* Camera name and zoom controls overlay */}
      <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold">
        {cam.name}
      </div>

      {/* Laptop mode zoom controls */}
      {laptopMode && cam.src && (
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            className="bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold hover:bg-black/90 transition-colors"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onZoomIn?.();
            }}
          >
            🔍+
          </button>
          <button
            className="bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold hover:bg-black/90 transition-colors"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onZoomOut?.();
            }}
          >
            🔍-
          </button>
          <button
            className="bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold hover:bg-black/90 transition-colors"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onResetView?.();
            }}
          >
            ↺
          </button>
        </div>
      )}
      
      {cam.src && showLogs && (cam.zoom !== 1 || cam.pan.x !== 0 || cam.pan.y !== 0) && (
        <div className="absolute bottom-2 right-2">
          <div className="bg-black/70 text-white px-2 py-1 rounded text-xs">
            {cam.zoom.toFixed(1)}x | Pan: {cam.pan.x.toFixed(0)},{cam.pan.y.toFixed(0)}
          </div>
        </div>
      )}
    </div>
  );
}

function Fullscreen({
  cam,
  brightness,
  contrast,
  onClose,
  onWheel,
  onDragStart,
}: {
  cam: Cam;
  brightness: number;
  contrast: number;
  onClose: () => void;
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  onDragStart: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="fixed inset-0 bg-white z-50">
      <div className="absolute top-3 right-3">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Exit
        </Button>
      </div>
      <div
        className="absolute inset-0"
        onWheel={onWheel}
        onMouseDown={onDragStart}
        style={{
          cursor: "grab",
          touchAction: "none",
          overscrollBehavior: "contain",
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            transform: `translate(${cam.pan.x}px, ${cam.pan.y}px) scale(${cam.zoom})`,
            transformOrigin: "50% 50%",
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {cam.src ? (
            <img 
              src={cam.src} 
              alt="camera-fullscreen" 
              className="select-none" 
              draggable={false} 
              decoding="async"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                display: 'block',
                filter: `brightness(${brightness}%) contrast(${contrast}%)`,
              }}
            />
          ) : (
            <div className="w-full h-full grid place-items-center">
              <span className="text-neutral-600 text-xs">Ingen bild</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Helpers ---
function clampPan(pan: { x: number; y: number }, zoom: number, rect: DOMRect, limit: boolean) {
  // At zoom 1.0 or less, always center the image (no panning allowed)
  if (!limit || zoom <= 1) return { x: 0, y: 0 };
  
  // Calculate proper bounds based on how canvas rendering works
  // The image at zoom level is scaledWidth = drawWidth * zoom
  // At zoom 1.0, image fits exactly, so no panning needed
  // At zoom > 1.0, image extends beyond viewport
  
  // How much the scaled image extends beyond the viewport on each side
  const imageOverhangX = (rect.width * zoom - rect.width) / 2;
  const imageOverhangY = (rect.height * zoom - rect.height) / 2;
  
  // Since canvas uses panX/zoom, the pan bounds are the overhang * zoom
  const maxPanX = imageOverhangX * zoom;
  const maxPanY = imageOverhangY * zoom;
  
  return { 
    x: clamp(pan.x, -maxPanX, maxPanX), 
    y: clamp(pan.y, -maxPanY, maxPanY) 
  };
}

// --- ROI Conversion Utilities ---
function viewportToROIBox(
  zoom: number, 
  pan: { x: number; y: number }, 
  containerRect: DOMRect,
  roiId: string = 'roi',
  label?: string
): ROIBox {
  // Calculate what portion of the original image is currently visible
  const visibleWidth = 1 / zoom;  // How much of image width is visible (0-1)
  const visibleHeight = 1 / zoom; // How much of image height is visible (0-1)
  
  // Calculate the center of the current viewport in normalized coordinates (0-1)
  let centerX = 0.5;
  let centerY = 0.5;
  
  if (zoom > 1) {
    // Based on clampPan: maxPan = imageOverhang * zoom
    // imageOverhang = (rect.width * zoom - rect.width) / 2 = rect.width * (zoom - 1) / 2
    const imageOverhangX = (containerRect.width * (zoom - 1)) / 2;
    const imageOverhangY = (containerRect.height * (zoom - 1)) / 2;
    const maxPanX = imageOverhangX * zoom;
    const maxPanY = imageOverhangY * zoom;
    
    // Normalize pan to -1 to +1 range
    const normalizedPanX = maxPanX > 0 ? pan.x / maxPanX : 0;
    const normalizedPanY = maxPanY > 0 ? pan.y / maxPanY : 0;
    
    // Convert to viewport center (0-1)
    // When pan is positive, we're looking at the right/bottom part of the image
    centerX = 0.5 + normalizedPanX * (1 - visibleWidth) / 2;
    centerY = 0.5 + normalizedPanY * (1 - visibleHeight) / 2;
  }
  
  // Calculate ROI box bounds (top-left corner)
  const x = centerX - visibleWidth / 2;
  const y = centerY - visibleHeight / 2;
  
  return {
    id: roiId,
    x: clamp(x, 0, 1 - visibleWidth),
    y: clamp(y, 0, 1 - visibleHeight),
    width: visibleWidth,
    height: visibleHeight,
    label
  };
}

function roiBoxToViewport(
  roiBox: ROIBox, 
  containerRect: DOMRect
): { zoom: number; pan: { x: number; y: number } } {
  // Calculate zoom needed to show the ROI box area
  const zoom = Math.min(
    1 / roiBox.width,   // Zoom to fit width
    1 / roiBox.height   // Zoom to fit height
  );
  
  // Calculate the center of the ROI box
  const roiCenterX = roiBox.x + roiBox.width / 2;
  const roiCenterY = roiBox.y + roiBox.height / 2;
  
  // Convert ROI center to pan coordinates
  let panX = 0;
  let panY = 0;
  
  if (zoom > 1) {
    // Based on clampPan calculation
    const imageOverhangX = (containerRect.width * (zoom - 1)) / 2;
    const imageOverhangY = (containerRect.height * (zoom - 1)) / 2;
    const maxPanX = imageOverhangX * zoom;
    const maxPanY = imageOverhangY * zoom;
    
    // Calculate visible area size at this zoom
    const visibleWidth = 1 / zoom;
    const visibleHeight = 1 / zoom;
    
    // Convert ROI center to normalized pan (-1 to +1)
    const normalizedPanX = (roiCenterX - 0.5) / ((1 - visibleWidth) / 2);
    const normalizedPanY = (roiCenterY - 0.5) / ((1 - visibleHeight) / 2);
    
    // Convert to actual pan values
    panX = normalizedPanX * maxPanX;
    panY = normalizedPanY * maxPanY;
  }
  
  return {
    zoom: clamp(zoom, 1, 10), // Respect zoom limits
    pan: clampPan({ x: panX, y: panY }, zoom, containerRect, true)
  };
}

// --- ROI Rectangle Conversion Functions ---
function viewportToROIRectangle(
  zoom: number,
  pan: { x: number; y: number },
  containerRect: DOMRect,
  imageWidth: number,
  imageHeight: number,
  id: string,
  label?: string
): ROIRectangle {
  // Calculate what portion of the image is visible
  const visibleWidth = imageWidth / zoom;
  const visibleHeight = imageHeight / zoom;
  
  // Calculate center of viewport in image coordinates
  let centerX = imageWidth / 2; // Default center
  let centerY = imageHeight / 2;
  
  if (zoom > 1) {
    // Convert pan coordinates to image center offset
    const imageOverhangX = (containerRect.width * (zoom - 1)) / 2;
    const imageOverhangY = (containerRect.height * (zoom - 1)) / 2;
    const maxPanX = imageOverhangX * zoom;
    const maxPanY = imageOverhangY * zoom;
    
    const normalizedPanX = pan.x / maxPanX;
    const normalizedPanY = pan.y / maxPanY;
    
    centerX = imageWidth / 2 + normalizedPanX * (imageWidth - visibleWidth) / 2;
    centerY = imageHeight / 2 + normalizedPanY * (imageHeight - visibleHeight) / 2;
  }
  
  // Calculate rectangle bounds
  const x = Math.max(0, centerX - visibleWidth / 2);
  const y = Math.max(0, centerY - visibleHeight / 2);
  const width = Math.min(visibleWidth, imageWidth - x);
  const height = Math.min(visibleHeight, imageHeight - y);
  
  return {
    id,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    label
  };
}

function roiRectangleToViewport(
  roiRect: ROIRectangle,
  containerRect: DOMRect,
  imageWidth: number,
  imageHeight: number
): { zoom: number; pan: { x: number; y: number } } {
  // Convert pixel coordinates to normalized ROI box format (0-1 range)
  const roiBox: ROIBox = {
    id: 'temp',
    x: roiRect.x / imageWidth,
    y: roiRect.y / imageHeight,
    width: roiRect.width / imageWidth,
    height: roiRect.height / imageHeight,
    label: roiRect.label
  };
  
  // Use the existing working roiBoxToViewport function
  return roiBoxToViewport(roiBox, containerRect);
}

// Canvas-based image component for crisp zoom with validation boxes
function CanvasImage({ 
  src, 
  zoom, 
  panX, 
  panY, 
  transform,
  brightness = 100,
  contrast = 100,
  validationBoxes = [], 
  validatedBoxIds = new Set(),
  onBoxClick,
  showValidationBoxes = false,
  cameraId,
  isCreatingValidationBox = false,
  validationBoxCreation = null,
  onValidationBoxCreation,
  onValidationBoxUpdate
}: { 
  src: string; 
  zoom: number; 
  panX: number; 
  panY: number; 
  transform?: CameraTransform;
  brightness?: number;
  contrast?: number;
  validationBoxes?: ValidationBox[];
  validatedBoxIds?: Set<string>;
  onBoxClick?: (boxId: string) => void;
  showValidationBoxes?: boolean;
  cameraId: number;
  isCreatingValidationBox?: boolean;
  validationBoxCreation?: { id: string; label: string; description: string; startX?: number; startY?: number; currentX?: number; currentY?: number; cameraId?: number; } | null;
  onValidationBoxCreation?: (cameraId: number, imageX: number, imageY: number) => void;
  onValidationBoxUpdate?: (cameraId: number, imageX: number, imageY: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Load image with cache busting and retry mechanism
  useEffect(() => {
    setImageLoaded(false);
    imageRef.current = null;
    
    const loadImageWithRetry = (url: string, attempt = 1) => {
      const img = new Image();
      
      img.onload = () => {
        // Additional check to ensure image is fully loaded
        if (img.complete && img.naturalHeight !== 0) {
          imageRef.current = img;
          setImageLoaded(true);
        } else {
          // Image appears loaded but may be corrupted, retry
          if (attempt < 3) {
            setTimeout(() => loadImageWithRetry(url, attempt + 1), 500);
          }
        }
      };
      
      img.onerror = () => {
        if (attempt < 3) {
          // Retry with cache busting
          const bustUrl = url + (url.includes('?') ? '&' : '?') + '_cb=' + Date.now();
          setTimeout(() => loadImageWithRetry(bustUrl, attempt + 1), 1000);
        }
      };
      
      // Force fresh load by adding cache busting parameter
      const finalUrl = attempt > 1 ? url + (url.includes('?') ? '&' : '?') + '_retry=' + attempt : url;
      img.src = finalUrl;
    };
    
    loadImageWithRetry(src);
  }, [src]);

  // Draw on canvas whenever zoom/pan changes
  useEffect(() => {
    if (!imageLoaded || !imageRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageRef.current;
    
    // Get canvas dimensions
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Calculate image scaling to fit container (like object-fit: contain)
    const containerAspect = rect.width / rect.height;
    const imageAspect = img.width / img.height;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (imageAspect > containerAspect) {
      // Image is wider - fit to width
      drawWidth = rect.width;
      drawHeight = rect.width / imageAspect;
      offsetX = 0;
      offsetY = (rect.height - drawHeight) / 2;
    } else {
      // Image is taller - fit to height
      drawWidth = rect.height * imageAspect;
      drawHeight = rect.height;
      offsetX = (rect.width - drawWidth) / 2;
      offsetY = 0;
    }

    // Apply zoom and pan
    const scaledWidth = drawWidth * zoom;
    const scaledHeight = drawHeight * zoom;
    const panOffsetX = panX / zoom;
    const panOffsetY = panY / zoom;
    
    const finalX = offsetX + (rect.width - scaledWidth) / 2 + panOffsetX;
    const finalY = offsetY + (rect.height - scaledHeight) / 2 + panOffsetY;

    // Use high-quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Apply camera transform if provided  
    if (transform && (transform.x !== 0 || transform.y !== 0 || transform.scale !== 1 || transform.rotation !== 0 || transform.flipped)) {
      // Calculate transformed dimensions and position
      const transformedWidth = scaledWidth * transform.scale;
      const transformedHeight = scaledHeight * transform.scale;
      
      // Calculate the center point of the image
      const imageCenterX = finalX + scaledWidth / 2;
      const imageCenterY = finalY + scaledHeight / 2;
      
      // Apply position offset - scale to match alignment tool behavior
      // The alignment tool works on larger containers, so we may need to scale the values
      // to match the relative effect in our smaller camera views
      const scaleFactorForTranslate = Math.min(rect.width, rect.height) / 500; // Approximate scaling
      const transformedCenterX = imageCenterX + (transform.x * scaleFactorForTranslate);
      const transformedCenterY = imageCenterY + (transform.y * scaleFactorForTranslate);
      
      // Calculate final drawing position (top-left corner)
      const transformedX = transformedCenterX - transformedWidth / 2;
      const transformedY = transformedCenterY - transformedHeight / 2;
      
      if (transform.rotation !== 0 || transform.flipped) {
        // For rotation and flip, we still need Canvas transforms but applied correctly
        ctx.save();
        
        // Transform around the transformed center point
        ctx.translate(transformedCenterX, transformedCenterY);
        
        if (transform.rotation !== 0) {
          ctx.rotate((transform.rotation * Math.PI) / 180);
        }
        
        if (transform.flipped) {
          ctx.scale(-1, 1);
        }
        
        // Draw centered at the transform point
        ctx.drawImage(img, -transformedWidth / 2, -transformedHeight / 2, transformedWidth, transformedHeight);
        
        ctx.restore();
      } else {
        // Simple translate and scale - draw directly
        ctx.drawImage(img, transformedX, transformedY, transformedWidth, transformedHeight);
      }
    } else {
      // Draw the image normally if no transform
      ctx.drawImage(img, finalX, finalY, scaledWidth, scaledHeight);
    }

    // Draw validation boxes if in innovative mode
    if (showValidationBoxes && validationBoxes.length > 0) {
      validationBoxes.forEach(box => {
        const isValidated = validatedBoxIds.has(box.id);
        
        // Calculate validation boxes to maintain baseline position but zoom/pan with transformed image center
        let boxX, boxY, boxWidth, boxHeight;
        
        if (transform && (transform.x !== 0 || transform.y !== 0 || transform.scale !== 1)) {
          // For transformed images, we need to adjust for the fact that zoom/pan operations
          // work relative to the transformed image center, not the original center
          
          // Calculate where the validation box would be at zoom=1, pan=0 (baseline)
          const baseZoom = 1;
          const basePanX = 0;
          const basePanY = 0;
          
          // Calculate base image dimensions and position at baseline zoom/pan
          const baseDrawWidth = Math.min(rect.width, rect.height * (img.width / img.height));
          const baseDrawHeight = Math.min(rect.height, rect.width * (img.height / img.width));
          
          let baseOffsetX, baseOffsetY;
          if (baseDrawWidth === rect.width) {
            baseOffsetX = 0;
            baseOffsetY = (rect.height - baseDrawHeight) / 2;
          } else {
            baseOffsetX = (rect.width - baseDrawWidth) / 2;
            baseOffsetY = 0;
          }
          
          const baseScaledWidth = baseDrawWidth * baseZoom;
          const baseScaledHeight = baseDrawHeight * baseZoom;
          const baseFinalX = baseOffsetX + (rect.width - baseScaledWidth) / 2;
          const baseFinalY = baseOffsetY + (rect.height - baseScaledHeight) / 2;
          
          // Calculate baseline validation box position
          const baselineBoxX = baseFinalX + (box.x * baseScaledWidth) / img.width;
          const baselineBoxY = baseFinalY + (box.y * baseScaledHeight) / img.height;
          const baselineBoxWidth = (box.width * baseScaledWidth) / img.width;
          const baselineBoxHeight = (box.height * baseScaledHeight) / img.height;
          
          // Calculate the transform offset at baseline
          const scaleFactorForTranslate = Math.min(rect.width, rect.height) / 500;
          const baseTransformOffsetX = transform.x * scaleFactorForTranslate;
          const baseTransformOffsetY = transform.y * scaleFactorForTranslate;
          
          // Calculate baseline image centers (untransformed and transformed)
          const baseUntransformedCenterX = baseFinalX + baseScaledWidth / 2;
          const baseUntransformedCenterY = baseFinalY + baseScaledHeight / 2;
          const baseTransformedCenterX = baseUntransformedCenterX + baseTransformOffsetX;
          const baseTransformedCenterY = baseUntransformedCenterY + baseTransformOffsetY;
          
          // Calculate current image centers with zoom/pan
          const currentUntransformedCenterX = finalX + scaledWidth / 2;
          const currentUntransformedCenterY = finalY + scaledHeight / 2;
          const currentTransformOffsetX = transform.x * scaleFactorForTranslate;
          const currentTransformOffsetY = transform.y * scaleFactorForTranslate;
          const currentTransformedCenterX = currentUntransformedCenterX + currentTransformOffsetX;
          const currentTransformedCenterY = currentUntransformedCenterY + currentTransformOffsetY;
          
          // Calculate validation box position relative to baseline transformed center
          const boxRelativeToBaseTransformedCenter = {
            x: baselineBoxX - baseTransformedCenterX,
            y: baselineBoxY - baseTransformedCenterY
          };
          
          // Apply the same zoom/pan transformation that was applied to the image
          const zoomFactor = scaledWidth / baseScaledWidth; // This captures both zoom and camera scale
          const scaledBoxRelativeX = boxRelativeToBaseTransformedCenter.x * zoomFactor;
          const scaledBoxRelativeY = boxRelativeToBaseTransformedCenter.y * zoomFactor;
          
          // Position relative to current transformed center
          boxX = currentTransformedCenterX + scaledBoxRelativeX;
          boxY = currentTransformedCenterY + scaledBoxRelativeY;
          boxWidth = baselineBoxWidth * zoomFactor;
          boxHeight = baselineBoxHeight * zoomFactor;
        } else {
          // For untransformed images, use simple calculation
          boxX = finalX + (box.x * scaledWidth) / img.width;
          boxY = finalY + (box.y * scaledHeight) / img.height;
          boxWidth = (box.width * scaledWidth) / img.width;
          boxHeight = (box.height * scaledHeight) / img.height;
        }
        
        // Draw box outline
        ctx.strokeStyle = isValidated ? '#10b981' : '#ef4444'; // green if validated, red if not
        ctx.lineWidth = 3;
        ctx.setLineDash(isValidated ? [] : [10, 5]); // solid if validated, dashed if not
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
        
        // Draw box background (only for validated boxes)
        if (isValidated) {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
          ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        }
        
        // Draw label
        ctx.font = '14px Arial';
        ctx.fillStyle = isValidated ? '#065f46' : '#7f1d1d';
        ctx.fillText(box.label, boxX + 5, boxY + 20);
        
        // Draw checkmark or X
        ctx.font = '18px Arial';
        ctx.fillStyle = isValidated ? '#10b981' : '#ef4444';
        const symbol = isValidated ? '✓' : '⚠';
        ctx.fillText(symbol, boxX + boxWidth - 25, boxY + 25);
        
        // Reset line dash
        ctx.setLineDash([]);
      });
    }

    
    // Draw validation box being created
    if (isCreatingValidationBox && validationBoxCreation?.startX !== undefined && validationBoxCreation?.startY !== undefined && validationBoxCreation?.currentX !== undefined && validationBoxCreation?.currentY !== undefined && validationBoxCreation?.cameraId === cameraId) {
      const startX = Math.min(validationBoxCreation.startX, validationBoxCreation.currentX);
      const startY = Math.min(validationBoxCreation.startY, validationBoxCreation.currentY);
      const endX = Math.max(validationBoxCreation.startX, validationBoxCreation.currentX);
      const endY = Math.max(validationBoxCreation.startY, validationBoxCreation.currentY);
      
      // Transform creation box coordinates to canvas coordinates
      // Use the same logic as validation boxes to maintain baseline position but zoom/pan correctly
      let boxX, boxY, boxWidth, boxHeight;
      
      if (transform && (transform.x !== 0 || transform.y !== 0 || transform.scale !== 1)) {
        // For transformed images, calculate relative to baseline transformed center
        
        // Calculate baseline image position (zoom=1, pan=0)
        const baseDrawWidth = Math.min(rect.width, rect.height * (img.width / img.height));
        const baseDrawHeight = Math.min(rect.height, rect.width * (img.height / img.width));
        
        let baseOffsetX, baseOffsetY;
        if (baseDrawWidth === rect.width) {
          baseOffsetX = 0;
          baseOffsetY = (rect.height - baseDrawHeight) / 2;
        } else {
          baseOffsetX = (rect.width - baseDrawWidth) / 2;
          baseOffsetY = 0;
        }
        
        const baseScaledWidth = baseDrawWidth;
        const baseScaledHeight = baseDrawHeight;
        const baseFinalX = baseOffsetX + (rect.width - baseScaledWidth) / 2;
        const baseFinalY = baseOffsetY + (rect.height - baseScaledHeight) / 2;
        
        // Calculate baseline creation box position
        const baselineBoxX = baseFinalX + (startX * baseScaledWidth) / img.width;
        const baselineBoxY = baseFinalY + (startY * baseScaledHeight) / img.height;
        const baselineBoxWidth = ((endX - startX) * baseScaledWidth) / img.width;
        const baselineBoxHeight = ((endY - startY) * baseScaledHeight) / img.height;
        
        // Calculate the transform offset
        const scaleFactorForTranslate = Math.min(rect.width, rect.height) / 500;
        const baseTransformOffsetX = transform.x * scaleFactorForTranslate;
        const baseTransformOffsetY = transform.y * scaleFactorForTranslate;
        
        // Calculate baseline transformed center
        const baseTransformedCenterX = baseFinalX + baseScaledWidth / 2 + baseTransformOffsetX;
        const baseTransformedCenterY = baseFinalY + baseScaledHeight / 2 + baseTransformOffsetY;
        
        // Calculate current transformed center
        const currentUntransformedCenterX = finalX + scaledWidth / 2;
        const currentUntransformedCenterY = finalY + scaledHeight / 2;
        const currentTransformOffsetX = transform.x * scaleFactorForTranslate;
        const currentTransformOffsetY = transform.y * scaleFactorForTranslate;
        const currentTransformedCenterX = currentUntransformedCenterX + currentTransformOffsetX;
        const currentTransformedCenterY = currentUntransformedCenterY + currentTransformOffsetY;
        
        // Calculate creation box position relative to baseline transformed center
        const boxRelativeToBaseTransformedCenter = {
          x: baselineBoxX - baseTransformedCenterX,
          y: baselineBoxY - baseTransformedCenterY
        };
        const boxEndRelativeToBaseTransformedCenter = {
          x: (baselineBoxX + baselineBoxWidth) - baseTransformedCenterX,
          y: (baselineBoxY + baselineBoxHeight) - baseTransformedCenterY
        };
        
        // Apply zoom/pan transformation
        const zoomFactor = scaledWidth / baseScaledWidth;
        const scaledBoxRelativeX = boxRelativeToBaseTransformedCenter.x * zoomFactor;
        const scaledBoxRelativeY = boxRelativeToBaseTransformedCenter.y * zoomFactor;
        const scaledBoxEndRelativeX = boxEndRelativeToBaseTransformedCenter.x * zoomFactor;
        const scaledBoxEndRelativeY = boxEndRelativeToBaseTransformedCenter.y * zoomFactor;
        
        // Position relative to current transformed center
        boxX = currentTransformedCenterX + scaledBoxRelativeX;
        boxY = currentTransformedCenterY + scaledBoxRelativeY;
        boxWidth = scaledBoxEndRelativeX - scaledBoxRelativeX;
        boxHeight = scaledBoxEndRelativeY - scaledBoxRelativeY;
      } else {
        // For untransformed images, use simple calculation
        boxX = finalX + (startX * scaledWidth) / img.width;
        boxY = finalY + (startY * scaledHeight) / img.height;
        boxWidth = ((endX - startX) * scaledWidth) / img.width;
        boxHeight = ((endY - startY) * scaledHeight) / img.height;
      }
      
      // Draw creation box
      ctx.strokeStyle = '#f59e0b'; // amber color for creation
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]); // dashed line
      ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
      
      // Draw semi-transparent fill
      ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      
      // Draw label
      ctx.font = '12px Arial';
      ctx.fillStyle = '#92400e';
      ctx.fillText(`Creating: ${validationBoxCreation.label}`, boxX + 5, boxY - 5);
      
      // Reset line dash
      ctx.setLineDash([]);
    }
  }, [imageLoaded, zoom, panX, panY, transform, validationBoxes, validatedBoxIds, showValidationBoxes, isCreatingValidationBox, validationBoxCreation, cameraId]);

  // State for drawing
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Helper function to convert mouse coordinates to image coordinates
  const getImageCoordinates = useCallback((event: React.MouseEvent) => {
    if (!imageRef.current || !canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const img = imageRef.current;
    
    // Get mouse coordinates relative to canvas
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Calculate image transform (same as drawing logic)
    const containerAspect = rect.width / rect.height;
    const imageAspect = img.width / img.height;
    
    let drawWidth, drawHeight, offsetX, offsetY;
    
    if (imageAspect > containerAspect) {
      drawWidth = rect.width;
      drawHeight = rect.width / imageAspect;
      offsetX = 0;
      offsetY = (rect.height - drawHeight) / 2;
    } else {
      drawWidth = rect.height * imageAspect;
      drawHeight = rect.height;
      offsetX = (rect.width - drawWidth) / 2;
      offsetY = 0;
    }

    const scaledWidth = drawWidth * zoom;
    const scaledHeight = drawHeight * zoom;
    const panOffsetX = panX / zoom;
    const panOffsetY = panY / zoom;
    
    const finalX = offsetX + (rect.width - scaledWidth) / 2 + panOffsetX;
    const finalY = offsetY + (rect.height - scaledHeight) / 2 + panOffsetY;

    // Convert to image pixel coordinates
    const imageX = Math.round(((mouseX - finalX) * img.width) / scaledWidth);
    const imageY = Math.round(((mouseY - finalY) * img.height) / scaledHeight);
    
    return { imageX, imageY, mouseX, mouseY, finalX, finalY, scaledWidth, scaledHeight };
  }, [zoom, panX, panY, transform]);

  // Track mouse position for drag detection
  const [mouseDownPos, setMouseDownPos] = useState<{x: number, y: number} | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Handle mouse down for validation box creation or clicking
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    // If creating validation box, prevent event propagation to stop panning
    if (isCreatingValidationBox && validationBoxCreation && onValidationBoxCreation) {
      event.preventDefault();
      event.stopPropagation();
      
      const coords = getImageCoordinates(event);
      if (!coords) return;
      
      setIsDrawing(true);
      onValidationBoxCreation(cameraId, coords.imageX, coords.imageY);
      return;
    }
    
    // Store initial mouse position for drag detection
    setMouseDownPos({ x: event.clientX, y: event.clientY });
    setIsDragging(false);
    
    // For validation box clicks, we'll check in handleMouseUp after drag detection
  }, [isCreatingValidationBox, validationBoxCreation, onValidationBoxCreation, cameraId, getImageCoordinates]);

  // Handle mouse move for validation box creation and drag detection
  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    // Handle validation box creation - prevent event propagation to stop panning
    if (isDrawing && isCreatingValidationBox && validationBoxCreation && onValidationBoxUpdate) {
      event.preventDefault();
      event.stopPropagation();
      
      const coords = getImageCoordinates(event);
      if (!coords) return;
      
      // Update the validation box creation state with current mouse position
      if (validationBoxCreation.startX !== undefined && validationBoxCreation.startY !== undefined) {
        onValidationBoxUpdate(cameraId, coords.imageX, coords.imageY);
      }
      return;
    }
    
    // Check for drag movement (only when not creating validation box)
    if (mouseDownPos && !isDragging && !isCreatingValidationBox) {
      const dragDistance = Math.sqrt(
        Math.pow(event.clientX - mouseDownPos.x, 2) + 
        Math.pow(event.clientY - mouseDownPos.y, 2)
      );
      
      // If moved more than 5 pixels, consider it a drag
      if (dragDistance > 5) {
        setIsDragging(true);
      }
    }
  }, [mouseDownPos, isDragging, isDrawing, isCreatingValidationBox, validationBoxCreation, onValidationBoxUpdate, cameraId, getImageCoordinates]);

  // Handle mouse up for validation box creation and clicking
  const handleMouseUp = useCallback((event: React.MouseEvent) => {
    // Handle validation box creation - prevent event propagation to stop panning
    if (isDrawing && isCreatingValidationBox && validationBoxCreation && onValidationBoxCreation) {
      event.preventDefault();
      event.stopPropagation();
      
      const coords = getImageCoordinates(event);
      if (coords) {
        setIsDrawing(false);
        
        // Finish the box creation
        if (validationBoxCreation.startX !== undefined && validationBoxCreation.startY !== undefined) {
          onValidationBoxCreation(cameraId, coords.imageX, coords.imageY);
        }
      }
      setMouseDownPos(null);
      setIsDragging(false);
      return;
    }
    
    // Handle validation box clicking (only if not dragging)
    if (!isDragging && !isCreatingValidationBox && showValidationBoxes && validationBoxes.length > 0 && onBoxClick) {
      const coords = getImageCoordinates(event);
      if (!coords) {
        setMouseDownPos(null);
        setIsDragging(false);
        return;
      }
      
      const { mouseX, mouseY, finalX, finalY, scaledWidth, scaledHeight } = coords;
      const img = imageRef.current!;
      
      // Check each validation box for clicks using the same coordinate system as visual rendering
      for (const box of validationBoxes) {
        let boxX, boxY, boxWidth, boxHeight;
        
        if (transform && (transform.x !== 0 || transform.y !== 0 || transform.scale !== 1)) {
          // For transformed images, use the same complex calculation as visual rendering
          const canvas = canvasRef.current;
          if (!canvas) continue;
          const canvasRect = canvas.getBoundingClientRect();
          
          // Calculate baseline image position (zoom=1, pan=0)
          const baseDrawWidth = Math.min(canvasRect.width, canvasRect.height * (img.width / img.height));
          const baseDrawHeight = Math.min(canvasRect.height, canvasRect.width * (img.height / img.width));
          
          let baseOffsetX, baseOffsetY;
          if (baseDrawWidth === canvasRect.width) {
            baseOffsetX = 0;
            baseOffsetY = (canvasRect.height - baseDrawHeight) / 2;
          } else {
            baseOffsetX = (canvasRect.width - baseDrawWidth) / 2;
            baseOffsetY = 0;
          }
          
          const baseScaledWidth = baseDrawWidth;
          const baseScaledHeight = baseDrawHeight;
          const baseFinalX = baseOffsetX + (canvasRect.width - baseScaledWidth) / 2;
          const baseFinalY = baseOffsetY + (canvasRect.height - baseScaledHeight) / 2;
          
          // Calculate baseline validation box position
          const baselineBoxX = baseFinalX + (box.x * baseScaledWidth) / img.width;
          const baselineBoxY = baseFinalY + (box.y * baseScaledHeight) / img.height;
          const baselineBoxWidth = (box.width * baseScaledWidth) / img.width;
          const baselineBoxHeight = (box.height * baseScaledHeight) / img.height;
          
          // Calculate the transform offset
          const scaleFactorForTranslate = Math.min(canvasRect.width, canvasRect.height) / 500;
          const baseTransformOffsetX = transform.x * scaleFactorForTranslate;
          const baseTransformOffsetY = transform.y * scaleFactorForTranslate;
          
          // Calculate baseline transformed center
          const baseTransformedCenterX = baseFinalX + baseScaledWidth / 2 + baseTransformOffsetX;
          const baseTransformedCenterY = baseFinalY + baseScaledHeight / 2 + baseTransformOffsetY;
          
          // Calculate current transformed center
          const currentUntransformedCenterX = finalX + scaledWidth / 2;
          const currentUntransformedCenterY = finalY + scaledHeight / 2;
          const currentTransformOffsetX = transform.x * scaleFactorForTranslate;
          const currentTransformOffsetY = transform.y * scaleFactorForTranslate;
          const currentTransformedCenterX = currentUntransformedCenterX + currentTransformOffsetX;
          const currentTransformedCenterY = currentUntransformedCenterY + currentTransformOffsetY;
          
          // Calculate validation box position relative to baseline transformed center
          const boxRelativeToBaseTransformedCenter = {
            x: baselineBoxX - baseTransformedCenterX,
            y: baselineBoxY - baseTransformedCenterY
          };
          
          // Apply zoom/pan transformation
          const zoomFactor = scaledWidth / baseScaledWidth;
          const scaledBoxRelativeX = boxRelativeToBaseTransformedCenter.x * zoomFactor;
          const scaledBoxRelativeY = boxRelativeToBaseTransformedCenter.y * zoomFactor;
          
          // Position relative to current transformed center
          boxX = currentTransformedCenterX + scaledBoxRelativeX;
          boxY = currentTransformedCenterY + scaledBoxRelativeY;
          boxWidth = baselineBoxWidth * zoomFactor;
          boxHeight = baselineBoxHeight * zoomFactor;
        } else {
          // For untransformed images, use simple calculation
          boxX = finalX + (box.x * scaledWidth) / img.width;
          boxY = finalY + (box.y * scaledHeight) / img.height;
          boxWidth = (box.width * scaledWidth) / img.width;
          boxHeight = (box.height * scaledHeight) / img.height;
        }
        
        if (mouseX >= boxX && mouseX <= boxX + boxWidth && 
            mouseY >= boxY && mouseY <= boxY + boxHeight) {
          onBoxClick(box.id);
          setMouseDownPos(null);
          setIsDragging(false);
          return;
        }
      }
    }
    
    // Reset drag tracking
    setMouseDownPos(null);
    setIsDragging(false);
  }, [isDrawing, isCreatingValidationBox, validationBoxCreation, onValidationBoxCreation, cameraId, getImageCoordinates, isDragging, showValidationBoxes, validationBoxes, onBoxClick]);

  // Handle mouse leave to reset drag state
  const handleMouseLeave = useCallback(() => {
    setMouseDownPos(null);
    setIsDragging(false);
    setIsDrawing(false);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-camera-id={cameraId}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{
        filter: `brightness(${brightness}%) contrast(${contrast}%)`,
        width: '100%',
        height: '100%',
        display: 'block',
        cursor: isCreatingValidationBox ? 'crosshair' : (showValidationBoxes && validationBoxes.length > 0 ? 'pointer' : 'default'),
      }}
    />
  );
}

// --- Smoke tests ---
try {
  console.group("MultiCamInspector tests");
  const arr = Array.from({ length: 8 }, (_, i) => defaultCam(i));
  console.assert(arr.length === 8 && arr[0].id === 0 && arr[7].id === 7, "8 cams init");
  console.assert(HANGARS.some((h) => h.id === "hangar_sisjon_vpn") && HANGARS.some((h) => h.id === "hangar_rouen_vpn"), "hangars present");
  console.assert(TI_ITEMS.length === inspectionData.tasks.length, `TI has ${inspectionData.tasks.length} items`);
  // ROI preset set/apply roundtrip (data only)
  const tmpItems = JSON.parse(JSON.stringify(TI_ITEMS)) as TIItem[];
  tmpItems[0].presets = { 3: { zoom: 2, pan: { x: 10, y: -5 } } };
  const p = tmpItems[0].presets?.[3];
  console.assert(p?.zoom === 2 && p?.pan.x === 10 && p?.pan.y === -5, "ROI store");
  // clampPan tests
  const rp = clampPan({ x: 9999, y: -9999 }, 3, { width: 1000, height: 800 } as any, true);
  console.assert(Math.abs(rp.x) <= (3 - 1) * (1000 / 2) + 1, "clampPan x");
  console.assert(Math.abs(rp.y) <= (3 - 1) * (800 / 2) + 1, "clampPan y");
  console.log("✔ tests ok");
  console.groupEnd();
} catch (e) {
  console.error("✖ test error", e);
}