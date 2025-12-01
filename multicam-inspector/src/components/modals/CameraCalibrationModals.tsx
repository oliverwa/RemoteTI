import React from 'react';
import { Button } from '../ui/button';

// Types
interface CameraTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity?: number;
  flipped?: boolean;
}

interface HangarConfig {
  id: string;
  label: string;
  cameraTransforms: { [cameraId: number]: CameraTransform };
}

interface Camera {
  id: string;
  name: string;
  position: string;
}

// Constants
const HANGARS: HangarConfig[] = [
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

const CAMERA_LAYOUT = [
  { id: 0, name: 'RUR' }, { id: 1, name: 'FUR' }, { id: 2, name: 'FUL' }, { id: 3, name: 'RUL' },
  { id: 4, name: 'RDR' }, { id: 5, name: 'FDR' }, { id: 6, name: 'FDL' }, { id: 7, name: 'RDL' }
];

// Props interfaces
interface CameraCalibrationSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  calibrateHangar: string;
  setCalibrateHangar: (hangar: string) => void;
  calibrateCamera: number;
  setCalibrateCamera: (camera: number) => void;
  cameras: Camera[];
  onStartCalibration: () => void;
}

interface CameraCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  calibrateHangar: string;
  calibrateCamera: number;
  cameras: Camera[];
  loadingImages: boolean;
  molndalImage: string;
  hangarImage: string;
  calibrationTransform: CameraTransform;
  setCalibrationTransform: (transform: CameraTransform) => void;
  onSave: () => void;
}

// Camera Calibration Selection Modal
export const CameraCalibrationSelectionModal: React.FC<CameraCalibrationSelectionModalProps> = ({
  isOpen,
  onClose,
  calibrateHangar,
  setCalibrateHangar,
  calibrateCamera,
  setCalibrateCamera,
  cameras,
  onStartCalibration,
}) => {
  if (!isOpen) return null;

  return (
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
              {cameras.map((camera, index) => (
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
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={onStartCalibration}
            disabled={!calibrateHangar}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Start Calibration
          </Button>
        </div>
      </div>
    </div>
  );
};

// Main Camera Calibration Modal
export const CameraCalibrationModal: React.FC<CameraCalibrationModalProps> = ({
  isOpen,
  onClose,
  calibrateHangar,
  calibrateCamera,
  cameras,
  loadingImages,
  molndalImage,
  hangarImage,
  calibrationTransform,
  setCalibrationTransform,
  onSave,
}) => {
  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const startTransformX = calibrationTransform.x;
    const startTransformY = calibrationTransform.y;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      setCalibrationTransform({
        ...calibrationTransform,
        x: startTransformX + deltaX,
        y: startTransformY + deltaY
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const selectedHangar = HANGARS.find(h => h.id === calibrateHangar);
  const selectedCamera = cameras[calibrateCamera];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-4 w-[1100px] max-w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-2">
          🎯 Camera Calibration - {selectedCamera?.name || 'Camera'} in {selectedHangar?.label || 'Hangar'}
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Align the {selectedHangar?.label || 'hangar'} image with the Mölndal baseline. Drag to pan or use controls.
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
              {/* Image Comparison */}
              <div className="col-span-3">
                <div 
                  className="relative bg-black rounded overflow-hidden border-2 border-gray-300" 
                  style={{ height: '500px' }}
                  onMouseDown={handleMouseDown}
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
                  
                  {/* Current layer - Colored overlay */}
                  <div 
                    className="absolute inset-0 cursor-move"
                    style={{
                      transform: `translate(${calibrationTransform.x}px, ${calibrationTransform.y}px) scale(${calibrationTransform.flipped ? -1 : 1}, 1) scale(${calibrationTransform.scale}) rotate(${calibrationTransform.rotation}deg)`,
                      transformOrigin: '50% 50%',
                      opacity: (calibrationTransform.opacity || 70) / 100
                    }}
                  >
                    <img 
                      src={hangarImage} 
                      alt="Hangar image to align" 
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
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">🔍 Opacity</label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={calibrationTransform.opacity || 70}
                      className="w-full"
                      onChange={(e) => setCalibrationTransform({
                        ...calibrationTransform,
                        opacity: parseInt(e.target.value)
                      })}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium mb-1">📐 Scale</label>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.01"
                      value={calibrationTransform.scale}
                      className="w-full"
                      onChange={(e) => setCalibrationTransform({
                        ...calibrationTransform,
                        scale: parseFloat(e.target.value)
                      })}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium mb-1">🔄 Rotation</label>
                    <input
                      type="range"
                      min="-10"
                      max="10"
                      step="0.1"
                      value={calibrationTransform.rotation}
                      className="w-full"
                      onChange={(e) => setCalibrationTransform({
                        ...calibrationTransform,
                        rotation: parseFloat(e.target.value)
                      })}
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="w-full text-xs py-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={onSave}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-xs py-1"
                  >
                    💾 Save Calibration
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">No images available for calibration</p>
          </div>
        )}
      </div>
    </div>
  );
};

export { CameraCalibrationSelectionModal as default };