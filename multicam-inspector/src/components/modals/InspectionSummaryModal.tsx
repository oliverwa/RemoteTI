import React, { useEffect, useState } from 'react';
import { X, Check, CheckCircle, AlertTriangle, FileText, Wrench, Camera, Clock } from 'lucide-react';

interface InspectionTask {
  id: string;
  title: string;
  status: 'completed' | 'skipped' | 'failed';
  notes?: string;
  images?: string[];
}

interface InspectionSummaryData {
  sessionId: string;
  sessionFolder: string;
  hangarId: string;
  hangarName: string;
  droneId: string;
  inspectionType: string;
  completedAt: string;
  duration: number;
  operator?: string;
  tasks: InspectionTask[];
  images?: { [cameraId: string]: string };
  overallStatus: 'passed' | 'failed' | 'partial';
  notes?: string;
  weatherConditions?: string;
  location?: string;
}

interface InspectionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionPath: string;
  hangarId?: string;
  showImages?: boolean;
}

const InspectionSummaryModal: React.FC<InspectionSummaryModalProps> = ({
  isOpen,
  onClose,
  sessionPath,
  hangarId,
  showImages = true
}) => {
  const [summaryData, setSummaryData] = useState<InspectionSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && sessionPath) {
      loadInspectionSummary();
    }
  }, [isOpen, sessionPath]);

  const loadInspectionSummary = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load inspection data from the session
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionPath)}`);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to load inspection data: ${error}`);
      }
      
      const data = await response.json();
      
      // Process and format the data
      const summaryData: InspectionSummaryData = {
        sessionId: sessionPath.split('/').pop() || '',
        sessionFolder: sessionPath,
        hangarId: data.hangar || data.sessionInfo?.hangar || hangarId || '',
        hangarName: data.hangarName || data.name || '',
        droneId: data.drone || data.sessionInfo?.drone || '',
        inspectionType: formatInspectionType(data.inspectionType || data.sessionInfo?.inspectionType || ''),
        completedAt: data.completionStatus?.completedAt || data.completedAt || data.sessionInfo?.createdAt || new Date().toISOString(),
        duration: calculateDuration(data.completionStatus?.startedAt || data.sessionInfo?.createdAt, data.completionStatus?.completedAt || data.completedAt),
        operator: data.completionStatus?.completedBy || data.operator || data.metadata?.author || 'System',
        tasks: processTasks(data.tasks || data.checklist || []),
        images: data.images || {},
        overallStatus: calculateOverallStatus(data.tasks || data.checklist || []),
        notes: data.notes || data.description,
        weatherConditions: data.weatherConditions,
        location: data.location
      };
      
      setSummaryData(summaryData);
    } catch (err) {
      console.error('Error loading inspection summary:', err);
      setError('Failed to load inspection summary');
    } finally {
      setLoading(false);
    }
  };

  const formatInspectionType = (type: string): string => {
    const typeMap: { [key: string]: string } = {
      'onsite-ti-inspection': 'Onsite TI',
      'full-remote-ti-inspection': 'Full Remote TI',
      'service-partner-inspection': 'Service Partner',
      'initial-remote-inspection': 'Initial Remote'
    };
    return typeMap[type] || type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const calculateDuration = (startTime?: string, endTime?: string): number => {
    if (!startTime || !endTime) return 0;
    return Math.floor((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000);
  };

  const processTasks = (tasks: any[]): InspectionTask[] => {
    if (!tasks || !Array.isArray(tasks)) return [];
    return tasks.map(task => {
      // Determine status from various possible fields
      let status: 'completed' | 'failed' | 'skipped' = 'completed'; // default to completed
      
      if (task.status) {
        // Map various status values
        if (task.status === 'pass' || task.status === 'completed' || task.status === 'done') {
          status = 'completed';
        } else if (task.status === 'fail' || task.status === 'failed') {
          status = 'failed';
        } else if (task.status === 'skip' || task.status === 'skipped' || task.status === 'na' || task.status === 'pending') {
          status = 'skipped';
        }
      } else if (task.completed !== undefined) {
        status = task.completed ? 'completed' : 'skipped';
      } else if (task.completion?.completedAt) {
        status = 'completed';
      }
      
      return {
        id: task.id || task.taskId || task.taskNumber || String(Math.random()),
        title: task.title || task.name || task.description || 'Unnamed task',
        status: status,
        notes: task.note || task.notes || (task.comment && task.comment !== '' ? task.comment : undefined),
        images: task.images
      };
    });
  };

  const calculateOverallStatus = (tasks: any[]): 'passed' | 'failed' | 'partial' => {
    if (!tasks || tasks.length === 0) return 'partial';
    
    // Process tasks the same way to get proper statuses
    const processedTasks = processTasks(tasks);
    const completedCount = processedTasks.filter(t => t.status === 'completed').length;
    const failedCount = processedTasks.filter(t => t.status === 'failed').length;
    const skippedCount = processedTasks.filter(t => t.status === 'skipped').length;
    
    if (failedCount > 0) return 'failed';
    if (skippedCount > 0) return 'partial';
    if (completedCount === processedTasks.length) return 'passed';
    return 'partial';
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes} minutes`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'passed':
        return 'text-green-600 bg-green-50';
      case 'failed':
        return 'text-red-600 bg-red-50';
      case 'partial':
      case 'skipped':
        return 'text-yellow-600 bg-yellow-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'passed':
        return 'bg-green-500 text-white';
      case 'failed':
        return 'bg-red-500 text-white';
      case 'partial':
      case 'skipped':
        return 'bg-yellow-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'passed':
        return <Check className="w-4 h-4" />;
      case 'failed':
        return <X className="w-4 h-4" />;
      case 'partial':
      case 'skipped':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return null;
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modern Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 backdrop-blur rounded-lg">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Inspection Report</h2>
                <p className="text-xs text-blue-100">
                  {summaryData?.sessionId ? `Session: ${summaryData.sessionId}` : 'Loading...'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {summaryData && (
                <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${getStatusBadge(summaryData.overallStatus)}`}>
                  {getStatusIcon(summaryData.overallStatus)}
                  <span className="ml-1">{summaryData.overallStatus.toUpperCase()}</span>
                </span>
              )}
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64 text-red-600">
              <AlertTriangle className="w-8 h-8 mr-2" />
              <span>{error}</span>
            </div>
          ) : summaryData ? (
            <div className="space-y-4">
              {/* Primary Info - WHO and WHEN (prominent when all passed) */}
              {summaryData.overallStatus === 'passed' ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                      <div>
                        <div className="text-lg font-semibold text-green-900">
                          Completed by {summaryData.operator}
                        </div>
                        <div className="text-sm text-green-700">
                          {new Date(summaryData.completedAt).toLocaleDateString()} at {new Date(summaryData.completedAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">{summaryData.inspectionType}</div>
                      <div className="text-sm font-medium">{summaryData.hangarName || summaryData.hangarId}</div>
                    </div>
                  </div>
                </div>
              ) : summaryData.overallStatus === 'failed' ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-4">
                    <X className="w-8 h-8 text-red-600" />
                    <div>
                      <div className="text-lg font-semibold text-red-900">
                        Inspection Failed
                      </div>
                      <div className="text-sm text-red-700">
                        {summaryData.operator} • {new Date(summaryData.completedAt).toLocaleDateString()} at {new Date(summaryData.completedAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <AlertTriangle className="w-8 h-8 text-yellow-600" />
                      <div>
                        <div className="text-lg font-semibold text-yellow-900">
                          Partially Completed
                        </div>
                        <div className="text-sm text-yellow-700">
                          {summaryData.operator} • {new Date(summaryData.completedAt).toLocaleDateString()} at {new Date(summaryData.completedAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">{summaryData.inspectionType}</div>
                      <div className="text-sm font-medium">{summaryData.hangarName || summaryData.hangarId}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Compact metadata bar */}
              <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 bg-white rounded-md px-3 py-2 border">
                <div className="flex items-center gap-1">
                  <Wrench className="w-3 h-3" />
                  <span className="font-medium">{summaryData.inspectionType}</span>
                </div>
                <span className="text-gray-300">•</span>
                <div className="flex items-center gap-1">
                  <Camera className="w-3 h-3" />
                  <span>Drone: {summaryData.droneId}</span>
                </div>
                {summaryData.duration > 0 && (
                  <>
                    <span className="text-gray-300">•</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDuration(summaryData.duration)}</span>
                    </div>
                  </>
                )}
                {summaryData.weatherConditions && (
                  <>
                    <span className="text-gray-300">•</span>
                    <span>{summaryData.weatherConditions}</span>
                  </>
                )}
              </div>

              {/* Failed/Skipped Tasks - Show prominently if any */}
              {(() => {
                const failedTasks = summaryData.tasks.filter(t => t.status === 'failed');
                const skippedTasks = summaryData.tasks.filter(t => t.status === 'skipped');
                const tasksWithNotes = summaryData.tasks.filter(t => t.notes);
                
                return (
                  <>
                    {failedTasks.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <h3 className="font-semibold text-sm text-red-900 mb-2 flex items-center gap-2">
                          <X className="w-4 h-4" />
                          Failed Tasks ({failedTasks.length})
                        </h3>
                        <div className="space-y-1">
                          {failedTasks.map(task => (
                            <div key={task.id} className="flex items-start gap-2">
                              <X className="w-3 h-3 text-red-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <span className="text-xs font-medium text-red-800">{task.title}</span>
                                {task.notes && (
                                  <p className="text-xs text-red-600 mt-0.5">{task.notes}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {skippedTasks.length > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <h3 className="font-semibold text-sm text-yellow-900 mb-2 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          Skipped Tasks ({skippedTasks.length})
                        </h3>
                        <div className="space-y-1">
                          {skippedTasks.map(task => (
                            <div key={task.id} className="flex items-start gap-2">
                              <AlertTriangle className="w-3 h-3 text-yellow-600 mt-0.5 flex-shrink-0" />
                              <div className="flex-1">
                                <span className="text-xs font-medium text-yellow-800">{task.title}</span>
                                {task.notes && (
                                  <p className="text-xs text-yellow-600 mt-0.5">{task.notes}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Show notes from passed tasks if any */}
                    {(() => {
                      const passedTasksWithNotes = summaryData.tasks.filter(t => t.status === 'completed' && t.notes && t.notes.trim() !== '');
                      return passedTasksWithNotes.length > 0 ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <h3 className="font-semibold text-sm text-blue-900 mb-2">Notes from Completed Tasks</h3>
                          <div className="space-y-1">
                            {passedTasksWithNotes.map(task => (
                              <div key={task.id} className="text-xs">
                                <span className="font-medium text-gray-700">{task.title}:</span>
                                <span className="text-gray-600 ml-1">{task.notes}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </>
                );
              })()}
              
              {/* All Tasks Summary - Compact with notes for passed tasks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-xs text-gray-700">All Tasks</h3>
                  <span className="text-xs text-gray-500">
                    {summaryData.tasks.filter(t => t.status === 'completed').length}/{summaryData.tasks.length} completed
                  </span>
                </div>
                <div className="space-y-1">
                  {summaryData.tasks.map((task) => {
                    const hasNote = task.notes && task.notes.trim() !== '';
                    return (
                      <div
                        key={task.id}
                        className="flex items-start gap-2 p-1.5 bg-white border rounded"
                      >
                        <div className={`p-0.5 rounded mt-0.5 ${getStatusColor(task.status)}`}>
                          {getStatusIcon(task.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-700">
                              {task.title}
                            </span>
                            {task.status === 'completed' && (
                              <span className="text-xs text-green-600">✓</span>
                            )}
                          </div>
                          {hasNote && (
                            <p className="text-xs text-gray-500 mt-0.5 italic">
                              Note: {task.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Images Section - Only show if images exist */}
              {showImages && summaryData.images && Object.keys(summaryData.images).length > 0 ? (
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                    <Camera className="w-4 h-4" />
                    Inspection Images
                  </h3>
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {Object.entries(summaryData.images).slice(0, 12).map(([cameraId, imagePath]) => {
                      // Ensure proper image path construction
                      // Images come as "hangar_id/session_name/image.jpg" and need /data/sessions/ prefix
                      const fullImagePath = imagePath.startsWith('data/') 
                        ? `/${imagePath}` 
                        : imagePath.startsWith('/') 
                          ? imagePath 
                          : `/data/sessions/${imagePath}`;
                      
                      return (
                        <div
                          key={cameraId}
                          className="relative group cursor-pointer aspect-square"
                          onClick={() => setSelectedImage(fullImagePath)}
                        >
                          <img
                            src={fullImagePath}
                            alt={cameraId}
                            className="w-full h-full object-cover rounded-md border border-gray-200 hover:border-blue-400 transition-colors"
                            onError={(e) => {
                              console.error(`Failed to load image for ${cameraId}:`, fullImagePath);
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y0ZjRmNCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjE0IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-end justify-center pb-1">
                            <span className="text-white text-[10px] font-medium">
                              {cameraId.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : showImages && (
                <div className="text-center py-4 text-xs text-gray-500">
                  <Camera className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p>No images captured for this inspection</p>
                </div>
              )}

              {/* Notes Section - Compact */}
              {summaryData.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-xs text-amber-900 mb-1">Notes</h3>
                      <p className="text-xs text-gray-700 leading-relaxed">{summaryData.notes}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>


        {/* Image Preview Modal */}
        {selectedImage && (
          <div
            className="fixed inset-0 bg-black bg-opacity-90 z-60 flex items-center justify-center p-4"
            onClick={() => setSelectedImage(null)}
          >
            <div className="relative max-w-[90vw] max-h-[90vh]">
              <img
                src={selectedImage}
                alt="Preview"
                className="max-w-full max-h-full rounded-lg"
                onError={(e) => {
                  console.error('Failed to load preview image:', selectedImage);
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LXNpemU9IjI0IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+SW1hZ2UgTm90IEF2YWlsYWJsZTwvdGV4dD48L3N2Zz4=';
                }}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImage(null);
                }}
                className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InspectionSummaryModal;