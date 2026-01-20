import React, { useState, useRef } from 'react';
import { X, Upload, Clock, Battery, MapPin, Activity, AlertCircle, CheckCircle, Zap, Pause } from 'lucide-react';
import { Button } from './ui/button';
import MissionTimeline from './MissionTimeline';
import MultipleTimelines from './MultipleTimelines';
import WeatherPanel from './WeatherPanel';
import PerformancePanel from './PerformancePanel';
import TemperaturePanel from './TemperaturePanel';
import RouteMapPanel from './RouteMapPanel';
import SpeedPanel from './SpeedPanel';
import BatteryPanel from './BatteryPanel';
import ReceptionPanel from './ReceptionPanel';

interface SimpleTelemetryAnalysisProps {
  isOpen: boolean;
  onClose: () => void;
}

interface BasicFlightData {
  id: string;
  fileName: string;
  
  // Core identifiers
  droneName: string;
  date: string;
  
  // Four Key KPIs
  alarmToTakeoffTime: number; // Time from alarm to takeoff in seconds
  awaitingClearanceTime: number; // Time awaiting clearance in seconds
  wpOutCalibratedTime: number; // WP out calibrated time in seconds
  calibratedDeliveryTime: number; // Calibrated delivery time in seconds
  
  // Additional metrics
  flightDuration: number; // in seconds
  batteryUsed: number; // percentage
  alarmDistance: number; // in meters (outDistance)
  alarmType: string; // Type of alarm/mission
  completionStatus: string; // Mission completion status
  
  // Raw data for inspection
  rawData: any;
}

const SimpleTelemetryAnalysis: React.FC<SimpleTelemetryAnalysisProps> = ({ isOpen, onClose }) => {
  const [flights, setFlights] = useState<BasicFlightData[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<string | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to find the latest timestamp in mission data
  const findLatestTimestamp = (data: any): string | null => {
    const timestamps: string[] = [];
    
    // Collect all possible timestamp fields from mission object
    if (data.mission) {
      Object.keys(data.mission).forEach(key => {
        if (key.toLowerCase().includes('timestamp') && typeof data.mission[key] === 'string') {
          timestamps.push(data.mission[key]);
        }
      });
    }
    
    // Also check landing object
    if (data.landing?.landedTimestamp) {
      timestamps.push(data.landing.landedTimestamp);
    }
    
    // Sort timestamps and return the latest one
    if (timestamps.length > 0) {
      return timestamps.sort().pop() || null;
    }
    
    return null;
  };

  // Helper function to calculate seconds between two timestamps
  const calculateDurationFromTimestamps = (takeOffTimestamp: string, landedTimestamp: string): number => {
    // Timestamp format expected: "20260118_143022.123" (YYYYMMDD_HHMMSS.mmm)
    const parseTimestamp = (ts: string): number => {
      // Extract date and time parts
      const [datePart, timePart] = ts.split('_');
      if (!datePart || !timePart) return 0;
      
      // Parse date (YYYYMMDD)
      const year = parseInt(datePart.substring(0, 4));
      const month = parseInt(datePart.substring(4, 6)) - 1; // Months are 0-indexed
      const day = parseInt(datePart.substring(6, 8));
      
      // Parse time (HHMMSS.mmm)
      const [time, milliseconds] = timePart.split('.');
      const hours = parseInt(time.substring(0, 2));
      const minutes = parseInt(time.substring(2, 4));
      const seconds = parseInt(time.substring(4, 6));
      const ms = parseInt(milliseconds || '0');
      
      // Create date and return timestamp
      const date = new Date(year, month, day, hours, minutes, seconds, ms);
      return date.getTime();
    };
    
    const takeOffTime = parseTimestamp(takeOffTimestamp);
    const landedTime = parseTimestamp(landedTimestamp);
    
    if (takeOffTime === 0 || landedTime === 0) return 0;
    
    // Return duration in seconds
    return Math.round((landedTime - takeOffTime) / 1000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          
          // Calculate flight duration from timestamps if available
          let flightDuration = 0;
          const takeOff = data.mission?.takeOffTimestamp || data.takeOffTimestamp;
          let landed = data.landing?.landedTimestamp || data.mission?.landedTimestamp || data.mission?.landingTimestamp || data.landedTimestamp || data.landingTimestamp;
          
          // If no landing timestamp found, use the latest timestamp available
          if (!landed) {
            landed = findLatestTimestamp(data);
          }
          
          if (takeOff && landed) {
            flightDuration = calculateDurationFromTimestamps(takeOff, landed);
          } else if (data.mission?.totalFlightTime) {
            // Fallback to totalFlightTime if timestamps not available
            flightDuration = data.mission.totalFlightTime;
          } else if (data.totalFlightTime) {
            flightDuration = data.totalFlightTime;
          }
          
          // Calculate alarm to takeoff time
          let alarmToTakeoffTime = 0;
          const alarmReceived = data.mission?.alarmRecievedTimestamp || data.alarm?.alarmReceivedFromCoordcom;
          if (alarmReceived && takeOff) {
            alarmToTakeoffTime = calculateDurationFromTimestamps(alarmReceived, takeOff);
          }
          
          // Calculate awaiting clearance time
          let awaitingClearanceTime = 0;
          if (data.mission?.droneHoldForClearanceTimestamp && data.mission?.clearanceConfirmedTimestamp) {
            awaitingClearanceTime = calculateDurationFromTimestamps(
              data.mission.droneHoldForClearanceTimestamp,
              data.mission.clearanceConfirmedTimestamp
            );
          }
          
          // Calculate WP out calibrated time
          let wpOutCalibratedTime = 0;
          
          // Check alarm type - can be in dashMetadata.alarmType or alarm.incidentTypeCoordcom
          const alarmTypeValue = data.dashMetadata?.alarmType || data.alarm?.incidentTypeCoordcom || data.alarm?.type || data.alarmType || '';
          const isLiveView = alarmTypeValue.toLowerCase() === 'liveview';
          const isOHCA = alarmTypeValue.toLowerCase() === 'ohca';
          
          console.log('WP Debug - Alarm type:', alarmTypeValue, 'isLiveView:', isLiveView, 'isOHCA:', isOHCA);
          console.log('WP Debug - Timestamps:', {
            wpStarted: data.mission?.wpStartedTimestamp,
            startingMissionProfiles: data.mission?.startingMissionProfilesTimestamp,
            aedDeliveryApproved: data.mission?.aedDeliveryApprovedAtTimestamp
          });
          
          // For LiveView: startingMissionProfilesTimestamp - wpStartedTimestamp
          if (isLiveView && data.mission?.wpStartedTimestamp && data.mission?.startingMissionProfilesTimestamp) {
            wpOutCalibratedTime = calculateDurationFromTimestamps(
              data.mission.wpStartedTimestamp,
              data.mission.startingMissionProfilesTimestamp
            );
            console.log('WP Debug - Calculated LiveView WP Out time:', wpOutCalibratedTime);
          } 
          // For OHCA: aedDeliveryApprovedAtTimestamp - wpStartedTimestamp
          else if (isOHCA && data.mission?.wpStartedTimestamp && data.mission?.aedDeliveryApprovedAtTimestamp) {
            wpOutCalibratedTime = calculateDurationFromTimestamps(
              data.mission.wpStartedTimestamp,
              data.mission.aedDeliveryApprovedAtTimestamp
            );
            console.log('WP Debug - Calculated OHCA WP Out time:', wpOutCalibratedTime);
          }
          
          // Calculate Calibrated Delivery Time (placeholder for now - to be discussed)
          let calibratedDeliveryTime = 0;
          // TODO: Implement calibrated delivery time calculation based on requirements
          
          // Extract only the most certain data points
          const flightData: BasicFlightData = {
            id: `flight-${Date.now()}-${Math.random()}`,
            fileName: file.name,
            droneName: data.droneName || data.drone || 'Unknown Drone',
            date: data.date || data.dashMetadata?.date || new Date().toISOString().split('T')[0],
            
            // Flight duration calculated from timestamps
            flightDuration: flightDuration,
            
            // Battery usage - calculation from takeoff to landing percentages
            batteryUsed: 
              (data.battery?.takeOffPercentage && data.battery?.landingPercentage) 
                ? Math.round(data.battery.takeOffPercentage - data.battery.landingPercentage)
                : 0,
            
            // Alarm distance (outDistance only) - round to nearest meter
            alarmDistance: 
              Math.round(data.routes?.outDistance || data.outDistance || 0),
            
            // Alarm type
            alarmType: 
              data.alarm?.subtype || 
              data.alarm?.type ||
              data.alarmType ||
              'Unknown',
            
            // Completion status
            completionStatus: 
              data.dashMetadata?.completionStatus || 
              data.completionStatus ||
              'unknown',
            
            // Four Key KPIs
            alarmToTakeoffTime: alarmToTakeoffTime,
            awaitingClearanceTime: awaitingClearanceTime,
            wpOutCalibratedTime: wpOutCalibratedTime,
            calibratedDeliveryTime: calibratedDeliveryTime,
            
            rawData: data
          };
          
          setFlights(prev => [...prev, flightData]);
          
          // Auto-select if first flight
          if (flights.length === 0) {
            setSelectedFlight(flightData.id);
          }
        } catch (error) {
          console.error('Error parsing flight data:', error);
          alert(`Error parsing ${file.name}. Please check the file format.`);
        }
      };
      reader.readAsText(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  const removeFlight = (flightId: string) => {
    setFlights(prev => prev.filter(f => f.id !== flightId));
    if (selectedFlight === flightId) {
      setSelectedFlight(null);
    }
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds || seconds === 0) return 'No data';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const formatDistance = (meters: number): string => {
    if (!meters || meters === 0) return 'No data';
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const selectedFlightData = flights.find(f => f.id === selectedFlight);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6" />
            Telemetry Analysis
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex h-[calc(90vh-88px)]">
          {/* Sidebar - Flight List */}
          <div className="w-80 border-r bg-gray-50 p-4 overflow-y-auto">
            {/* Upload Controls */}
            <div className="mb-4 space-y-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".json"
                multiple
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload JSON Files
              </Button>
            </div>

            {/* Flight List */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Loaded Flights ({flights.length})
              </h3>
              {flights.map(flight => (
                <div 
                  key={flight.id} 
                  className={`bg-white rounded-lg p-3 border cursor-pointer transition-all ${
                    selectedFlight === flight.id ? 'border-blue-500 shadow-sm' : 'hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedFlight(flight.id)}
                >
                  <div className="font-medium text-sm">{flight.droneName}</div>
                  <div className="text-xs text-gray-500">{flight.date}</div>
                  <div className="text-xs text-gray-500">
                    {formatDuration(flight.flightDuration)}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {flight.alarmType}
                  </div>
                  <div className="mt-1">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                      flight.completionStatus === 'normal' 
                        ? 'bg-green-100 text-green-800' 
                        : flight.completionStatus === 'abnormal'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {flight.completionStatus}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFlight(flight.id);
                    }}
                    className="mt-2 text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {flights.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-8">
                  No flights loaded. Upload JSON files to begin analysis.
                </div>
              )}
            </div>
          </div>

          {/* Main Content - Flight Details */}
          <div className="flex-1 p-6 overflow-y-auto">
            {selectedFlightData ? (
              <div className="space-y-6">
                {/* Flight Header */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-xl font-semibold mb-4">{selectedFlightData.droneName}</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Date:</span>
                      <span className="ml-2 font-medium">{selectedFlightData.date}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">File:</span>
                      <span className="ml-2 font-medium">{selectedFlightData.fileName}</span>
                    </div>
                  </div>
                </div>

                {/* Four Key KPIs - Top Priority */}
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
                  <h3 className="text-sm font-semibold text-blue-900 mb-3">KEY PERFORMANCE INDICATORS</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <Zap className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-medium">Alarm to Takeoff</span>
                      </div>
                      <div className="text-xl font-bold text-blue-900">
                        {formatDuration(selectedFlightData.alarmToTakeoffTime)}
                      </div>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <Pause className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-medium">Awaiting Clearance</span>
                      </div>
                      <div className="text-xl font-bold text-blue-900">
                        {selectedFlightData.awaitingClearanceTime > 0 
                          ? formatDuration(selectedFlightData.awaitingClearanceTime)
                          : '-'}
                      </div>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <Activity className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-medium">WP Out Time</span>
                      </div>
                      <div className="text-xl font-bold text-blue-900">
                        {selectedFlightData.wpOutCalibratedTime > 0 
                          ? formatDuration(selectedFlightData.wpOutCalibratedTime)
                          : '-'}
                      </div>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-blue-200">
                      <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <MapPin className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-medium">Calibrated Delivery</span>
                      </div>
                      <div className="text-xl font-bold text-blue-900">
                        {selectedFlightData.calibratedDeliveryTime > 0 
                          ? formatDuration(selectedFlightData.calibratedDeliveryTime)
                          : '-'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Metrics - Second Row */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  <div className="bg-gray-50 rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <Clock className="w-3 h-3" />
                      <span className="text-xs">Flight Duration</span>
                    </div>
                    <div className="text-lg font-bold">
                      {formatDuration(selectedFlightData.flightDuration)}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <Battery className="w-3 h-3" />
                      <span className="text-xs">Battery Used</span>
                    </div>
                    <div className="text-lg font-bold">
                      {selectedFlightData.batteryUsed > 0 
                        ? `${selectedFlightData.batteryUsed}%` 
                        : 'No data'}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <MapPin className="w-3 h-3" />
                      <span className="text-xs">Alarm Distance</span>
                    </div>
                    <div className="text-lg font-bold">
                      {formatDistance(selectedFlightData.alarmDistance)}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center gap-2 text-gray-600 mb-2">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-sm">Alarm Type</span>
                    </div>
                    <div className="text-lg font-bold">
                      {selectedFlightData.alarmType}
                    </div>
                  </div>
                </div>

                {/* Completion Status - Full Width */}
                <div className="bg-white rounded-lg border p-4 mb-4">
                  <div className="flex items-center gap-2 text-gray-600 mb-2">
                    {selectedFlightData.completionStatus === 'normal' ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span className="text-sm">Completion Status</span>
                  </div>
                  <div className={`text-2xl font-bold capitalize ${
                    selectedFlightData.completionStatus === 'normal' 
                      ? 'text-green-600' 
                      : selectedFlightData.completionStatus === 'abnormal'
                      ? 'text-red-600'
                      : 'text-gray-600'
                  }`}>
                    {selectedFlightData.completionStatus}
                  </div>
                </div>

                {/* Speed and Battery Panels - First Row */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {selectedFlightData.rawData?.speeds && (
                    <SpeedPanel speeds={selectedFlightData.rawData.speeds} />
                  )}
                  {selectedFlightData.rawData?.battery && (
                    <BatteryPanel 
                      battery={selectedFlightData.rawData.battery} 
                      flightDuration={selectedFlightData.flightDuration}
                    />
                  )}
                </div>

                {/* Reception Panel */}
                {selectedFlightData.rawData?.reception && (
                  <div className="mb-4">
                    <ReceptionPanel reception={selectedFlightData.rawData.reception} />
                  </div>
                )}

                {/* Weather Panel */}
                {selectedFlightData.rawData?.weather && (
                  <div className="mb-4">
                    <WeatherPanel weatherData={selectedFlightData.rawData.weather} />
                  </div>
                )}

                {/* Performance Panel */}
                {selectedFlightData.rawData?.performance && (
                  <div className="mb-4">
                    <PerformancePanel performanceData={selectedFlightData.rawData.performance} />
                  </div>
                )}

                {/* Temperature Panel */}
                {selectedFlightData.rawData?.temperature && (
                  <div className="mb-4">
                    <TemperaturePanel temperatureData={selectedFlightData.rawData.temperature} />
                  </div>
                )}

                {/* Route Map Panel */}
                {selectedFlightData.rawData?.routes && (
                  <div className="mb-4">
                    <RouteMapPanel routeData={selectedFlightData.rawData.routes} />
                  </div>
                )}

                {/* Multiple Timelines */}
                {(() => {
                  const data = selectedFlightData.rawData;
                  const takeOff = data?.mission?.takeOffTimestamp || data?.takeOffTimestamp;
                  let landed = data?.landing?.landedTimestamp || data?.mission?.landedTimestamp || data?.mission?.landingTimestamp || data?.landedTimestamp || data?.landingTimestamp;
                  
                  // If no landing timestamp found, use the latest timestamp available
                  if (!landed) {
                    landed = findLatestTimestamp(data);
                  }
                  
                  if (takeOff && landed) {
                    return (
                      <div className="mb-4">
                        <MultipleTimelines
                          takeOffTimestamp={takeOff}
                          landedTimestamp={landed}
                          rawData={data}
                        />
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Raw Data Toggle */}
                <div className="border-t pt-4">
                  <Button
                    onClick={() => setShowRawData(!showRawData)}
                    variant="outline"
                    size="sm"
                  >
                    {showRawData ? 'Hide' : 'Show'} Raw Data
                  </Button>
                  
                  {showRawData && (
                    <div className="mt-4 bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-96">
                      <pre className="text-xs">
                        {JSON.stringify(selectedFlightData.rawData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Data Quality Notice */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> This simplified view shows only the most essential telemetry data. 
                    Some values may show "No data" if the information is not available in the uploaded file.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a flight to view its telemetry data</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleTelemetryAnalysis;