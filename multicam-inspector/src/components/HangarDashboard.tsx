import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { HANGARS } from '../constants';
import { AlertCircle, CheckCircle, Clock, Wrench, Radio, ArrowRight, User, RefreshCw, Timer } from 'lucide-react';
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

  // Initialize with mock data for now
  useEffect(() => {
    // In the future, this will fetch from backend
    const currentTime = new Date();
    const mockStatuses: HangarStatusData[] = HANGARS.map(hangar => ({
      id: hangar.id,
      name: hangar.label,
      state: 'standby',
      assignedDrone: hangar.assignedDrone,
      lastActivity: '2 hours ago'
    }));
    
    // Add some variety to demonstrate different states
    if (mockStatuses[0]) {
      // Mölndal - in Initial RTI phase
      mockStatuses[0].state = 'post_flight';
      mockStatuses[0].currentPhase = 'Initial Remote TI';
      mockStatuses[0].lastActivity = 'Started 10 min ago';
      mockStatuses[0].estimatedCompletion = '~2h remaining';
      mockStatuses[0].activeInspection = {
        type: 'Initial RTI',
        progress: 65,
        assignedTo: 'Everdrone'
      };
    }
    
    if (mockStatuses[1]) {
      // Forges - in Basic TI phase
      mockStatuses[1].state = 'inspection';
      mockStatuses[1].currentPhase = 'Basic TI - Remote Crew';
      mockStatuses[1].activeInspection = {
        type: 'Basic TI',
        progress: 40,
        assignedTo: 'Remote Crew'
      };
      mockStatuses[1].lastActivity = 'Started 25 min ago';
      mockStatuses[1].estimatedCompletion = '~1.5h remaining';
    }
    
    setHangarStatuses(mockStatuses);
    setLoading(false);
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
                          {hangar.activeInspection.progress}%
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
                  <div className="text-xs text-gray-500">{hangar.lastActivity}</div>
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