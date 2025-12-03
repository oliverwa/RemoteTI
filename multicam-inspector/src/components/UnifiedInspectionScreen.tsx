import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { HANGARS, DRONE_OPTIONS } from '../constants';

interface InspectionType {
  file: string;
  type: string;
  name: string;
  description: string;
  mode: 'remote' | 'onsite';
  taskCount: number;
}

interface UnifiedInspectionScreenProps {
  currentUser: string;
  onStartInspection: (action: 'capture' | 'load' | 'browse', inspectionType: string, hangar: string, drone: string) => void;
  onLogout: () => void;
}

const UnifiedInspectionScreen: React.FC<UnifiedInspectionScreenProps> = ({ 
  currentUser,
  onStartInspection,
  onLogout 
}) => {
  const [inspectionTypes, setInspectionTypes] = useState<InspectionType[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<string>('');
  const [selectedHangar, setSelectedHangar] = useState<string>('');
  const [selectedDrone, setSelectedDrone] = useState<string>('');
  const [isEditingDrone, setIsEditingDrone] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch available inspection types
  useEffect(() => {
    setLoading(true);
    const apiUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:3001/api/inspection-types'
      : `http://172.20.1.93:3001/api/inspection-types`;
    
    fetch(apiUrl)
      .then(res => res.json())
      .then(data => {
        // Sort inspection types in desired order
        const sortOrder = ['remote', 'onsite', 'extended', 'service'];
        const sortedData = data.sort((a: InspectionType, b: InspectionType) => {
          const aIndex = sortOrder.indexOf(a.type);
          const bIndex = sortOrder.indexOf(b.type);
          return aIndex - bIndex;
        });
        
        setInspectionTypes(sortedData);
        // Auto-select first inspection (Remote)
        if (sortedData.length > 0) {
          setSelectedInspection(sortedData[0].file);
        }
      })
      .catch(err => console.error('Failed to fetch inspection types:', err))
      .finally(() => setLoading(false));
  }, []);

  // Auto-select drone when hangar changes
  useEffect(() => {
    const hangar = HANGARS.find(h => h.id === selectedHangar);
    if (hangar?.assignedDrone) {
      setSelectedDrone(hangar.assignedDrone);
      setIsEditingDrone(false);
    }
  }, [selectedHangar]);

  const handleCaptureSnapshot = () => {
    if (selectedInspection && selectedHangar && selectedDrone) {
      onStartInspection('capture', selectedInspection, selectedHangar, selectedDrone);
    }
  };

  const handleLoadLatest = () => {
    if (selectedInspection && selectedHangar && selectedDrone) {
      onStartInspection('load', selectedInspection, selectedHangar, selectedDrone);
    }
  };

  const handleBrowseHistory = () => {
    if (selectedInspection && selectedHangar && selectedDrone) {
      onStartInspection('browse', selectedInspection, selectedHangar, selectedDrone);
    }
  };

  const selectedHangarObj = HANGARS.find(h => h.id === selectedHangar);
  const assignedDroneName = selectedHangarObj?.assignedDrone 
    ? DRONE_OPTIONS.find(d => d.id === selectedHangarObj.assignedDrone)?.label 
    : null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-4">
        <h1 className="text-lg font-bold text-center text-gray-900 mb-4">
          Inspection Configuration
        </h1>

        <div className="space-y-5">
          {/* Inspection Type Selection */}
          <div className="bg-gray-50 rounded-lg p-3">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              Select Inspection Type
            </label>
            {loading ? (
              <div className="text-center py-4 text-gray-500">Loading inspection types...</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {inspectionTypes.map((inspection) => (
                  <button
                    key={inspection.file}
                    onClick={() => setSelectedInspection(inspection.file)}
                    className={`p-2 rounded-lg border-2 text-left transition-all ${
                      selectedInspection === inspection.file
                        ? inspection.mode === 'remote' 
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="text-sm font-medium">{inspection.name.replace(' TI Inspection', '')}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {inspection.taskCount} tasks
                    </div>
                    <div className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block ${
                      inspection.mode === 'remote' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {inspection.mode === 'remote' ? 'Remote' : 'Onsite'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hangar Selection */}
          <div className="bg-gray-50 rounded-lg p-3">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              Select Hangar
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {HANGARS.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setSelectedHangar(h.id)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedHangar === h.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{h.label}</div>
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
          <div className="bg-gray-50 rounded-lg p-3">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              Drone Assignment
            </label>
            {selectedHangarObj?.assignedDrone && !isEditingDrone ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
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
                <button
                  onClick={() => setIsEditingDrone(true)}
                  className="px-2 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Change
                </button>
              </div>
            ) : !selectedHangar ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Select a hangar first</span>
                  </div>
                </div>
              </div>
            ) : isEditingDrone ? (
              <div>
                <select
                  value={selectedDrone}
                  onChange={(e) => setSelectedDrone(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a drone...</option>
                  {DRONE_OPTIONS.map((drone) => (
                    <option key={drone.id} value={drone.id}>{drone.label}</option>
                  ))}
                </select>
                {selectedHangarObj?.assignedDrone && (
                  <button
                    onClick={() => {
                      if (selectedHangarObj.assignedDrone) {
                        setSelectedDrone(selectedHangarObj.assignedDrone);
                        setIsEditingDrone(false);
                      }
                    }}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                  >
                    Use assigned drone ({assignedDroneName})
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">No drone assigned</span>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditingDrone(true)}
                  className="px-2 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Select
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2">
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              Actions
            </label>
            
            {/* Primary Action */}
            <Button 
              onClick={handleCaptureSnapshot}
              disabled={!selectedInspection || !selectedHangar || !selectedDrone}
              className="w-full mb-3 py-4 text-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500"
            >
              Start Inspection
            </Button>

            {/* Secondary Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleLoadLatest}
                disabled={!selectedInspection || !selectedHangar || !selectedDrone}
                className="py-2.5 px-4 rounded-lg border-2 border-gray-300 hover:bg-gray-50 transition-all text-base font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Load Latest
              </button>
              <button
                onClick={handleBrowseHistory}
                disabled={!selectedInspection || !selectedHangar || !selectedDrone}
                className="py-2.5 px-4 rounded-lg border-2 border-gray-300 hover:bg-gray-50 transition-all text-base font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Browse History
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifiedInspectionScreen;