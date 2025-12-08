import React, { useState } from 'react';
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
  onClose: () => void;
}

const HangarWorkflowView: React.FC<HangarWorkflowViewProps> = ({
  hangarId,
  hangarName,
  onClose
}) => {
  const [selectedDecision, setSelectedDecision] = useState<string | null>('basic');
  const [showTelemetry, setShowTelemetry] = useState(false);
  
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
    setSelectedDecision(route);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 text-white px-6 py-3 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">{hangarName} - Inspection Workflow</h2>
            <p className="text-sm text-gray-300">Post-flight inspection process</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Timeline - Horizontal */}
        <div className="bg-gray-50 p-6 overflow-x-auto">
          <div className="flex items-start gap-3 min-w-max pb-4">
            
            {/* Flight in Progress */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-500 mb-1">14:05</div>
              <div className={`w-36 p-3 rounded-lg border-2 ${getPhaseStyle('completed')}`}>
                <Plane className={`w-5 h-5 mx-auto mb-1 ${getIconColor('completed')}`} />
                <div className="text-xs font-semibold text-center">Flight in Progress</div>
                <div className="text-xs text-center mt-1 opacity-75">Mission active</div>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-green-500 mt-10" />

            {/* Drone Landed */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-500 mb-1">14:24</div>
              <div className={`w-36 p-3 rounded-lg border-2 ${getPhaseStyle('completed')}`}>
                <MapPin className={`w-5 h-5 mx-auto mb-1 ${getIconColor('completed')}`} />
                <div className="text-xs font-semibold text-center">Drone Landed</div>
                <div className="text-xs text-center mt-1 opacity-75">Hangar secured</div>
              </div>
              {/* Crew Dispatch branch */}
              <div className="mt-2 pt-2 border-t-2 border-green-400 w-full">
                <div className="flex items-center gap-1 justify-center">
                  <Users className="w-3 h-3 text-green-600" />
                  <div className="text-xs text-green-700 font-medium">Crew Dispatched</div>
                </div>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-green-500 mt-10" />

            {/* Telemetry Analysis */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-500 mb-1">14:25</div>
              <div 
                className={`w-36 p-3 rounded-lg border-2 cursor-pointer hover:shadow-md ${getPhaseStyle('completed')}`}
                onClick={() => setShowTelemetry(!showTelemetry)}
              >
                <Activity className={`w-5 h-5 mx-auto mb-1 ${getIconColor('completed')}`} />
                <div className="text-xs font-semibold text-center">Telemetry Analysis</div>
                <div className="text-xs text-center mt-1 text-blue-600">Everdrone</div>
                <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                  <div className="bg-green-500 h-1 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-green-500 mt-10" />

            {/* Initial Remote TI */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-500 mb-1">14:30</div>
              <div className={`w-36 p-3 rounded-lg border-2 ${getPhaseStyle('active')}`}>
                <div className="flex justify-center mb-1">
                  <Loader className="w-5 h-5 text-blue-600 animate-spin" />
                </div>
                <div className="text-xs font-semibold text-center">Initial Remote TI</div>
                <div className="text-xs text-center mt-1 text-blue-600">Everdrone</div>
                <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                  <div className="bg-blue-500 h-1 rounded-full animate-pulse" style={{ width: '65%' }} />
                </div>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-gray-300 mt-10" />

            {/* Decision Point */}
            <div className="flex flex-col items-center">
              <div className="text-xs text-gray-500 mb-1">14:45</div>
              <div className="w-48 p-4 rounded-lg border-3 bg-yellow-50 border-yellow-500 shadow-md">
                <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-yellow-600" />
                <div className="text-sm font-bold text-center text-yellow-900 mb-3">Route Decision</div>
                <div className="space-y-2">
                  <button 
                    onClick={() => handleDecision('basic')}
                    className={`w-full text-sm px-3 py-2 rounded-lg font-medium transition-all ${
                      selectedDecision === 'basic' 
                        ? 'bg-green-500 text-white shadow-md' 
                        : 'bg-white border-2 border-green-400 text-green-700 hover:bg-green-50'
                    }`}
                  >
                    Basic TI
                    <div className="text-xs opacity-75 mt-0.5">Standard inspection</div>
                  </button>
                  <button 
                    onClick={() => handleDecision('onsite')}
                    className={`w-full text-sm px-3 py-2 rounded-lg font-medium transition-all ${
                      selectedDecision === 'onsite' 
                        ? 'bg-orange-500 text-white shadow-md' 
                        : 'bg-white border-2 border-orange-400 text-orange-700 hover:bg-orange-50'
                    }`}
                  >
                    Onsite TI
                    <div className="text-xs opacity-75 mt-0.5">Everdrone required</div>
                  </button>
                </div>
              </div>
            </div>

            <ChevronRight className="w-4 h-4 text-gray-300 mt-10" />

            {/* Route-dependent workflow */}
            {selectedDecision === 'basic' ? (
              <>
                {/* Basic TI Path */}
                <div className="flex flex-col items-center">
                  <div className="text-xs text-gray-500 mb-1">15:15</div>
                  <div className={`w-36 p-3 rounded-lg border-2 ${getPhaseStyle('pending')}`}>
                    <Wrench className={`w-5 h-5 mx-auto mb-1 ${getIconColor('pending')}`} />
                    <div className="text-xs font-semibold text-center">Basic TI</div>
                    <div className="text-xs text-center mt-1 text-green-600">Remote Crew</div>
                    <div className="text-xs text-center text-blue-600">Everdrone monitors</div>
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