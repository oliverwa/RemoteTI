import React, { useState, useRef } from 'react';
import { X, Upload, Sparkles, Clock, Battery, MapPin, Activity, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';
import MissionTimeline from './MissionTimeline';
import MultipleTimelines from './MultipleTimelines';

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
  
  // Essential metrics only
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
          const landed = data.landing?.landedTimestamp || data.mission?.landedTimestamp || data.mission?.landingTimestamp || data.landedTimestamp || data.landingTimestamp;
          
          if (takeOff && landed) {
            flightDuration = calculateDurationFromTimestamps(takeOff, landed);
          } else if (data.mission?.totalFlightTime) {
            // Fallback to totalFlightTime if timestamps not available
            flightDuration = data.mission.totalFlightTime;
          } else if (data.totalFlightTime) {
            flightDuration = data.totalFlightTime;
          }
          
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

  const loadSampleData = () => {
    // Generate sample telemetry data with proper structure
    const now = new Date();
    const formatTimestamp = (date: Date): string => {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const seconds = date.getSeconds().toString().padStart(2, '0');
      const ms = Math.floor(Math.random() * 999).toString().padStart(3, '0');
      return `${year}${month}${day}_${hours}${minutes}${seconds}.${ms}`;
    };
    
    // Sample 1: Normal 8-minute flight
    const takeoff1 = new Date(now.getTime() - 3600000); // 1 hour ago
    const landed1 = new Date(takeoff1.getTime() + 480000); // 8 minutes later
    const sample1 = {
      droneName: 'Bender',
      mission: {
        takeOffTimestamp: formatTimestamp(takeoff1),
        landedTimestamp: formatTimestamp(landed1)
      },
      battery: {
        takeOffPercentage: 95,
        landingPercentage: 50
      },
      routes: {
        outDistance: 2600,
        homeDistance: 2600
      },
      alarm: {
        subtype: 'Medical Emergency'
      },
      dashMetadata: {
        date: '2024-01-18',
        completionStatus: 'normal'
      }
    };
    
    // Sample 2: Shorter 5-minute flight
    const takeoff2 = new Date(now.getTime() - 7200000); // 2 hours ago
    const landed2 = new Date(takeoff2.getTime() + 320000); // 5.3 minutes later
    const sample2 = {
      droneName: 'Marvin',
      mission: {
        takeOffTimestamp: formatTimestamp(takeoff2),
        landedTimestamp: formatTimestamp(landed2)
      },
      battery: {
        takeOffPercentage: 98,
        landingPercentage: 70
      },
      routes: {
        outDistance: 1550,
        homeDistance: 1550
      },
      alarm: {
        subtype: 'Fire Alert'
      },
      dashMetadata: {
        date: '2024-01-18',
        completionStatus: 'normal'
      }
    };
    
    // Sample 3: Aborted 3-minute flight
    const takeoff3 = new Date(now.getTime() - 1800000); // 30 minutes ago
    const landed3 = new Date(takeoff3.getTime() + 180000); // 3 minutes later
    const sample3 = {
      droneName: 'HAL',
      mission: {
        takeOffTimestamp: formatTimestamp(takeoff3),
        landedTimestamp: formatTimestamp(landed3)
      },
      battery: {
        takeOffPercentage: 92,
        landingPercentage: 77
      },
      routes: {
        outDistance: 750,
        homeDistance: 750
      },
      alarm: {
        subtype: 'Equipment Delivery'
      },
      dashMetadata: {
        date: '2024-01-18',
        completionStatus: 'abnormal'
      }
    };
    
    // Process each sample through the same logic as uploaded files
    [sample1, sample2, sample3].forEach((data, index) => {
      let flightDuration = 0;
      if (data.mission?.takeOffTimestamp && data.mission?.landedTimestamp) {
        flightDuration = calculateDurationFromTimestamps(
          data.mission.takeOffTimestamp,
          data.mission.landedTimestamp
        );
      }
      
      const flightData: BasicFlightData = {
        id: `sample-${index + 1}`,
        fileName: `sample_flight_${index + 1}.json`,
        droneName: data.droneName,
        date: data.dashMetadata?.date || '2024-01-18',
        flightDuration: flightDuration,
        batteryUsed: 
          (data.battery?.takeOffPercentage && data.battery?.landingPercentage) 
            ? Math.round(data.battery.takeOffPercentage - data.battery.landingPercentage)
            : 0,
        alarmDistance: 
          data.routes?.outDistance || 0,
        alarmType: 
          data.alarm?.subtype || 'Medical Emergency',
        completionStatus: 
          data.dashMetadata?.completionStatus || 'normal',
        rawData: data
      };
      
      setFlights(prev => [...prev, flightData]);
      
      if (index === 0 && flights.length === 0) {
        setSelectedFlight(flightData.id);
      }
    });
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
            Simple Telemetry Analysis
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
              <Button
                onClick={loadSampleData}
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Load Sample Data
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
                  No flights loaded. Upload JSON files or load sample data.
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

                {/* Basic Metrics - First Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center gap-2 text-gray-600 mb-2">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm">Flight Duration</span>
                    </div>
                    <div className="text-2xl font-bold">
                      {formatDuration(selectedFlightData.flightDuration)}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center gap-2 text-gray-600 mb-2">
                      <Battery className="w-4 h-4" />
                      <span className="text-sm">Battery Used</span>
                    </div>
                    <div className="text-2xl font-bold">
                      {selectedFlightData.batteryUsed > 0 
                        ? `${selectedFlightData.batteryUsed}%` 
                        : 'No data'}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center gap-2 text-gray-600 mb-2">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">Alarm Distance</span>
                    </div>
                    <div className="text-2xl font-bold">
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

                {/* Multiple Timelines */}
                {(() => {
                  const data = selectedFlightData.rawData;
                  const takeOff = data?.mission?.takeOffTimestamp || data?.takeOffTimestamp;
                  const landed = data?.landing?.landedTimestamp || data?.mission?.landedTimestamp || data?.mission?.landingTimestamp || data?.landedTimestamp || data?.landingTimestamp;
                  
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