import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { HangarConfig } from '../types';
import { API_CONFIG } from '../config/api.config';
import FolderBrowserModal from './modals/FolderBrowserModal';

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
  onStartInspection: (action: 'capture' | 'load' | 'browse' | 'load-session', inspectionType: string, hangar: string, drone: string) => void;
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
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<any[]>([]);
  const [hangars, setHangars] = useState<HangarConfig[]>([]);
  const [drones, setDrones] = useState<any[]>([]);

  // Fetch hangars from API (no auth required for read)
  useEffect(() => {
    fetch(`${API_CONFIG.BASE_URL}/api/hangars`)
        .then(res => res.json())
        .then(data => {
          // The API returns {success: true, hangars: [...]}
          console.log('Raw hangars API response:', data);
          console.log('Full response keys:', Object.keys(data));
          
          if (data.success && data.hangars) {
            console.log('Setting hangars from success response:', data.hangars);
            console.log('First hangar full object:', JSON.stringify(data.hangars[0], null, 2));
            setHangars(data.hangars);
          } else if (data.hangars) {
            console.log('Setting hangars from direct property:', data.hangars);
            console.log('First hangar full object:', JSON.stringify(data.hangars[0], null, 2));
            setHangars(data.hangars);
          } else if (Array.isArray(data)) {
            console.log('Data is array directly:', data);
            setHangars(data);
          } else {
            console.warn('Unexpected hangars response format:', data);
            setHangars([]);
          }
        })
        .catch(err => {
          console.error('Failed to fetch hangars:', err);
          // Don't fall back to constants - show empty list
          setHangars([]);
        });
  }, []);

  // Fetch drones from API (no auth required for read)
  useEffect(() => {
    console.log('Fetching drones from:', `${API_CONFIG.BASE_URL}/api/drones`);
    fetch(`${API_CONFIG.BASE_URL}/api/drones`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          console.log('Drones API response:', data);
          if (data.success && data.drones) {
            setDrones(data.drones);
            console.log('Drones loaded:', data.drones.length, data.drones);
          } else if (data.drones) {
            setDrones(data.drones);
            console.log('Drones loaded (alt format):', data.drones.length, data.drones);
          } else {
            console.error('No drones in response');
          }
        })
        .catch(err => console.error('Failed to fetch drones:', err));
  }, []);

  // Fetch available inspection types
  useEffect(() => {
    setLoading(true);
    // Always use Pi backend for consistency, add cache busting
    const apiUrl = `${API_CONFIG.BASE_URL}/api/inspection-types?t=${Date.now()}`;
    
    fetch(apiUrl, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    })
      .then(res => res.json())
      .then(data => {
        console.log('Fetched inspection types:', data);
        // Sort inspection types in desired order
        const sortOrder = ['remote', 'onsite', 'extended', 'service', 'basic'];
        const sortedData = data.sort((a: InspectionType, b: InspectionType) => {
          const aIndex = sortOrder.indexOf(a.type);
          const bIndex = sortOrder.indexOf(b.type);
          return aIndex - bIndex;
        });
        
        console.log('Sorted inspection types:', sortedData);
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
    const hangar = hangars.find(h => h.id === selectedHangar);
    if (hangar?.assignedDrone) {
      setSelectedDrone(hangar.assignedDrone);
      setIsEditingDrone(false);
    }
  }, [selectedHangar, hangars]);

  const handleCaptureSnapshot = () => {
    if (selectedInspection && selectedHangar && selectedDrone) {
      onStartInspection('capture', selectedInspection, selectedHangar, selectedDrone);
    }
  };

  const handleLoadLatest = async () => {
    // Find the most recent inspection across all hangars
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/folders`);
      if (response.ok) {
        const data = await response.json();
        
        // Collect all sessions from all hangars with their timestamps
        let allSessions: any[] = [];
        
        if (data.hangars) {
          data.hangars.forEach((hangar: any) => {
            hangar.sessions.forEach((session: any) => {
              allSessions.push({
                ...session,
                hangarId: hangar.id,
                hangarName: hangar.name,
                timestamp: new Date(session.created).getTime()
              });
            });
          });
        }
        
        // Sort by timestamp to find the most recent
        allSessions.sort((a, b) => b.timestamp - a.timestamp);
        
        if (allSessions.length > 0) {
          const latestSession = allSessions[0];
          console.log('Loading latest session:', latestSession.name, 'from', latestSession.hangarName);
          
          // Detect inspection type from session name
          const nameLower = latestSession.name.toLowerCase();
          const firstPart = latestSession.name.split('_')[0].toLowerCase();
          let inspectionType = 'remote-ti-inspection';
          
          // Check for new remote inspection types first
          if (nameLower.startsWith('initial_remote_')) {
            inspectionType = 'initial-remote-ti-inspection';
          } else if (nameLower.startsWith('full_remote_')) {
            inspectionType = 'full-remote-ti-inspection';
          } else if (firstPart === 'remote' || nameLower.startsWith('remote_')) {
            inspectionType = 'remote-ti-inspection';
          } else if (firstPart === 'onsite' || nameLower.startsWith('onsite_')) {
            inspectionType = 'onsite-ti-inspection';
          } else if (firstPart === 'extended' || nameLower.startsWith('extended_')) {
            inspectionType = 'extended-ti-inspection';
          } else if (firstPart === 'service' || nameLower.startsWith('service_')) {
            inspectionType = 'service-ti-inspection';
          } else if (firstPart === 'basic' || nameLower.startsWith('basic_')) {
            inspectionType = 'service-partner-inspection';
          } else if (firstPart === 'service' || nameLower.startsWith('service_partner')) {
            inspectionType = 'service-partner-inspection';
          }
          
          // Load the session using the same mechanism as browse
          const sessionData = `${latestSession.hangarId}|${latestSession.name}`;
          onStartInspection('load-session', inspectionType, sessionData, 'session');
        } else {
          console.log('No sessions found');
          alert('No inspection sessions found');
        }
      }
    } catch (error) {
      console.error('Failed to load latest session:', error);
      alert('Failed to load latest session');
    }
  };

  const handleBrowseHistory = async () => {
    // Open the folder browser directly here
    setLoadingFolders(true);
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/folders`);
      if (response.ok) {
        const data = await response.json();
        console.log('Loaded folders data:', data);
        // Pass the entire response object which includes both hangars and categorized
        setAvailableFolders(data);
      } else {
        console.error('Failed to fetch folders, status:', response.status);
        setAvailableFolders([]);
      }
    } catch (error) {
      console.error('Failed to load folders:', error);
      setAvailableFolders([]);
    } finally {
      setLoadingFolders(false);
    }
    setShowFolderModal(true);
  };

  const handleLoadSession = (hangarId: string, sessionName: string, images: any[]) => {
    // When a session is selected from browser, determine inspection type from session name
    setShowFolderModal(false);
    
    // Detect inspection type from session name
    const nameLower = sessionName.toLowerCase();
    const firstPart = sessionName.split('_')[0].toLowerCase();
    let inspectionType = 'remote-ti-inspection'; // default
    
    // Check for new remote inspection types first
    if (nameLower.startsWith('initial_remote_')) {
      inspectionType = 'initial-remote-ti-inspection';
    } else if (nameLower.startsWith('full_remote_')) {
      inspectionType = 'full-remote-ti-inspection';
    } else if (firstPart === 'remote' || nameLower.startsWith('remote_')) {
      inspectionType = 'remote-ti-inspection';
    } else if (firstPart === 'onsite' || nameLower.startsWith('onsite_')) {
      inspectionType = 'onsite-ti-inspection';
    } else if (firstPart === 'extended' || nameLower.startsWith('extended_')) {
      inspectionType = 'extended-ti-inspection';
    } else if (firstPart === 'service' || nameLower.startsWith('service_')) {
      inspectionType = 'service-ti-inspection';
    } else if (firstPart === 'basic' || nameLower.startsWith('basic_')) {
      inspectionType = 'service-partner-inspection';
    }
    
    // Pass session data as part of the hangar parameter (will be parsed in the inspector components)
    const sessionData = `${hangarId}|${sessionName}`;
    onStartInspection('load-session', inspectionType, sessionData, 'session');
  };

  const selectedHangarObj = hangars.find(h => h.id === selectedHangar);
  const assignedDroneName = selectedHangarObj?.assignedDrone 
    ? drones.find((d: any) => d.id === selectedHangarObj.assignedDrone)?.label 
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
        <h1 className="text-lg font-bold text-center text-gray-900 dark:text-gray-200 mb-4">
          Inspection Configuration
        </h1>

        <div className="space-y-5">
          {/* Inspection Type Selection */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-300 mb-2">
              Select Inspection Type
            </label>
            {loading ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400 dark:text-gray-400">Loading inspection types...</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {inspectionTypes.map((inspection) => (
                  <button
                    key={inspection.file}
                    onClick={() => setSelectedInspection(inspection.file)}
                    className={`p-2 rounded-lg border-2 text-left transition-all ${
                      selectedInspection === inspection.file
                        ? inspection.mode === 'remote' 
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                          : 'border-green-500 bg-green-50 dark:bg-green-900/30 dark:border-green-400'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="text-sm font-medium">{inspection.name.replace(' TI Inspection', '')}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-400 mt-1">
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
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-300 mb-2">
              Select Hangar
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {hangars.map((h) => {
                console.log(`Rendering hangar ${h.label}: assignedDrone = ${h.assignedDrone}, drones loaded = ${drones.length}`);
                return (
                <button
                  key={h.id}
                  onClick={() => setSelectedHangar(h.id)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedHangar === h.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium">{h.label}</div>
                  {h.assignedDrone && (
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Drone: {drones.find((d: any) => d.id === h.assignedDrone)?.label || h.assignedDrone}
                    </div>
                  )}
                  {!h.assignedDrone && (
                    <div className="text-sm text-gray-400 dark:text-gray-500 dark:text-gray-400 mt-1 italic">
                      No drone assigned
                    </div>
                  )}
                </button>
              )})}
            </div>
          </div>
          
          {/* Drone Display/Selection */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-300 mb-2">
              Drone Assignment
            </label>
            {selectedHangarObj?.assignedDrone && !isEditingDrone ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{assignedDroneName}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">(Auto-selected)</span>
                  </div>
                  <div className="text-green-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditingDrone(true)}
                  className="px-2 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Change
                </button>
              </div>
            ) : !selectedHangar ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Select a hangar first</span>
                  </div>
                </div>
              </div>
            ) : isEditingDrone ? (
              <div>
                <select
                  value={selectedDrone}
                  onChange={(e) => setSelectedDrone(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200"
                >
                  <option value="">Select a drone...</option>
                  {drones.map((drone: any) => (
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
                <div className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 dark:text-gray-400">No drone assigned</span>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditingDrone(true)}
                  className="px-2 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Select
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2">
            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-300 mb-2">
              Actions
            </label>
            
            {/* Primary Action */}
            <Button 
              onClick={handleCaptureSnapshot}
              disabled={!selectedInspection || !selectedHangar || !selectedDrone}
              className="w-full mb-3 py-4 text-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 dark:text-gray-400"
            >
              {selectedInspection === 'remote-ti-inspection' 
                ? 'Start Remote Inspection' 
                : 'Start Inspection'}
            </Button>

            {/* Secondary Actions - Always Accessible */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleLoadLatest}
                className="py-2 px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Load Latest
              </button>
              <button
                onClick={handleBrowseHistory}
                className="py-2 px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Browse History
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Folder Browser Modal */}
      <FolderBrowserModal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        loadingFolders={loadingFolders}
        availableFolders={availableFolders}
        onLoadSession={handleLoadSession}
      />
    </div>
  );
};

export default UnifiedInspectionScreen;