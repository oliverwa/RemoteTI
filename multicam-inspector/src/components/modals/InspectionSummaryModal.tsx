import React, { useState, useEffect } from 'react';
import { X, Check, AlertTriangle, Camera, Clock, Wrench, FileText, Download, Share2, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface InspectionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionPath: string;
  hangarId?: string;
  showImages?: boolean;
}

interface InspectionTask {
  id: string;
  title: string;
  status: 'completed' | 'failed' | 'skipped';
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
  operator: string;
  tasks: InspectionTask[];
  images: { [key: string]: string };
  overallStatus: 'passed' | 'failed' | 'partial';
  notes?: string;
  weatherConditions?: string;
  location?: string;
}

const InspectionSummaryModal: React.FC<InspectionSummaryModalProps> = ({
  isOpen,
  onClose,
  sessionPath,
  hangarId,
  showImages = false
}) => {
  const [summaryData, setSummaryData] = useState<InspectionSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ camId: string; path: string } | null>(null);

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
      const response = await fetch(`/api/inspection/${sessionPath}/data`);
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to load inspection data: ${error}`);
      }
      
      const data = await response.json();
      
      // Extract hangar ID from session path (e.g., "hangar_forsaker_vpn/session_name")
      const pathParts = sessionPath.split('/');
      const hangarIdFromPath = pathParts[0] || '';
      
      // Format hangar name from ID
      const formatHangarName = (id: string): string => {
        // Remove "hangar_" prefix and "_vpn" suffix, capitalize
        const name = id.replace(/^hangar_/, '').replace(/_vpn$/, '');
        return name.charAt(0).toUpperCase() + name.slice(1);
      };
      
      // If images not in JSON, build them from standard camera IDs
      let images = data.images || {};
      if (Object.keys(images).length === 0) {
        // For camera inspections, we know the standard camera IDs and file format
        const cameraIds = ['FDL', 'FDR', 'FUL', 'FUR', 'RDL', 'RDR', 'RUL', 'RUR'];
        const sessionName = sessionPath.split('/').pop() || '';
        // Extract timestamp from session name (e.g., "full_remote_e3002_260223_140122" -> "260223_140122")
        const timestampMatch = sessionName.match(/_(\d{6}_\d{6})$/);
        if (timestampMatch) {
          const timestamp = timestampMatch[1];
          // Build images object with expected filenames
          cameraIds.forEach(camId => {
            images[camId] = `${camId}_${timestamp}.jpg`;
          });
        }
      } else {
        // Clean up image paths if they contain the full path
        const cleanedImages: Record<string, string> = {};
        Object.entries(images).forEach(([camId, imagePath]) => {
          if (typeof imagePath === 'string') {
            // If the path contains slashes, extract just the filename
            // This handles cases like "hangar_forsaker_vpn/full_remote_e3002_260223_141009/RUR_260223_141009.jpg"
            const parts = imagePath.split('/');
            cleanedImages[camId] = parts[parts.length - 1]; // Get just the filename
          }
        });
        images = cleanedImages;
      }
      
      // Determine inspection type from session name if not properly set
      let inspectionType = data.inspectionType || data.sessionInfo?.inspectionType || '';
      const sessionName = sessionPath.split('/').pop() || '';
      if (inspectionType === 'drone_remote_visual_inspection' || !inspectionType) {
        if (sessionName.startsWith('full_remote_')) {
          inspectionType = 'full-remote-ti-inspection';
        } else if (sessionName.startsWith('initial_remote_')) {
          inspectionType = 'initial-remote-ti-inspection';
        } else if (sessionName.startsWith('onsite_')) {
          inspectionType = 'onsite-ti-inspection';
        }
      }
      
      // Process and format the data
      const summaryData: InspectionSummaryData = {
        sessionId: sessionPath.split('/').pop() || '',
        sessionFolder: sessionPath,
        hangarId: data.hangar || data.sessionInfo?.hangar || hangarIdFromPath || hangarId || '',
        hangarName: data.hangarName || formatHangarName(hangarIdFromPath) || data.name || '',
        droneId: data.drone || data.sessionInfo?.drone || extractDroneFromSession(sessionName) || '',
        inspectionType: formatInspectionType(inspectionType),
        completedAt: data.completionStatus?.completedAt || data.completedAt || data.sessionInfo?.createdAt || new Date().toISOString(),
        duration: calculateDuration(data.completionStatus?.startedAt || data.sessionInfo?.createdAt, data.completionStatus?.completedAt || data.completedAt),
        operator: data.completionStatus?.completedBy || data.operator || data.metadata?.author || 'System',
        tasks: processTasks(data.tasks || data.checklist || []),
        images: images,
        overallStatus: calculateOverallStatus(data.tasks || data.checklist || []),
        notes: data.notes || data.description,
        weatherConditions: data.weatherConditions,
        location: data.location
      };
      
      setSummaryData(summaryData);
    } catch (err) {
      console.error('Error loading inspection summary:', err);
      setError(err instanceof Error ? err.message : 'Failed to load inspection summary');
    } finally {
      setLoading(false);
    }
  };
  
  const extractDroneFromSession = (sessionName: string): string => {
    // Extract drone ID from session name (e.g., "full_remote_e3002_260223_140122" -> "e3002")
    const parts = sessionName.split('_');
    for (const part of parts) {
      if (part.match(/^[a-z]\d{4}$/i) || part.match(/^marvin$/i) || part.match(/^bender$/i)) {
        return part;
      }
    }
    return '';
  };

  const formatInspectionType = (type: string): string => {
    const typeMap: { [key: string]: string } = {
      'remote-ti-inspection': 'Remote TI',
      'initial-remote-ti-inspection': 'Initial Remote TI',
      'full-remote-ti-inspection': 'Full Remote TI',
      'onsite-ti-inspection': 'Onsite TI',
      'extended-ti-inspection': 'Extended TI',
      'service-partner-inspection': 'Service Partner',
      'service-ti-inspection': 'Service TI'
    };
    return typeMap[type] || type;
  };

  const calculateDuration = (start?: string, end?: string): number => {
    if (!start || !end) return 0;
    return Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
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
        images: task.images || []
      };
    });
  };

  const calculateOverallStatus = (tasks: any[]): 'passed' | 'failed' | 'partial' => {
    const processedTasks = processTasks(tasks);
    const hasFailed = processedTasks.some(t => t.status === 'failed');
    const hasSkipped = processedTasks.some(t => t.status === 'skipped');
    
    if (hasFailed) return 'failed';
    if (hasSkipped) return 'partial';
    return 'passed';
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  };

  const getStatusIcon = (status: 'completed' | 'failed' | 'skipped') => {
    switch (status) {
      case 'completed':
        return <Check className="w-3 h-3 text-green-600 dark:text-green-400" />;
      case 'failed':
        return <X className="w-3 h-3 text-red-600 dark:text-red-400" />;
      case 'skipped':
        return <AlertTriangle className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />;
    }
  };

  const getStatusColor = (status: 'completed' | 'failed' | 'skipped') => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 dark:bg-green-900/30';
      case 'failed':
        return 'bg-red-100 dark:bg-red-900/30';
      case 'skipped':
        return 'bg-yellow-100 dark:bg-yellow-900/30';
    }
  };

  const exportToPDF = async () => {
    if (!summaryData) return;
    
    setIsExporting(true);
    try {
      const element = document.getElementById('inspection-summary-content');
      if (!element) return;
      
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      const filename = `inspection-${summaryData.hangarId}-${summaryData.droneId}-${new Date(summaryData.completedAt).toISOString().split('T')[0]}.pdf`;
      pdf.save(filename);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const shareResults = () => {
    if (!summaryData) return;
    
    const url = new URL(window.location.href);
    url.searchParams.set('action', 'view-summary');
    url.searchParams.set('session', summaryData.sessionFolder);
    
    if (navigator.share) {
      navigator.share({
        title: `Inspection Summary - ${summaryData.hangarId}`,
        text: `Inspection completed for ${summaryData.droneId} at ${summaryData.hangarId}`,
        url: url.toString()
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(url.toString());
      alert('Link copied to clipboard!');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100000] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Inspection Summary
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={exportToPDF}
              disabled={isExporting || !summaryData}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
              title="Export to PDF"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={shareResults}
              disabled={!summaryData}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
              title="Share Results"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading inspection summary...</p>
              </div>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600" />
                <div>
                  <div className="font-semibold text-red-900 dark:text-red-400">Error Loading Summary</div>
                  <div className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</div>
                </div>
              </div>
            </div>
          ) : summaryData ? (
            <div id="inspection-summary-content" className="space-y-4">
              {/* Compact Header with all key info */}
              <div className={`border rounded-lg p-3 ${
                summaryData.overallStatus === 'passed' 
                  ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-600' 
                  : summaryData.overallStatus === 'failed'
                  ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-600'
                  : 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-600'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {summaryData.overallStatus === 'passed' ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : summaryData.overallStatus === 'failed' ? (
                      <X className="w-5 h-5 text-red-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    )}
                    <span className={`font-semibold text-sm ${
                      summaryData.overallStatus === 'passed' ? 'text-green-900 dark:text-green-400' : 
                      summaryData.overallStatus === 'failed' ? 'text-red-900 dark:text-red-400' : 'text-yellow-900 dark:text-yellow-400'
                    }`}>
                      {summaryData.overallStatus === 'passed' ? 'Inspection Passed' : 
                       summaryData.overallStatus === 'failed' ? 'Inspection Failed' : 'Partially Completed'}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Duration: {formatDuration(summaryData.duration)}
                  </span>
                </div>
                
                {/* Key details in compact format */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Type:</span>
                    <span className="font-medium ml-1 text-gray-900 dark:text-gray-100">{summaryData.inspectionType}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Inspector:</span>
                    <span className="font-medium ml-1 text-gray-900 dark:text-gray-100">{summaryData.operator}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Location:</span>
                    <span className="font-medium ml-1 text-gray-900 dark:text-gray-100">{summaryData.hangarName || summaryData.hangarId}</span>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Drone:</span>
                    <span className="font-medium ml-1 text-gray-900 dark:text-gray-100">{summaryData.droneId}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600 dark:text-gray-400">Date:</span>
                    <span className="font-medium ml-1 text-gray-900 dark:text-gray-100">
                      {new Date(summaryData.completedAt).toLocaleDateString()} at {new Date(summaryData.completedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Images section - moved up - only show for remote inspections */}
              {showImages && 
               Object.keys(summaryData.images).length > 0 && 
               !summaryData.inspectionType.includes('onsite') && 
               !summaryData.inspectionType.includes('service') && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                  <h3 className="font-semibold text-xs text-gray-700 dark:text-gray-300 mb-2">Inspection Images</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(summaryData.images).map(([camId, imagePath]) => (
                      <div key={camId} className="relative group cursor-pointer" onClick={() => setSelectedImage({ camId, path: imagePath })}>
                        <img 
                          src={`/api/image/${summaryData.hangarId}/${summaryData.sessionId}/${imagePath}`}
                          alt={`Camera ${camId}`}
                          className="w-full h-20 object-cover rounded border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-400 transition-colors"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-1 py-0.5 rounded-b">
                          {camId}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Compact Tasks Summary */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-xs text-gray-700 dark:text-gray-300">Tasks Summary</h3>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {summaryData.tasks.filter(t => t.status === 'completed').length}/{summaryData.tasks.length} completed
                  </span>
                </div>
                
                {/* Failed and Skipped tasks - keep prominent */}
                {(() => {
                  const failedTasks = summaryData.tasks.filter(t => t.status === 'failed');
                  const skippedTasks = summaryData.tasks.filter(t => t.status === 'skipped');
                  const passedTasks = summaryData.tasks.filter(t => t.status === 'completed');
                  
                  return (
                    <>
                      {/* Failed tasks */}
                      {failedTasks.length > 0 && (
                        <div className="mb-3">
                          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-600 rounded-lg p-3">
                            <h4 className="text-xs font-semibold text-red-900 dark:text-red-400 mb-2">Failed Tasks ({failedTasks.length})</h4>
                            <div className="space-y-1">
                              {failedTasks.map(task => (
                                <div key={task.id} className="flex items-start gap-2">
                                  <X className="w-3 h-3 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1">
                                    <div className="text-xs font-medium text-red-800 dark:text-red-200">{task.title}</div>
                                    {task.notes && (
                                      <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">→ {task.notes}</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Skipped/N/A tasks */}
                      {skippedTasks.length > 0 && (
                        <div className="mb-3">
                          <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-600 rounded-lg p-3">
                            <h4 className="text-xs font-semibold text-yellow-900 dark:text-yellow-400 mb-2">N/A Tasks ({skippedTasks.length})</h4>
                            <div className="space-y-1">
                              {skippedTasks.map(task => (
                                <div key={task.id} className="flex items-start gap-2">
                                  <AlertTriangle className="w-3 h-3 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1">
                                    <div className="text-xs font-medium text-yellow-800 dark:text-yellow-200">{task.title}</div>
                                    {task.notes && (
                                      <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">→ {task.notes}</div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Passed tasks in compact 2-column grid */}
                      {passedTasks.length > 0 && (
                        <div>
                          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-600 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-xs font-semibold text-green-900 dark:text-green-400">Passed Tasks ({passedTasks.length})</h4>
                              <button
                                onClick={() => setExpandedTasks(!expandedTasks)}
                                className="text-xs text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200"
                              >
                                {expandedTasks ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            </div>
                            {expandedTasks && (
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                {passedTasks.map(task => (
                                  <div key={task.id} className="flex items-start gap-1">
                                    <Check className="w-3 h-3 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1">
                                      <div className="text-xs text-gray-700 dark:text-gray-300">{task.title}</div>
                                      {task.notes && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400 italic mt-0.5">→ {task.notes}</div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      
      {/* Image Preview Modal */}
      {selectedImage && summaryData && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <img 
              src={`/api/image/${summaryData.hangarId}/${summaryData.sessionId}/${selectedImage.path}`}
              alt={`Camera ${selectedImage.camId}`}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute top-2 right-2">
              <button
                onClick={() => setSelectedImage(null)}
                className="bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 rounded-full p-2 shadow-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
            </div>
            <div className="absolute bottom-2 left-2 bg-black/70 text-white px-3 py-1 rounded-lg">
              Camera: {selectedImage.camId}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InspectionSummaryModal;