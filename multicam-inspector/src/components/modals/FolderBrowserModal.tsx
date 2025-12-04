import React, { useState } from 'react';
import { Button } from '../ui/button';
import { getRelativeTime, formatDateTime } from '../../utils/timeFormatting';

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

const formatSessionName = (name: string): string => {
  // Remove inspection type prefix and underscore for cleaner display
  const cleanedName = name
    .replace(/^(remote|onsite|extended|service)_/, '')
    .replace(/_inspection/, '');
  
  // Extract drone/location name from format like "bender_241201_090045"
  const parts = cleanedName.split('_');
  if (parts.length >= 1) {
    // Capitalize first letter of location name
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  return cleanedName;
};

const getInspectionTypeFromName = (name: string): string => {
  const nameLower = name.toLowerCase();
  const firstPart = name.split('_')[0].toLowerCase();
  
  if (firstPart === 'remote' || nameLower.includes('remote')) {
    return 'remote';
  } else if (firstPart === 'onsite' || nameLower.includes('onsite')) {
    return 'onsite';
  } else if (firstPart === 'extended' || nameLower.includes('extended')) {
    return 'extended';
  } else if (firstPart === 'service' || nameLower.includes('service_inspection')) {
    return 'service';
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
    case 'remote':
      return { 
        label: 'Remote', 
        color: 'text-blue-700', 
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200'
      };
    case 'onsite':
      return { 
        label: 'Onsite', 
        color: 'text-green-700', 
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200'
      };
    case 'extended':
      return { 
        label: 'Extended', 
        color: 'text-purple-700', 
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200'
      };
    case 'service':
      return { 
        label: 'Service', 
        color: 'text-orange-700', 
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200'
      };
    default:
      return { 
        label: 'Standard', 
        color: 'text-gray-700', 
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200'
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
      color: 'text-gray-600', 
      bgColor: 'bg-gray-50', 
      borderColor: 'border-gray-200'
    };
  }
};

export const FolderBrowserModal: React.FC<FolderBrowserModalProps> = ({
  isOpen,
  onClose,
  loadingFolders,
  availableFolders,
  onLoadSession,
}) => {
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  
  if (!isOpen) return null;

  // Extract hangars array from the data structure
  const hangarsList = availableFolders && typeof availableFolders === 'object' && 'hangars' in availableFolders
    ? (availableFolders as any).hangars 
    : (Array.isArray(availableFolders) ? availableFolders : []);

  const renderSession = (session: Session, hangarId: string) => {
    const ageInfo = getAgeCategory(session.created);
    const inspectionInfo = getInspectionTypeInfo(session.name, session.inspectionType);
    const statusColor = session.inspectionStatus === 'completed' ? 'text-green-600' : 
                       session.inspectionStatus === 'in_progress' ? 'text-yellow-600' : 
                       session.inspectionStatus === 'not_started' ? 'text-gray-400' : 'text-gray-500';
    const statusBg = session.inspectionStatus === 'completed' ? 'bg-green-50' : 
                    session.inspectionStatus === 'in_progress' ? 'bg-yellow-50' : 
                    'bg-gray-50';
    
    return (
      <div 
        key={session.id}
        className={`
          relative border rounded-md px-3 py-2 cursor-pointer transition-all duration-150
          ${hoveredSession === session.id 
            ? `${inspectionInfo.borderColor} ${inspectionInfo.bgColor} shadow-sm scale-[1.01]` 
            : `border-gray-200 bg-white hover:${inspectionInfo.bgColor} hover:${inspectionInfo.borderColor} hover:shadow-sm`
          }
        `}
        onClick={() => onLoadSession(hangarId, session.name, session.images)}
        onMouseEnter={() => setHoveredSession(session.id)}
        onMouseLeave={() => setHoveredSession(null)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Inspection Type Badge */}
            <div className={`px-2 py-1 rounded-md ${inspectionInfo.bgColor} ${inspectionInfo.borderColor} border`}>
              <span className={`text-xs font-bold ${inspectionInfo.color}`}>
                {inspectionInfo.label}
              </span>
            </div>
            
            {/* Session Name */}
            <div className="font-medium text-gray-900">
              {formatSessionName(session.name)}
            </div>
            
            {/* Time */}
            <div className={`text-sm font-medium ${ageInfo.color}`}>
              {getRelativeTime(session.created)}
            </div>
            
            {/* Inspection Status */}
            {session.hasInspection && (
              <div className={`flex items-center gap-2 px-2 py-0.5 rounded-full ${statusBg}`}>
                <div className={`text-xs font-medium ${statusColor}`}>
                  {session.inspectionStatus === 'completed' ? '✓ Completed' :
                   session.inspectionStatus === 'in_progress' ? `In Progress (${session.inspectionProgress?.percentage}%)` :
                   session.inspectionStatus === 'not_started' ? 'Not Started' : 'No Inspection'}
                </div>
                {session.inspectionProgress && session.inspectionStatus !== 'completed' && (
                  <div className="text-xs text-gray-500">
                    ({session.inspectionProgress.completed}/{session.inspectionProgress.total})
                  </div>
                )}
              </div>
            )}
            {!session.hasInspection && (
              <div className="text-xs text-gray-400">
                Images Only
              </div>
            )}
            {ageInfo.category === 'recent' && (
              <span className="px-1.5 py-0.5 bg-green-500 text-white text-xs rounded-full font-semibold animate-pulse">
                NEW
              </span>
            )}
          </div>
          <svg className={`w-4 h-4 ${hoveredSession === session.id ? inspectionInfo.color : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    );
  };

  // Sort sessions by date only (newest first)
  const sortSessions = (sessions: Session[]) => {
    return [...sessions].sort((a, b) => {
      // Sort by date (newest first)
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl p-5 w-[90%] max-w-5xl max-h-[85vh] mx-4 overflow-hidden flex flex-col animate-slideUp">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Inspection History</h2>
            <p className="text-xs text-gray-500 mt-0.5">Browse all inspection types and sessions by hangar</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {loadingFolders ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
              <div className="mt-4 text-gray-600 font-medium">Scanning inspection folders...</div>
              <div className="text-sm text-gray-400 mt-1">This may take a moment</div>
            </div>
          </div>
        ) : hangarsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <svg className="w-20 h-20 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <div className="text-gray-500 font-medium">No inspection folders found</div>
            <div className="text-sm text-gray-400 mt-1">Create a new inspection to get started</div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {hangarsList.map((hangar: HangarData) => {
              const sortedSessions = sortSessions(hangar.sessions);
              
              // Count sessions by type
              const typeCounts = sortedSessions.reduce((acc, session) => {
                const type = getInspectionTypeFromName(session.name);
                acc[type] = (acc[type] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              
              return (
                <div key={hangar.id} className="mb-6 last:mb-0">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900">{hangar.name}</h3>
                      <div className="flex gap-2 mt-1">
                        {Object.entries(typeCounts).map(([type, count]) => {
                          if (type === 'unknown') return null;
                          const info = getInspectionTypeInfo(type);
                          return (
                            <span key={type} className={`text-xs ${info.color}`}>
                              {count} {info.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-1.5 pl-2">
                    {sortedSessions.map((session: Session) => renderSession(session, hangar.id))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        <div className="flex gap-3 mt-6 pt-6 border-t border-gray-200">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="flex-1 py-2.5 font-medium hover:bg-gray-50 transition-colors"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FolderBrowserModal;