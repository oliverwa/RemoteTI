import React, { useState, useEffect, Fragment } from 'react';
import { Button } from './ui/button';
import { HANGARS } from '../constants';
import { AlertCircle, CheckCircle, Clock, Wrench, Radio, ArrowRight, User, RefreshCw, Timer, AlertTriangle, BarChart, Camera, FileCheck, HelpCircle, Shield, Settings, FileText, XCircle, PlayCircle } from 'lucide-react';
import AdminPanel from './AdminPanel';
import TelemetryAnalysis from './TelemetryAnalysis';
import { API_CONFIG } from '../config/api.config';
import authService from '../services/authService';

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
  status?: 'operational' | 'maintenance' | 'construction';
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
  const [visibleHangars, setVisibleHangars] = useState<any[]>([]);
  const [hangarStatuses, setHangarStatuses] = useState<HangarStatusData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hangarsLoading, setHangarsLoading] = useState(true);
  const [selectedHangar, setSelectedHangar] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showTelemetryAnalysis, setShowTelemetryAnalysis] = useState(false);
  const [telemetryHangar, setTelemetryHangar] = useState<any>(null);
  const [captureStartTimes, setCaptureStartTimes] = useState<{ [key: string]: number }>({});
  const [maintenanceHistory, setMaintenanceHistory] = useState<{[key: string]: any}>({});
  const [availableInspections, setAvailableInspections] = useState<any[]>([]);

  // Helper function to calculate days since a date
  const getDaysSince = (dateString: string): number => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Helper function to format time since with more granularity
  const formatTimeSince = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 60) {
      return `${diffMinutes}m`;
    } else if (diffHours < 24) {
      return `${diffHours}h`;
    } else if (diffDays < 7) {
      return `${diffDays}d`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks}w`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months}mo`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years}y`;
    }
  };


  // Fetch hangars from backend (reads from hangars.json)
  const fetchHangars = async () => {
      try {
        const response = await fetch(`${API_CONFIG.BASE_URL}/api/hangars`, {
          headers: {
            'Authorization': `Bearer ${authService.getToken()}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.success && data.hangars) {
            // Filter based on user type and status
            const hangars = data.hangars.filter((h: any) => {
              if (userType === 'service_partner') {
                // Service partners only see operational hangars
                return h.status === 'operational';
              }
              return true; // Admin and everdrone see all
            });
            setVisibleHangars(hangars);
          } else {
            // Fallback to constants
            setVisibleHangars(userType === 'service_partner' 
              ? HANGARS.filter(hangar => hangar.status === 'operational')
              : HANGARS);
          }
        } else {
          // Fallback to constants
          setVisibleHangars(userType === 'service_partner' 
            ? HANGARS.filter(hangar => hangar.status === 'operational')
            : HANGARS);
        }
      } catch (error) {
        console.error('Error fetching hangars:', error);
        // Fallback to constants
        setVisibleHangars(userType === 'service_partner' 
          ? HANGARS.filter(hangar => hangar.operational !== false)
          : HANGARS);
      } finally {
        setHangarsLoading(false);
      }
    };

  useEffect(() => {
    fetchHangars();
    
    // Poll for hangar updates every 5 seconds
    const interval = setInterval(fetchHangars, 5000);
    return () => clearInterval(interval);
  }, [userType]);

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
          status: hangar.status || 'operational', // Use status from admin panel
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
                      currentPhase = '🚨 Initial assessment complete - Choose route';
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
    
    if (visibleHangars.length > 0) {
      fetchHangarStatuses();
    } else {
      setLoading(false);
    }
    
    // Poll for updates every 5 seconds (only if we have hangars)
    let interval: NodeJS.Timeout | undefined;
    if (visibleHangars.length > 0) {
      interval = setInterval(fetchHangarStatuses, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [visibleHangars, userType]);

  // Simplified status component for remote users
  const RemoteUserStatus = ({ alarmSession, hangarId, hangar }: any) => {
    const phases = alarmSession?.workflow?.phases || {};
    const routeDecision = alarmSession?.workflow?.routeDecision;
    const inspections = alarmSession?.inspections || {};
    
    // Determine current phase for display
    let currentPhase = '';
    if (phases.initialRTI?.status === 'in-progress') {
      currentPhase = 'Initial assessment';
    } else if (phases.telemetryAnalysis?.status === 'in-progress') {
      currentPhase = 'Analyzing data';
    }
    
    // Get status text for remote users
    const getRemoteStatusText = () => {
      // Always show "Standby for inspection" for all stages before route decision
      if (!routeDecision && phases.telemetryAnalysis?.status) {
        return 'Standby for inspection';
      }
      return '';
    };
    
    // Determine remote user state
    let canPerformBasicTI = false;
    
    if (!phases.telemetryAnalysis?.status) {
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
  const WorkflowTimeline = ({ alarmSession, hangarId, onOpenWorkflow, isRemoteUser, captureStartTimes, setCaptureStartTimes }: any) => {
    const phases = alarmSession?.workflow?.phases || {};
    const routeDecision = alarmSession?.workflow?.routeDecision;
    const inspections = alarmSession?.inspections || {};
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
          setCaptureStartTimes((prev: any) => ({ ...prev, [key]: Date.now() }));
        }
      } else if (inspections.initialRTI?.path) {
        // Clear when complete
        const key = `${hangarId}-initialRTI`;
        if (captureStartTimes[key]) {
          setCaptureStartTimes((prev: any) => {
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
          setCaptureStartTimes((prev: any) => ({ ...prev, [key]: Date.now() }));
        }
      } else if (inspections.fullRTI?.path) {
        // Clear when complete
        const key = `${hangarId}-fullRTI`;
        if (captureStartTimes[key]) {
          setCaptureStartTimes((prev: any) => {
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
      clickable?: boolean;
      needsAttention?: boolean;
    }> = [
      { 
        id: 'telemetryAnalysis', 
        icon: BarChart, 
        label: 'Data Analysis', 
        status: phases.telemetryAnalysis?.status === 'completed' && (phases.initialRTI?.status || routeDecision) 
          ? 'completed' 
          : phases.telemetryAnalysis?.status,
        clickable: phases.telemetryAnalysis?.status === 'in-progress' || phases.telemetryAnalysis?.status === 'completed',
        needsAttention: phases.telemetryAnalysis?.status === 'completed' && !phases.initialRTI?.status && !routeDecision
      },
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
    
    // Show route decision point ONLY when Initial RTI is actually complete
    const initialRTIReady = phases.initialRTI?.status === 'completed' || 
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
              window.location.href = `/?action=load-session&hangar=${h}&session=${s}&type=initial-remote-ti-inspection&userType=${userType}`;
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
              window.location.href = `/?action=load-session&hangar=${h}&session=${s}&type=full-remote-ti-inspection&userType=${userType}`;
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
              window.location.href = `/?action=load-session&hangar=${h}&session=${s}&type=${typeMap[currentStep.id]}&userType=${userType}`;
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
                
                
                const isClickable = (step as any).clickable;
                const needsAttention = (step as any).needsAttention;
                
                return (
                  <div key={`${step.id}-${index}`} className="flex flex-col items-center z-10 flex-1">
                    {/* Step circle - always at same height */}
                    <div 
                      className={`
                        w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm
                        ${step.id === 'telemetryAnalysis' && isCompleted && phases.telemetryAnalysis?.result === 'fail' ? 'bg-red-500' : ''}
                        ${step.id === 'telemetryAnalysis' && isCompleted && phases.telemetryAnalysis?.result === 'warning' ? 'bg-yellow-500' : ''}
                        ${step.id === 'telemetryAnalysis' && isCompleted && phases.telemetryAnalysis?.result === 'pass' ? 'bg-green-500' : ''}
                        ${step.id !== 'telemetryAnalysis' && isCompleted && !needsAttention ? 'bg-green-500' : ''}
                        ${step.id !== 'telemetryAnalysis' && isCompleted && needsAttention ? 'bg-amber-500 animate-pulse ring-4 ring-amber-100' : ''}
                        ${isInProgress ? 'bg-blue-500 ring-4 ring-blue-100' : ''}
                        ${isPending ? 'bg-white border-2 border-gray-200' : ''}
                        ${isClickable ? 'cursor-pointer hover:scale-110' : ''}
                      `}
                      onClick={() => {
                        if (isClickable && step.id === 'telemetryAnalysis') {
                          const currentHangar = hangarStatuses.find(h => h.id === hangarId);
                          if (currentHangar) {
                            setTelemetryHangar(currentHangar);
                            setShowTelemetryAnalysis(true);
                          }
                        }
                      }}
                      title={isClickable ? 'Click to view analysis' : ''}
                    >
                      <Icon className={`
                        w-4 h-4
                        ${isCompleted || isInProgress ? 'text-white' : 'text-gray-400'}
                      `} />
                    </div>
                    
                    {/* Step label */}
                    <span className={`
                      text-[10px] mt-1 text-center
                      ${step.id === 'telemetryAnalysis' && isCompleted && phases.telemetryAnalysis?.result === 'fail' ? 'text-red-600 font-medium' : ''}
                      ${step.id === 'telemetryAnalysis' && isCompleted && phases.telemetryAnalysis?.result === 'warning' ? 'text-yellow-600 font-medium' : ''}
                      ${step.id === 'telemetryAnalysis' && isCompleted && phases.telemetryAnalysis?.result === 'pass' ? 'text-green-600 font-medium' : ''}
                      ${step.id !== 'telemetryAnalysis' && isCompleted ? 'text-green-600 font-medium' : ''}
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

  const getStatusColor = (state: string, hasWorkflow: boolean = false, isRemote: boolean = false, alarmSession?: any, status?: string) => {
    // Handle different hangar statuses
    if (status === 'construction') {
      return 'bg-white border-yellow-400 shadow-lg hover:shadow-xl';
    } else if (status === 'maintenance') {
      return 'bg-white border-orange-400 shadow-lg hover:shadow-xl';
    }
    // For remote users, use different colors based on their simplified states
    if (isRemote && hasWorkflow && state !== 'standby') {
      // Check if in "Standby for inspection" state (initial RTI completed, awaiting decision)
      const phases = alarmSession?.workflow?.phases || {};
      const routeDecision = alarmSession?.workflow?.routeDecision;
      const inspections = alarmSession?.inspections || {};
      
      if (!routeDecision && (phases.initialRTI?.status === 'completed' || inspections.initialRTI?.path)) {
        // This is the "Standby for inspection" state - subtle animation
        return 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-400 shadow-lg hover:shadow-xl';
      }
      
      // Check if Mission Reset is ready to perform
      if (routeDecision === 'basic' && inspections.missionReset?.path && phases.missionReset?.status !== 'completed') {
        // Mission Reset is available - prominent blue gradient
        return 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-500 shadow-xl hover:shadow-2xl';
      }
      
      // Check the actual workflow state for remote users
      return 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-400 shadow-lg hover:shadow-xl';
    }
    
    // Blue background when workflow is in progress (Everdrone users)
    if (hasWorkflow && state !== 'standby' && !isRemote) {
      return 'bg-white border-blue-400 shadow-lg hover:shadow-xl';
    }
    
    switch(state) {
      case 'standby':
        // Different styling for service partners vs other users
        if (isRemote) {
          return 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-400 shadow-lg hover:shadow-xl';
        }
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

  const getStatusLabel = (state: string, currentPhase?: string, alarmSession?: any, isRemote?: boolean, status?: string, isMaintenanceOverdue?: boolean) => {
    // Handle different hangar statuses
    if (status === 'construction') {
      return 'Under Construction';
    } else if (status === 'maintenance') {
      return 'Under Maintenance';
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
      } else if (phases.telemetryAnalysis?.status) {
        return '🔍 Post-alarm analysis in progress';
      }
    }
    
    // More accurate status based on current phase (Everdrone users)
    if (currentPhase) {
      if (currentPhase.toLowerCase().includes('initial remote ti')) return 'Initial RTI';
      if (currentPhase.toLowerCase().includes('basic ti') || currentPhase.toLowerCase().includes('mission reset')) return 'Mission Reset Active';
      if (currentPhase.toLowerCase().includes('remote crew')) return 'Field Team Active';
    }
    
    switch(state) {
      case 'standby':
        return 'Open - Ready for alarm!';
      case 'alarm':
        return 'Workflow Active';
      case 'post_flight':
        return 'Post-Flight';
      case 'inspection':
        return 'Workflow Active';
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
              state: 'inspection',
              currentPhase: 'Starting data analysis',
              lastActivity: 'Just now',
              activeInspection: {
                type: 'Post-Alarm Analysis',
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

  const startInitialRTI = async (hangarId: string) => {
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
              currentPhase: '📸 Starting image capture...',
            };
          }
          return h;
        }));

        const response = await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${hangarId}/generate-initial-rti`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authService.getToken()}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          
          // Track capture start time for progress
          setCaptureStartTimes((prev: any) => ({
            ...prev,
            [`${hangarId}-initialRTI`]: Date.now()
          }));
          
          // Update with the inspection path
          await updatePhase(hangarId, 'initialRTI', {
            status: 'in-progress',
            inspectionPath: data.path
          });
          
          // Show capturing status
          setHangarStatuses(prev => prev.map(h => {
            if (h.id === hangarId) {
              return {
                ...h,
                currentPhase: '📸 Capturing images from 8 cameras...',
                activeInspection: {
                  type: 'Initial Remote TI',
                  progress: 0,
                  assignedTo: 'System'
                }
              };
            }
            return h;
          }));
        }
      } catch (error) {
        console.error('Error creating Initial RTI:', error);
      }
    }, 2000);
    
    // After 40 seconds, show as ready with clear next steps
    setTimeout(() => {
      
      // Update status to show inspection is ready with action needed
      setHangarStatuses(prev => prev.map(h => {
        if (h.id === hangarId) {
          return {
            ...h,
            currentPhase: '✅ Images captured - Ready for route decision',
            activeInspection: {
              type: 'Initial Remote TI',
              progress: 100,
              assignedTo: 'Everdrone',
              nextAction: 'Select inspection route'
            }
          };
        }
        return h;
      }));
    }, 40000);
  };

  const startWorkflowProgression = (hangarId: string) => {
    // Start telemetry analysis immediately (after 2 seconds for UX)
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
    }, 2000);

    // Complete telemetry analysis after 5 seconds and automatically proceed to Initial RTI
    setTimeout(async () => {
      // Generate mock telemetry data (same as in TelemetryAnalysis component)
      const mockTelemetryData = {
        summary: { totalChecks: 12, passed: 10, failed: 0, warnings: 2 },
        flightData: {
          flightTime: '12m 34s',
          deliveryTime: '3m 2s',
          completionStatus: 'completed',
          abnormalEvents: [],
          totalDistance: '2.3km',
          maxAltitude: '120m',
          weatherConditions: 'Wind: 10.8km/h, Temp: 15.0°C',
          batteryUsed: '35%'
        },
        metrics: [
          { name: 'Battery Level', value: 65, unit: '%', status: 'pass' },
          { name: 'GPS Signal', value: 18, unit: 'satellites', status: 'pass' },
          { name: 'Motor Temperature', value: 62, unit: '°C', status: 'warning' },
          { name: 'Vibration Level', value: 0.9, unit: 'g', status: 'pass' },
          { name: 'Landing Precision', value: 1.2, unit: 'm', status: 'pass' },
          { name: 'Return Path Efficiency', value: 94, unit: '%', status: 'pass' },
          { name: 'Max Speed', value: 48, unit: 'km/h', status: 'pass' },
          { name: 'Communication Latency', value: 42, unit: 'ms', status: 'pass' },
          { name: 'Obstacle Detections', value: 0, unit: 'count', status: 'pass' },
          { name: 'Cargo Weight', value: 1.8, unit: 'kg', status: 'pass' },
          { name: 'Power Consumption', value: 92.5, unit: 'A', status: 'warning' },
          { name: 'Wind Conditions', value: 10.8, unit: 'km/h', status: 'pass' }
        ]
      };
      
      // Determine result based on metrics
      const failedCount = mockTelemetryData.metrics.filter((m: any) => m.status === 'fail').length;
      const warningCount = mockTelemetryData.metrics.filter((m: any) => m.status === 'warning').length;
      const result = failedCount > 0 ? 'fail' : warningCount > 0 ? 'warning' : 'pass';
      
      await updatePhase(hangarId, 'telemetryAnalysis', {
        status: 'completed',
        endTime: new Date().toISOString(),
        result: result,
        data: mockTelemetryData
      });
      
      // Update status to show telemetry is complete
      setHangarStatuses(prev => prev.map(h => {
        if (h.id === hangarId) {
          return {
            ...h,
            currentPhase: 'Data analysis complete',
            activeInspection: {
              type: 'Telemetry Analysis',
              progress: 100,
              assignedTo: 'System'
            }
          };
        }
        return h;
      }));
      
      // Automatically proceed to Initial RTI after 1 second
      setTimeout(() => {
        startInitialRTI(hangarId);
      }, 1000);
    }, 5000);
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
            const isMaintenanceOverdue = (userType === 'admin' || userType === 'everdrone') && hangar.status === 'operational' && hangar.assignedDrone && hangar.state === 'standby' && (
              (hangar.maintenanceHistory?.lastOnsiteTI && getDaysSince(hangar.maintenanceHistory.lastOnsiteTI) > 30) ||
              (hangar.maintenanceHistory?.lastExtendedTI && getDaysSince(hangar.maintenanceHistory.lastExtendedTI) > 60) ||
              (hangar.maintenanceHistory?.lastService && getDaysSince(hangar.maintenanceHistory.lastService) > 90) ||
              (!hangar.maintenanceHistory?.lastOnsiteTI && !hangar.maintenanceHistory?.lastExtendedTI && !hangar.maintenanceHistory?.lastService)
            );

            // Determine the left border color based on state
            const getBorderColor = () => {
              if (hangar.status === 'construction') return 'border-l-yellow-500';
              if (hangar.status === 'maintenance') return 'border-l-orange-500';
              if (isMaintenanceOverdue && hangar.state === 'standby') return 'border-l-red-500';
              
              // For service partners with active mission reset
              if (userType === 'service_partner' && hangar.alarmSession?.workflow?.routeDecision === 'basic' && 
                  hangar.alarmSession?.inspections?.missionReset?.path && 
                  hangar.alarmSession?.workflow?.phases?.missionReset?.status !== 'completed') {
                return 'border-l-blue-500';
              }
              
              switch(hangar.state) {
                case 'standby': return 'border-l-green-500';
                case 'alarm': return 'border-l-blue-500';
                case 'post_flight': return 'border-l-amber-500';
                case 'inspection': return 'border-l-blue-500';
                case 'verification': return 'border-l-violet-500';
                default: return 'border-l-gray-400';
              }
            };

            return (
            <div
              key={hangar.id}
              className={`relative bg-white rounded-lg shadow-md hover:shadow-lg transition-all border-l-8 ${
                getBorderColor()
              } p-5 cursor-pointer ${
                hangar.status !== 'operational' ? 'min-h-[140px]' : userType === 'service_partner' ? 'min-h-[180px]' : 'min-h-[220px]'
              } flex flex-col`}
              onClick={() => {
                if (hangar.state !== 'standby' && hangar.status === 'operational') {
                  setSelectedHangar(hangar.id);
                }
              }}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900">{hangar.name}</h3>
                  <p className="text-sm text-gray-600 mt-0.5">
                    Drone: {hangar.assignedDrone || 'Not assigned'}
                  </p>
                </div>
                {/* Status Badge */}
                <div className="flex items-center">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    hangar.status === 'construction' ? 'bg-yellow-100 text-yellow-800' :
                    hangar.status === 'maintenance' ? 'bg-orange-100 text-orange-800' :
                    isMaintenanceOverdue && hangar.state === 'standby' ? 'bg-red-100 text-red-800' :
                    hangar.state === 'standby' ? 'bg-green-100 text-green-800' :
                    hangar.state === 'alarm' ? 'bg-blue-100 text-blue-800' :
                    hangar.state === 'post_flight' ? 'bg-amber-100 text-amber-800' :
                    hangar.state === 'inspection' ? 'bg-blue-100 text-blue-800' :
                    hangar.state === 'verification' ? 'bg-violet-100 text-violet-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {getStatusLabel(hangar.state, hangar.currentPhase, hangar.alarmSession, userType === 'service_partner', hangar.status || 'operational', !!isMaintenanceOverdue)}
                  </span>
                </div>
              </div>
              
              {/* Service Partner Mission Reset Button - Moved to be more prominent */}
              {userType === 'service_partner' && hangar.alarmSession?.workflow?.routeDecision === 'basic' && 
               hangar.alarmSession?.inspections?.missionReset?.path && 
               hangar.alarmSession?.workflow?.phases?.missionReset?.status !== 'completed' && (
                <div className="flex-1 flex items-center justify-center mt-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const [h, s] = hangar.alarmSession.inspections.missionReset.path.split('/');
                      window.location.href = `/?action=load-session&hangar=${h}&session=${s}&type=mission-reset-inspection&userType=service_partner`;
                    }}
                    className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-lg font-bold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <FileCheck className="w-6 h-6" />
                    <span>
                      {hangar.alarmSession?.inspections?.missionReset?.progress && hangar.alarmSession.inspections.missionReset.progress !== '0%' 
                        ? 'Continue Mission Reset' 
                        : 'Perform Mission Reset'}
                    </span>
                  </button>
                </div>
              )}
              
              {/* Service Partner Status Text - Centered when showing standby */}
              {userType === 'service_partner' && hangar.state === 'standby' && hangar.status === 'operational' && !(
                hangar.alarmSession?.workflow?.routeDecision === 'basic' && 
                hangar.alarmSession?.inspections?.missionReset?.path && 
                hangar.alarmSession?.workflow?.phases?.missionReset?.status !== 'completed'
              ) && (
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-lg font-semibold text-green-700">
                    {getStatusLabel(hangar.state, hangar.currentPhase, hangar.alarmSession, true, hangar.status || 'operational', !!isMaintenanceOverdue)}
                  </span>
                </div>
              )}
              
              {/* Maintenance History - Simplified grid layout */}
              {(userType === 'admin' || userType === 'everdrone') && hangar.status === 'operational' && hangar.assignedDrone && hangar.state === 'standby' && (
                <div className="mt-auto pt-3 border-t border-gray-200">
                  <div className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Maintenance History</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className={`p-2 rounded-lg text-center ${
                      hangar.maintenanceHistory?.lastOnsiteTI 
                        ? getDaysSince(hangar.maintenanceHistory.lastOnsiteTI) > 30 ? 'bg-red-50' : 'bg-green-50'
                        : 'bg-gray-50'
                    }`}>
                      <div className="text-[10px] font-medium text-gray-600">Onsite TI</div>
                      <div className={`text-xs font-bold mt-0.5 ${
                        hangar.maintenanceHistory?.lastOnsiteTI 
                          ? getDaysSince(hangar.maintenanceHistory.lastOnsiteTI) > 30 ? 'text-red-600' : 'text-green-600'
                          : 'text-gray-400'
                      }`}>
                        {hangar.maintenanceHistory?.lastOnsiteTI 
                          ? formatTimeSince(hangar.maintenanceHistory.lastOnsiteTI)
                          : '-'}
                      </div>
                    </div>
                    <div className={`p-2 rounded-lg text-center ${
                      hangar.maintenanceHistory?.lastExtendedTI 
                        ? getDaysSince(hangar.maintenanceHistory.lastExtendedTI) > 60 ? 'bg-red-50' : 'bg-green-50'
                        : 'bg-gray-50'
                    }`}>
                      <div className="text-[10px] font-medium text-gray-600">Extended</div>
                      <div className={`text-xs font-bold mt-0.5 ${
                        hangar.maintenanceHistory?.lastExtendedTI 
                          ? getDaysSince(hangar.maintenanceHistory.lastExtendedTI) > 60 ? 'text-red-600' : 'text-green-600'
                          : 'text-gray-400'
                      }`}>
                        {hangar.maintenanceHistory?.lastExtendedTI 
                          ? formatTimeSince(hangar.maintenanceHistory.lastExtendedTI)
                          : '-'}
                      </div>
                    </div>
                    <div className={`p-2 rounded-lg text-center ${
                      hangar.maintenanceHistory?.lastService 
                        ? getDaysSince(hangar.maintenanceHistory.lastService) > 90 ? 'bg-red-50' : 'bg-green-50'
                        : 'bg-gray-50'
                    }`}>
                      <div className="text-[10px] font-medium text-gray-600">Service</div>
                      <div className={`text-xs font-bold mt-0.5 ${
                        hangar.maintenanceHistory?.lastService 
                          ? getDaysSince(hangar.maintenanceHistory.lastService) > 90 ? 'text-red-600' : 'text-green-600'
                          : 'text-gray-400'
                      }`}>
                        {hangar.maintenanceHistory?.lastService 
                          ? formatTimeSince(hangar.maintenanceHistory.lastService)
                          : '-'}
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
                        hangar={hangar}
                      />
                    ) : (
                      /* Full Workflow Timeline for Everdrone users */
                      <WorkflowTimeline 
                        alarmSession={hangar.alarmSession} 
                        hangarId={hangar.id}
                        isRemoteUser={false}
                        captureStartTimes={captureStartTimes}
                        setCaptureStartTimes={setCaptureStartTimes}
                        onOpenWorkflow={() => {
                          setSelectedHangar(hangar.id);
                        }}
                      />
                    )}
                  </>
                ) : (
                  <>
                    {/* Show alarm button for Everdrone users when operational and not overdue */}
                    {hangar.state === 'standby' && (userType === 'admin' || userType === 'everdrone') && hangar.status === 'operational' && !isMaintenanceOverdue && (
                      <div className="flex justify-center mt-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTriggerAlarm(hangar.id, hangar.assignedDrone);
                          }}
                          className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-lg transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                        >
                          <PlayCircle className="w-5 h-5" />
                          Trigger Post-Alarm Workflow
                        </button>
                      </div>
                    )}
                    {/* Show maintenance required message when overdue */}
                    {hangar.state === 'standby' && (userType === 'admin' || userType === 'everdrone') && hangar.status === 'operational' && isMaintenanceOverdue && (
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

      {/* Telemetry Analysis Modal */}
      {showTelemetryAnalysis && telemetryHangar && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <TelemetryAnalysis
              droneId={telemetryHangar.assignedDrone || 'Unknown'}
              hangarId={telemetryHangar.id}
              existingData={telemetryHangar.alarmSession?.workflow?.phases?.telemetryAnalysis?.data}
              viewOnly={telemetryHangar.alarmSession?.workflow?.phases?.telemetryAnalysis?.status === 'completed'}
              onComplete={async (status, telemetryData) => {
                setShowTelemetryAnalysis(false);
                
                // Mark telemetry analysis as complete with full telemetry data
                const session = telemetryHangar.alarmSession;
                if (session?.workflow?.phases?.telemetryAnalysis?.status !== 'completed') {
                  await updatePhase(telemetryHangar.id, 'telemetryAnalysis', {
                    status: 'completed',
                    endTime: new Date().toISOString(),
                    result: status,
                    data: {
                      ...telemetryData,
                      decision: 'continue-to-initial-rti',
                      decisionMadeAt: new Date().toISOString(),
                      decisionMadeBy: authService.getCurrentUser()?.username
                    }
                  });
                }
                
                // Always trigger Initial RTI when continuing (unless already started)
                if (!session?.workflow?.phases?.initialRTI?.status || session?.workflow?.phases?.initialRTI?.status === 'pending') {
                  setTimeout(() => {
                    startInitialRTI(telemetryHangar.id);
                  }, 1000);
                }
              }}
              onRequestOnsite={async (telemetryData) => {
                setShowTelemetryAnalysis(false);
                
                // Mark telemetry as complete with data and decision
                const session = telemetryHangar.alarmSession;
                if (session?.workflow?.phases?.telemetryAnalysis?.status !== 'completed') {
                  await updatePhase(telemetryHangar.id, 'telemetryAnalysis', {
                    status: 'completed',
                    endTime: new Date().toISOString(),
                    result: 'warning',
                    data: {
                      ...telemetryData,
                      decision: 'request-onsite-inspection',
                      decisionMadeAt: new Date().toISOString(),
                      decisionMadeBy: authService.getCurrentUser()?.username
                    }
                  });
                }
                
                // Set route decision to onsite and trigger onsite TI
                if (session) {
                  try {
                    // First set the route decision with proper route parameter
                    const routeResponse = await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${telemetryHangar.id}/route-decision`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${authService.getToken()}`
                      },
                      body: JSON.stringify({
                        route: 'onsite',  // Changed from routeDecision to route
                        decisionMadeAt: new Date().toISOString(),
                        decisionMadeBy: authService.getCurrentUser()?.username
                      })
                    });
                    
                    if (routeResponse.ok) {
                      // Now generate the onsite TI
                      const onsiteResponse = await fetch(`${API_CONFIG.BASE_URL}/api/alarm-session/${telemetryHangar.id}/generate-onsite-ti`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${authService.getToken()}`
                        }
                      });
                      
                      if (onsiteResponse.ok) {
                        // Reload hangars to reflect the update
                        fetchHangars();
                        
                        // Update hangar status immediately for better UX
                        setHangarStatuses(prev => prev.map(h => {
                          if (h.id === telemetryHangar.id) {
                            return {
                              ...h,
                              state: 'inspection',
                              currentPhase: 'Technician dispatched for onsite inspection',
                              activeInspection: {
                                type: 'Onsite TI',
                                progress: 0,
                                assignedTo: 'Everdrone'
                              }
                            };
                          }
                          return h;
                        }));
                      }
                    }
                  } catch (error) {
                    console.error('Error setting route decision:', error);
                  }
                }
              }}
              onClose={() => setShowTelemetryAnalysis(false)}
            />
          </div>
        </div>
      )}
      
    </div>
  );
};

export default HangarDashboard;