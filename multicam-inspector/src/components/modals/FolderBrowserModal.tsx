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
        color: 'text-blue-600', 
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200'
      };
    case 'onsite':
      return { 
        label: 'Onsite', 
        color: 'text-green-600', 
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200'
      };
    case 'extended':
      return { 
        label: 'Extended', 
        color: 'text-purple-600', 
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200'
      };
    case 'service':
      return { 
        label: 'Service', 
        color: 'text-orange-600', 
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200'
      };
    default:
      return { 
        label: 'Standard', 
        color: 'text-gray-600', 
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
  const [expandedHangars, setExpandedHangars] = useState<Set<string>>(new Set());
  
  const toggleHangarExpansion = (hangarId: string) => {
    const newExpanded = new Set(expandedHangars);
    if (newExpanded.has(hangarId)) {
      newExpanded.delete(hangarId);
    } else {
      newExpanded.add(hangarId);
    }
    setExpandedHangars(newExpanded);
  };
  
  if (!isOpen) return null;

  // Extract hangars array from the data structure
  const hangarsList = availableFolders && typeof availableFolders === 'object' && 'hangars' in availableFolders
    ? (availableFolders as any).hangars 
    : (Array.isArray(availableFolders) ? availableFolders : []);

  const renderSession = (session: Session, hangarId: string) => {
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
            textColor: 'text-gray-400',
            bgColor: 'bg-gray-50',
            borderColor: 'border-gray-200',
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
            ? 'bg-white hover:bg-gray-50 border-gray-300' 
            : 'bg-gray-50/50 hover:bg-gray-50 border-gray-200'
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
              session.inspectionStatus === 'completed' ? 'bg-green-500' :
              session.inspectionStatus === 'in_progress' ? 'bg-amber-500' :
              session.inspectionStatus === 'not_started' ? 'bg-red-500' :
              'bg-gray-300'
            }`} />
            
            {/* Inspection Type Badge */}
            <div className={`px-2 py-0.5 rounded text-xs font-medium ${inspectionInfo.bgColor} ${inspectionInfo.color} border ${inspectionInfo.borderColor}`}>
              {inspectionInfo.label}
            </div>
            
            {/* Session Name */}
            <div className="font-medium text-gray-800">
              {formatSessionName(session.name)}
            </div>
            
            {/* Time */}
            <div className="text-gray-400 text-xs">
              {getRelativeTime(session.created)}
            </div>
            
            {/* Status Text - Subtle */}
            {session.hasInspection && (
              <div className="text-xs text-gray-600">
                {session.inspectionStatus === 'completed' ? 'Completed' :
                 session.inspectionStatus === 'in_progress' ? `In Progress (${session.inspectionProgress?.percentage || 0}%)` :
                 session.inspectionStatus === 'not_started' ? 'Not Started' : ''}
                {session.inspectionProgress && session.inspectionStatus === 'in_progress' && (
                  <span className="ml-1 text-gray-400">
                    - {session.inspectionProgress.completed}/{session.inspectionProgress.total} tasks
                  </span>
                )}
              </div>
            )}
            {!session.hasInspection && (
              <span className="text-xs text-gray-400">Images Only</span>
            )}
            {ageInfo.category === 'recent' && (
              <span className="px-1.5 py-0.5 bg-gray-200 text-gray-700 text-xs rounded font-medium">
                NEW
              </span>
            )}
          </div>
          <svg className={`w-4 h-4 ${hoveredSession === session.id ? 'text-gray-500' : 'text-gray-300'} transition-colors`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    );
  };

  // Sort sessions by priority (incomplete first) then by date
  const sortSessions = (sessions: Session[]) => {
    return [...sessions].sort((a, b) => {
      // First sort by completion status (incomplete first)
      const getPriority = (status: string | null | undefined) => {
        switch(status) {
          case 'in_progress': return 1;
          case 'not_started': return 2;
          case 'completed': return 3;
          default: return 4;
        }
      };
      
      const aPriority = getPriority(a.inspectionStatus);
      const bPriority = getPriority(b.inspectionStatus);
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // Then sort by date (newest first)
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-5 w-[94%] max-w-7xl max-h-[90vh] mx-4 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Inspection History</h2>
            <p className="text-xs text-gray-500 mt-0.5">Browse all inspection types and sessions by hangar</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {loadingFolders ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-3 border-gray-300 border-t-gray-600 rounded-full animate-spin mb-4"></div>
              <div className="text-sm text-gray-600">Loading inspection data...</div>
            </div>
          </div>
        ) : hangarsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <div className="text-gray-500 text-sm">No inspection folders found</div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2">
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
            {hangarsList.map((hangar: HangarData) => {
              const sortedSessions = sortSessions(hangar.sessions);
              const isExpanded = expandedHangars.has(hangar.id);
              const sessionsToShow = isExpanded ? sortedSessions : sortedSessions.slice(0, 5);
              const hasMoreSessions = sortedSessions.length > 5;
              
              // Count sessions by type
              const typeCounts = sortedSessions.reduce((acc, session) => {
                const type = getInspectionTypeFromName(session.name);
                acc[type] = (acc[type] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              
              const incompleteCount = sortedSessions.filter((s: Session) => 
                s.inspectionStatus === 'in_progress' || s.inspectionStatus === 'not_started'
              ).length;
              
              return (
                <div key={hangar.id} className="mb-6 last:mb-0">
                  <div className="flex items-center gap-3 mb-3 px-2 py-2 bg-gray-50 rounded-lg">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <h3 className="text-base font-semibold text-gray-800">{hangar.name}</h3>
                    <div className="flex gap-3 text-xs text-gray-500">
                      {Object.entries(typeCounts).map(([type, count]) => {
                        if (type === 'unknown') return null;
                        return (
                          <span key={type}>
                            {count} {type}
                          </span>
                        );
                      })}
                    </div>
                    {incompleteCount > 0 && (
                      <span className="ml-auto px-2 py-0.5 bg-gray-800 text-white text-xs font-medium rounded">
                        {incompleteCount} Incomplete
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 pl-2">
                    {sessionsToShow.map((session: Session) => renderSession(session, hangar.id))}
                    {hasMoreSessions && (
                      <button
                        onClick={() => toggleHangarExpansion(hangar.id)}
                        className="w-full mt-2 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        {isExpanded ? (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                            Show less
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            Show all {sortedSessions.length} sessions
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        <div className="flex gap-3 mt-4 pt-4 border-t border-gray-200">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="flex-1 py-2 text-sm font-medium bg-white hover:bg-gray-50 transition-colors border-gray-300 text-gray-700 rounded-lg"
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FolderBrowserModal;