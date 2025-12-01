import React from 'react';
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
  if (!isOpen) return null;

  return (
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
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={onExecuteSnapshot}
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
              onClick={onLoadLatest}
              className="flex-1 bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
            >
              🔄 Latest
            </Button>
            <Button 
              variant="outline"
              onClick={onBrowseFolders}
              className="flex-1 bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
            >
              📁 Browse
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SnapshotConfigModal;