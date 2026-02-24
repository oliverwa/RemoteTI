import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { getRelativeTime, formatDateTime } from '../../utils/timeFormatting';
import { API_CONFIG } from '../../config/api.config';

// Types
interface Session {
  id: string;
  name: string;
  imageCount: number;
  created: string;
  images: any[];
  hasInspection?: boolean;
  inspectionType?: string | null;
  inspectionStatus?: string | null;
  inspectionDetailedStatus?: 'passed' | 'failed' | 'partial' | 'pending' | null;
  inspectionCategory?: string;
  hangarId?: string;
  hangarName?: string;
  inspectionProgress?: {
    completed: number;
    total: number;
    percentage: number;
  } | null;
}

interface HangarData {
  id: string;
  name: string;
  sessions: Session[];
}

// Props interface
interface FolderBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  loadingFolders: boolean;
  availableFolders: HangarData[] | { hangars: HangarData[] };
  onLoadSession: (hangarId: string, sessionName: string, images: any[]) => void;
}

// Global variable to store fetched drone list
let knownDrones: string[] = [];

const formatSessionName = (name: string): string => {
  // Try multiple patterns to extract drone name
  // New naming convention: type_hangar_drone_date_time
  // Old naming convention: type_drone_date_time or type_hangar_date_time
  const patterns = [
    // New patterns with both hangar and drone
    /initial_remote_[a-zA-Z]+_([a-zA-Z0-9]+)_\d{6}_\d{6}/,
    /full_remote_ti_[a-zA-Z]+_([a-zA-Z0-9]+)_\d{6}_\d{6}/,
    /onsite_ti_[a-zA-Z]+_([a-zA-Z0-9]+)_\d{6}_\d{6}/,
    /service_partner_[a-zA-Z]+_([a-zA-Z0-9]+)_\d{6}_\d{6}/,
    // Old patterns
    /initial_remote_([a-zA-Z0-9]+)_\d{6}_\d{6}/,
    /full_remote_ti_([a-zA-Z0-9]+)_\d{6}_\d{6}/,
    /onsite_ti_([a-zA-Z0-9]+)_\d{6}_\d{6}/,
    /onsite_([a-zA-Z0-9]+)_\d{6}_\d{6}/,
    /service_partner_([a-zA-Z0-9]+)_\d{6}_\d{6}/,
    /remote_([a-zA-Z0-9]+)_/,
    /extended_([a-zA-Z0-9]+)_/,
    /service_([a-zA-Z0-9]+)_/,
    /basic_([a-zA-Z0-9]+)_/,
    /^([a-zA-Z0-9]+)_\d{6}_\d{6}/, // Direct pattern like "e3002_241201_090045"
  ];
  
  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match && match[1]) {
      const droneName = match[1].toLowerCase();
      // Check if it's a known drone
      if (knownDrones.includes(droneName)) {
        // Return uppercase for drone IDs like E3002
        if (droneName.match(/^[a-z]\d+$/)) {
          return droneName.toUpperCase();
        }
        return droneName.charAt(0).toUpperCase() + droneName.slice(1);
      }
    }
  }
  
  // Fallback: try to find known drone name in any position
  const parts = name.toLowerCase().split('_');
  for (const part of parts) {
    // First check if it's in our known drones list
    if (knownDrones.length > 0 && knownDrones.includes(part)) {
      // Return uppercase for drone IDs like E3002
      if (part.match(/^[a-z]\d+$/)) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
    // Also check for common drone patterns even if not in the list
    if (part.match(/^(e\d{4}|marvin|bender|maggie|lisa|bart|homer|marge|lancelot)$/)) {
      if (part.match(/^e\d{4}$/)) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    }
  }
  
  return 'Unknown';
};

const getInspectionTypeFromName = (name: string): string => {
  const nameLower = name.toLowerCase();
  const firstPart = name.split('_')[0].toLowerCase();
  
  // Check for new remote inspection types first
  if (nameLower.startsWith('initial_remote_')) {
    return 'initial-remote';
  } else if (nameLower.startsWith('full_remote_ti_')) {
    return 'full-remote';
  } else if (nameLower.startsWith('full_remote_')) {
    return 'full-remote';
  } else if (nameLower.startsWith('service_partner_')) {
    return 'service';
  } else if (nameLower.startsWith('onsite_ti_')) {
    return 'onsite';
  } else if (firstPart === 'remote' || nameLower.includes('remote')) {
    return 'remote';
  } else if (firstPart === 'onsite' || nameLower.includes('onsite')) {
    return 'onsite';
  } else if (firstPart === 'extended' || nameLower.includes('extended')) {
    return 'extended';
  } else if (firstPart === 'service' || nameLower.includes('service_inspection')) {
    return 'service';
  } else if (firstPart === 'basic' || nameLower.includes('basic')) {
    return 'basic';
  }
  return 'unknown';
};

const getInspectionTypeInfo = (sessionName: string, inspectionType?: string | null): { 
  label: string, 
  color: string, 
  bgColor: string,
  borderColor: string 
} => {
  // First try to determine from session name
  const detectedType = getInspectionTypeFromName(sessionName);
  const type = detectedType !== 'unknown' ? detectedType : (inspectionType?.toLowerCase() || 'unknown');
  
  switch (type) {
    case 'initial-remote':
      return { 
        label: 'Initial Remote', 
        color: 'text-blue-600 dark:text-blue-400', 
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        borderColor: 'border-blue-200 dark:border-blue-600'
      };
    case 'full-remote':
      return { 
        label: 'Full Remote', 
        color: 'text-blue-600 dark:text-blue-400', 
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        borderColor: 'border-blue-200 dark:border-blue-600'
      };
    case 'remote':
      return { 
        label: 'Remote', 
        color: 'text-blue-600 dark:text-blue-400', 
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        borderColor: 'border-blue-200 dark:border-blue-600'
      };
    case 'onsite':
      return { 
        label: 'Onsite', 
        color: 'text-green-600 dark:text-green-400', 
        bgColor: 'bg-green-50 dark:bg-green-900/20',
        borderColor: 'border-green-200 dark:border-green-600'
      };
    case 'extended':
      return { 
        label: 'Extended', 
        color: 'text-purple-600 dark:text-purple-400', 
        bgColor: 'bg-purple-50 dark:bg-purple-900/20',
        borderColor: 'border-purple-200 dark:border-purple-600'
      };
    case 'service':
      return { 
        label: 'Service', 
        color: 'text-orange-600 dark:text-orange-400', 
        bgColor: 'bg-orange-50 dark:bg-orange-900/20',
        borderColor: 'border-orange-200 dark:border-orange-600'
      };
    case 'basic':
      return { 
        label: 'Basic', 
        color: 'text-cyan-600 dark:text-cyan-400', 
        bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
        borderColor: 'border-cyan-200 dark:border-cyan-600'
      };
    default:
      return { 
        label: 'Standard', 
        color: 'text-gray-600 dark:text-gray-400', 
        bgColor: 'bg-gray-50 dark:bg-gray-900',
        borderColor: 'border-gray-200 dark:border-gray-600'
      };
  }
};

const getAgeCategory = (dateString: string): { category: 'recent' | 'today' | 'old', color: string, bgColor: string, borderColor: string } => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
  
  if (diffInHours < 1) {
    return { 
      category: 'recent', 
      color: 'text-green-700', 
      bgColor: 'bg-green-50', 
      borderColor: 'border-green-300'
    };
  } else if (diffInHours < 24) {
    return { 
      category: 'today', 
      color: 'text-blue-700', 
      bgColor: 'bg-blue-50', 
      borderColor: 'border-blue-300'
    };
  } else {
    return { 
      category: 'old', 
      color: 'text-gray-600 dark:text-gray-400', 
      bgColor: 'bg-gray-50 dark:bg-gray-900', 
      borderColor: 'border-gray-200 dark:border-gray-600'
    };
  }
};

// Helper function to get colors based on detailed inspection status
const getInspectionStatusColors = (detailedStatus: 'passed' | 'failed' | 'partial' | 'pending' | null | undefined, status: string | null | undefined) => {
  // If we have detailed status, use it
  if (detailedStatus) {
    switch (detailedStatus) {
      case 'passed':
        return {
          dot: 'bg-green-500 dark:bg-green-400',
          text: 'text-green-600 dark:text-green-400',
          label: 'Passed'
        };
      case 'failed':
        return {
          dot: 'bg-red-500 dark:bg-red-400',
          text: 'text-red-600 dark:text-red-400',
          label: 'Failed'
        };
      case 'partial':
        return {
          dot: 'bg-yellow-500 dark:bg-yellow-400',
          text: 'text-yellow-600 dark:text-yellow-400',
          label: 'Partial'
        };
      case 'pending':
        return {
          dot: 'bg-amber-500 dark:bg-amber-400',
          text: 'text-amber-600 dark:text-amber-400',
          label: 'Pending'
        };
    }
  }
  
  // Fall back to basic status
  switch (status) {
    case 'completed':
      return {
        dot: 'bg-green-500 dark:bg-green-400',
        text: 'text-green-600 dark:text-green-400',
        label: 'Completed'
      };
    case 'in_progress':
      return {
        dot: 'bg-amber-500 dark:bg-amber-400',
        text: 'text-amber-600 dark:text-amber-400',
        label: 'In Progress'
      };
    case 'not_started':
      return {
        dot: 'bg-red-500 dark:bg-red-400',
        text: 'text-red-600 dark:text-red-400',
        label: 'Not Started'
      };
    default:
      return {
        dot: 'bg-gray-300 dark:bg-gray-600',
        text: 'text-gray-400 dark:text-gray-500',
        label: ''
      };
  }
};

const FolderBrowserModal: React.FC<FolderBrowserModalProps> = ({
  isOpen,
  onClose,
  loadingFolders,
  availableFolders,
  onLoadSession,
}) => {
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [expandedHangars, setExpandedHangars] = useState<Set<string>>(new Set());
  const [expandedDrones, setExpandedDrones] = useState<Set<string>>(new Set());
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [sessionsToHide, setSessionsToHide] = useState<Set<string>>(new Set());
  const [loadingDrones, setLoadingDrones] = useState(false);
  const [dronesLoaded, setDronesLoaded] = useState(false);
  
  // Fetch available drones when modal opens
  useEffect(() => {
    if (isOpen && !dronesLoaded) {
      setLoadingDrones(true);
      fetch(`${API_CONFIG.BASE_URL}/api/drones`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.drones) {
            knownDrones = data.drones.map((drone: any) => drone.id.toLowerCase());
            console.log('Loaded drones:', knownDrones);
            // Add some additional common drone names that might be missing
            const additionalDrones = ['e3001', 'e3002', 'e3003', 'e3004', 'marvin'];
            additionalDrones.forEach(d => {
              if (!knownDrones.includes(d)) knownDrones.push(d);
            });
          }
          setDronesLoaded(true);
          setLoadingDrones(false);
        })
        .catch(err => {
          console.error('Failed to fetch drones:', err);
          // Fallback to a more complete list if API fails
          knownDrones = ['bender', 'maggie', 'lisa', 'bart', 'homer', 'marge', 'lancelot', 'e3001', 'e3002', 'e3003', 'e3004', 'marvin'];
          setDronesLoaded(true);
          setLoadingDrones(false);
        });
    }
  }, [isOpen, dronesLoaded]);
  
  const toggleHangarExpansion = (hangarId: string) => {
    const newExpanded = new Set(expandedHangars);
    if (newExpanded.has(hangarId)) {
      newExpanded.delete(hangarId);
    } else {
      newExpanded.add(hangarId);
    }
    setExpandedHangars(newExpanded);
  };
  
  const toggleDroneExpansion = (droneName: string) => {
    const newExpanded = new Set(expandedDrones);
    if (newExpanded.has(droneName)) {
      newExpanded.delete(droneName);
    } else {
      newExpanded.add(droneName);
    }
    setExpandedDrones(newExpanded);
  };
  
  const handleDeleteSession = async (e: React.MouseEvent, hangarId: string, sessionName: string) => {
    e.stopPropagation(); // Prevent session from opening
    
    if (!window.confirm(`Are you sure you want to delete the session "${sessionName}"? This cannot be undone.`)) {
      return;
    }
    
    setDeletingSession(`${hangarId}/${sessionName}`);
    
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/inspection/${hangarId}/${sessionName}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        // Hide the session immediately
        setSessionsToHide(prev => {
          const newSet = new Set(prev);
          newSet.add(`${hangarId}/${sessionName}`);
          return newSet;
        });
        console.log('Session deleted successfully');
      } else {
        alert('Failed to delete session');
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      alert('Error deleting session');
    } finally {
      setDeletingSession(null);
    }
  };
  
  if (!isOpen) return null;

  // Extract hangars array from the data structure
  const hangarsList = availableFolders && typeof availableFolders === 'object' && 'hangars' in availableFolders
    ? (availableFolders as any).hangars 
    : (Array.isArray(availableFolders) ? availableFolders : []);

  // Remove renderSession function as we'll inline the rendering
  const renderSessionOLD = (session: Session, hangarId: string) => {
    const ageInfo = getAgeCategory(session.created);
    const inspectionInfo = getInspectionTypeInfo(session.name, session.inspectionType);
    
    // Clean status styling
    const getStatusStyle = () => {
      switch(session.inspectionStatus) {
        case 'completed':
          return { 
            text: 'Completed', 
            textColor: 'text-green-600',
            bgColor: 'bg-green-50',
            borderColor: 'border-green-200',
            priority: 3
          };
        case 'in_progress':
          return { 
            text: `In Progress (${session.inspectionProgress?.percentage || 0}%)`,
            textColor: 'text-amber-600',
            bgColor: 'bg-amber-50',
            borderColor: 'border-amber-300',
            priority: 1
          };
        case 'not_started':
          return { 
            text: 'Not Started',
            textColor: 'text-red-600',
            bgColor: 'bg-red-50',
            borderColor: 'border-red-300',
            priority: 2
          };
        default:
          return { 
            text: 'Images Only',
            textColor: 'text-gray-400 dark:text-gray-500',
            bgColor: 'bg-gray-50 dark:bg-gray-900',
            borderColor: 'border-gray-200 dark:border-gray-600',
            priority: 4
          };
      }
    };
    
    const statusStyle = getStatusStyle();
    const isIncomplete = session.inspectionStatus === 'in_progress' || session.inspectionStatus === 'not_started';
    
    return (
      <div 
        key={session.id}
        className={`
          relative px-3 py-2 cursor-pointer transition-all duration-100 border rounded-lg
          ${isIncomplete 
            ? 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600' 
            : 'bg-gray-50/50 dark:bg-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600'
          }
          ${hoveredSession === session.id ? 'shadow-sm' : ''}
        `}
        onClick={() => onLoadSession(hangarId, session.name, session.images)}
        onMouseEnter={() => setHoveredSession(session.id)}
        onMouseLeave={() => setHoveredSession(null)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            {/* Status Indicator Dot */}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              getInspectionStatusColors(session.inspectionDetailedStatus, session.inspectionStatus).dot
            }`} />
            
            {/* Inspection Type Badge */}
            <div className={`px-2 py-0.5 rounded text-xs font-medium ${inspectionInfo.bgColor} ${inspectionInfo.color} border ${inspectionInfo.borderColor}`}>
              {inspectionInfo.label}
            </div>
            
            {/* Session Name */}
            <div className="font-medium text-gray-800 dark:text-gray-200">
              {formatSessionName(session.name)}
            </div>
            
            {/* Time */}
            <div className="text-gray-400 dark:text-gray-500 text-xs">
              {getRelativeTime(session.created)}
            </div>
            
            {/* Status Text - Subtle */}
            {session.hasInspection && (
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {getInspectionStatusColors(session.inspectionDetailedStatus, session.inspectionStatus).label}
                {session.inspectionStatus === 'in_progress' && (
                  <span className="ml-1">
                    ({session.inspectionProgress?.percentage || 0}%) - {session.inspectionProgress?.completed}/{session.inspectionProgress?.total} tasks
                  </span>
                )}
              </div>
            )}
            {!session.hasInspection && (
              <span className="text-xs text-gray-400 dark:text-gray-500">Images Only</span>
            )}
            {ageInfo.category === 'recent' && (
              <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs rounded font-medium">
                NEW
              </span>
            )}
          </div>
          <svg className={`w-4 h-4 ${hoveredSession === session.id ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600'} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    );
  };

  // Sort sessions by date only (newest first) for chronological order
  const sortSessionsChronologically = (sessions: Session[]) => {
    return [...sessions].sort((a, b) => {
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[94%] max-w-7xl max-h-[90vh] mx-4 overflow-hidden flex flex-col">
        <div className="p-8 pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              </div>
              <div>
                <h2 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">Inspection History</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Browse all inspection types and sessions by drone</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {(loadingFolders || loadingDrones) ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-3 border-gray-300 border-t-gray-600 rounded-full animate-spin mb-4"></div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{loadingDrones ? 'Loading drones...' : 'Loading inspection data...'}</div>
            </div>
          </div>
        ) : hangarsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <div className="text-gray-500 dark:text-gray-400 text-sm">No inspection folders found</div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-8 pb-6">
            <style dangerouslySetInnerHTML={{ __html: `
              .flex-1::-webkit-scrollbar {
                width: 6px;
              }
              .flex-1::-webkit-scrollbar-track {
                background: #f9f9f9;
                border-radius: 3px;
              }
              .flex-1::-webkit-scrollbar-thumb {
                background: #d1d5db;
                border-radius: 3px;
              }
              .flex-1::-webkit-scrollbar-thumb:hover {
                background: #9ca3af;
              }
            ` }} />
            {(() => {
              // Organize sessions by drone
              const droneData: Record<string, {
                sessions: Session[],
                hangars: Set<string>
              }> = {};
              
              hangarsList.forEach((hangar: HangarData) => {
                hangar.sessions.forEach((session: Session) => {
                  let droneName = formatSessionName(session.name);
                  // If we couldn't identify the drone, still include it but with a fallback name
                  if (droneName === 'Unknown') {
                    // Try to extract any drone-like identifier from the session name
                    const match = session.name.match(/([a-zA-Z]*\d+|marvin|bender|maggie|lisa|bart|homer|marge|lancelot)/i);
                    if (match) {
                      droneName = match[1].toLowerCase();
                      if (droneName.match(/^[a-z]\d+$/)) {
                        droneName = droneName.toUpperCase();
                      } else {
                        droneName = droneName.charAt(0).toUpperCase() + droneName.slice(1);
                      }
                    } else {
                      // Use hangar name as a fallback grouping
                      droneName = `Sessions (${hangar.name})`;
                    }
                  }
                  if (!droneData[droneName]) {
                    droneData[droneName] = {
                      sessions: [],
                      hangars: new Set()
                    };
                  }
                  droneData[droneName].sessions.push({
                    ...session,
                    hangarId: hangar.id,
                    hangarName: hangar.name
                  });
                  droneData[droneName].hangars.add(hangar.name);
                });
              });
              
              // Sort drones alphabetically
              const sortedDrones = Object.keys(droneData).sort();
              
              return sortedDrones.map(droneName => {
                const drone = droneData[droneName];
                const sortedSessions = sortSessionsChronologically(drone.sessions)
                  .filter(session => !sessionsToHide.has(`${session.hangarId}/${session.name}`));
                
                // Get latest inspection of each type
                const latestByType: Record<string, Session> = {};
                sortedSessions.forEach(session => {
                  const type = getInspectionTypeFromName(session.name);
                  if (!latestByType[type] || new Date(session.created) > new Date(latestByType[type].created)) {
                    latestByType[type] = session;
                  }
                });
                
                // Count totals
                const totalInspections = sortedSessions.length;
                const incompleteCount = sortedSessions.filter(s => 
                  s.inspectionStatus === 'in_progress' || s.inspectionStatus === 'not_started'
                ).length;
                
                const isExpanded = expandedDrones.has(droneName);
                
                return (
                  <div key={droneName} className="mb-8 last:mb-0">
                    <div className="mb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{droneName}</h3>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            ({totalInspections} total inspections)
                          </span>
                          {incompleteCount > 0 && (
                            <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium rounded-lg">
                              {incompleteCount} incomplete
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => toggleDroneExpansion(droneName)}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                        >
                          {isExpanded ? 'Show latest only' : 'View all inspections'}
                        </button>
                      </div>
                    </div>
                    
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                        {!isExpanded ? (
                          // Show latest of each type
                          ['initial-remote', 'full-remote', 'onsite', 'extended', 'service', 'basic'].map(type => {
                            const session = latestByType[type];
                            if (!session || sessionsToHide.has(`${session.hangarId}/${session.name}`)) return null;
                            
                            const inspectionInfo = getInspectionTypeInfo(session.name, session.inspectionType);
                            const isDeleting = deletingSession === `${session.hangarId}/${session.name}`;
                            
                            return (
                              <div
                                key={`${droneName}-${type}`}
                                className={`group flex items-center justify-between py-2 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-all border-b border-gray-100 dark:border-gray-600 last:border-b-0 ${
                                  isDeleting ? 'opacity-50' : ''
                                }`}
                                onClick={() => !isDeleting && onLoadSession(session.hangarId!, session.name, session.images)}
                              >
                                <div className="flex items-center gap-3 flex-1">
                                  {/* Status dot */}
                                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                    getInspectionStatusColors(session.inspectionDetailedStatus, session.inspectionStatus).dot
                                  }`} />
                                  
                                  {/* Type badge - more compact */}
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${inspectionInfo.bgColor} ${inspectionInfo.color} border ${inspectionInfo.borderColor}`}>
                                    {inspectionInfo.label}
                                  </span>
                                  
                                  {/* Hangar name */}
                                  <span className="text-sm text-gray-700 dark:text-gray-300">
                                    {session.hangarName}
                                  </span>
                                  
                                  {/* Date and time - more compact */}
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {formatDateTime(session.created)}
                                  </span>
                                  
                                  {/* Status - inline */}
                                  <span className={`text-xs ${
                                    getInspectionStatusColors(session.inspectionDetailedStatus, session.inspectionStatus).text
                                  }`}>
                                    {getInspectionStatusColors(session.inspectionDetailedStatus, session.inspectionStatus).label}
                                    {session.inspectionStatus === 'in_progress' && ` (${session.inspectionProgress?.percentage || 0}%)`}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  {/* Delete button - only show on hover */}
                                  <button
                                    onClick={(e) => handleDeleteSession(e, session.hangarId!, session.name)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-all"
                                    disabled={isDeleting}
                                    title="Delete inspection"
                                  >
                                    <svg className="w-4 h-4 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                  
                                  {/* Arrow */}
                                  <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          // Show all inspections chronologically
                          <>
                            {sortedSessions.map((session, idx) => {
                              const inspectionInfo = getInspectionTypeInfo(session.name, session.inspectionType);
                              const isDeleting = deletingSession === `${session.hangarId}/${session.name}`;
                              const sessionKey = `${droneName}-all-${idx}`;
                              
                              return (
                                <div
                                  key={sessionKey}
                                  className={`group flex items-center justify-between py-2 px-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-all border-b border-gray-100 dark:border-gray-600 last:border-b-0 ${
                                    isDeleting ? 'opacity-50' : ''
                                  }`}
                                  onClick={() => !isDeleting && onLoadSession(session.hangarId!, session.name, session.images)}
                                  onMouseEnter={() => setHoveredSession(session.id)}
                                  onMouseLeave={() => setHoveredSession(null)}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    {/* Status dot */}
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                      getInspectionStatusColors(session.inspectionDetailedStatus, session.inspectionStatus).dot
                                    }`} />
                                    
                                    {/* Type badge - more compact */}
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${inspectionInfo.bgColor} ${inspectionInfo.color} border ${inspectionInfo.borderColor}`}>
                                      {inspectionInfo.label}
                                    </span>
                                    
                                    {/* Hangar name */}
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                      {session.hangarName}
                                    </span>
                                    
                                    {/* Date and time - more compact */}
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {formatDateTime(session.created)}
                                    </span>
                                    
                                    {/* Status - inline */}
                                    <span className={`text-xs ${
                                      getInspectionStatusColors(session.inspectionDetailedStatus, session.inspectionStatus).text
                                    }`}>
                                      {getInspectionStatusColors(session.inspectionDetailedStatus, session.inspectionStatus).label}
                                      {session.inspectionStatus === 'in_progress' && ` (${session.inspectionProgress?.percentage || 0}%)`}
                                    </span>
                                  </div>
                                  
                                  <div className="flex items-center gap-2">
                                    {/* Delete button - only show on hover */}
                                    <button
                                      onClick={(e) => handleDeleteSession(e, session.hangarId!, session.name)}
                                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-all"
                                      disabled={isDeleting}
                                      title="Delete inspection"
                                    >
                                      <svg className="w-4 h-4 text-red-500 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                    
                                    {/* Arrow */}
                                    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
        
        <div className="p-8 pt-6 border-t border-gray-200 dark:border-gray-600">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="w-full py-3 text-base font-medium bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-200 rounded-lg"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FolderBrowserModal;