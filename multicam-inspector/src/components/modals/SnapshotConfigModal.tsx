import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { HANGARS, DRONE_OPTIONS } from '../../constants';


// Props interface
interface SnapshotConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshotHangar: string;
  setSnapshotHangar: (hangar: string) => void;
  snapshotDrone: string;
  setSnapshotDrone: (drone: string) => void;
  onExecuteSnapshot: () => void;
  onLoadLatest: () => void;
  onBrowseFolders: () => void;
}

export const SnapshotConfigModal: React.FC<SnapshotConfigModalProps> = ({
  isOpen,
  onClose,
  snapshotHangar,
  setSnapshotHangar,
  snapshotDrone,
  setSnapshotDrone,
  onExecuteSnapshot,
  onLoadLatest,
  onBrowseFolders,
}) => {
  const [isEditingDrone, setIsEditingDrone] = useState(false);

  // Auto-select drone when hangar changes
  useEffect(() => {
    const selectedHangar = HANGARS.find(h => h.id === snapshotHangar);
    if (selectedHangar?.assignedDrone) {
      setSnapshotDrone(selectedHangar.assignedDrone);
      setIsEditingDrone(false);
    }
  }, [snapshotHangar, setSnapshotDrone]);

  if (!isOpen) return null;

  const selectedHangar = HANGARS.find(h => h.id === snapshotHangar);
  const assignedDroneName = selectedHangar?.assignedDrone 
    ? DRONE_OPTIONS.find(d => d.id === selectedHangar.assignedDrone)?.label 
    : null;

  const handleLoadLatest = (e: React.MouseEvent) => {
    e.stopPropagation();
    onLoadLatest();
  };

  const handleBrowseFolders = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBrowseFolders();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl p-8 w-full max-w-2xl">
        <h2 className="text-2xl font-semibold mb-6 text-center">Snapshot Configuration</h2>
        
        <div className="space-y-6">
          {/* Hangar Selection */}
          <div>
            <label className="block text-base font-medium mb-3">Select Hangar</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {HANGARS.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setSnapshotHangar(h.id)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    snapshotHangar === h.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium text-lg">{h.label}</div>
                  {h.assignedDrone && (
                    <div className="text-sm text-gray-600 mt-1">
                      Drone: {DRONE_OPTIONS.find(d => d.id === h.assignedDrone)?.label || h.assignedDrone}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
          
          {/* Drone Display/Selection */}
          <div>
            <label className="block text-base font-medium mb-3">Drone Assignment</label>
            {selectedHangar?.assignedDrone && !isEditingDrone ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{assignedDroneName}</span>
                    <span className="text-sm text-gray-500">(Auto-selected)</span>
                  </div>
                  <div className="text-green-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setIsEditingDrone(true)}
                  className="px-4 py-2"
                >
                  Change
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <select 
                  className="flex-1 border-2 rounded-lg px-4 py-2 text-base" 
                  value={snapshotDrone} 
                  onChange={(e) => setSnapshotDrone(e.target.value)}
                >
                  {DRONE_OPTIONS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {isEditingDrone && selectedHangar?.assignedDrone && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSnapshotDrone(selectedHangar.assignedDrone!);
                      setIsEditingDrone(false);
                    }}
                    className="px-4 py-2"
                  >
                    Reset
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Action Section */}
        <div className="mt-8 border-t pt-6">
          <div className="space-y-4">
            {/* Primary Action */}
            <Button 
              onClick={onExecuteSnapshot}
              className="w-full py-4 text-lg font-medium bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!snapshotHangar || !snapshotDrone.trim()}
            >
              Capture New Snapshot
            </Button>

            {/* Secondary Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleLoadLatest}
                className="flex-1 py-2 px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all text-sm font-medium text-gray-700"
              >
                Load Latest
              </button>
              <button
                onClick={handleBrowseFolders}
                className="flex-1 py-2 px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all text-sm font-medium text-gray-700"
              >
                Browse Snapshots
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all text-sm font-medium text-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SnapshotConfigModal;