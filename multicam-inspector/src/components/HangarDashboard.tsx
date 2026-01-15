import React, { useState, useEffect, Fragment } from 'react';
import { Button } from './ui/button';
import { HANGARS } from '../constants';
import { AlertCircle, CheckCircle, Clock, Wrench, Radio, ArrowRight, User, RefreshCw, Timer, AlertTriangle, Plane, Navigation, BarChart, Camera, FileCheck, HelpCircle, Shield, Settings, FileText, XCircle, PlayCircle } from 'lucide-react';
import AdminPanel from './AdminPanel';
import { generateInspectionPDF } from '../utils/pdfGenerator';
import { API_CONFIG } from '../config/api.config';

interface HangarDashboardProps {
  currentUser: string;
  userType: 'admin' | 'everdrone' | 'service_partner';
  onProceedToInspection: () => void;
  onLogout: () => void;
}

interface HangarStatusData {
  id: string;
  name: string;
  state: 'standby' | 'alarm' | 'post_flight' | 'inspection' | 'verification';
  currentPhase?: string;
  lastActivity?: string;
  assignedDrone?: string;
  estimatedCompletion?: string;
  operational?: boolean;
  activeInspection?: {
    type: string;
    progress: number;
    assignedTo: string;
  };
  alarmSession?: any;
  maintenanceHistory?: {
    lastOnsiteTI: string | null;
    lastExtendedTI: string | null;
    lastService: string | null;
  };
}

const HangarDashboard: React.FC<HangarDashboardProps> = ({
  currentUser,
  userType,
  onProceedToInspection,
  onLogout
}) => {
  // Filter hangars based on userType - service_partner users only see operational hangars
  const visibleHangars = userType === 'service_partner' 
    ? HANGARS.filter(hangar => hangar.operational !== false)
    : HANGARS;

  const [hangarStatuses, setHangarStatuses] = useState<HangarStatusData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHangar, setSelectedHangar] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [maintenanceHistory, setMaintenanceHistory] = useState<{[key: string]: any}>({});
  const [showPDFModal, setShowPDFModal] = useState(false);
  const [availableInspections, setAvailableInspections] = useState<any[]>([]);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [selectedPDFInspection, setSelectedPDFInspection] = useState<any | null>(null);

  // Helper function to calculate days since a date
  const getDaysSince = (dateString: string): number => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Fetch available completed inspections
  const fetchAvailableInspections = async () => {
    try {
      console.log('Starting fetch of inspections...');
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/folders`);
      
      if (!response.ok) {
        console.error('Failed to fetch folders:', response.status, response.statusText);
        return;
      }
      
      const data = await response.json();
      console.log('Fetched data:', data);
      console.log('Number of hangars:', data.hangars?.length || 0);
      
      const inspections: any[] = [];
      
      // Go through all hangars and sessions to find completed inspections
      for (const hangar of data.hangars || []) {
        console.log(`Checking hangar ${hangar.id} with ${hangar.sessions?.length || 0} sessions`);
        
        for (const session of hangar.sessions || []) {
          // Check if session has an inspection and it's completed
          if (session.hasInspection && session.inspectionStatus === 'completed') {
            console.log(`Found completed inspection: ${session.name}`);
            
            // For now, just use the metadata we have instead of fetching full inspection
            inspections.push({
              hangarId: hangar.id,
              hangarName: hangar.label || hangar.id,
              sessionName: session.name,
              sessionPath: `${hangar.id}/${session.name}`,
              inspection: {
                tasks: [],
                type: session.inspectionType,
                completionStatus: {
                  status: 'completed',
                  completedAt: session.created
                }
              },
              images: session.images || [],
              completedAt: session.created,
              inspectorName: 'Inspector',
              droneId: session.name.split('_')[1] || 'Unknown',
              inspectionType: session.inspectionType || 'Unknown',
              inspectionProgress: session.inspectionProgress
            });
          }
        }
      }
      
      console.log(`Found ${inspections.length} completed inspections`);
      
      // Sort by completion date (newest first)
      inspections.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
      
      setAvailableInspections(inspections);
      console.log('Set inspections:', inspections);
    } catch (error) {
      console.error('Failed to fetch inspections:', error);
      alert('Failed to fetch inspections. Check console for details.');
    }
  };

  // Generate PDF report and open in new tab
  const generatePDFReport = async (inspectionData: any) => {
    try {
      console.log('Starting PDF generation for:', inspectionData);
      setLoadingPDF(true);
      
      // First fetch the full inspection data if we don't have it
      let fullInspection = inspectionData.inspection;
      if (!fullInspection.tasks || fullInspection.tasks.length === 0) {
        console.log('Fetching full inspection data...');
        try {
          const response = await fetch(`${API_CONFIG.BASE_URL}/api/session/${inspectionData.hangarId}/${inspectionData.sessionName}/inspection`);
          if (response.ok) {
            fullInspection = await response.json();
            console.log('Fetched full inspection:', fullInspection);
          } else {
            console.error('Failed to fetch inspection:', response.status);
          }
        } catch (err) {
          console.error('Failed to fetch full inspection data:', err);
        }
      }
      
      // Prepare data for PDF generation
      const data: any = {
        inspection: fullInspection,
        inspectorName: inspectionData.inspectorName,
        droneId: inspectionData.droneId,
        hangarName: inspectionData.hangarName,
        sessionName: inspectionData.sessionName,
        completedAt: inspectionData.completedAt,
        images: []
      };
      
      // If we have images, fetch them
      if (inspectionData.images && inspectionData.images.length > 0) {
        // Load image data for the selected inspection
        const imagesWithData = await Promise.all(
          inspectionData.images.slice(0, 2).map(async (img: any) => { // Only take first 2 images
            try {
              const response = await fetch(`${API_CONFIG.BASE_URL}/api/snapshot/${inspectionData.sessionPath}/${img}`);
              const blob = await response.blob();
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              return { name: img.replace('.jpg', ''), data: dataUrl };
            } catch (error) {
              console.error(`Failed to load image ${img}:`, error);
              return null;
            }
          })
        );
        
        data.images = imagesWithData.filter(Boolean);
      }
      
      // Generate the PDF blob
      console.log('Generating PDF with data:', data);
      const pdfBlob = await generateInspectionPDF(data);
      console.log('PDF blob generated:', pdfBlob);
      
      // Create a download link and click it to open/download the PDF
      const pdfUrl = URL.createObjectURL(pdfBlob);
      console.log('PDF URL created:', pdfUrl);
      
      // Try to open in new tab first
      const newWindow = window.open(pdfUrl, '_blank');
      
      // If popup was blocked, fall back to download
      if (!newWindow || newWindow.closed || typeof newWindow.closed == 'undefined') {
        // Create a temporary link element
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = `Inspection_${inspectionData.sessionName}_${new Date().toISOString().slice(0, 10)}.pdf`;
        link.target = '_blank';
        
        // Append to body, click it, and remove it
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      // Clean up after a delay
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 10000);
      
      setShowPDFModal(false);
      setLoadingPDF(false);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to generate PDF report: ${errorMessage}`);
      setLoadingPDF(false);
    }
  };

  // Load actual alarm session states for each hangar
  useEffect(() => {
    const fetchHangarStatuses = async () => {
      try {
        // Fetch maintenance history (only for admin and everdrone users)
        let maintenanceData: {[key: string]: any} = {};
        if (userType === 'admin' || userType === 'everdrone') {
          const historyResponse = await fetch(`${API_CONFIG.BASE_URL}/api/maintenance-history`);
          if (historyResponse.ok) {
            maintenanceData = await historyResponse.json();
            setMaintenanceHistory(maintenanceData);
          }
        }
        
        // Start with default statuses
        const statuses: HangarStatusData[] = visibleHangars.map(hangar => ({
          id: hangar.id,
          name: hangar.label,
          state: 'standby' as const,
          assignedDrone: hangar.assignedDrone,
          lastActivity: 'No recent activity',
          operational: hangar.operational !== false, // Default to true if not specified
          // Get maintenance history for the drone assigned to this hangar
          maintenanceHistory: (hangar.assignedDrone && maintenanceData[hangar.assignedDrone]) ? {
            lastOnsiteTI: maintenanceData[hangar.assignedDrone].lastOnsiteTI,
            lastExtendedTI: maintenanceData[hangar.assignedDrone].lastExtendedTI,
            lastService: maintenanceData[hangar.assignedDrone].lastService
          } : {
            lastOnsiteTI: null,
            lastExtendedTI: null,
            lastService: null
          }
        }));
        
        // Fetch alarm session for each hangar
        for (const hangar of visibleHangars) {
          try {
            const response = await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangar.id}`);
            if (response.ok) {
              const data = await response.json();
              if (data.session) {
                const session = data.session;
                const hangarIndex = statuses.findIndex(h => h.id === hangar.id);
                
                if (hangarIndex !== -1) {
                  // Determine state based on workflow phases
                  let state: 'standby' | 'alarm' | 'post_flight' | 'inspection' | 'verification' = 'standby';
                  let currentPhase = '';
                  let activeInspection = undefined;
                  
                  if (session.workflow?.phases) {
                    const phases = session.workflow.phases;
                    
                    if (phases.flight?.status === 'in-progress') {
                      state = 'alarm';
                      currentPhase = 'Drone responding to alarm';
                    } else if (phases.landing?.status === 'in-progress') {
                      state = 'post_flight';
                      currentPhase = 'Drone landing';
                    } else if (phases.telemetryAnalysis?.status === 'in-progress') {
                      state = 'post_flight';
                      currentPhase = 'Analyzing flight data';
                    } else if (phases.initialRTI?.status === 'in-progress') {
                      state = 'inspection';
                      currentPhase = session.inspections?.initialRTI?.path
                        ? 'Initial inspection ready'
                        : 'Capturing initial RTI images...';
                      activeInspection = {
                        type: 'Initial Remote TI',
                        progress: 10,
                        assignedTo: 'Everdrone'
                      };
                    } else if (phases.missionReset?.status === 'in-progress' || phases.onsiteTI?.status === 'in-progress') {
                      state = 'inspection';
                      const isBasic = phases.missionReset?.status === 'in-progress';
                      const inspection = isBasic ? session.inspections?.missionReset : session.inspections?.onsiteTI;
                      currentPhase = isBasic 
                        ? (inspection?.progress && inspection.progress !== '0%' 
                          ? `Mission Reset ${inspection.progress} complete`
                          : 'Performing Mission Reset')
                        : (inspection?.progress && inspection.progress !== '0%'
                          ? `Onsite inspection ${inspection.progress} complete`  
                          : 'Technician performing onsite inspection');
                      activeInspection = {
                        type: isBasic ? 'Mission Reset' : 'Onsite TI',
                        progress: 50,
                        assignedTo: isBasic ? 'Remote Crew' : 'Everdrone'
                      };
                    } else if (phases.fullRTI?.status === 'in-progress') {
                      state = 'inspection';
                      currentPhase = session.inspections?.fullRTI?.path
                        ? 'Full inspection ready'
                        : 'Capturing full RTI images...';
                      activeInspection = {
                        type: 'Full Remote TI',
                        progress: 30,
                        assignedTo: 'Everdrone'
                      };
                    } else if (phases.clearArea?.status === 'in-progress') {
                      state = 'verification';
                      currentPhase = 'Confirming area is safe';
                    } else if (phases.initialRTI?.status === 'completed' && !session.workflow?.routeDecision) {
                      // Initial RTI completed but no route decision yet
                      state = 'inspection';
                      currentPhase = 'Choose inspection route';
                    } else if (phases.initialRTI?.status === 'completed' && phases.missionReset?.status === 'pending' && session.workflow?.routeDecision === 'basic') {
                      // Route selected but Mission Reset not started
                      state = 'inspection';
                      currentPhase = 'Mission Reset pending';
                    } else if (phases.initialRTI?.status === 'completed' && phases.onsiteTI?.status === 'pending' && session.workflow?.routeDecision === 'onsite') {
                      // Route selected but Onsite TI not started
                      state = 'inspection';
                      currentPhase = 'Awaiting technician dispatch';
                    } else if (phases.missionReset?.status === 'completed' && !phases.fullRTI?.status && session.workflow?.routeDecision === 'basic') {
                      // Mission Reset completed but Full RTI not started
                      state = 'inspection';
                      currentPhase = 'Full inspection required';
                    } else if (phases.fullRTI?.status === 'completed' && !phases.clearArea?.status) {
                      // Full RTI completed but area not cleared yet
                      state = 'verification';
                      currentPhase = 'Confirm area is safe';
                    } else if (phases.onsiteTI?.status === 'completed' && !phases.clearArea?.status) {
                      // Onsite TI completed but area not cleared yet
                      state = 'verification';
                      currentPhase = 'Confirm area is safe';
                    } else if (phases.clearArea?.status === 'completed') {
                      // Everything completed - NOW the hangar is operational
                      state = 'standby';
                      currentPhase = 'Area operational';
                    } else {
                      // Default state when workflow is active but not in a specific phase
                      state = 'inspection';
                      currentPhase = 'Inspection workflow active';
                    }
                    
                    // Calculate relative time
                    let lastActivity = 'Recently';
                    if (session.createdAt) {
                      const created = new Date(session.createdAt);
                      const now = new Date();
                      const diffMinutes = Math.floor((now.getTime() - created.getTime()) / 60000);
                      
                      if (diffMinutes < 1) {
                        lastActivity = 'Just now';
                      } else if (diffMinutes < 60) {
                        lastActivity = `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
                      } else {
                        const diffHours = Math.floor(diffMinutes / 60);
                        lastActivity = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                      }
                    }
                    
                    // Update the hangar status
                    statuses[hangarIndex] = {
                      ...statuses[hangarIndex],
                      state,
                      currentPhase: currentPhase || statuses[hangarIndex].currentPhase,
                      lastActivity,
                      activeInspection,
                      alarmSession: session
                    };
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`Failed to fetch alarm session for ${hangar.id}:`, error);
          }
        }
        
        setHangarStatuses(statuses);
      } catch (error) {
        console.error('Failed to fetch hangar statuses:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchHangarStatuses();
    
    // Poll for updates every 5 seconds
    const interval = setInterval(fetchHangarStatuses, 5000);
    return () => clearInterval(interval);
  }, []);

  // Simplified status component for remote users
  const RemoteUserStatus = ({ alarmSession, hangarId }: any) => {
    const phases = alarmSession?.workflow?.phases || {};
    const routeDecision = alarmSession?.workflow?.routeDecision;
    const inspections = alarmSession?.inspections || {};
    
    // Determine current phase for display
    let currentPhase = '';
    if (phases.initialRTI?.status === 'in-progress') {
      currentPhase = 'Initial assessment';
    } else if (phases.flight?.status === 'in-progress') {
      currentPhase = 'Flight in progress';
    } else if (phases.telemetryAnalysis?.status === 'in-progress') {
      currentPhase = 'Analyzing data';
    }
    
    // Get status text for remote users
    const getRemoteStatusText = () => {
      // Always show "Standby for inspection" for all stages before route decision
      if (!routeDecision && phases.flight?.status) {
        return 'Standby for inspection';
      }
      return '';
    };
    
    // Determine remote user state
    let canPerformBasicTI = false;
    
    if (!phases.flight?.status) {
      // No alarm yet
      return null;
    } else if (phases.clearArea?.status === 'completed') {
      // Area is cleared - don't show anything extra
      return null;
    } else if (routeDecision === 'basic' && (phases.missionReset?.status === 'pending' || phases.missionReset?.status === 'in-progress')) {
      // Mission Reset route selected, can perform inspection
      canPerformBasicTI = true;
    }
    
    // Get status text for display in header
    let statusText = '';
    let statusColor = 'text-gray-600';
    
    if (!routeDecision && getRemoteStatusText()) {
      statusText = getRemoteStatusText();
      statusColor = 'text-yellow-600';
    } else if (routeDecision === 'basic' && !inspections.missionReset?.path) {
      statusText = 'Ready for Inspection';
      statusColor = 'text-blue-600';
    } else if (routeDecision === 'onsite') {
      statusText = 'No Action Required';
      statusColor = 'text-gray-600';
    } else if (phases.missionReset?.status === 'completed') {
      statusText = 'Final Validation';
      statusColor = 'text-violet-600';
    }
    
    return (
      <>
        {/* Status text to show in header */}
        {statusText && (
          <div className="absolute top-1/2 -translate-y-1/2 right-16">
            <span className={`text-base font-semibold ${statusColor}`}>
              {statusText}
            </span>
          </div>
        )}
        
        {/* Buttons and messages below */}
        <div className="mt-2 space-y-2">
        
        {/* Button moved to header */}
        
        {/* Preparing message */}
        {canPerformBasicTI && !inspections.missionReset?.path && (
          <div className="text-xs text-blue-600">
            Preparing inspection checklist...
          </div>
        )}
        
        {/* Onsite route - message removed, shown in header as "No Action Required" */}
        
        {/* Progress removed for remote users */}
        </div>
      </>
    );
  };
  
  // Mini workflow timeline component  
  const WorkflowTimeline = ({ alarmSession, hangarId, onOpenWorkflow, isRemoteUser }: any) => {
    const phases = alarmSession?.workflow?.phases || {};
    const routeDecision = alarmSession?.workflow?.routeDecision;
    const inspections = alarmSession?.inspections || {};
    const [captureStartTimes, setCaptureStartTimes] = useState<{ [key: string]: number }>({});
    const [, forceUpdate] = useState(0);
    
    // Calculate progress based on elapsed time
    const getElapsedProgress = (startTime: number, duration: number): number => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 95);
      return Math.floor(progress);
    };
    
    // Force re-render every 500ms to update progress smoothly
    React.useEffect(() => {
      const interval = setInterval(() => {
        const hasActiveCapture = Object.keys(captureStartTimes).length > 0;
        if (hasActiveCapture) {
          forceUpdate(prev => prev + 1);
        }
      }, 500);
      return () => clearInterval(interval);
    }, [captureStartTimes]);
    
    // Handle Initial RTI capture progress
    React.useEffect(() => {
      if (phases.initialRTI?.status === 'in-progress' && !inspections.initialRTI?.path) {
        const key = `${hangarId}-initialRTI`;
        if (!captureStartTimes[key]) {
          setCaptureStartTimes(prev => ({ ...prev, [key]: Date.now() }));
        }
      } else if (inspections.initialRTI?.path) {
        // Clear when complete
        const key = `${hangarId}-initialRTI`;
        if (captureStartTimes[key]) {
          setCaptureStartTimes(prev => {
            const newTimes = { ...prev };
            delete newTimes[key];
            return newTimes;
          });
        }
      }
    }, [phases.initialRTI?.status, inspections.initialRTI?.path, hangarId]);
    
    // Handle Full RTI capture progress  
    React.useEffect(() => {
      if (phases.fullRTI?.status === 'in-progress' && !inspections.fullRTI?.path) {
        const key = `${hangarId}-fullRTI`;
        if (!captureStartTimes[key]) {
          setCaptureStartTimes(prev => ({ ...prev, [key]: Date.now() }));
        }
      } else if (inspections.fullRTI?.path) {
        // Clear when complete
        const key = `${hangarId}-fullRTI`;
        if (captureStartTimes[key]) {
          setCaptureStartTimes(prev => {
            const newTimes = { ...prev };
            delete newTimes[key];
            return newTimes;
          });
        }
      }
    }, [phases.fullRTI?.status, inspections.fullRTI?.path, hangarId]);
    
    // Determine which workflow path to show
    const isOnsitePath = routeDecision === 'onsite';
    const isBasicPath = routeDecision === 'basic';
    
    // Helper to get progress percentage from inspection
    const getProgress = (inspectionData: any) => {
      if (!inspectionData?.progress) return 0;
      const match = inspectionData.progress.match(/(\d+)%/);
      return match ? parseInt(match[1]) : 0;
    };
    
    // Define ALL workflow steps (show full path)
    const workflowSteps: Array<{
      id: string;
      icon: any;
      label: string;
      status?: string;
      progress?: number;
      inspectionPath?: string;
      highlight?: boolean;
      isAlternative?: boolean;
      routeType?: 'basic' | 'onsite';
    }> = [
      { id: 'flight', icon: Plane, label: 'Flight', status: phases.flight?.status },
      { id: 'landing', icon: Navigation, label: 'Land', status: phases.landing?.status },
      { id: 'telemetryAnalysis', icon: BarChart, label: 'Data', status: phases.telemetryAnalysis?.status },
      { 
        id: 'initialRTI', 
        icon: Camera, 
        label: 'Initial RTI', 
        status: phases.initialRTI?.status,
        progress: captureStartTimes[`${hangarId}-initialRTI`] && !inspections.initialRTI?.path
          ? getElapsedProgress(captureStartTimes[`${hangarId}-initialRTI`], 30000)
          : getProgress(inspections.initialRTI),
        inspectionPath: inspections.initialRTI?.path
      },
    ];
    
    // Show route decision point when Initial RTI is ready (has path) or complete
    const initialRTIReady = phases.initialRTI?.status === 'completed' || 
                           (phases.initialRTI?.status === 'in-progress' && inspections.initialRTI?.path) ||
                           (phases.initialRTI?.status === 'in-progress' && inspections.initialRTI?.progress === '100%');
    
    // Always show decision point and possible paths in timeline
    if (!routeDecision) {
      if (initialRTIReady) {
        // Show route decision needed - highlight it as active
        workflowSteps.push(
          { id: 'route', icon: AlertCircle, label: 'Decision', status: 'pending', highlight: true }
        );
      } else {
        // Show decision point as pending/grey (not ready yet)
        workflowSteps.push(
          { id: 'route', icon: AlertCircle, label: 'Decision', status: 'pending', highlight: false }
        );
      }
      // Show undecided next step
      workflowSteps.push(
        { id: 'undecided', icon: HelpCircle, status: 'pending', label: 'Next Step' }
      );
    } else {
      // Route was decided - show as completed
      workflowSteps.push(
        { id: 'route', icon: CheckCircle, label: 'Decided', status: 'completed' }
      );
    }
    
    if (routeDecision) {
      // Show the chosen path
      if (isOnsitePath) {
        workflowSteps.push(
          { 
            id: 'onsiteTI', 
            icon: Wrench, 
            label: 'Onsite TI', 
            status: phases.onsiteTI?.status,
            progress: getProgress(inspections.onsiteTI),
            inspectionPath: inspections.onsiteTI?.path
          }
        );
      } else if (isBasicPath) {
        workflowSteps.push(
          { 
            id: 'basicTI', 
            icon: FileCheck, 
            label: 'Mission Reset', 
            status: phases.missionReset?.status,
            progress: getProgress(inspections.missionReset),
            inspectionPath: inspections.missionReset?.path
          },
          { 
            id: 'fullRTI', 
            icon: Camera, 
            label: 'Full RTI', 
            status: phases.fullRTI?.status,
            progress: captureStartTimes[`${hangarId}-fullRTI`] && !inspections.fullRTI?.path
              ? getElapsedProgress(captureStartTimes[`${hangarId}-fullRTI`], 30000)
              : getProgress(inspections.fullRTI),
            inspectionPath: inspections.fullRTI?.path
          }
        );
      }
    }
    
    workflowSteps.push(
      { id: 'clearArea', icon: CheckCircle, label: 'Ready to Open', status: phases.clearArea?.status }
    );
    
    // Find current step
    let currentStepIndex = workflowSteps.findIndex(step => step.status === 'in-progress');
    if (currentStepIndex === -1) {
      const lastCompletedIndex = workflowSteps.map((s, i) => s.status === 'completed' ? i : -1)
        .filter(i => i !== -1)
        .pop();
      if (lastCompletedIndex !== undefined && lastCompletedIndex < workflowSteps.length - 1) {
        currentStepIndex = lastCompletedIndex + 1;
      }
    }
    
    // Get action button for current phase
    const getActionButton = () => {
      // Remote users can only perform Mission Reset
      const isAllowedForRemoteUser = (stepId: string) => {
        if (!isRemoteUser) return true; // Everdrone users can do everything
        return stepId === 'basicTI'; // Remote users can only do Mission Reset
      };
      // First check for Full RTI trigger when Mission Reset is complete but Full RTI not started
      if (phases.missionReset?.status === 'completed' && (!phases.fullRTI?.status || (phases.fullRTI?.status === 'pending')) && routeDecision === 'basic') {
        return (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const response = await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangarId}/generate-full-rti`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  }
                });
                if (response.ok) {
                  // Full RTI generation started
                }
              } catch (error) {
                console.error('Error generating Full RTI:', error);
              }
            }}
            className="mt-3 w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors flex items-center justify-center gap-2 animate-pulse"
          >
            <Camera className="w-4 h-4" />
            Start Full Remote TI
          </button>
        );
      }
      
      // Check if Initial RTI is capturing images (in-progress but no inspection path yet)
      if (phases.initialRTI?.status === 'in-progress' && !inspections.initialRTI?.path) {
        return (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Capturing Initial RTI images...</span>
          </div>
        );
      }
      
      // Show perform inspection button when Initial RTI has a path
      if (phases.initialRTI?.status === 'in-progress' && inspections.initialRTI?.path) {
        if (!isAllowedForRemoteUser('initialRTI')) {
          return (
            <div className="mt-3 px-3 py-2 bg-gray-100 text-gray-500 text-xs rounded border border-gray-200">
              Initial RTI (Everdrone only)
            </div>
          );
        }
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const [h, s] = inspections.initialRTI.path.split('/');
              window.location.href = `/?action=load-session&hangar=${h}&session=${s}&type=initial-remote-ti-inspection&userType=${isRemoteUser ? 'remote' : 'everdrone'}`;
            }}
            className="mt-3 w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
          >
            Perform Initial RTI
          </button>
        );
      }
      
      // Check if Full RTI is capturing images (in-progress but no inspection path yet)
      if (phases.fullRTI?.status === 'in-progress' && !inspections.fullRTI?.path) {
        return (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-600">
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span>Capturing Full RTI images...</span>
          </div>
        );
      }
      
      // Show perform inspection button when Full RTI has a path
      if (phases.fullRTI?.status === 'in-progress' && inspections.fullRTI?.path) {
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const [h, s] = inspections.fullRTI.path.split('/');
              window.location.href = `/?action=load-session&hangar=${h}&session=${s}&type=full-remote-ti-inspection&userType=${isRemoteUser ? 'remote' : 'everdrone'}`;
            }}
            className="mt-3 w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
          >
            Perform Full RTI
          </button>
        );
      }
      
      const currentStep = workflowSteps[currentStepIndex];
      if (!currentStep) return null;
      
      // Check if this is an inspection that needs to be opened
      if (currentStep.inspectionPath && currentStep.progress !== undefined && currentStep.progress >= 0) {
        const actionText = currentStep.progress === 0 ? `Perform ${currentStep.label}` : `Continue ${currentStep.label}`;
        
        if (!isAllowedForRemoteUser(currentStep.id)) {
          return (
            <div className="mt-3 px-3 py-2 bg-gray-100 text-gray-500 text-xs rounded border border-gray-200">
              {currentStep.label} (Everdrone only)
            </div>
          );
        }
        
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const [h, s] = currentStep.inspectionPath!.split('/');
              const typeMap: any = {
                'initialRTI': 'initial-remote-ti-inspection',
                'basicTI': 'mission-reset-inspection',
                'onsiteTI': 'onsite-ti-inspection',
                'fullRTI': 'full-remote-ti-inspection'
              };
              window.location.href = `/?action=load-session&hangar=${h}&session=${s}&type=${typeMap[currentStep.id]}&userType=${isRemoteUser ? 'remote' : 'everdrone'}`;
            }}
            className="mt-3 w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
          >
            {actionText}
          </button>
        );
      }
      
      // Handle clear area button - show when Full RTI or Onsite TI is complete
      if ((phases.fullRTI?.status === 'completed' || phases.onsiteTI?.status === 'completed') && 
          (!phases.clearArea?.status || phases.clearArea?.status === 'pending')) {
        return (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const response = await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangarId}/clear-area`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  }
                });
                if (response.ok) {
                  // Area cleared successfully
                }
              } catch (error) {
                console.error('Error clearing area:', error);
              }
            }}
            className="mt-3 w-full px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded transition-colors animate-pulse"
          >
            Area Ready to Open
          </button>
        );
      }
      
      // Handle clear area in progress
      if (currentStep.id === 'clearArea' && currentStep.status === 'in-progress') {
        return (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const response = await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangarId}/clear-area`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  }
                });
                if (response.ok) {
                  // Area cleared successfully
                }
              } catch (error) {
                console.error('Error clearing area:', error);
              }
            }}
            className="mt-3 w-full px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-xs font-medium rounded transition-colors"
          >
            Area Ready to Open
          </button>
        );
      }
      
      // Handle route decision - show buttons directly when available
      if (currentStep.id === 'route' && currentStep.highlight) {
        return (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const response = await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangarId}/route-decision`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ route: 'basic' }),
                    });
                    if (response.ok) {
                      // Route set
                    }
                  } catch (error) {
                    console.error('Error setting route:', error);
                  }
                }}
                className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors flex flex-col items-center gap-1"
              >
                <FileCheck className="w-4 h-4" />
                <span>Mission Reset → Full RTI</span>
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const response = await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangarId}/route-decision`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({ route: 'onsite' }),
                    });
                    if (response.ok) {
                      // Automatically generate Onsite TI after route decision
                      setTimeout(async () => {
                        await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangarId}/generate-onsite-ti`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          }
                        });
                      }, 500); // Small delay to ensure route is saved
                    }
                  } catch (error) {
                    console.error('Error setting route:', error);
                  }
                }}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded transition-colors flex flex-col items-center gap-1"
              >
                <Wrench className="w-4 h-4" />
                <span>Onsite TI</span>
              </button>
            </div>
          </div>
        );
      }
      
      return null;
    };
    
    return (
      <div>
        <div className="mt-3">
          {/* Workflow Timeline */}
          <div className="relative pb-3">
            {/* Connection line - positioned at fixed height */}
            <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-300" />
            
            {/* Steps container with fixed height alignment */}
            <div className="relative flex items-start justify-between">
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                const isCompleted = step.status === 'completed';
                const isInProgress = step.status === 'in-progress';
                const isPending = !step.status || step.status === 'pending';
                const isCurrent = index === currentStepIndex;
                const hasProgress = isInProgress && step.progress !== undefined && step.progress > 0;
                
                // For route decision point
                if (step.id === 'route') {
                  if (step.status === 'completed') {
                    // Decision made
                    return (
                      <div key={step.id} className="flex flex-col items-center z-10 flex-1">
                        <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                          <CheckCircle className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-[10px] mt-1 text-green-600 font-medium">Decided</span>
                      </div>
                    );
                  } else if (step.highlight) {
                    // Active decision point - ready to decide
                    return (
                      <div key={step.id} className="flex flex-col items-center z-10 flex-1">
                        <div className="w-8 h-8 bg-amber-50 border-2 border-amber-300 rounded-full flex items-center justify-center animate-pulse shadow-sm">
                          <AlertCircle className="w-4 h-4 text-amber-600" />
                        </div>
                        <span className="text-[10px] mt-1 text-amber-600 font-medium">Decision</span>
                      </div>
                    );
                  } else {
                    // Pending decision - not ready yet (keep grey like other pending items)
                    return (
                      <div key={step.id} className="flex flex-col items-center z-10 flex-1">
                        <div className="w-8 h-8 bg-white border-2 border-gray-200 rounded-full flex items-center justify-center shadow-sm">
                          <AlertCircle className="w-4 h-4 text-gray-400" />
                        </div>
                        <span className="text-[10px] mt-1 text-gray-400">Decision</span>
                      </div>
                    );
                  }
                }
                
                
                return (
                  <div key={`${step.id}-${index}`} className="flex flex-col items-center z-10 flex-1">
                    {/* Step circle - always at same height */}
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm
                      ${isCompleted ? 'bg-green-500' : ''}
                      ${isInProgress ? 'bg-blue-500 ring-4 ring-blue-100' : ''}
                      ${isPending ? 'bg-white border-2 border-gray-200' : ''}
                    `}>
                      <Icon className={`
                        w-4 h-4
                        ${isCompleted || isInProgress ? 'text-white' : 'text-gray-400'}
                      `} />
                    </div>
                    
                    {/* Step label */}
                    <span className={`
                      text-[10px] mt-1 text-center
                      ${isCompleted ? 'text-green-600 font-medium' : ''}
                      ${isInProgress ? 'text-blue-600 font-semibold' : ''}
                      ${isPending ? 'text-gray-400' : ''}
                    `}>
                      {step.label}
                    </span>
                    
                    {/* Compact progress indicator for in-progress inspections (only when inspection path exists) */}
                    {isInProgress && hasProgress && step.progress && step.progress > 0 && step.inspectionPath && (
                      <div className="text-[9px] text-blue-600 font-medium">
                        {step.progress}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
          </div>
          
        </div>
        {getActionButton()}
      </div>
    );
  };

  const getStatusIcon = (state: string, alarmSession?: any, isRemote?: boolean) => {
    // For remote users, show icons based on their simplified states
    if (isRemote && alarmSession?.workflow?.phases) {
      const phases = alarmSession.workflow.phases;
      const routeDecision = alarmSession.workflow.routeDecision;
      
      if (phases.clearArea?.status === 'completed') {
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      } else if (phases.missionReset?.status === 'completed') {
        return <Shield className="w-6 h-6 text-purple-600" />;
      } else if (routeDecision === 'basic' && (phases.missionReset?.status === 'pending' || phases.missionReset?.status === 'in-progress')) {
        return <FileCheck className="w-6 h-6 text-blue-600" />;
      } else if (routeDecision === 'onsite') {
        return <Wrench className="w-6 h-6 text-gray-500" />;
      } else if (phases.flight?.status) {
        return <Clock className="w-6 h-6 text-yellow-600" />;
      }
    }
    
    switch(state) {
      case 'standby':
        return <CheckCircle className="w-6 h-6 text-green-600" />;
      case 'alarm':
        return <AlertCircle className="w-6 h-6 text-red-600 animate-pulse" />;
      case 'post_flight':
        return <Clock className="w-6 h-6 text-yellow-600" />;
      case 'inspection':
        return <Wrench className="w-6 h-6 text-blue-600" />;
      case 'verification':
        return <Radio className="w-6 h-6 text-purple-600" />;
      default:
        return <CheckCircle className="w-6 h-6 text-gray-500" />;
    }
  };

  const getStatusColor = (state: string, hasWorkflow: boolean = false, isRemote: boolean = false, alarmSession?: any, operational?: boolean) => {
    // Non-operational hangars get yellow border
    if (!operational) {
      return 'bg-white border-yellow-400 shadow-lg hover:shadow-xl';
    }
    // For remote users, use different colors based on their simplified states
    if (isRemote && hasWorkflow && state !== 'standby') {
      // Check if in "Standby for inspection" state (initial RTI completed, awaiting decision)
      const phases = alarmSession?.workflow?.phases || {};
      const routeDecision = alarmSession?.workflow?.routeDecision;
      const inspections = alarmSession?.inspections || {};
      
      if (!routeDecision && (phases.initialRTI?.status === 'completed' || inspections.initialRTI?.path)) {
        // This is the "Standby for inspection" state - add pulsating effect
        return 'bg-white border-amber-400 shadow-lg hover:shadow-xl animate-pulse';
      }
      
      // Check if Mission Reset is ready to perform
      if (routeDecision === 'basic' && inspections.missionReset?.path) {
        // Inspection is available - blue card
        return 'bg-white border-blue-400 shadow-lg hover:shadow-xl';
      }
      
      // Check the actual workflow state for remote users
      return 'bg-white border-amber-400 shadow-lg hover:shadow-xl';
    }
    
    // Blue background when workflow is in progress (Everdrone users)
    if (hasWorkflow && state !== 'standby' && !isRemote) {
      return 'bg-white border-blue-400 shadow-lg hover:shadow-xl';
    }
    
    switch(state) {
      case 'standby':
        return 'bg-white border-green-400 shadow-lg hover:shadow-xl';
      case 'alarm':
        return 'bg-white border-red-400 animate-pulse shadow-xl';
      case 'post_flight':
        return 'bg-white border-amber-400 shadow-lg hover:shadow-xl';
      case 'inspection':
        return 'bg-white border-blue-400 shadow-lg hover:shadow-xl';
      case 'verification':
        return 'bg-white border-violet-400 shadow-lg hover:shadow-xl';
      default:
        return 'bg-white border-gray-300 shadow-lg hover:shadow-xl';
    }
  };

  const getStatusLabel = (state: string, currentPhase?: string, alarmSession?: any, isRemote?: boolean, operational?: boolean, isMaintenanceOverdue?: boolean) => {
    // Non-operational hangars show "Under Construction"
    if (!operational) {
      return 'Under Construction';
    }
    
    // Check for overdue maintenance in standby state
    if (state === 'standby' && isMaintenanceOverdue) {
      return 'Maintenance Required';
    }
    
    // For remote users, show simplified states
    if (isRemote && alarmSession?.workflow?.phases) {
      const phases = alarmSession.workflow.phases;
      const routeDecision = alarmSession.workflow.routeDecision;
      const inspections = alarmSession.inspections || {};
      
      if (phases.clearArea?.status === 'completed') {
        return 'Open - Ready for alarm!';
      } else if (phases.missionReset?.status === 'completed') {
        return 'Final Validation';
      } else if (routeDecision === 'basic' && (phases.missionReset?.status === 'pending' || phases.missionReset?.status === 'in-progress')) {
        return 'Ready for Inspection';
      } else if (routeDecision === 'onsite') {
        return 'No Action Required';
      } else if (phases.flight?.status) {
        return 'Standby for Inspection';
      }
    }
    
    // More accurate status based on current phase (Everdrone users)
    if (currentPhase) {
      if (currentPhase.toLowerCase().includes('initial remote ti')) return 'Initial RTI';
      if (currentPhase.toLowerCase().includes('basic ti') || currentPhase.toLowerCase().includes('mission reset')) return 'Mission Reset Active';
      if (currentPhase.toLowerCase().includes('remote crew')) return 'Field Team Active';
      if (currentPhase.toLowerCase().includes('initial')) return 'Initial Assessment';
    }
    
    switch(state) {
      case 'standby':
        return 'Open - Ready for alarm!';
      case 'alarm':
        return 'Alarm Active';
      case 'post_flight':
        return 'Post-Flight';
      case 'inspection':
        return 'Inspection';
      case 'verification':
        return 'Verification';
      default:
        return state;
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    // Simulate refresh
    setTimeout(() => {
      setLoading(false);
    }, 500);
  };

  const handleTriggerAlarm = async (hangarId: string, droneId?: string) => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/trigger-alarm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hangarId,
          droneId: droneId || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Alarm triggered:', data);
        // Update the hangar status to show alarm state
        setHangarStatuses(prev => prev.map(h => {
          if (h.id === hangarId) {
            return {
              ...h,
              state: 'alarm',
              currentPhase: 'Flight in progress',
              lastActivity: 'Just now',
              activeInspection: {
                type: 'Alarm Response',
                progress: 0,
                assignedTo: 'System'
              }
            };
          }
          return h;
        }));
        
        // Start workflow progression
        startWorkflowProgression(hangarId);
      } else {
        console.error('Failed to trigger alarm');
      }
    } catch (error) {
      console.error('Error triggering alarm:', error);
    }
  };

  const startWorkflowProgression = (hangarId: string) => {
    // 5 seconds: Land drone
    setTimeout(async () => {
      await updatePhase(hangarId, 'landing', {
        status: 'completed',
        timestamp: new Date().toISOString()
      });
      await updatePhase(hangarId, 'flight', {
        status: 'completed',
        endTime: new Date().toISOString()
      });
      
      setHangarStatuses(prev => prev.map(h => {
        if (h.id === hangarId) {
          return {
            ...h,
            state: 'post_flight',
            currentPhase: 'Drone landed',
            lastActivity: 'Just landed'
          };
        }
        return h;
      }));
    }, 5000);

    // 10 seconds: Start telemetry analysis
    setTimeout(async () => {
      await updatePhase(hangarId, 'telemetryAnalysis', {
        status: 'in-progress',
        startTime: new Date().toISOString()
      });
      
      setHangarStatuses(prev => prev.map(h => {
        if (h.id === hangarId) {
          return {
            ...h,
            currentPhase: 'Analyzing telemetry',
            activeInspection: {
              type: 'Telemetry Analysis',
              progress: 50,
              assignedTo: 'System'
            }
          };
        }
        return h;
      }));
    }, 10000);

    // 15 seconds: Complete telemetry and trigger Initial Remote TI
    setTimeout(async () => {
      await updatePhase(hangarId, 'telemetryAnalysis', {
        status: 'completed',
        endTime: new Date().toISOString(),
        data: {
          batteryRemaining: 65,
          flightDuration: 12,
          errors: []
        }
      });
      
      // Start Initial Remote TI phase
      await updatePhase(hangarId, 'initialRTI', {
        status: 'in-progress',
        startTime: new Date().toISOString()
      });
      
      setHangarStatuses(prev => prev.map(h => {
        if (h.id === hangarId) {
          return {
            ...h,
            state: 'inspection',
            currentPhase: 'Generating Initial RTI',
            activeInspection: {
              type: 'Initial Remote TI',
              progress: 0,
              assignedTo: 'System'
            }
          };
        }
        return h;
      }));
      
      // Generate the actual Initial RTI inspection after 2 seconds
      setTimeout(async () => {
        try {
          // Update status to show we're capturing images
          setHangarStatuses(prev => prev.map(h => {
            if (h.id === hangarId) {
              return {
                ...h,
                currentPhase: 'Capturing images...',
                activeInspection: {
                  type: 'Initial Remote TI',
                  progress: 5,
                  assignedTo: 'System'
                }
              };
            }
            return h;
          }));
          
          const response = await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangarId}/generate-initial-rti`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log('Initial RTI generation started:', data);
            
            // Show capturing status without progress bar
            setHangarStatuses(prev => prev.map(h => {
              if (h.id === hangarId) {
                return {
                  ...h,
                  currentPhase: 'Capturing camera images...',
                  activeInspection: {
                    type: 'Initial Remote TI',
                    progress: 0,
                    assignedTo: 'System'
                  }
                };
              }
              return h;
            }));
            
            // After 40 seconds, show as ready
            setTimeout(() => {
              
              // Update status to show inspection is ready
              setHangarStatuses(prev => prev.map(h => {
                if (h.id === hangarId) {
                  return {
                    ...h,
                    currentPhase: 'Initial Remote TI Ready',
                    activeInspection: {
                      type: 'Initial Remote TI',
                      progress: 10,
                      assignedTo: 'Everdrone'
                    }
                  };
                }
                return h;
              }));
            }, 40000);
          }
        } catch (error) {
          console.error('Error generating Initial RTI:', error);
        }
      }, 2000);
    }, 15000);
  };

  const updatePhase = async (hangarId: string, phase: string, updates: any) => {
    try {
      await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangarId}/update-phase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phase, updates }),
      });
    } catch (error) {
      console.error('Error updating phase:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading hangar statuses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-800">Hangar Dashboard</h1>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600 px-3 py-1.5 bg-white/50 rounded-lg">
                <User className="w-4 h-4" />
                <span>{currentUser}</span>
                <span className="text-xs text-gray-400">({
                  userType === 'admin' ? 'Admin' :
                  userType === 'everdrone' ? 'Everdrone' : 'Service Partner'
                })</span>
              </div>
              <button
                onClick={handleRefresh}
                className="p-2 hover:bg-white/50 rounded-lg transition-all text-gray-600 hover:text-gray-800"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              {userType === 'admin' && (
                <button
                  onClick={() => setShowAdminPanel(true)}
                  className="p-2 hover:bg-white/50 rounded-lg transition-all text-gray-600 hover:text-gray-800"
                  title="Admin Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
              {(userType === 'admin' || userType === 'everdrone') && (
                <>
                  <Button
                    onClick={onProceedToInspection}
                    size="sm"
                    className="bg-blue-500 hover:bg-blue-600 text-white shadow-sm"
                  >
                    Manual Inspection
                  </Button>
                  <Button
                    onClick={() => {
                      setShowPDFModal(true);
                      fetchAvailableInspections();
                    }}
                    size="sm"
                    className="bg-purple-500 hover:bg-purple-600 text-white shadow-sm flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Generate PDF
                  </Button>
                </>
              )}
              <Button
                onClick={onLogout}
                variant="ghost"
                size="sm"
                className="text-gray-600 hover:text-gray-800"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="p-8">

        {/* Hangar Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 auto-rows-fr">
          {hangarStatuses.map(hangar => {
            // Check if maintenance is overdue (only for admin/everdrone users and when in standby state)
            const isMaintenanceOverdue = (userType === 'admin' || userType === 'everdrone') && hangar.operational && hangar.assignedDrone && hangar.state === 'standby' && (
              (hangar.maintenanceHistory?.lastOnsiteTI && getDaysSince(hangar.maintenanceHistory.lastOnsiteTI) > 30) ||
              (hangar.maintenanceHistory?.lastExtendedTI && getDaysSince(hangar.maintenanceHistory.lastExtendedTI) > 60) ||
              (hangar.maintenanceHistory?.lastService && getDaysSince(hangar.maintenanceHistory.lastService) > 90) ||
              (!hangar.maintenanceHistory?.lastOnsiteTI && !hangar.maintenanceHistory?.lastExtendedTI && !hangar.maintenanceHistory?.lastService)
            );

            return (
            <div
              key={hangar.id}
              className={`relative rounded-xl border-[6px] p-5 cursor-pointer transition-all ${
                !hangar.operational ? 'min-h-[120px]' : 'min-h-[200px]'
              } flex flex-col ${
                isMaintenanceOverdue && hangar.state === 'standby' 
                  ? 'bg-red-50 border-red-400 hover:border-red-500 hover:shadow-lg' 
                  : getStatusColor(hangar.state, !!hangar.alarmSession?.workflow?.phases, userType === 'service_partner', hangar.alarmSession, hangar.operational)
              }`}
              onClick={() => {
                if (hangar.state !== 'standby' && hangar.operational) {
                  setSelectedHangar(hangar.id);
                }
              }}
            >
              <div className={`flex justify-between items-start ${hangar.operational ? 'mb-4' : ''}`}>
                <div className="flex-1">
                  <h3 className={`font-bold text-gray-900 ${hangar.operational ? 'text-lg' : 'text-base'}`}>{hangar.name}</h3>
                  {hangar.operational && (
                    <p className="text-xs text-gray-500 mt-0.5">{hangar.assignedDrone || 'No drone'}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* Show button for remote users when inspection is ready but not completed */}
                  {userType === 'service_partner' && hangar.alarmSession?.workflow?.routeDecision === 'basic' && 
                   hangar.alarmSession?.inspections?.missionReset?.path && 
                   hangar.alarmSession?.workflow?.phases?.missionReset?.status !== 'completed' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const [h, s] = hangar.alarmSession.inspections.missionReset.path.split('/');
                        window.location.href = `/?action=load-session&hangar=${h}&session=${s}&type=mission-reset-inspection&userType=remote`;
                      }}
                      className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-600 text-sm font-medium rounded-lg transition-all border-2 border-blue-400 flex items-center gap-2 animate-pulse"
                    >
                      <FileCheck className="w-4 h-4" />
                      {hangar.alarmSession?.inspections?.missionReset?.progress && hangar.alarmSession.inspections.missionReset.progress !== '0%' 
                        ? 'Continue Mission Reset' 
                        : 'Perform Mission Reset'}
                    </button>
                  )}
                  {(hangar.state === 'standby' || !hangar.operational) && (
                    <span className={`font-semibold ${
                      !hangar.operational ? 'text-yellow-700' : 
                      isMaintenanceOverdue ? 'text-red-700' : 
                      'text-green-700'
                    } text-base`}>
                      {getStatusLabel(hangar.state, hangar.currentPhase, hangar.alarmSession, userType === 'service_partner', hangar.operational, !!isMaintenanceOverdue)}
                    </span>
                  )}
                  {hangar.operational && (
                    isMaintenanceOverdue && hangar.state === 'standby' 
                      ? <XCircle className="w-6 h-6 text-red-600" />
                      : getStatusIcon(hangar.state, hangar.alarmSession, userType === 'service_partner')
                  )}
                </div>
              </div>
              
              {/* Maintenance History - Only show for everdrone users when no workflow is active */}
              {userType === 'everdrone' && hangar.operational && hangar.assignedDrone && hangar.state === 'standby' && (
                <div className="mt-auto pt-4 mt-4 border-t-2 border-gray-100">
                  <div className="flex justify-between items-center mb-3">
                    <div className="text-sm font-semibold text-gray-700">
                      Maintenance History - {hangar.assignedDrone}
                    </div>
                    {/* Show warning badge if any maintenance is overdue */}
                    {((hangar.maintenanceHistory?.lastOnsiteTI && getDaysSince(hangar.maintenanceHistory.lastOnsiteTI) > 30) ||
                      (hangar.maintenanceHistory?.lastExtendedTI && getDaysSince(hangar.maintenanceHistory.lastExtendedTI) > 60) ||
                      (hangar.maintenanceHistory?.lastService && getDaysSince(hangar.maintenanceHistory.lastService) > 90) ||
                      (!hangar.maintenanceHistory?.lastOnsiteTI && !hangar.maintenanceHistory?.lastExtendedTI && !hangar.maintenanceHistory?.lastService)) && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded-md text-xs font-semibold">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Alarm
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="text-xs text-gray-500 mb-1.5 font-medium">OnsiteTI:</div>
                      <div className={`text-sm font-bold ${
                        hangar.maintenanceHistory?.lastOnsiteTI 
                          ? getDaysSince(hangar.maintenanceHistory.lastOnsiteTI) > 30 ? 'text-red-600' : 'text-green-600'
                          : 'text-gray-400'
                      }`}>
                        {hangar.maintenanceHistory?.lastOnsiteTI 
                          ? `${getDaysSince(hangar.maintenanceHistory.lastOnsiteTI)} days ago`
                          : 'Never'}
                      </div>
                    </div>
                    <div className="flex-1 text-center">
                      <div className="text-xs text-gray-500 mb-1.5 font-medium">ExtendedTI:</div>
                      <div className={`text-sm font-bold ${
                        hangar.maintenanceHistory?.lastExtendedTI 
                          ? getDaysSince(hangar.maintenanceHistory.lastExtendedTI) > 60 ? 'text-red-600' : 'text-green-600'
                          : 'text-gray-400'
                      }`}>
                        {hangar.maintenanceHistory?.lastExtendedTI 
                          ? `${getDaysSince(hangar.maintenanceHistory.lastExtendedTI)} days ago`
                          : 'Never'}
                      </div>
                    </div>
                    <div className="flex-1 text-right">
                      <div className="text-xs text-gray-500 mb-1.5 font-medium">Service:</div>
                      <div className={`text-sm font-bold ${
                        hangar.maintenanceHistory?.lastService 
                          ? getDaysSince(hangar.maintenanceHistory.lastService) > 90 ? 'text-red-600' : 'text-green-600'
                          : 'text-gray-400'
                      }`}>
                        {hangar.maintenanceHistory?.lastService 
                          ? `${getDaysSince(hangar.maintenanceHistory.lastService)} days ago`
                          : 'Never'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex-1 flex flex-col justify-end">
                
                {hangar.alarmSession && hangar.state !== 'standby' && hangar.operational ? (
                  <>
                    {userType === 'service_partner' ? (
                      /* Simplified view for remote users */
                      <RemoteUserStatus 
                        alarmSession={hangar.alarmSession} 
                        hangarId={hangar.id}
                      />
                    ) : (
                      /* Full Workflow Timeline for Everdrone users */
                      <WorkflowTimeline 
                        alarmSession={hangar.alarmSession} 
                        hangarId={hangar.id}
                        isRemoteUser={false}
                        onOpenWorkflow={() => {
                          setSelectedHangar(hangar.id);
                        }}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {/* Show alarm button for Everdrone users when operational and not overdue */}
                    {hangar.state === 'standby' && (userType === 'admin' || userType === 'everdrone') && hangar.operational && !isMaintenanceOverdue && (
                      <div className="flex justify-center mt-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTriggerAlarm(hangar.id, hangar.assignedDrone);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-all hover:shadow-md"
                        >
                          <PlayCircle className="w-4 h-4" />
                          Trigger inspection workflow
                        </button>
                      </div>
                    )}
                    {/* Show maintenance required message when overdue */}
                    {hangar.state === 'standby' && (userType === 'admin' || userType === 'everdrone') && hangar.operational && isMaintenanceOverdue && (
                      <div className="flex justify-center mt-4">
                        <div className="text-sm text-red-600 font-medium">
                          Cannot trigger workflow - Maintenance required
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            );
          })}
        </div>

      </div>

      {/* Admin Panel Modal */}
      <AdminPanel 
        isOpen={showAdminPanel}
        onClose={() => setShowAdminPanel(false)}
      />
      
      {/* PDF Generation Modal */}
      {showPDFModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6">
              <h2 className="text-2xl font-bold">Generate PDF Report</h2>
              <p className="text-purple-100 mt-1">Select an inspection to generate a PDF report</p>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {availableInspections.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-700 mb-2">No Completed Inspections</h3>
                  <p className="text-gray-500">There are no completed inspections available to generate reports.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableInspections.map((inspection, index) => {
                    const completedDate = new Date(inspection.completedAt);
                    const isSelected = selectedPDFInspection === inspection;
                    
                    return (
                      <div
                        key={index}
                        onClick={() => setSelectedPDFInspection(inspection)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected 
                            ? 'border-purple-500 bg-purple-50' 
                            : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-gray-800">
                              {inspection.hangarName} - {inspection.droneId}
                            </h3>
                            <p className="text-sm text-gray-600 mt-1">
                              Session: {inspection.sessionName}
                            </p>
                            <p className="text-sm text-gray-600">
                              Type: {inspection.inspectionType || inspection.inspection.type || 'Standard Inspection'}
                            </p>
                            <p className="text-sm text-gray-600">
                              Inspector: {inspection.inspectorName}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-700">
                              {completedDate.toLocaleDateString()}
                            </p>
                            <p className="text-xs text-gray-500">
                              {completedDate.toLocaleTimeString()}
                            </p>
                            <div className="mt-2">
                              {inspection.inspection.tasks && (
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-green-600">
                                    ✓ {inspection.inspection.tasks.filter((t: any) => t.status === 'pass').length}
                                  </span>
                                  <span className="text-red-600">
                                    ✗ {inspection.inspection.tasks.filter((t: any) => t.status === 'fail').length}
                                  </span>
                                  <span className="text-gray-500">
                                    - {inspection.inspection.tasks.filter((t: any) => t.status === 'na').length}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className="p-6 bg-gray-50 border-t flex justify-between items-center">
              <button
                onClick={() => {
                  setShowPDFModal(false);
                  setSelectedPDFInspection(null);
                }}
                disabled={loadingPDF}
                className="px-6 py-2 text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => selectedPDFInspection && generatePDFReport(selectedPDFInspection)}
                disabled={!selectedPDFInspection || loadingPDF}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {loadingPDF ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    Generate PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HangarDashboard;