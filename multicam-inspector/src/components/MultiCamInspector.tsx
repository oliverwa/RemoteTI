// @ts-nocheck
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// Removed static import - will fetch from API instead
import jsPDF from 'jspdf';

// Import shared types and constants
import type { 
  Cam, 
  CameraTransform, 
  ValidationBox, 
  TIItem, 
  InspectionMetadata 
} from '../types';
import { HANGARS, CAMERA_LAYOUT, clamp } from '../constants';

// Import extracted modals
import { 
  SnapshotConfigModal, 
  CameraTransformModal, 
  CameraCalibrationSelectionModal, 
  FolderBrowserModal 
} from './modals';

// ---------------------------------------------------------
// Hangar MultiCam Inspector – 4×2 Grid + TI Checklist (v8.6)
// ---------------------------------------------------------
// • 4×2 grid layout
// • Zoom-to-center (scroll/pinch), pan on drag, dblclick reset
// • F = fullscreen (hovered / main), Esc = close + reset view
// • Snapshot (cache-bust sourceUrl) + Reset All
// • TI checklist BELOW cameras (original wording, left-aligned)
//   Timeline with 27 dots (centered), active highlighted, clickable jump
//   Pass/Fail big buttons, N/A radio; Pass/Fail auto-advance with slide-up
// • Manual zoom/pan controls for each camera view
// ---------------------------------------------------------

// --- Consts & utils ---
// IMPORTANT: Transform scale factor configuration
// This function calculates the scale factor based on the actual drawn image size
// to ensure consistent transforms regardless of viewport orientation or aspect ratio.
// The base reference of 1000 pixels provides a normalized scale.
const calculateTransformScaleFactor = (imageDrawnWidth: number, imageDrawnHeight: number) => {
  // Use the smaller dimension for consistent scaling in both portrait and landscape
  const referenceSize = Math.min(imageDrawnWidth, imageDrawnHeight);
  // Scale relative to a 1000px reference for consistent transforms
  return referenceSize / 1000;
};

// TI_ITEMS will be populated from API

function tone(s?: string) {
  return s === "pass"
    ? "bg-green-50 border-green-200"
    : s === "fail"
    ? "bg-red-50 border-red-200"
    : "bg-white border-neutral-200";
}


// --- Types ---

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

interface MultiCamInspectorProps {
  selectedInspection?: string | null;
  selectedHangar?: string;
  selectedDrone?: string;
}

export default function MultiCamInspector({ 
  selectedInspection,
  selectedHangar,
  selectedDrone 
}: MultiCamInspectorProps = {}) {
  // --- State for inspection data ---
  const [inspectionData, setInspectionData] = useState<any>(null);
  const [tiItems, setTiItems] = useState<TIItem[]>([]);
  const [isLoadingInspection, setIsLoadingInspection] = useState(true);

  // --- Hangar ID Mapping ---
  const folderNameToHangarId = (folderName: string) => {
    switch(folderName) {
      case "Molndal": return "hangar_sisjon_vpn";
      case "Rouen": return "hangar_rouen_vpn"; 
      case "Forges-les-Eaux": return "hangar_rouen_vpn";
      default: return folderName; // fallback to original name
    }
  };

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
  const [showTaskDescriptionModal, setShowTaskDescriptionModal] = useState(false);
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

  // Debug state - visible transform info for iPad testing
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [hangarTransforms, setHangarTransforms] = useState<{ [hangarId: string]: { [cameraId: number]: CameraTransform } }>(() => {
    // Initialize with defaults from constants, will be updated from backend
    const defaultTransforms: { [hangarId: string]: { [cameraId: number]: CameraTransform } } = {};
    HANGARS.forEach(hangar => {
      defaultTransforms[hangar.id] = {};
      // Make sure we copy all 8 camera transforms
      for (let i = 0; i < 8; i++) {
        defaultTransforms[hangar.id][i] = { ...hangar.cameraTransforms[i] };
      }
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

  // Fetch camera transforms from backend on mount
  useEffect(() => {
    const fetchTransforms = async () => {
      try {
        const response = await fetch('http://172.20.1.93:3001/api/hangars/config');
        if (response.ok) {
          const data = await response.json();
          const transforms: { [hangarId: string]: { [cameraId: number]: CameraTransform } } = {};
          
          Object.entries(data).forEach(([hangarId, hangar]: [string, any]) => {
            transforms[hangarId] = hangar.cameraTransforms || {};
          });
          
          setHangarTransforms(transforms);
          console.log('🌐 Loaded transforms from backend:', transforms);
        } else {
          console.warn('Failed to fetch transforms from backend, using defaults');
        }
      } catch (error) {
        console.warn('Error fetching transforms from backend:', error);
        // Keep using defaults if backend is not available
      }
    };
    
    fetchTransforms();
  }, []);
  
  // Save transforms to backend
  const saveTransformsToBackend = async (hangarId: string, transforms: { [cameraId: number]: CameraTransform }) => {
    try {
      const response = await fetch(`http://172.20.1.93:3001/api/hangars/${hangarId}/transforms`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ transforms })
      });
      
      if (response.ok) {
        console.log(`💾 Saved transforms to backend for ${hangarId}`);
        return true;
      } else {
        console.error('Failed to save transforms to backend');
        return false;
      }
    } catch (error) {
      console.error('Error saving transforms to backend:', error);
      return false;
    }
  };

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
  
  // Using innovative mode only
  
  
  // Validation box tracking for innovative mode
  const [validatedBoxes, setValidatedBoxes] = useState<Record<string, Set<string>>>({}); // taskId -> Set of validated box IDs
  
  // Comment section visibility
  const [showComments, setShowComments] = useState(false);
  
  // Log state
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  
  // Helper function to add logs
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev.slice(-49), logEntry]); // Keep last 50 logs
  }, []);

  // Fetch inspection data from backend
  useEffect(() => {
    const fetchInspectionData = async () => {
      try {
        console.log('Starting to fetch inspection data...');
        setIsLoadingInspection(true);
        
        // Determine the API URL based on environment and selected inspection
        const baseUrl = window.location.hostname === 'localhost' 
          ? 'http://localhost:3001' 
          : 'http://172.20.1.93:3001';
        
        const apiUrl = selectedInspection 
          ? `${baseUrl}/api/inspection-data/${selectedInspection}`
          : `${baseUrl}/api/inspection-data`;
        
        console.log('Fetching from:', apiUrl);
        const response = await fetch(apiUrl);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch inspection data: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Received inspection data:', data);
        console.log('Number of tasks:', data.tasks?.length || 0);
        
        setInspectionData(data);
        
        // Convert JSON tasks to TIItem format
        const items: TIItem[] = data.tasks.map((task: any) => ({
          id: task.id,
          title: task.title,
          detail: task.description,
          order: task.order,
          required: task.required,
          allowedStatuses: task.allowedStatuses,
          status: undefined,
          validationBoxes: task.validationBoxes,
          instructions: Array.isArray(task.instructions) ? task.instructions : (task.instructions ? [task.instructions] : [])
        }));
        
        console.log('Converted items:', items.length);
        setTiItems(items);
        addLog(`✅ Loaded ${items.length} inspection tasks`);
      } catch (error) {
        console.error('Error loading inspection data:', error);
        addLog(`❌ Failed to load inspection data: ${error}`);
      } finally {
        setIsLoadingInspection(false);
      }
    };

    fetchInspectionData();
  }, [addLog, selectedInspection]);

  // Folder browser state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<any[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [currentSession, setCurrentSession] = useState<{name: string, hangar: string} | null>(null);

  // --- TI checklist state ---
  const [items, setItems] = useState<TIItem[]>([]);
  
  // Update items when tiItems changes
  useEffect(() => {
    setItems(tiItems);
  }, [tiItems]);
  const [idx, setIdx] = useState(0); // current
  const [leaving, setLeaving] = useState(false);
  const didInitialApply = useRef(false);

  // --- Layout preference state ---
  const [useOneColumn, setUseOneColumn] = useState(false); // For iPad: false = 2 columns, true = 1 column

  // Handle validation box clicks (moved after state declarations)  
  const lastClickRef = useRef<{ boxId: string; timestamp: number } | null>(null);
  
  // Session info refs for dark analysis (persist across state resets)
  const sessionRef = useRef<string>("");
  const hangarRef = useRef<string>("");
  
  // Validation box creation state
  const [isCreatingValidationBox, setIsCreatingValidationBox] = useState(false);
  const [validationBoxCreation, setValidationBoxCreation] = useState<{
    id: string;
    label: string; 
    description: string;
    startX?: number;           // Pixel coordinates (for visual feedback)
    startY?: number;
    currentX?: number;
    currentY?: number;
    startNormalizedX?: number; // Normalized coordinates (for storage)
    startNormalizedY?: number;
    currentNormalizedX?: number;
    currentNormalizedY?: number;
    cameraId?: number;
    imageWidth?: number;       // Image dimensions for conversion
    imageHeight?: number;
  } | null>(null);
  
  // Handle validation box creation clicks and updates
  const handleValidationBoxCreation = useCallback((cameraId: number, imageX: number, imageY: number, normalizedX?: number, normalizedY?: number, imageWidth?: number, imageHeight?: number) => {
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
        startNormalizedX: normalizedX || imageX / (imageWidth || 1),
        startNormalizedY: normalizedY || imageY / (imageHeight || 1),
        currentNormalizedX: normalizedX || imageX / (imageWidth || 1),
        currentNormalizedY: normalizedY || imageY / (imageHeight || 1),
        imageWidth: imageWidth,
        imageHeight: imageHeight,
        cameraId
      } : null);
      addLog(`📦 Start validation box at (${imageX}, ${imageY}) normalized (${(normalizedX || 0).toFixed(3)}, ${(normalizedY || 0).toFixed(3)}) on camera ${cameraId}`);
    } else if (validationBoxCreation.startNormalizedX !== undefined && validationBoxCreation.startNormalizedY !== undefined) {
      // Second click - finish the box using normalized coordinates
      const currentNormalizedX = normalizedX || imageX / (imageWidth || 1);
      const currentNormalizedY = normalizedY || imageY / (imageHeight || 1);
      
      const normalizedStartX = Math.min(validationBoxCreation.startNormalizedX, currentNormalizedX);
      const normalizedStartY = Math.min(validationBoxCreation.startNormalizedY, currentNormalizedY);
      const normalizedEndX = Math.max(validationBoxCreation.startNormalizedX, currentNormalizedX);
      const normalizedEndY = Math.max(validationBoxCreation.startNormalizedY, currentNormalizedY);
      const normalizedWidth = normalizedEndX - normalizedStartX;
      const normalizedHeight = normalizedEndY - normalizedStartY;
      
      // Convert to pixel coordinates for size validation
      const pixelWidth = normalizedWidth * (imageWidth || 1);
      const pixelHeight = normalizedHeight * (imageHeight || 1);
      
      // Only create box if it has reasonable size (minimum 10x10 pixels)
      if (pixelWidth > 10 && pixelHeight > 10) {
        const currentTask = items[idx];
        const cameraName = CAMERA_LAYOUT.find(c => c.id === cameraId)?.name || `Camera${cameraId}`;
        
        // Create validation box with normalized coordinates
        const validationBox = {
          id: validationBoxCreation.id,
          x: normalizedStartX,        // Normalized coordinates
          y: normalizedStartY,
          width: normalizedWidth,
          height: normalizedHeight,
          label: validationBoxCreation.label,
          description: '',
          // Store pixel coordinates for legacy support/debugging
          pixelX: normalizedStartX * (imageWidth || 1),
          pixelY: normalizedStartY * (imageHeight || 1),
          pixelWidth: pixelWidth,
          pixelHeight: pixelHeight
        };
        
        addLog(`📦 Validation Box Created for ${cameraName} on task ${currentTask?.id}:`);
        addLog(`   Normalized: (${normalizedStartX.toFixed(3)}, ${normalizedStartY.toFixed(3)}) ${normalizedWidth.toFixed(3)}×${normalizedHeight.toFixed(3)}`);
        addLog(`   Pixels: (${validationBox.pixelX?.toFixed(0)}, ${validationBox.pixelY?.toFixed(0)}) ${pixelWidth.toFixed(0)}×${pixelHeight.toFixed(0)}`);
        
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
  const handleValidationBoxUpdate = useCallback((cameraId: number, imageX: number, imageY: number, normalizedX?: number, normalizedY?: number, imageWidth?: number, imageHeight?: number) => {
    if (!validationBoxCreation || !isCreatingValidationBox || validationBoxCreation.cameraId !== cameraId) return;
    
    // Prioritize normalized coordinates for device independence
    const normalX = normalizedX ?? (imageWidth ? imageX / imageWidth : 0);
    const normalY = normalizedY ?? (imageHeight ? imageY / imageHeight : 0);
    
    // Update current position for live preview using normalized coordinates as primary
    setValidationBoxCreation(prev => prev ? {
      ...prev,
      currentX: imageX,
      currentY: imageY,
      currentNormalizedX: normalX,
      currentNormalizedY: normalY
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
      
      const response = await fetch('http://172.20.1.93:3001/api/update-validation-box', {
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
  

  const resetAll = () => setCams((prev) => prev.map((c) => ({ ...c, zoom: 1, pan: { x: 0, y: 0 } })));

  // --- Layout helpers ---
  const isIPad = () => {
    return /iPad|Android|Touch/i.test(navigator.userAgent) && window.innerWidth >= 768 && window.innerWidth < 1024;
  };

  // --- Hotkeys: fullscreen --- (moved after selectStatus definition)

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
      console.log(`🌙 checkForDarkImages called with hangar: "${hangar}", session: "${session}"`);
      addLog(`🌙 Checking for dark images in session: ${session}`);
      
      // Construct session path based on hangar structure
      const sessionPath = `/Users/oliverwallin/hangar_snapshots/${hangar}/${session}`;
      console.log(`📁 Session path: ${sessionPath}`);
      
      const requestBody = {
        sessionPath: sessionPath,
        method: 'average',
        threshold: 100,
        blurThreshold: 100 // Not used
      };
      console.log(`📤 Sending request to API:`, requestBody);
      
      const response = await fetch('http://localhost:3002/api/analyze-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log(`📥 API response status: ${response.status} ${response.statusText}`);

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
    // Use props if snapshotHangar/snapshotDrone aren't set yet
    const hangarToUse = snapshotHangar || selectedHangar;
    const droneToUse = snapshotDrone || selectedDrone;
    
    if (!hangarToUse || !droneToUse?.trim()) {
      addLog("❌ Snapshot cancelled - missing hangar or drone name");
      alert("Please select a hangar and a drone name");
      return;
    }

    // Handle demo mode with local images
    if (droneToUse === 'demo') {
      addLog("🎭 Demo mode selected - loading local demo images");
      setIsCapturing(true);
      setShowSnapshotModal(false);
      
      // Update inspection metadata
      setInspectionMeta(prev => ({
        ...prev,
        droneName: "Demo Drone",
        hangarName: hangarToUse
      }));
      
      // Set loading state
      setCams(prev => prev.map(cam => ({ ...cam, isLoading: true, src: "" })));
      
      // Simulate loading delay for realism
      setTimeout(() => {
        // Map camera IDs to demo image filenames based on camera layout
        const demoImageMap: Record<number, string> = {
          0: 'RUR_251016_090049.jpg',  // Camera 0 = RUR (Rear Upper Right)
          1: 'FUR_251016_090049.jpg',  // Camera 1 = FUR (Front Upper Right)
          2: 'FUL_251016_090049.jpg',  // Camera 2 = FUL (Front Upper Left)
          3: 'RUL_251016_090049.jpg',  // Camera 3 = RUL (Rear Upper Left)
          4: 'RDR_251016_090049.jpg',  // Camera 4 = RDR (Rear Down Right)
          5: 'FDR_251016_090049.jpg',  // Camera 5 = FDR (Front Down Right)
          6: 'FDL_251016_090049.jpg',  // Camera 6 = FDL (Front Down Left)
          7: 'RDL_251016_090049.jpg',  // Camera 7 = RDL (Rear Down Left)
        };
        
        // Load demo images
        setCams(prev => prev.map(cam => ({
          ...cam,
          isLoading: false,
          src: `/demo-images/${demoImageMap[cam.id]}`
        })));
        
        setIsCapturing(false);
        addLog("✅ Demo images loaded successfully");
      }, 1500); // 1.5 second delay to simulate capture
      
      return;
    }

    addLog(`📸 Starting fast camera capture for ${droneToUse} at ${hangarToUse}`);
    addLog("🔗 Connecting to backend API...");
    
    // Store hangar in ref for dark analysis (persists across state resets)
    hangarRef.current = hangarToUse;
    console.log(`📝 Stored hangar in ref: ${hangarRef.current}`);
    
    // Reset session name for new capture
    setCurrentSessionName("");
    
    setIsCapturing(true);
    setShowSnapshotModal(false);
    
    // Update inspection metadata with capture info
    setInspectionMeta(prev => ({
      ...prev,
      droneName: droneToUse,
      hangarName: hangarToUse
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
      const response = await fetch('http://172.20.1.93:3001/api/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hangar: hangarToUse,
          drone: droneToUse,
          inspectionType: selectedInspection || 'remote'
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
          const statusResponse = await fetch(`http://172.20.1.93:3001/api/capture/${requestId}/status`);
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
              setProgressText(`Parallel batch ${status.currentPhase.replace('batch_', '').replace('_of_', '/')} - Processing: [${cameraList}]`);
            } else if (status.currentPhase === 'autofocus') {
              setProgressText(isParallel ? `Step 4/6: Triggering autofocus - [${cameraList}]` : `Step 4/6: Triggering autofocus - ${cameraList}`);
            } else if (status.currentPhase === 'capture') {
              setProgressText(isParallel ? `Step 5/6: Capturing image - [${cameraList}]` : `Step 5/6: Capturing image - ${cameraList}`);
            } else if (status.currentPhase === 'connecting') {
              setProgressText(isParallel ? `Step 1-3/6: Establishing connections - [${cameraList}]` : `Step 1-3/6: Establishing connections - ${cameraList}`);
            } else {
              setProgressText(isParallel ? `Processing: [${cameraList}] (${status.currentStep}/8)` : `Processing ${cameraList} (${status.currentStep}/8)`);
            }
          } else if (status.status === 'running') {
            setProgressText(`Parallel capture in progress...`);
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
                  const imageUrl = `http://172.20.1.93:3001/api/image/${snapshotHangar}/${imageInfo.session}/${imageInfo.filename}?t=${timestamp}`;
                  
                  console.log(`Storing image for ${cameraName}:`, imageUrl);
                  
                  // Capture session name from the first image processed
                  if (!currentSessionName) {
                    setCurrentSessionName(imageInfo.session);
                    sessionRef.current = imageInfo.session;
                    console.log(`Captured session name: ${imageInfo.session}`);
                    console.log(`📝 Stored session in ref: ${sessionRef.current}`);
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
          
          if (status.status === 'completed') {
            clearInterval(pollInterval);
            clearTimeout(frontendTimeout);
            setEstimatedTimeRemaining(null); // Clear ETA timer
            addLog(`🎉 All cameras completed! Loading latest images...`);
            
            // Load the latest images from the server since capture is complete
            loadLatestFolderGlobally().catch((error: Error) => {
              console.error('Failed to load latest images after capture:', error);
              addLog(`❌ Failed to load images: ${error.message}`);
            });
            
            setIsWaitingToDisplay(true);
            
            // Start dark image analysis during the 2-second wait period
            const sessionToAnalyze = sessionRef.current;
            const hangarToAnalyze = hangarRef.current;
            
            console.log(`🔍 Dark image analysis check - session: "${sessionToAnalyze}", hangar: "${hangarToAnalyze}"`);
            
            if (sessionToAnalyze && hangarToAnalyze) {
              console.log(`📅 Starting dark image analysis for session: ${sessionToAnalyze} in hangar: ${hangarToAnalyze}`);
              setTimeout(async () => {
                console.log('🕐 Dark image check timer triggered during stabilization!');
                console.log(`🔍 Analyzing session: ${sessionToAnalyze} in hangar: ${hangarToAnalyze}`);
                
                try {
                  addLog(`🔍 Starting dark image analysis...`);
                  await checkForDarkImages(hangarToAnalyze, sessionToAnalyze);
                } catch (error) {
                  console.error('❌ Dark image analysis failed:', error);
                  addLog(`❌ Dark image analysis failed: ${error instanceof Error ? error.message : String(error)}`);
                }
              }, 500); // Start analysis 500ms into the stabilization period
            } else {
              console.log(`❌ Cannot set up dark image analysis - missing session (${sessionToAnalyze}) or hangar (${hangarToAnalyze})`);
              addLog(`❌ Dark image check skipped - missing session (${sessionToAnalyze}) or hangar (${hangarToAnalyze})`);
            }
            
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
            clearTimeout(frontendTimeout);
            const errorMessage = status.error || 'Unknown error occurred during capture';
            addLog(`CAPTURE FAILED: ${errorMessage}`);
            
            // Show detailed failure information
            if (status.capturedCameras && status.failedCameras) {
              addLog(`Results: ${status.capturedCameras.length} cameras succeeded, ${status.failedCameras.length} cameras failed`);
              if (status.failedCameras.length > 0) {
                addLog(`Failed cameras: ${status.failedCameras.join(', ')}`);
              }
            }
            
            setCams(prev => prev.map(cam => ({ ...cam, isLoading: false })));
            setIsCapturing(false);
            setCaptureStartTime(null);
            setEstimatedTimeRemaining(null);
            setProgressText("");
          }
          
        } catch (error) {
          console.error('Polling error:', error);
          const errorMessage = error instanceof Error ? error.message : String(error);
          addLog(`⚠️ Polling error: ${errorMessage}`);
          // Continue polling - don't stop on temporary errors
        }
      }, 500); // Poll every 500ms for debugging
      
      // Safety timeout - 6 minutes (longer than backend's 5 minute timeout)
      const frontendTimeout = setTimeout(() => {
        clearInterval(pollInterval);
        if (isCapturing) {
          addLog("CAPTURE TIMEOUT: No response from backend after 6 minutes - stopping capture");
          addLog("This may indicate a network issue or hangar connectivity problem");
          setCams(prev => prev.map(cam => ({ ...cam, isLoading: false })));
          setIsCapturing(false);
          setCaptureStartTime(null);
          setEstimatedTimeRemaining(null);
          setProgressText("");
        }
      }, 360000); // 6 minutes timeout
      
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
      
      const response = await fetch(`http://172.20.1.93:3001/api/folders`);
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
          const imageUrl = `http://172.20.1.93:3001/api/image/${latestHangar}/${latestSession.name}/${imageFile}?t=${timestamp}`;
          console.log(`🖼️ Loading image ${index} (${cameraName}): ${imageUrl}`);
          return { ...cam, src: imageUrl, isLoading: false };
        } else {
          console.log(`❌ No image found for camera ${index} (${cameraName})`);
          return { ...cam, src: "", isLoading: false };
        }
      });
      
      // Map folder name back to hangar ID for API calls
      const folderNameToHangarId = (folderName: string) => {
        switch(folderName) {
          case "Molndal": return "hangar_sisjon_vpn";
          case "Rouen": return "hangar_rouen_vpn"; 
          case "Forges-les-Eaux": return "hangar_rouen_vpn";
          default: return folderName; // fallback to original name
        }
      };
      
      const hangarId = folderNameToHangarId(latestHangar);
      console.log(`🏢 Mapped folder "${latestHangar}" to hangar ID "${hangarId}"`);
      
      setCams(newCams);
      setSnapshotHangar(hangarId);
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
      
      const response = await fetch(`http://172.20.1.93:3001/api/folders/latest/${hangar}`);
      if (!response.ok) {
        throw new Error(`Failed to load latest folder: ${response.statusText}`);
      }
      
      const data = await response.json();
      const session = data.session;
      
      console.log('📊 Session data:', session);
      console.log('🎯 Camera layout:', CAMERA_LAYOUT);
      addLog(`📂 Found latest session: ${session.name} with ${session.imageCount} images`);
      
      // Load images from this session
      const timestamp = Date.now();
      const newCams = cams.map((cam, index) => {
        // Use the correct camera layout order
        const cameraName = CAMERA_LAYOUT[index]?.name;
        const imageFile = session.images.find((img: string) => img.startsWith(cameraName));
        
        if (imageFile) {
          const imageUrl = `http://172.20.1.93:3001/api/image/${session.hangar}/${session.name}/${imageFile}?t=${timestamp}`;
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
      
      const response = await fetch('http://172.20.1.93:3001/api/folders');
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
          const imageUrl = `http://172.20.1.93:3001/api/image/${hangar}/${sessionName}/${imageFile}?t=${timestamp}`;
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
      
      // Convert hangar ID back to folder name for API calls
      const hangarIdToFolderName = (id: string) => {
        switch(id) {
          case "hangar_sisjon_vpn": return "Molndal";
          case "hangar_rouen_vpn": return "Rouen";
          default: return id;
        }
      };
      
      const folderName = hangarIdToFolderName(hangarId);
      console.log('🔧 Mapped hangar ID to folder name:', { hangarId, folderName });
      
      // Load Mölndal baseline image from actual available session
      const baselineUrl = `http://172.20.1.93:3001/api/image/hangar_sisjon_vpn/bender_251201_125858/${cameraName}_251201_125858.jpg?t=${Date.now()}`;
      console.log('🔧 Baseline URL:', baselineUrl);
      setMolndalImage(baselineUrl);
      addLog(`📍 Loading baseline: ${cameraName} from Mölndal`);
      
      // Get all folders and find the latest session for selected hangar
      const foldersUrl = `http://172.20.1.93:3001/api/folders`;
      console.log('🔧 Folders URL:', foldersUrl);
      const foldersResponse = await fetch(foldersUrl);
      
      if (foldersResponse.ok) {
        const response = await foldersResponse.json();
        console.log('🔧 Folders API response:', response);
        
        // Find the hangar in the response using the original hangar ID, not the folder name
        const targetHangar = response.hangars?.find((h: any) => h.id === hangarId);
        console.log('🔧 Target hangar:', targetHangar);
        
        if (targetHangar && targetHangar.sessions?.length > 0) {
          // Get the latest session (first in the array, as they're sorted by date)
          const latestSession = targetHangar.sessions[0];
          console.log('🔧 Latest session:', latestSession);
          
          // Find the image for this camera - the images array contains filenames
          const targetImageFilename = latestSession.images?.find((filename: string) => filename.startsWith(cameraName));
          console.log('🔧 Target image filename:', targetImageFilename);
          
          if (targetImageFilename) {
            const hangarImageUrl = `http://172.20.1.93:3001/api/image/${hangarId}/${latestSession.name}/${targetImageFilename}?t=${Date.now()}`;
            console.log('🔧 Hangar image URL:', hangarImageUrl);
            setHangarImage(hangarImageUrl);
            addLog(`🎯 Loading target: ${cameraName} from ${latestSession.name}`);
          } else {
            addLog(`⚠️ No image found for ${cameraName} in latest session from ${folderName}`);
            console.log('🔧 Available images in session:', latestSession.images);
          }
        } else {
          addLog(`❌ No sessions found for hangar ${folderName}`);
          console.log('🔧 Available hangars:', response.hangars?.map((h: any) => h.id));
        }
      } else {
        addLog(`❌ Failed to load folders - Status: ${foldersResponse.status}`);
        console.log('🔧 Folders response error:', await foldersResponse.text());
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
    
    // Validation gate logic - only block PASS, allow FAIL
    if (s === 'pass') {
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

  // --- Hotkeys: fullscreen ---
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
          // Don't reset transform - keep current values for next time
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
  }, [hoverId, fsId, resetView, resetAll, addLog, showLogs, selectStatus]);
  
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
        
        currentY += 2;
        
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



  // --- Backend health check ---
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        const response = await fetch('http://172.20.1.93:3001/api/health');
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
      didInitialApply.current = true;
    }
  }, [items, addLog]);

  // --- Reset cameras when task changes ---
  useEffect(() => {
    if (didInitialApply.current && items.length > 0) {
      resetAll();
      addLog(`🔄 Reset camera views for task ${idx + 1}: ${items[idx]?.title?.substring(0, 40)}...`);
    }
  }, [idx, items, addLog]);

  // --- Auto-start capture when component mounts with props ---
  useEffect(() => {
    // Auto-start capture when component mounts with hangar and drone from props
    const hasImages = cams.some(cam => cam.src && cam.src !== "");
    if (!hasImages && !isCapturing && !isWaitingToDisplay && selectedHangar && selectedDrone) {
      // Set the snapshot values from props
      setSnapshotHangar(selectedHangar);
      setSnapshotDrone(selectedDrone);
      
      // Small delay to ensure component is fully mounted and state is set
      const timer = setTimeout(() => {
        addLog("🎬 Starting remote inspection capture...");
        // Directly start capture without showing modal
        executeSnapshot();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [selectedHangar, selectedDrone]);

  // --- Render ---
  if (isLoadingInspection) {
    return (
      <div className="w-full min-h-screen max-h-screen flex items-center justify-center bg-white text-black">
        <div className="text-center">
          <div className="text-xl font-semibold mb-2">Loading inspection data...</div>
          <div className="text-sm text-gray-500">Please wait</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen max-h-screen overflow-y-auto px-3 py-2 space-y-2 bg-white text-black">
      {/* Header – main controls */}
      <div className="flex flex-wrap items-center gap-2">
        {showLogs && (
          <>
            {/* Layout toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setUseOneColumn(!useOneColumn);
                addLog(`📱 Layout changed to ${!useOneColumn ? '1 column' : '2 columns'}`);
              }}
              className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
            >
              {useOneColumn ? '📱 1 Col' : '📱 2 Cols'}
            </Button>

            {/* Debug button for iPad testing */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Better iPad detection
                const isIPad = /iPad/.test(navigator.userAgent) || 
                              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                const transformCount = Object.keys(hangarTransforms || {}).length;
                
                // Debug current transforms
                console.log('📦 Transform Debug:', {
                  hangarCount: transformCount,
                  hangars: Object.keys(hangarTransforms),
                  currentSession,
                  transforms: hangarTransforms
                });
                
                const sampleTransforms = hangarTransforms && transformCount > 0 
                  ? Object.entries(hangarTransforms)[0] 
                  : null;
                
                let sampleText = '';
                let transformStatus = '';
                if (sampleTransforms) {
                  const [hangarId, transforms] = sampleTransforms;
                  const firstCam = Object.entries(transforms as any)[0];
                  if (firstCam) {
                    const [camId, transform] = firstCam;
                    const hasNonZeroTransform = transform.x !== 0 || transform.y !== 0 || transform.scale !== 1 || transform.rotation !== 0;
                    sampleText = `\nSample - ${hangarId} Cam${camId}: x:${transform.x || 0}, y:${transform.y || 0}, scale:${transform.scale || 1}`;
                    transformStatus = `\nTransform Active: ${hasNonZeroTransform ? 'YES' : 'NO (all values zero)'}`;
                  }
                }
                
                // Show Rouen transforms specifically
                const rouenText = hangarTransforms['hangar_rouen_vpn'] 
                  ? `\n\nRouen Cam0: x:${hangarTransforms['hangar_rouen_vpn'][0]?.x}, y:${hangarTransforms['hangar_rouen_vpn'][0]?.y}, scale:${hangarTransforms['hangar_rouen_vpn'][0]?.scale}`
                  : '\n\nRouen: Not loaded';
                
                // Session info
                const sessionInfo = currentSession 
                  ? `\nSession: ${currentSession.name}\nHangar: ${currentSession.hangar}\nMapped ID: ${folderNameToHangarId(currentSession.hangar)}`
                  : '\nSession: None loaded';
                
                // Check current viewport size to understand scaling
                const viewportInfo = `\nViewport: ${window.innerWidth}x${window.innerHeight}`;
                const pixelRatio = `\nPixel Ratio: ${window.devicePixelRatio}`;

                alert(`🔧 TRANSFORM DEBUG\n\nDevice: ${isIPad ? 'iOS/iPad' : 'Desktop'}${viewportInfo}${pixelRatio}\nTransforms: ${transformCount} hangars loaded\nDefaults loaded from constants${sessionInfo}${sampleText}${transformStatus}${rouenText}\n\nCheck console for detailed transform logs`);
              }}
              className="bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100"
            >
              🔧 DEBUG
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
        
      </div>


      {/* ETA Countdown Display */}
      {(isCapturing || isWaitingToDisplay) && (
        <div className="bg-gray-100 rounded-lg p-2">
          <div className="flex items-center justify-center">
            {isWaitingToDisplay ? (
              <span className="text-sm font-medium text-gray-700">
                Preparing images for display...
              </span>
            ) : estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 ? (
              <div className="flex flex-col items-center space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-700">
                    {progressText || "Parallel capture in progress"}
                  </span>
                  <span className="text-lg font-bold text-blue-600">
                    {estimatedTimeRemaining}s
                  </span>
                  <span className="text-sm text-gray-600">
                    remaining
                  </span>
                </div>
              </div>
            ) : isCapturing ? (
              <span className="text-sm font-medium text-gray-700">
                Capture completed - processing images...
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
      <div className="flex-1 overflow-auto px-2">
        <div className={`grid gap-2 px-1 py-2 ${
          // Mobile: always 1 column
          // iPad/tablet: 1 or 2 columns based on toggle
          // Large screens: 4 columns
          useOneColumn 
            ? 'grid-cols-1' 
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        }`}>
          {cams.map((cam) => {
            // Get current hangar (use current session hangar or default to first)
            const currentFolderName = currentSession?.hangar || HANGARS[0].id;
            // Map folder name to full hangar ID for transform lookup
            const currentHangarId = folderNameToHangarId(currentFolderName);
            const transform = hangarTransforms[currentHangarId]?.[cam.id] || { x: 0, y: 0, scale: 1, rotation: 0 };
            
            // Debug logging for first camera only
            if (cam.id === 0) {
              console.log('🎥 Transform Debug (Cam 0):', {
                currentSession: currentSession,
                currentFolderName,
                currentHangarId,
                availableHangars: Object.keys(hangarTransforms),
                transform,
                hasTransformData: !!hangarTransforms[currentHangarId]
              });
            }
            
            return (
              <Card key={cam.id} className="overflow-hidden border-0 shadow-sm">
                <CardContent className="p-0 m-0">
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
                    onPanUpdate={(deltaX, deltaY) => {
                      setCams(prev => prev.map(c => {
                        if (c.id !== cam.id) return c;
                        
                        // Apply sensitivity scaling like the mouse drag system
                        const sensitivity = 1.5 * c.zoom;
                        const newPan = {
                          x: c.pan.x + deltaX * sensitivity,
                          y: c.pan.y + deltaY * sensitivity
                        };
                        
                        // Use clampPan to ensure pan stays within bounds
                        const containerElement = document.querySelector(`[data-camera-id="${cam.id}"]`) as HTMLElement;
                        if (containerElement) {
                          const rect = containerElement.getBoundingClientRect();
                          const clampedPan = clampPan(newPan, c.zoom, rect, true);
                          return { ...c, pan: clampedPan };
                        }
                        
                        return { ...c, pan: newPan };
                      }));
                    }}
                  showLogs={showLogs}
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

        {/* Pass/Fail Buttons, Title, and Timeline - Below Camera Images */}
        {items.some(item => !item.status) && (
          <div className="space-y-4">
            {/* Title with Pass/Fail Buttons */}
            <div className="">
              {/* Task Title first */}
              <div className="text-center mb-4 px-4">
                <h2 className="text-lg md:text-xl font-semibold text-gray-900 flex items-center justify-center gap-2">
                  <span className="truncate max-w-[90%]">
                    {items[idx].title}
                  </span>
                  <button 
                    onClick={() => setShowTaskDescriptionModal(true)}
                    className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 text-sm font-medium"
                    title="Task details"
                  >
                    ?
                  </button>
                </h2>
              </div>
              
              {/* Pass/Fail Buttons below title */}
              <div className="flex justify-center gap-6">
                {(() => {
                  const currentTask = items[idx];
                  const currentValidations = validatedBoxes[currentTask.id] || new Set();
                  const totalBoxes = Object.values(currentTask.validationBoxes || {}).reduce((sum, boxes) => sum + (boxes?.length || 0), 0);
                  const isValidationComplete = totalBoxes === 0 || currentValidations.size === totalBoxes;
                  
                  return (
                    <>
                      {/* FAIL Button */}
                      <button 
                        onClick={() => {
                          console.log('FAIL clicked for task', idx);
                          selectStatus("fail");
                        }} 
                        className={`py-3 px-16 text-base font-medium rounded-lg transition-all flex items-center justify-center gap-2 min-w-[200px] ${
                          items[idx].status === "fail" 
                            ? "bg-red-500 text-white hover:bg-red-600 shadow-md" 
                            : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span>FAIL</span>
                      </button>
                      
                      {/* PASS Button */}
                      <button 
                        onClick={() => {
                          console.log('PASS clicked for task', idx);
                          selectStatus("pass");
                        }} 
                        disabled={!isValidationComplete}
                        className={`py-3 px-16 text-base font-medium rounded-lg transition-all flex items-center justify-center gap-2 min-w-[200px] ${
                          items[idx].status === "pass" 
                            ? "bg-green-500 text-white hover:bg-green-600 shadow-md" 
                            : isValidationComplete
                              ? "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"
                              : "bg-gray-100 text-gray-400 cursor-not-allowed opacity-50"
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>PASS</span>
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
            
            {/* Progress Timeline */}
            <div className="flex justify-center pb-3">
              <div className="flex items-center gap-1.5">
                {items.map((it, i) => {
                  const isActive = i === idx;
                  const isDone = it.status === "pass" || it.status === "fail" || it.status === "na";
                  const statusColor = it.status === "pass" ? "bg-green-500" : 
                                     it.status === "fail" ? "bg-red-500" : 
                                     it.status === "na" ? "bg-yellow-500" : 
                                     "bg-gray-300";
                  
                  return (
                    <button
                      title={`${i + 1}. ${it.title}`}
                      key={i}
                      className={`
                        ${isActive ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5'} 
                        rounded-full transition-all
                        ${statusColor}
                        ${isActive ? 'ring-2 ring-offset-2 ring-blue-400' : ''}
                        ${!isDone && !isActive ? 'opacity-30' : ''}
                        hover:scale-125
                      `}
                      onClick={() => {
                        if (i !== idx) {
                          setIdx(i);
                          addLog(`Jumped to task ${i + 1}: ${it.title}`);
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
            
            {/* Thin Add Comments / N/A row */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 rounded-lg">
              <button
                onClick={() => setShowComments(!showComments)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                <span>Add Comments</span>
              </button>
              
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                <input 
                  type="radio" 
                  name={`task-${idx}`}
                  checked={items[idx].status === "na"}
                  onChange={() => selectStatus("na")}
                  className="w-4 h-4"
                />
                <span>N/A</span>
              </label>
            </div>
            
            {/* Comments textarea if open */}
            {showComments && (
              <div className="px-4">
                <textarea
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                  rows={2}
                  placeholder="Add comments or notes for this inspection task..."
                  value={items[idx].comment || ''}
                  onChange={(e) => updateTaskComment(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

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

      {/* Completion Section */}
      {!items.some(item => !item.status) && (
        <div className="bg-white py-3">
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
        </div>
      )}

      {/* Image Enhancement Controls - iPad friendly */}
      <div className="bg-white px-6 py-4">
        <div className="flex justify-center items-center gap-8">
          {/* Brightness Control */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 font-medium">BRIGHTNESS</span>
            <button
              onClick={() => adjustBrightness(-10)}
              className="w-12 h-12 text-xl bg-white hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors font-medium"
            >
              −
            </button>
            <span className="text-base font-bold text-gray-800 w-16 text-center">{brightness}%</span>
            <button
              onClick={() => adjustBrightness(10)}
              className="w-12 h-12 text-xl bg-white hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors font-medium"
            >
              +
            </button>
          </div>
          
          {/* Contrast Control */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 font-medium">CONTRAST</span>
            <button
              onClick={() => adjustContrast(-10)}
              className="w-12 h-12 text-xl bg-white hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors font-medium"
            >
              −
            </button>
            <span className="text-base font-bold text-gray-800 w-16 text-center">{contrast}%</span>
            <button
              onClick={() => adjustContrast(10)}
              className="w-12 h-12 text-xl bg-white hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors font-medium"
            >
              +
            </button>
          </div>
        </div>
      </div>
      
      {/* Session Info and Help - Bottom bar */}
      <div className="bg-white border-t border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Session Info */}
          <div className="flex items-center gap-2 text-sm">
            {currentSession ? (
              <>
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="font-medium text-gray-700">{currentSession.name}</span>
                <span className="text-gray-400">({currentSession.hangar})</span>
              </>
            ) : (
              <span className="text-gray-400">No session loaded</span>
            )}
          </div>
          
          {/* Help button */}
          <div className="relative group">
            <button className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors">
              Help
            </button>
            <div className="absolute right-0 bottom-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs text-gray-700 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
              <div className="font-semibold mb-2">Keyboard Shortcuts</div>
              <div className="space-y-1">
                <div>Scroll = zoom</div>
                <div>Drag = pan</div>
                <div>Double-click = reset</div>
                <div>F = fullscreen</div>
                <div>R = reset view</div>
                <div>Esc = close modal/fullscreen</div>
                <div>D = debug mode</div>
                <div>P = pass</div>
                <div>X = fail</div>
                <div>A = camera alignment</div>
                <div>C = calibrate camera</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {fsId != null && (
        <Fullscreen
          cam={cams[fsId!]}
          brightness={brightness}
          contrast={contrast}
          onClose={() => {
            resetView(fsId!);
            setFsId(null);
          }}
          onWheel={(e) => onWheel(fsId!, e)}
          onDragStart={(e) => onDrag(fsId!, e)}
        />
      )}

      {/* Snapshot Modal */}
      <SnapshotConfigModal
        isOpen={showSnapshotModal}
        onClose={() => setShowSnapshotModal(false)}
        snapshotHangar={snapshotHangar}
        setSnapshotHangar={setSnapshotHangar}
        snapshotDrone={snapshotDrone}
        setSnapshotDrone={setSnapshotDrone}
        onExecuteSnapshot={executeSnapshot}
        onLoadLatest={() => {
          setShowSnapshotModal(false);
          loadLatestFolderGlobally();
        }}
        onBrowseFolders={() => {
          setShowSnapshotModal(false);
          loadAvailableFolders();
          setShowFolderModal(true);
        }}
      />

      {/* Camera Transform Settings Modal */}
      <CameraTransformModal
        isOpen={showTransformModal}
        onClose={() => setShowTransformModal(false)}
        selectedHangarTab={selectedHangarTab}
        setSelectedHangarTab={setSelectedHangarTab}
        hangarTransforms={hangarTransforms}
        setHangarTransforms={setHangarTransforms}
        onSave={async () => {
          // Save all hangar transforms to backend
          let allSaved = true;
          for (const [hangarId, transforms] of Object.entries(hangarTransforms)) {
            const saved = await saveTransformsToBackend(hangarId, transforms as { [cameraId: number]: CameraTransform });
            if (!saved) {
              allSaved = false;
            }
          }
          
          if (allSaved) {
            addLog('✅ Camera transform settings saved to backend');
          } else {
            addLog('⚠️ Some transforms failed to save to backend');
          }
          setShowTransformModal(false);
        }}
      />

      {/* Camera Calibration Selection Modal */}
      <CameraCalibrationSelectionModal
        isOpen={showCalibrateSelectionModal}
        onClose={() => {
          setCalibrateSelectionModal(false);
          setCalibrateHangar("");
          setCalibrateCamera(0);
        }}
        calibrateHangar={calibrateHangar}
        setCalibrateHangar={setCalibrateHangar}
        calibrateCamera={calibrateCamera}
        setCalibrateCamera={setCalibrateCamera}
        cameras={inspectionData?.cameras || []}
        onStartCalibration={() => {
          if (calibrateHangar) {
            setCalibrateSelectionModal(false);
            // Convert from inspectionData.cameras index to CAMERA_LAYOUT index
            const selectedCameraName = inspectionData?.cameras?.[calibrateCamera]?.id;
            const cameraLayoutIndex = CAMERA_LAYOUT.findIndex(layout => layout.name === selectedCameraName);
            
            // Load current transform values for this camera and hangar using the correct index
            const currentTransform = hangarTransforms[calibrateHangar]?.[cameraLayoutIndex] || { x: 0, y: 0, scale: 1, rotation: 0 };
            
            // Note: The stored transforms are in "normalized" units that get scaled by calculateTransformScaleFactor
            // For the calibration UI, we show them as-is since the calibration modal will save them in the same format
            setCalibrationTransform(currentTransform);
            loadCalibrationImages(calibrateHangar, calibrateCamera);
            setCalibrateModal(true);
          }
        }}
      />

      {/* Camera Calibration Modal */}
      {showCalibrateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 w-[1100px] max-w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-2">🎯 Camera Calibration - {inspectionData?.cameras?.[calibrateCamera]?.name || 'Camera'} in {HANGARS.find(h => h.id === calibrateHangar)?.label || 'Hangar'}</h2>
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
                          // Scale the delta by 2 since we apply 0.5 scaling in the display
                          setCalibrationTransform(prev => ({
                            ...prev,
                            x: startTransformX + deltaX * 2,
                            y: startTransformY + deltaY * 2
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
                          // Apply the same transform scaling as in the viewport
                          // The container is 500px height, so calculate the scale factor
                          // Using the same logic as calculateTransformScaleFactor
                          transform: `translate(${calibrationTransform.x * 0.5}px, ${calibrationTransform.y * 0.5}px) scale(${calibrationTransform.flipped ? -1 : 1}, 1) scale(${calibrationTransform.scale}) rotate(${calibrationTransform.rotation}deg)`,
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
                          // Don't reset transform - keep current values for next time
                          setMolndalImage("");
                          setHangarImage("");
                        }}
                        className="w-full text-xs py-1"
                      >
                        Cancel
                      </Button>
                      {molndalImage && hangarImage && (
                        <Button
                          onClick={async () => {
                            // Convert from inspectionData.cameras index to CAMERA_LAYOUT index
                            const selectedCameraName = inspectionData?.cameras?.[calibrateCamera]?.id;
                            const cameraLayoutIndex = CAMERA_LAYOUT.findIndex(layout => layout.name === selectedCameraName);
                            
                            // Save the calibration to the hangar transforms
                            const newTransforms = { ...hangarTransforms };
                            if (!newTransforms[calibrateHangar]) newTransforms[calibrateHangar] = {};
                            newTransforms[calibrateHangar][cameraLayoutIndex] = { ...calibrationTransform };
                            setHangarTransforms(newTransforms);
                            
                            // Save to backend
                            const saved = await saveTransformsToBackend(calibrateHangar, newTransforms[calibrateHangar]);
                            
                            if (saved) {
                              addLog(`✅ Calibration saved to backend for ${inspectionData?.cameras?.[calibrateCamera]?.name || 'Camera'} in ${HANGARS.find(h => h.id === calibrateHangar)?.label || 'Hangar'}`);
                            } else {
                              addLog(`⚠️ Calibration updated locally but failed to save to backend`);
                            }
                            
                            // Close modal but keep transform for next time
                            setCalibrateModal(false);
                            // Don't reset transform - keep current values for next time
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
      <FolderBrowserModal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        loadingFolders={loadingFolders}
        availableFolders={availableFolders}
        onLoadSession={loadSessionImages}
      />

      {/* No Images Modal */}
      {showNoImagesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4">
            <div className="text-center">
              <div className="text-2xl mb-4">📷</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Images Required</h3>
              <p className="text-gray-600 mb-6">
                You need to capture camera images before you can mark this task as pass or fail. 
                The snapshot configuration will open automatically.
              </p>
              <div className="flex justify-center">
                <Button
                  onClick={() => {
                    setShowNoImagesModal(false);
                    setShowSnapshotModal(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Open Snapshot Config
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Analysis Results Modal */}
      {showDarkImageModal && darkImageDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
            <div className="text-center">
              <div className="text-3xl mb-2">
                {darkImageDetails!.darkCount > 0 ? '⚠️' : darkImageDetails!.totalImages !== 8 ? '⚠️' : '✅'}
              </div>
              <h2 className={`text-lg font-bold mb-3 ${
                darkImageDetails!.darkCount > 0 || darkImageDetails!.totalImages !== 8 
                  ? 'text-red-600' 
                  : 'text-green-600'
              }`}>
                Image Analysis
              </h2>
              
              <div className="text-left mb-4">
                <p className="text-gray-700 mb-3 text-sm">
                  Images: {darkImageDetails!.totalImages}/8 • Dark: {darkImageDetails!.darkCount}
                </p>
                
                {darkImageDetails!.analysisResults && (
                  <div className="bg-gray-50 rounded p-3 mb-3">
                    <div className="grid grid-cols-4 gap-1 text-xs">
                      {darkImageDetails!.analysisResults!.map((result, index) => (
                        <div key={index} className={`p-1 rounded text-center ${
                          result.isDark ? 'bg-red-100' : 'bg-green-100'
                        }`}>
                          <div className="font-medium text-xs">{result.cameraName}</div>
                          <div className={`text-xs ${result.isDark ? 'text-red-600' : 'text-green-600'}`}>
                            {Math.round(result.brightness)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2 justify-center">
                {(darkImageDetails!.darkCount > 0 || darkImageDetails!.totalImages !== 8) && (
                  <Button
                    onClick={deleteSessionFolder}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm"
                  >
                    Delete & Retry
                  </Button>
                )}
                <Button
                  onClick={() => setShowDarkImageModal(false)}
                  variant="outline"
                  className="px-4 py-2 text-sm"
                >
                  {darkImageDetails!.darkCount > 0 || darkImageDetails!.totalImages !== 8 ? 'Keep' : 'Continue'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Description Modal */}
      {showTaskDescriptionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-[600px] max-w-[90vw] max-h-[80vh] overflow-y-auto mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Task Description</h2>
              <button
                onClick={() => setShowTaskDescriptionModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">{items[idx].title}</h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{items[idx].detail}</p>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowTaskDescriptionModal(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Close
              </button>
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
  onPanUpdate,
  big,
  showLogs,
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
    onPanUpdate?: (deltaX: number, deltaY: number) => void;
    big?: boolean;
    showLogs?: boolean;
    items: TIItem[];
    idx: number;
    validatedBoxes: Record<string, Set<string>>;
    handleValidationBoxClick: (boxId: string) => void;
    isCreatingValidationBox: boolean;
    validationBoxCreation: { id: string; label: string; description: string; startX?: number; startY?: number; currentX?: number; currentY?: number; startNormalizedX?: number; startNormalizedY?: number; currentNormalizedX?: number; currentNormalizedY?: number; cameraId?: number; imageWidth?: number; imageHeight?: number; } | null;
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

  // Touch state for pinch-to-zoom and panning
  const [touchState, setTouchState] = useState<{
    initialDistance?: number;
    initialZoom?: number;
    centerX?: number;
    centerY?: number;
    isPanning?: boolean;
    lastX?: number;
    lastY?: number;
  }>({});

  // Touch handling for mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Single touch - prepare for pan (only if zoomed in)
      if (cam.zoom > 1) {
        const touch = e.touches[0];
        setTouchState({
          isPanning: true,
          lastX: touch.clientX,
          lastY: touch.clientY
        });
      }
    } else if (e.touches.length === 2) {
      // Two touches - prepare for pinch-to-zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      
      setTouchState({
        initialDistance: distance,
        initialZoom: cam.zoom,
        centerX,
        centerY,
        isPanning: false // Stop panning when pinching starts
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling
    
    if (e.touches.length === 2 && touchState.initialDistance && touchState.initialZoom) {
      // Pinch to zoom with proper distance tracking
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      // Calculate zoom factor based on distance change
      const zoomFactor = currentDistance / touchState.initialDistance;
      const newZoom = clamp(touchState.initialZoom * zoomFactor, 0.1, 10);
      
      // Get center point for zooming
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      
      // Convert to container coordinates and apply zoom
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) {
        // Apply zoom with rect and factor (matching onPinch signature)
        onPinch(rect, newZoom / cam.zoom);
      }
    } else if (e.touches.length === 1 && touchState.isPanning && touchState.lastX !== undefined && touchState.lastY !== undefined) {
      // Single finger pan - calculate movement delta
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchState.lastX;
      const deltaY = touch.clientY - touchState.lastY;
      
      // Apply pan movement via callback
      onPanUpdate?.(deltaX, deltaY);
      
      // Update last position for next move
      setTouchState(prev => ({
        ...prev,
        lastX: touch.clientX,
        lastY: touch.clientY
      }));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      // Reset all touch state when no touches remain
      setTouchState({});
    } else if (e.touches.length < 2) {
      // Reset pinch state but keep panning if one finger remains
      setTouchState(prev => ({
        isPanning: prev.isPanning,
        lastX: prev.lastX,
        lastY: prev.lastY
      }));
    }
  };

  return (
    <div
      ref={rootRef}
      className={`relative w-full ${big ? "aspect-[16/9] md:aspect-[16/9]" : "aspect-[16/9]"} bg-black overflow-hidden`}
      onWheel={onWheel}
      onMouseDown={onDragStart}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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
            validationBoxes={items[idx]?.validationBoxes?.[cam.name] || []}
            validatedBoxIds={validatedBoxes[items[idx]?.id] || new Set()}
            onBoxClick={handleValidationBoxClick}
            showValidationBoxes={true}
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
      <div className="absolute top-1 left-1 bg-black/60 text-white px-1 py-0.5 rounded text-xs font-medium">
        {cam.name}
      </div>

      
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
// Calculate actual image draw dimensions (matches canvas rendering logic)
function calculateImageDrawDimensions(
  imageWidth: number, 
  imageHeight: number, 
  containerWidth: number, 
  containerHeight: number
) {
  const containerAspect = containerWidth / containerHeight;
  const imageAspect = imageWidth / imageHeight;
  
  let result;
  if (imageAspect > containerAspect) {
    // Image is wider - fit to width
    result = {
      drawWidth: containerWidth,
      drawHeight: containerWidth / imageAspect
    };
  } else {
    // Image is taller - fit to height
    result = {
      drawWidth: containerHeight * imageAspect,
      drawHeight: containerHeight
    };
  }
  
  console.log(`[Debug] calculateImageDrawDimensions: image=${imageWidth}x${imageHeight}, container=${containerWidth}x${containerHeight}, draw=${result.drawWidth}x${result.drawHeight}`);
  return result;
}


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
  validationBoxCreation?: { id: string; label: string; description: string; startX?: number; startY?: number; currentX?: number; currentY?: number; startNormalizedX?: number; startNormalizedY?: number; currentNormalizedX?: number; currentNormalizedY?: number; cameraId?: number; imageWidth?: number; imageHeight?: number; } | null;
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
    
    // Debug camera transform values on all devices
    if (process.env.NODE_ENV === 'development') {
      console.log('🎯 Camera Transform Check:', {
        cameraId,
        transform,
        hasTransform: !!transform,
        transformCondition: transform && (transform.x !== 0 || transform.y !== 0 || transform.scale !== 1 || transform.rotation !== 0 || transform.flipped),
        userAgent: navigator.userAgent,
        isIPad: /iPad|iPhone|iPod/.test(navigator.userAgent)
      });
    }
    
    // Apply camera transform if provided  
    if (transform && (transform.x !== 0 || transform.y !== 0 || transform.scale !== 1 || transform.rotation !== 0 || transform.flipped)) {
      // Calculate transformed dimensions and position
      const transformedWidth = scaledWidth * transform.scale;
      const transformedHeight = scaledHeight * transform.scale;
      
      // Calculate the center point of the image
      const imageCenterX = finalX + scaledWidth / 2;
      const imageCenterY = finalY + scaledHeight / 2;
      
      // Apply position offset using image-relative scaling for device independence
      // Scale transforms relative to image size, not viewport size, for consistent alignment
      const baseReference = 1000; // Normalized reference for consistent scaling
      const currentImageSize = Math.min(scaledWidth, scaledHeight);
      
      // Calculate scale factor based on actual drawn image size for consistency
      const scaleFactorForTranslate = calculateTransformScaleFactor(drawWidth, drawHeight);
      // Apply transforms with bounds checking to prevent extreme offsets
      const maxOffset = Math.max(rect.width, rect.height) * 0.5; // Max 50% of container size
      const clampedOffsetX = clamp(transform.x * scaleFactorForTranslate, -maxOffset, maxOffset);
      const clampedOffsetY = clamp(transform.y * scaleFactorForTranslate, -maxOffset, maxOffset);
      
      const transformedCenterX = imageCenterX + clampedOffsetX;
      const transformedCenterY = imageCenterY + clampedOffsetY;
      
      // Debug output for camera transform alignment (remove in production)
      if (process.env.NODE_ENV === 'development') {
        const debugInfo = {
          cameraId,
          device: /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'iPad/iOS' : 'Desktop',
          viewport: `${rect.width}x${rect.height}`,
          orientation: rect.width > rect.height ? 'landscape' : 'portrait',
          drawSize: { width: drawWidth.toFixed(0), height: drawHeight.toFixed(0) },
          scaledSize: { width: scaledWidth.toFixed(0), height: scaledHeight.toFixed(0) },
          scaleMode: 'DYNAMIC_BASED_ON_DRAW_SIZE',
          scaleFactorForTranslate: scaleFactorForTranslate.toFixed(3),
          transform,
          calculatedOffset: { 
            x: (transform.x * scaleFactorForTranslate).toFixed(1), 
            y: (transform.y * scaleFactorForTranslate).toFixed(1) 
          },
          clampedOffset: {
            x: clampedOffsetX.toFixed(1),
            y: clampedOffsetY.toFixed(1)
          },
          maxOffset: maxOffset.toFixed(1),
          transformApplied: true
        };
        console.log('🎯 Camera Transform Applied:', debugInfo);
      }
      
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
        // Get bounding box for validation box
        const boxBounds = { x: box.x, y: box.y, width: box.width, height: box.height };
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
          // Use same calculation as image transforms for consistency
          const scaleFactorForTranslate = calculateTransformScaleFactor(baseDrawWidth, baseDrawHeight);
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
          // For untransformed images - normalize pixel coordinates first, then convert to viewport
          // box.x, box.y are in pixel coordinates, need to normalize by image dimensions
          boxX = finalX + ((box.x / img.width) * scaledWidth);
          boxY = finalY + ((box.y / img.height) * scaledHeight);
          boxWidth = (box.width / img.width) * scaledWidth;
          boxHeight = (box.height / img.height) * scaledHeight;
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
        
        // Draw checkmark for validated boxes only
        if (isValidated) {
          ctx.font = '18px Arial';
          ctx.fillStyle = '#10b981';
          ctx.fillText('✓', boxX + boxWidth - 25, boxY + 25);
        }
        
        // Reset line dash
        ctx.setLineDash([]);
      });
    }

    
    // Draw validation box being created using normalized coordinates (temporarily disabled for compilation)
    if (false && isCreatingValidationBox && (validationBoxCreation as any)?.startNormalizedX !== undefined && (validationBoxCreation as any)?.startNormalizedY !== undefined && (validationBoxCreation as any)?.currentNormalizedX !== undefined && (validationBoxCreation as any)?.currentNormalizedY !== undefined && validationBoxCreation?.cameraId === cameraId) {
      const startNormX = Math.min((validationBoxCreation as any).startNormalizedX, (validationBoxCreation as any).currentNormalizedX);
      const startNormY = Math.min((validationBoxCreation as any).startNormalizedY, (validationBoxCreation as any).currentNormalizedY);
      const endNormX = Math.max((validationBoxCreation as any).startNormalizedX, (validationBoxCreation as any).currentNormalizedX);
      const endNormY = Math.max((validationBoxCreation as any).startNormalizedY, (validationBoxCreation as any).currentNormalizedY);
      
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
        
        // Calculate baseline creation box position using normalized coordinates
        const baselineBoxX = baseFinalX + (startNormX * baseScaledWidth);
        const baselineBoxY = baseFinalY + (startNormY * baseScaledHeight);
        const baselineBoxWidth = (endNormX - startNormX) * baseScaledWidth;
        const baselineBoxHeight = (endNormY - startNormY) * baseScaledHeight;
        
        // Calculate the transform offset
        // Use same calculation as image transforms for consistency
        const scaleFactorForTranslate = calculateTransformScaleFactor(baseDrawWidth, baseDrawHeight);
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
        // For untransformed images - convert normalized coordinates to viewport pixels
        boxX = finalX + (startNormX * scaledWidth);
        boxY = finalY + (startNormY * scaledHeight);
        boxWidth = (endNormX - startNormX) * scaledWidth;
        boxHeight = (endNormY - startNormY) * scaledHeight;
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
  
  // Helper functions for coordinate normalization
  const normalizeCoordinates = useCallback((pixelX: number, pixelY: number, pixelWidth: number, pixelHeight: number, imageWidth: number, imageHeight: number) => {
    return {
      x: pixelX / imageWidth,
      y: pixelY / imageHeight,
      width: pixelWidth / imageWidth,
      height: pixelHeight / imageHeight
    };
  }, []);

  const denormalizeCoordinates = useCallback((normalizedX: number, normalizedY: number, normalizedWidth: number, normalizedHeight: number, imageWidth: number, imageHeight: number) => {
    return {
      x: normalizedX * imageWidth,
      y: normalizedY * imageHeight,
      width: normalizedWidth * imageWidth,
      height: normalizedHeight * imageHeight
    };
  }, []);

  // Helper function to convert mouse coordinates to both pixel and normalized coordinates
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
    
    // Convert to normalized coordinates (0.0 to 1.0)
    const normalizedX = imageX / img.width;
    const normalizedY = imageY / img.height;
    
    return { 
      imageX, imageY, 
      normalizedX, normalizedY,
      mouseX, mouseY, 
      finalX, finalY, 
      scaledWidth, scaledHeight,
      imageWidth: img.width,
      imageHeight: img.height
    };
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
        // Only process rectangle validation boxes for now (default to rectangle for backward compatibility)
        if ((box as any).type && (box as any).type !== 'rectangle') continue;
        
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
          // Use image-relative scaling for device independence (not viewport-relative)
          const scaleFactorForTranslate = Math.min(baseScaledWidth, baseScaledHeight) / 1000;
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
          // For untransformed images - normalize pixel coordinates first, then convert to viewport
          // box.x, box.y are in pixel coordinates, need to normalize by image dimensions
          boxX = finalX + ((box.x / img.width) * scaledWidth);
          boxY = finalY + ((box.y / img.height) * scaledHeight);
          boxWidth = (box.width / img.width) * scaledWidth;
          boxHeight = (box.height / img.height) * scaledHeight;
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
  if (inspectionData) {
    console.assert(tiItems.length === inspectionData?.tasks?.length, `TI has ${inspectionData?.tasks?.length} items`);
  }
  // clampPan tests
  const rp = clampPan({ x: 9999, y: -9999 }, 3, { width: 1000, height: 800 } as any, true);
  console.assert(Math.abs(rp.x) <= (3 - 1) * (1000 / 2) + 1, "clampPan x");
  console.assert(Math.abs(rp.y) <= (3 - 1) * (800 / 2) + 1, "clampPan y");
  console.log("✔ tests ok");
  console.groupEnd();
} catch (e) {
  console.error("✖ test error", e);
}