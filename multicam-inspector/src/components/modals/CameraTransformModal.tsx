import React from 'react';
import { Button } from '../ui/button';
import type { CameraTransform } from '../../types';
import { HANGARS, CAMERA_LAYOUT } from '../../constants';


// Props interface
interface CameraTransformModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedHangarTab: string;
  setSelectedHangarTab: (hangar: string) => void;
  hangarTransforms: { [hangarId: string]: { [cameraId: number]: CameraTransform } };
  setHangarTransforms: (transforms: { [hangarId: string]: { [cameraId: number]: CameraTransform } }) => void;
  onSave: () => void;
}

export const CameraTransformModal: React.FC<CameraTransformModalProps> = ({
  isOpen,
  onClose,
  selectedHangarTab,
  setSelectedHangarTab,
  hangarTransforms,
  setHangarTransforms,
  onSave,
}) => {
  if (!isOpen) return null;

  const handleTransformChange = (
    hangarId: string, 
    cameraIndex: number, 
    field: keyof CameraTransform, 
    value: number
  ) => {
    const newTransforms = { ...hangarTransforms };
    if (!newTransforms[hangarId]) newTransforms[hangarId] = {};
    
    const currentTransform = hangarTransforms[hangarId]?.[cameraIndex] || { x: 0, y: 0, scale: 1, rotation: 0 };
    newTransforms[hangarId][cameraIndex] = {
      ...currentTransform,
      [field]: value
    };
    
    setHangarTransforms(newTransforms);
  };

  return (
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
                              onChange={(e) => handleTransformChange(
                                selectedHangar.id, 
                                camIndex, 
                                'x', 
                                parseFloat(e.target.value) || 0
                              )}
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              className="w-16 text-xs border rounded px-1 py-0.5 text-center"
                              value={transform.y}
                              onChange={(e) => handleTransformChange(
                                selectedHangar.id, 
                                camIndex, 
                                'y', 
                                parseFloat(e.target.value) || 0
                              )}
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              step="0.01"
                              className="w-16 text-xs border rounded px-1 py-0.5 text-center"
                              value={transform.scale}
                              onChange={(e) => handleTransformChange(
                                selectedHangar.id, 
                                camIndex, 
                                'scale', 
                                parseFloat(e.target.value) || 1
                              )}
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              step="0.1"
                              className="w-16 text-xs border rounded px-1 py-0.5 text-center"
                              value={transform.rotation}
                              onChange={(e) => handleTransformChange(
                                selectedHangar.id, 
                                camIndex, 
                                'rotation', 
                                parseFloat(e.target.value) || 0
                              )}
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
            onClick={onClose}
            className="flex-1 text-xs py-1"
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            className="flex-1 text-xs py-1"
          >
            💾 Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CameraTransformModal;