import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { HANGARS } from '../constants';
import { AlertCircle, CheckCircle, Clock, Wrench, Radio, ArrowRight, User, RefreshCw, Timer, AlertTriangle } from 'lucide-react';
import HangarWorkflowView from './HangarWorkflowView';

interface HangarDashboardProps {
  currentUser: string;
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
  activeInspection?: {
    type: string;
    progress: number;
    assignedTo: string;
  };
  alarmSession?: any;
}

const HangarDashboard: React.FC<HangarDashboardProps> = ({
  currentUser,
  onProceedToInspection,
  onLogout
}) => {
  const [hangarStatuses, setHangarStatuses] = useState<HangarStatusData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHangar, setSelectedHangar] = useState<string | null>(null);
  const [showWorkflow, setShowWorkflow] = useState(false);

  // Load actual alarm session states for each hangar
  useEffect(() => {
    const fetchHangarStatuses = async () => {
      try {
        // Start with default statuses
        const statuses: HangarStatusData[] = HANGARS.map(hangar => ({
          id: hangar.id,
          name: hangar.label,
          state: 'standby' as const,
          assignedDrone: hangar.assignedDrone,
          lastActivity: 'No recent activity'
        }));
        
        // Fetch alarm session for each hangar
        for (const hangar of HANGARS) {
          try {
            const response = await fetch(`http://172.20.1.93:3001/api/alarm-session/${hangar.id}`);
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
                      currentPhase = 'Flight in progress';
                    } else if (phases.landing?.status === 'in-progress') {
                      state = 'post_flight';
                      currentPhase = 'Landing';
                    } else if (phases.telemetryAnalysis?.status === 'in-progress') {
                      state = 'post_flight';
                      currentPhase = 'Analyzing telemetry';
                    } else if (phases.initialRTI?.status === 'in-progress') {
                      state = 'inspection';
                      currentPhase = session.inspections?.initialRTI ? 'Initial Remote TI Ready' : 'Generating Initial RTI';
                      activeInspection = {
                        type: 'Initial Remote TI',
                        progress: 10,
                        assignedTo: 'Everdrone'
                      };
                    } else if (phases.basicTI?.status === 'in-progress' || phases.onsiteTI?.status === 'in-progress') {
                      state = 'inspection';
                      currentPhase = phases.basicTI?.status === 'in-progress' ? 'Basic TI' : 'Onsite TI';
                      activeInspection = {
                        type: currentPhase,
                        progress: 50,
                        assignedTo: phases.basicTI?.status === 'in-progress' ? 'Remote Crew' : 'Everdrone'
                      };
                    } else if (phases.fullRTI?.status === 'in-progress') {
                      state = 'inspection';
                      currentPhase = 'Full Remote TI';
                      activeInspection = {
                        type: 'Full Remote TI',
                        progress: 30,
                        assignedTo: 'Everdrone'
                      };
                    } else if (phases.clearArea?.status === 'in-progress') {
                      state = 'verification';
                      currentPhase = 'Clearing area';
                    } else if (phases.initialRTI?.status === 'completed' && !session.workflow?.routeDecision) {
                      // Initial RTI completed but no route decision yet
                      state = 'inspection';
                      currentPhase = 'Awaiting route decision';
                    } else if (phases.initialRTI?.status === 'completed' && phases.basicTI?.status === 'pending' && session.workflow?.routeDecision === 'basic') {
                      // Route selected but Basic TI not started
                      state = 'inspection';
                      currentPhase = 'Ready for Basic TI';
                    } else if (phases.initialRTI?.status === 'completed' && phases.onsiteTI?.status === 'pending' && session.workflow?.routeDecision === 'onsite') {
                      // Route selected but Onsite TI not started
                      state = 'inspection';
                      currentPhase = 'Ready for Onsite TI';
                    } else if (phases.clearArea?.status === 'completed') {
                      // Everything completed
                      state = 'standby';
                      currentPhase = 'Alarm resolved';
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

  const getStatusIcon = (state: string) => {
    switch(state) {
      case 'standby':
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'alarm':
        return <AlertCircle className="w-6 h-6 text-red-500 animate-pulse" />;
      case 'post_flight':
        return <Clock className="w-6 h-6 text-yellow-500" />;
      case 'inspection':
        return <Wrench className="w-6 h-6 text-blue-500" />;
      case 'verification':
        return <Radio className="w-6 h-6 text-purple-500" />;
      default:
        return <CheckCircle className="w-6 h-6 text-gray-400" />;
    }
  };

  const getStatusColor = (state: string) => {
    switch(state) {
      case 'standby':
        return 'bg-green-50 border-green-200 hover:border-green-300';
      case 'alarm':
        return 'bg-red-50 border-red-300 hover:border-red-400 animate-pulse';
      case 'post_flight':
        return 'bg-yellow-50 border-yellow-200 hover:border-yellow-300';
      case 'inspection':
        return 'bg-blue-50 border-blue-200 hover:border-blue-300';
      case 'verification':
        return 'bg-purple-50 border-purple-200 hover:border-purple-300';
      default:
        return 'bg-gray-50 border-gray-200 hover:border-gray-300';
    }
  };

  const getStatusLabel = (state: string, currentPhase?: string) => {
    // More accurate status based on current phase
    if (currentPhase) {
      if (currentPhase.toLowerCase().includes('initial remote ti')) return 'Initial RTI';
      if (currentPhase.toLowerCase().includes('basic ti')) return 'Basic TI Active';
      if (currentPhase.toLowerCase().includes('remote crew')) return 'Field Team Active';
      if (currentPhase.toLowerCase().includes('initial')) return 'Initial Assessment';
    }
    
    switch(state) {
      case 'standby':
        return 'Operational';
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
      const response = await fetch('http://172.20.1.93:3001/api/trigger-alarm', {
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
          
          const response = await fetch(`http://172.20.1.93:3001/api/alarm-session/${hangarId}/generate-initial-rti`, {
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
      await fetch(`http://172.20.1.93:3001/api/alarm-session/${hangarId}/update-phase`, {
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
      <div className="bg-white border-b">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Hangar Status Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">Monitor and manage all hangar operations</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                <span>{currentUser}</span>
              </div>
              <Button
                onClick={handleRefresh}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
              <Button
                onClick={onProceedToInspection}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Manual Inspection
              </Button>
              <Button
                onClick={onLogout}
                variant="outline"
                size="sm"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">

        {/* Hangar Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {hangarStatuses.map(hangar => (
            <div
              key={hangar.id}
              className={`bg-white rounded-lg border-2 p-3 cursor-pointer transition-all ${getStatusColor(hangar.state)}`}
              onClick={() => {
                if (hangar.state !== 'standby') {
                  setSelectedHangar(hangar.id);
                  setShowWorkflow(true);
                }
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{hangar.name}</h3>
                  <p className="text-xs text-gray-500">{hangar.assignedDrone || 'No drone'}</p>
                </div>
                {getStatusIcon(hangar.state)}
              </div>
              
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className={`text-sm font-semibold ${
                    hangar.state === 'standby' ? 'text-green-600' :
                    hangar.state === 'post_flight' ? 'text-yellow-600' :
                    hangar.state === 'inspection' ? 'text-blue-600' :
                    hangar.state === 'alarm' ? 'text-red-600' :
                    'text-gray-600'
                  }`}>
                    {getStatusLabel(hangar.state, hangar.currentPhase)}
                  </span>
                  {hangar.state !== 'standby' && (
                    <ArrowRight className="w-3 h-3 text-gray-400" />
                  )}
                </div>
                
                {hangar.activeInspection && (
                  <>
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-gray-700">
                          {hangar.activeInspection.type}
                        </span>
                        <span className="text-xs text-gray-500">
                          {Math.floor(hangar.activeInspection.progress)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div 
                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${hangar.activeInspection.progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <div className="text-xs text-gray-500">{hangar.lastActivity}</div>
                      {hangar.estimatedCompletion && (
                        <div className="flex items-center gap-1 text-xs font-medium text-orange-600">
                          <Timer className="w-3 h-3" />
                          {hangar.estimatedCompletion}
                        </div>
                      )}
                    </div>
                  </>
                )}
                
                {!hangar.activeInspection && (
                  <>
                    <div className="text-xs text-gray-500">{hangar.lastActivity}</div>
                    {hangar.state === 'standby' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTriggerAlarm(hangar.id, hangar.assignedDrone);
                        }}
                        className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200 transition-colors"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Trigger Alarm
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        
        {/* Workflow Modal */}
        {showWorkflow && selectedHangar && (
          <HangarWorkflowView
            hangarId={selectedHangar}
            hangarName={hangarStatuses.find(h => h.id === selectedHangar)?.name || ''}
            hangarState={hangarStatuses.find(h => h.id === selectedHangar)?.state || 'standby'}
            currentPhase={hangarStatuses.find(h => h.id === selectedHangar)?.currentPhase}
            onClose={() => setShowWorkflow(false)}
          />
        )}
      </div>
    </div>
  );
};

export default HangarDashboard;