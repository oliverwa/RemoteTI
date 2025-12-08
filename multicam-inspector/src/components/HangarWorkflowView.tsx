import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Wrench, 
  ArrowRight,
  Users,
  Plane,
  FileText,
  Camera,
  X,
  Loader,
  AlertTriangle,
  MapPin,
  Activity,
  ChevronRight
} from 'lucide-react';

interface HangarWorkflowViewProps {
  hangarId: string;
  hangarName: string;
  hangarState?: string;
  currentPhase?: string;
  onClose: () => void;
}

const HangarWorkflowView: React.FC<HangarWorkflowViewProps> = ({
  hangarId,
  hangarName,
  hangarState = 'post_flight',
  currentPhase,
  onClose
}) => {
  // Initialize decision based on hangar state
  const initDecision = () => {
    if (hangarState === 'inspection' && currentPhase?.toLowerCase().includes('remote crew')) {
      return 'basic';  // Forges has already chosen Basic TI route
    }
    return null;
  };

  const [selectedDecision, setSelectedDecision] = useState<string | null>(initDecision());
  const [decisionLocked, setDecisionLocked] = useState(initDecision() !== null);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [alarmSession, setAlarmSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [captureProgress, setCaptureProgress] = useState<number>(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeElementRef = useRef<HTMLDivElement>(null);
  
  // Fetch alarm session data
  useEffect(() => {
    const fetchAlarmSession = async () => {
      try {
        const response = await fetch(`http://172.20.1.93:3001/api/alarm-session/${hangarId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.session) {
            setAlarmSession(data.session);
            // Update decision based on session data
            if (data.session.workflow?.routeDecision) {
              setSelectedDecision(data.session.workflow.routeDecision);
              setDecisionLocked(true);
            }
            
            // Check if we're capturing images for Initial RTI
            if (data.session.workflow?.phases?.initialRTI?.status === 'in-progress' && 
                !data.session.inspections?.initialRTI && 
                data.session.workflow?.phases?.initialRTI?.startTime) {
              const startTime = new Date(data.session.workflow.phases.initialRTI.startTime).getTime();
              const now = Date.now();
              const elapsed = (now - startTime) / 1000; // seconds elapsed
              
              if (elapsed < 40) { // 40 seconds for full capture
                setIsCapturing(true);
                const progress = Math.min(95, (elapsed / 40) * 95); // Progress up to 95% over 40 seconds
                setCaptureProgress(progress);
              } else {
                setIsCapturing(false);
                setCaptureProgress(0);
              }
            } else {
              setIsCapturing(false);
              setCaptureProgress(0);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching alarm session:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAlarmSession();
    // Poll for updates every 2 seconds
    const interval = setInterval(fetchAlarmSession, 2000);
    return () => clearInterval(interval);
  }, [hangarId]);

  // Determine which phase is active based on alarm session or hangar state
  const getActivePhase = (): string => {
    // Use alarm session data if available
    if (alarmSession?.workflow?.phases) {
      const phases = alarmSession.workflow.phases;
      
      // Check phases in order and return the first in-progress one
      if (phases.flight?.status === 'in-progress') return 'flight';
      if (phases.landing?.status === 'in-progress') return 'landing';
      if (phases.telemetryAnalysis?.status === 'in-progress') return 'telemetry';
      if (phases.initialRTI?.status === 'in-progress') return 'initial-rti';
      if (phases.basicTI?.status === 'in-progress') return 'basic-ti';
      if (phases.onsiteTI?.status === 'in-progress') return 'onsite-ti';
      if (phases.fullRTI?.status === 'in-progress') return 'full-rti';
      
      // If no phase is in progress, check completed ones to determine current position
      if (phases.landing?.status === 'completed' && phases.telemetryAnalysis?.status === 'pending') return 'telemetry';
      if (phases.telemetryAnalysis?.status === 'completed' && phases.initialRTI?.status === 'pending') return 'initial-rti';
    }
    
    // Fallback to original logic if no alarm session
    if (hangarState === 'post_flight') {
      return 'initial-rti';  
    } else if (hangarState === 'inspection') {
      if (currentPhase?.toLowerCase().includes('remote crew')) {
        return 'basic-ti';  
      }
      return 'initial-rti';
    }
    return 'initial-rti';
  };

  // Scroll to center the active element on mount
  useEffect(() => {
    if (scrollContainerRef.current && activeElementRef.current) {
      const container = scrollContainerRef.current;
      const activeElement = activeElementRef.current;
      
      // Calculate scroll position to center the active element
      const containerWidth = container.offsetWidth;
      const activeElementOffset = activeElement.offsetLeft;
      const activeElementWidth = activeElement.offsetWidth;
      
      const scrollPosition = activeElementOffset - (containerWidth / 2) + (activeElementWidth / 2);
      
      container.scrollLeft = scrollPosition;
    }
  }, []);
  
  const getPhaseStyle = (status: string) => {
    switch(status) {
      case 'completed': return 'bg-green-50 border-green-400 text-green-900';
      case 'active': return 'bg-blue-50 border-blue-500 text-blue-900 shadow-lg';
      case 'pending': return 'bg-gray-50 border-gray-300 text-gray-500';
      default: return 'bg-gray-50 border-gray-300 text-gray-500';
    }
  };

  const getIconColor = (status: string) => {
    switch(status) {
      case 'completed': return 'text-green-600';
      case 'active': return 'text-blue-600';
      default: return 'text-gray-400';
    }
  };

  const handleDecision = (route: string) => {
    if (!decisionLocked) {
      setSelectedDecision(route);
      setDecisionLocked(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-7xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 text-white px-6 py-3 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">{hangarName} - Inspection Workflow</h2>
            <p className="text-sm text-gray-300">
              {alarmSession?.sessionId ? `Session: ${alarmSession.sessionId}` : 'Post-flight inspection process'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Timeline - Horizontal */}
        <div ref={scrollContainerRef} className="bg-gray-50 p-6 overflow-x-auto">
          <div className="flex items-start gap-3 justify-center min-w-fit pb-4">
            
            {/* Flight in Progress */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-500 mb-1">
                {alarmSession?.workflow?.phases?.flight?.startTime ? 
                  new Date(alarmSession.workflow.phases.flight.startTime).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}) : 
                  '--:--'}
              </div>
              <div className={`w-36 p-3 rounded-lg border-2 ${
                getPhaseStyle(
                  alarmSession?.workflow?.phases?.flight?.status === 'completed' ? 'completed' : 
                  alarmSession?.workflow?.phases?.flight?.status === 'in-progress' ? 'active' : 'pending'
                )
              }`}>
                <Plane className={`w-5 h-5 mx-auto mb-1 ${
                  getIconColor(
                    alarmSession?.workflow?.phases?.flight?.status === 'completed' ? 'completed' : 
                    alarmSession?.workflow?.phases?.flight?.status === 'in-progress' ? 'active' : 'pending'
                  )
                }`} />
                <div className="text-xs font-semibold text-center">Flight in Progress</div>
                <div className="text-xs text-center mt-1 opacity-75">
                  {alarmSession?.droneId || 'Mission active'}
                </div>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-green-500 mt-10" />

            {/* Drone Landed */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-500 mb-1">
                {alarmSession?.workflow?.phases?.landing?.timestamp ? 
                  new Date(alarmSession.workflow.phases.landing.timestamp).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}) : 
                  '--:--'}
              </div>
              <div className={`w-36 p-3 rounded-lg border-2 ${
                getPhaseStyle(
                  alarmSession?.workflow?.phases?.landing?.status === 'completed' ? 'completed' : 
                  alarmSession?.workflow?.phases?.landing?.status === 'in-progress' ? 'active' : 'pending'
                )
              }`}>
                <MapPin className={`w-5 h-5 mx-auto mb-1 ${
                  getIconColor(
                    alarmSession?.workflow?.phases?.landing?.status === 'completed' ? 'completed' : 
                    alarmSession?.workflow?.phases?.landing?.status === 'in-progress' ? 'active' : 'pending'
                  )
                }`} />
                <div className="text-xs font-semibold text-center">Drone Landed</div>
                <div className="text-xs text-center mt-1 opacity-75">Hangar secured</div>
              </div>
              {/* Crew Dispatch branch */}
              {alarmSession?.crewDispatch?.dispatched && (
                <div className="mt-2 pt-2 border-t-2 border-green-400 w-full">
                  <div className="flex items-center gap-1 justify-center">
                    <Users className="w-3 h-3 text-green-600" />
                    <div className="text-xs text-green-700 font-medium">Crew Dispatched</div>
                  </div>
                </div>
              )}
            </div>

            <ChevronRight className="w-4 h-4 mt-10 text-green-500" />

            {/* Telemetry Analysis */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-500 mb-1">
                {alarmSession?.workflow?.phases?.telemetryAnalysis?.startTime ? 
                  new Date(alarmSession.workflow.phases.telemetryAnalysis.startTime).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}) : 
                  '--:--'}
              </div>
              <div 
                className={`w-36 p-3 rounded-lg border-2 cursor-pointer hover:shadow-md ${
                  getPhaseStyle(
                    alarmSession?.workflow?.phases?.telemetryAnalysis?.status === 'completed' ? 'completed' : 
                    alarmSession?.workflow?.phases?.telemetryAnalysis?.status === 'in-progress' ? 'active' : 'pending'
                  )
                }`}
                onClick={() => setShowTelemetry(!showTelemetry)}
              >
                <Activity className={`w-5 h-5 mx-auto mb-1 ${
                  getIconColor(
                    alarmSession?.workflow?.phases?.telemetryAnalysis?.status === 'completed' ? 'completed' : 
                    alarmSession?.workflow?.phases?.telemetryAnalysis?.status === 'in-progress' ? 'active' : 'pending'
                  )
                }`} />
                <div className="text-xs font-semibold text-center">Telemetry Analysis</div>
                <div className="text-xs text-center mt-1 text-blue-600">Everdrone</div>
                {alarmSession?.workflow?.phases?.telemetryAnalysis?.status === 'in-progress' && (
                  <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                    <div className="bg-blue-500 h-1 rounded-full animate-pulse" style={{ width: '50%' }} />
                  </div>
                )}
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-green-500 mt-10" />

            {/* Initial Remote TI */}
            <div ref={getActivePhase() === 'initial-rti' ? activeElementRef : undefined} className="flex flex-col items-center">
              <div className="text-xs text-gray-500 mb-1">
                {alarmSession?.workflow?.phases?.initialRTI?.startTime ? 
                  new Date(alarmSession.workflow.phases.initialRTI.startTime).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'}) : 
                  '--:--'}
              </div>
              <div 
                className={`w-36 p-3 rounded-lg border-2 ${
                  alarmSession?.inspections?.initialRTI?.sessionId && !isCapturing ? 'cursor-pointer hover:shadow-lg' : 'cursor-not-allowed'
                } ${
                  getPhaseStyle(
                    alarmSession?.workflow?.phases?.initialRTI?.status === 'completed' ? 'completed' : 
                    alarmSession?.workflow?.phases?.initialRTI?.status === 'in-progress' ? 'active' : 'pending'
                  )
                }`}
                onClick={() => {
                  // Only allow click if capture is complete and inspection exists
                  if (alarmSession?.inspections?.initialRTI?.path && !isCapturing) {
                    const sessionPath = alarmSession.inspections.initialRTI.path;
                    const [hangar, sessionName] = sessionPath.split('/');
                    // Navigate to the inspection in the same tab
                    window.location.href = `/?action=load-session&hangar=${hangar}&session=${sessionName}&type=initial-remote-ti-inspection`;
                  }
                }}
              >
                <div className="flex justify-center mb-1">
                  {alarmSession?.workflow?.phases?.initialRTI?.status === 'in-progress' && !alarmSession?.inspections?.initialRTI ? (
                    <Loader className="w-5 h-5 text-blue-600 animate-spin" />
                  ) : (
                    <Camera className={`w-5 h-5 ${
                      getIconColor(
                        alarmSession?.workflow?.phases?.initialRTI?.status === 'completed' ? 'completed' : 
                        alarmSession?.workflow?.phases?.initialRTI?.status === 'in-progress' ? 'active' : 'pending'
                      )
                    }`} />
                  )}
                </div>
                <div className="text-xs font-semibold text-center">Initial Remote TI</div>
                <div className="text-xs text-center mt-1 text-blue-600">
                  {isCapturing
                    ? `Capturing... ${Math.floor(captureProgress)}%`
                    : alarmSession?.workflow?.phases?.initialRTI?.status === 'in-progress' && alarmSession?.inspections?.initialRTI?.sessionId
                      ? 'In Progress'  // Inspection is being performed
                      : alarmSession?.workflow?.phases?.initialRTI?.status === 'completed' && alarmSession?.inspections?.initialRTI?.sessionId
                        ? 'Click to Open'  // Inspection is completed
                        : alarmSession?.workflow?.phases?.initialRTI?.status === 'in-progress'
                          ? 'Generating...'  // Generating but no inspection yet
                          : 'Everdrone'  // Default
                  }
                </div>
                {(isCapturing || (alarmSession?.workflow?.phases?.initialRTI?.status === 'in-progress' && alarmSession?.inspections?.initialRTI)) && (
                  <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                    <div className="bg-blue-500 h-1 rounded-full transition-all" style={{ 
                      width: isCapturing 
                        ? `${captureProgress}%` 
                        : alarmSession?.inspections?.initialRTI?.progress || '30%'
                    }} />
                  </div>
                )}
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-gray-300 mt-10" />

            {/* Decision Point */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-500 mb-1">14:45</div>
              <div className={`w-48 p-4 rounded-lg border-3 ${
                decisionLocked 
                  ? 'bg-gray-50 border-gray-400' 
                  : alarmSession?.workflow?.phases?.initialRTI?.status === 'completed'
                    ? 'bg-yellow-50 border-yellow-500 shadow-md'
                    : 'bg-gray-100 border-gray-300 cursor-not-allowed'
              }`}>
                <AlertTriangle className={`w-6 h-6 mx-auto mb-2 ${
                  decisionLocked ? 'text-gray-500' : 'text-yellow-600'
                }`} />
                <div className={`text-sm font-bold text-center mb-3 ${
                  decisionLocked ? 'text-gray-700' : 'text-yellow-900'
                }`}>
                  {decisionLocked ? 'Route Selected' : 'Route Decision'}
                </div>
                {!selectedDecision && (
                  <div className="text-xs text-center text-gray-600 mb-2">
                    Choose inspection route:
                  </div>
                )}
                <div className="space-y-2">
                  <button 
                    onClick={() => handleDecision('basic')}
                    disabled={decisionLocked || alarmSession?.workflow?.phases?.initialRTI?.status !== 'completed'}
                    className={`w-full text-sm px-3 py-2 rounded-lg font-medium transition-all ${
                      selectedDecision === 'basic' 
                        ? 'bg-green-500 text-white shadow-md cursor-default' 
                        : decisionLocked || alarmSession?.workflow?.phases?.initialRTI?.status !== 'completed'
                        ? 'bg-gray-100 border-2 border-gray-300 text-gray-400 cursor-not-allowed'
                        : 'bg-white border-2 border-green-400 text-green-700 hover:bg-green-50 cursor-pointer'
                    }`}
                  >
                    Basic TI
                    <div className="text-xs opacity-75 mt-0.5">Standard inspection</div>
                  </button>
                  <button 
                    onClick={() => handleDecision('onsite')}
                    disabled={decisionLocked || alarmSession?.workflow?.phases?.initialRTI?.status !== 'completed'}
                    className={`w-full text-sm px-3 py-2 rounded-lg font-medium transition-all ${
                      selectedDecision === 'onsite' 
                        ? 'bg-orange-500 text-white shadow-md cursor-default' 
                        : decisionLocked || alarmSession?.workflow?.phases?.initialRTI?.status !== 'completed'
                        ? 'bg-gray-100 border-2 border-gray-300 text-gray-400 cursor-not-allowed'
                        : 'bg-white border-2 border-orange-400 text-orange-700 hover:bg-orange-50 cursor-pointer'
                    }`}
                  >
                    Onsite TI
                    <div className="text-xs opacity-75 mt-0.5">Everdrone required</div>
                  </button>
                </div>
                {decisionLocked && (
                  <div className="mt-3 text-xs text-center text-gray-500">
                    <CheckCircle className="w-4 h-4 inline mr-1 text-green-500" />
                    Decision confirmed
                  </div>
                )}
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-gray-300 mt-10" />

            {/* Route-dependent workflow */}
            {!selectedDecision ? (
              // Show placeholder when no decision made
              <div className="flex flex-col items-center justify-center">
                <div className="text-xs text-gray-400 text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <div>Select a route to continue</div>
                </div>
              </div>
            ) : selectedDecision === 'basic' ? (
              <>
                {/* Basic TI Path */}
                <div ref={getActivePhase() === 'basic-ti' ? activeElementRef : undefined} className="flex flex-col items-center">
                  <div className="text-xs text-gray-500 mb-1">15:15</div>
                  <div className={`w-36 p-3 rounded-lg border-2 ${
                    getPhaseStyle(getActivePhase() === 'basic-ti' ? 'active' : 'pending')
                  }`}>
                    {getActivePhase() === 'basic-ti' ? (
                      <Loader className="w-5 h-5 mx-auto mb-1 text-blue-600 animate-spin" />
                    ) : (
                      <Wrench className={`w-5 h-5 mx-auto mb-1 ${getIconColor('pending')}`} />
                    )}
                    <div className="text-xs font-semibold text-center">Basic TI</div>
                    <div className="text-xs text-center mt-1 text-green-600">Remote Crew</div>
                    <div className="text-xs text-center text-blue-600">Everdrone monitors</div>
                    {getActivePhase() === 'basic-ti' && (
                      <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                        <div className="bg-blue-500 h-1 rounded-full animate-pulse" style={{ width: '65%' }} />
                      </div>
                    )}
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-300 mt-10" />

                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-500 mb-1">16:00</div>
                  <div className={`w-36 p-3 rounded-lg border-2 ${getPhaseStyle('pending')}`}>
                    <Camera className={`w-5 h-5 mx-auto mb-1 ${getIconColor('pending')}`} />
                    <div className="text-xs font-semibold text-center">Full Remote TI</div>
                    <div className="text-xs text-center mt-1 text-blue-600">Everdrone</div>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-300 mt-10" />

                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-500 mb-1">16:30</div>
                  <div className={`w-36 p-3 rounded-lg border-2 ${getPhaseStyle('pending')}`}>
                    <CheckCircle className={`w-5 h-5 mx-auto mb-1 ${getIconColor('pending')}`} />
                    <div className="text-xs font-semibold text-center">Area Ready</div>
                    <div className="text-xs text-center mt-1 opacity-75">Operational</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Onsite TI Path */}
                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-500 mb-1">15:15</div>
                  <div className={`w-36 p-3 rounded-lg border-2 bg-orange-50 border-orange-300 text-orange-900`}>
                    <Wrench className={`w-5 h-5 mx-auto mb-1 text-orange-600`} />
                    <div className="text-xs font-semibold text-center">Onsite TI</div>
                    <div className="text-xs text-center mt-1 text-orange-600">Everdrone</div>
                    <div className="text-xs text-center text-gray-600">Physical inspection</div>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-300 mt-10" />

                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-500 mb-1">17:00</div>
                  <div className={`w-36 p-3 rounded-lg border-2 ${getPhaseStyle('pending')}`}>
                    <Camera className={`w-5 h-5 mx-auto mb-1 ${getIconColor('pending')}`} />
                    <div className="text-xs font-semibold text-center">Full Remote TI</div>
                    <div className="text-xs text-center mt-1 text-blue-600">Everdrone</div>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-300 mt-10" />

                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-500 mb-1">17:30</div>
                  <div className={`w-36 p-3 rounded-lg border-2 ${getPhaseStyle('pending')}`}>
                    <CheckCircle className={`w-5 h-5 mx-auto mb-1 ${getIconColor('pending')}`} />
                    <div className="text-xs font-semibold text-center">Area Ready</div>
                    <div className="text-xs text-center mt-1 opacity-75">Operational</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Telemetry Details (shown below when clicked) */}
          {showTelemetry && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 max-w-md">
              <h4 className="font-semibold text-sm text-blue-900 mb-2">Telemetry Summary</h4>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-gray-600">Battery:</span>
                  <div className="font-semibold">72%</div>
                </div>
                <div>
                  <span className="text-gray-600">Flight Time:</span>
                  <div className="font-semibold">19 min</div>
                </div>
                <div>
                  <span className="text-gray-600">Distance:</span>
                  <div className="font-semibold">8.3 km</div>
                </div>
                <div>
                  <span className="text-gray-600">Max Altitude:</span>
                  <div className="font-semibold">120 m</div>
                </div>
                <div>
                  <span className="text-gray-600">Wind Speed:</span>
                  <div className="font-semibold">12 km/h</div>
                </div>
                <div>
                  <span className="text-gray-600">Errors:</span>
                  <div className="font-semibold text-green-600">None</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="px-6 py-3 bg-white border-t">
          <div className="flex items-center justify-between">
            <div className="flex gap-6 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-50 border-2 border-green-400 rounded"></div>
                <span>Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-50 border-2 border-blue-500 rounded"></div>
                <span>Active</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-50 border-2 border-gray-300 rounded"></div>
                <span>Pending</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-3 h-3 text-green-600" />
                <span>Remote Crew</span>
              </div>
              <div className="flex items-center gap-2">
                <Camera className="w-3 h-3 text-blue-600" />
                <span>Everdrone</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold">Est. Completion: 16:30</div>
              <div className="text-xs text-gray-600">Total time: ~2.5 hours</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HangarWorkflowView;