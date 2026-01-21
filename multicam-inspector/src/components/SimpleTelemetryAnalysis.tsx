import React, { useState, useRef } from 'react';
import { X, Upload, Clock, Battery, MapPin, Activity, AlertCircle, CheckCircle, Zap, Pause, LayoutGrid, FileText, Heart } from 'lucide-react';
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
import KPITimeline from './KPITimeline';
import FlightsSummaryView from './FlightsSummaryView';
import FlightFilters from './FlightFilters';

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
  
  // Key KPIs
  alarmToTakeoffTime: number; // Time from alarm to takeoff in seconds
  awaitingClearanceTime: number; // Time awaiting clearance in seconds
  wpOutCalibratedTime: number; // WP out calibrated time in seconds (normalized to 2km)
  wpOutActualTime: number; // WP out actual time in seconds (for display in parentheses)
  aedDropTime: number; // AED drop time (OHCA only) - time at location to AED delivery
  aedReleaseAGL: number; // AED release altitude above ground level (OHCA only) - in meters
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
  console.log('SimpleTelemetryAnalysis v2.0 - 5 column layout with completion status inline');
  const [flights, setFlights] = useState<BasicFlightData[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<string | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [viewMode, setViewMode] = useState<'summary' | 'detail'>('detail');
  const [filters, setFilters] = useState({
    alarmType: '',
    droneName: '',
    dateFrom: '',
    dateTo: '',
    completionStatus: ''
  });
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
          
          // Calculate WP out time (actual and calibrated to 2km)
          let wpOutActualTime = 0;
          let wpOutCalibratedTime = 0;
          let outDirectDistance = 0;
          
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
          
          // Get the direct out distance (in meters)
          outDirectDistance = data.routes?.outDistanceDirect || data.outDistanceDirect || 0;
          
          // For LiveView: startingMissionProfilesTimestamp - wpStartedTimestamp
          if (isLiveView && data.mission?.wpStartedTimestamp && data.mission?.startingMissionProfilesTimestamp) {
            wpOutActualTime = calculateDurationFromTimestamps(
              data.mission.wpStartedTimestamp,
              data.mission.startingMissionProfilesTimestamp
            );
            console.log('WP Debug - Calculated LiveView WP Out time:', wpOutActualTime, 'seconds');
          } 
          // For OHCA: aedDeliveryApprovedAtTimestamp - wpStartedTimestamp
          else if (isOHCA && data.mission?.wpStartedTimestamp && data.mission?.aedDeliveryApprovedAtTimestamp) {
            wpOutActualTime = calculateDurationFromTimestamps(
              data.mission.wpStartedTimestamp,
              data.mission.aedDeliveryApprovedAtTimestamp
            );
            console.log('WP Debug - Calculated OHCA WP Out time:', wpOutActualTime, 'seconds');
          }
          
          // Calculate calibrated time normalized to 2km
          if (wpOutActualTime > 0 && outDirectDistance > 0) {
            // Convert distance from meters to km
            const distanceKm = outDirectDistance / 1000;
            // Calculate calibration factor (2km / actual distance)
            const calibrationFactor = 2.0 / distanceKm;
            
            // Sanity check: reject unrealistic calibration factors
            // If factor is > 10 (distance < 200m) or < 0.1 (distance > 20km), skip calibration
            const MAX_CALIBRATION_FACTOR = 10; // Max 10x scaling (min 200m distance)
            const MIN_CALIBRATION_FACTOR = 0.1; // Min 0.1x scaling (max 20km distance)
            
            if (calibrationFactor > MAX_CALIBRATION_FACTOR || calibrationFactor < MIN_CALIBRATION_FACTOR) {
              console.warn('WP Debug - Invalid calibration factor, using actual time:', {
                actualTime: wpOutActualTime,
                directDistance: outDirectDistance,
                distanceKm: distanceKm,
                calibrationFactor: calibrationFactor,
                reason: calibrationFactor > MAX_CALIBRATION_FACTOR ? 'Distance too short' : 'Distance too long'
              });
              // Use actual time without calibration
              wpOutCalibratedTime = wpOutActualTime;
            } else {
              // Apply calibration factor to get normalized time
              wpOutCalibratedTime = Math.round(wpOutActualTime * calibrationFactor);
              
              console.log('WP Debug - Calibration:', {
                actualTime: wpOutActualTime,
                directDistance: outDirectDistance,
                distanceKm: distanceKm,
                calibrationFactor: calibrationFactor,
                calibratedTime: wpOutCalibratedTime
              });
            }
          } else {
            // If no distance data, use actual time as fallback
            wpOutCalibratedTime = wpOutActualTime;
          }
          
          // Calculate AED Drop Time and AED Release AGL for OHCA alarms
          let aedDropTime = 0;
          let aedReleaseAGL = 0;
          if (isOHCA) {
            // AED Drop Time calculation
            if (data.mission?.atAlarmLocationTimestamp && data.mission?.aedDeliveryApprovedAtTimestamp) {
              aedDropTime = calculateDurationFromTimestamps(
                data.mission.atAlarmLocationTimestamp,
                data.mission.aedDeliveryApprovedAtTimestamp
              );
              console.log('AED Drop Time Calculation:', {
                atLocation: data.mission.atAlarmLocationTimestamp,
                aedDelivered: data.mission.aedDeliveryApprovedAtTimestamp,
                aedDropTime: aedDropTime
              });
            }
            
            // AED Release AGL (altitude above ground level in meters)
            if (data.mission?.aedReleaseAGL) {
              aedReleaseAGL = Math.round(data.mission.aedReleaseAGL);
              console.log('AED Release AGL:', aedReleaseAGL, 'meters');
            }
          }
          
          // Calculate Calibrated Delivery Time 
          // For OHCA: Alarm to Takeoff + Awaiting Clearance + WP Out Time (calibrated to 2km) + AED Drop Time
          // For others: Alarm to Takeoff + Awaiting Clearance + WP Out Time (calibrated to 2km)
          let calibratedDeliveryTime = 0;
          
          if (isOHCA) {
            // OHCA includes AED drop time
            if (alarmToTakeoffTime > 0 && awaitingClearanceTime > 0 && wpOutCalibratedTime > 0) {
              calibratedDeliveryTime = alarmToTakeoffTime + awaitingClearanceTime + wpOutCalibratedTime + aedDropTime;
              
              console.log('OHCA Calibrated Delivery Time Calculation:', {
                alarmToTakeoff: alarmToTakeoffTime,
                awaitingClearance: awaitingClearanceTime,
                wpOutCalibrated: wpOutCalibratedTime,
                aedDrop: aedDropTime,
                total: calibratedDeliveryTime
              });
            }
          } else {
            // Non-OHCA calculation (LiveView, etc.)
            if (alarmToTakeoffTime > 0 && awaitingClearanceTime > 0 && wpOutCalibratedTime > 0) {
              calibratedDeliveryTime = alarmToTakeoffTime + awaitingClearanceTime + wpOutCalibratedTime;
              
              console.log('Calibrated Delivery Time Calculation:', {
                alarmToTakeoff: alarmToTakeoffTime,
                awaitingClearance: awaitingClearanceTime,
                wpOutCalibrated: wpOutCalibratedTime,
                total: calibratedDeliveryTime
              });
            }
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
            
            // Key KPIs
            alarmToTakeoffTime: alarmToTakeoffTime,
            awaitingClearanceTime: awaitingClearanceTime,
            wpOutCalibratedTime: wpOutCalibratedTime,
            wpOutActualTime: wpOutActualTime,
            aedDropTime: aedDropTime,
            aedReleaseAGL: aedReleaseAGL,
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
    if (!seconds || seconds === 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const formatDistance = (meters: number): string => {
    if (!meters || meters === 0) return 'No data';
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };
  
  // Get color class for KPIs based on thresholds
  const getKPIColor = (type: 'alarmToTakeoff' | 'awaitingClearance' | 'wpOut' | 'delivery', seconds: number, returnType: 'text' | 'bg' = 'text'): string => {
    if (!seconds || seconds <= 0) {
      return returnType === 'bg' ? 'bg-gray-100 border-gray-300' : 'text-gray-400';
    }
    
    let colorLevel = 0; // 0=green, 1=light-green, 2=yellow, 3=orange, 4=red
    
    switch(type) {
      case 'alarmToTakeoff':
        // Green at 20s, Yellow at 25s, Red at 35s+
        if (seconds <= 20) colorLevel = 0;
        else if (seconds <= 25) colorLevel = 1;
        else if (seconds <= 30) colorLevel = 2;
        else if (seconds <= 35) colorLevel = 3;
        else colorLevel = 4;
        break;
        
      case 'awaitingClearance':
        // Green below 5s, Yellow at 10s, Red at 20s+
        if (seconds <= 5) colorLevel = 0;
        else if (seconds <= 10) colorLevel = 2;
        else if (seconds <= 15) colorLevel = 3;
        else if (seconds <= 20) colorLevel = 3;
        else colorLevel = 4;
        break;
        
      case 'delivery':
        // Green at 2:30 (150s), gradually to Red at 3:30 (210s)
        if (seconds <= 150) colorLevel = 0;
        else if (seconds <= 170) colorLevel = 2;
        else if (seconds <= 190) colorLevel = 3;
        else if (seconds <= 210) colorLevel = 3;
        else colorLevel = 4;
        break;
        
      case 'wpOut':
        // No specific thresholds given, use generic
        if (seconds <= 120) colorLevel = 0;
        else if (seconds <= 180) colorLevel = 2;
        else if (seconds <= 240) colorLevel = 3;
        else colorLevel = 4;
        break;
        
      default:
        colorLevel = 0;
    }
    
    if (returnType === 'bg') {
      // Return background gradient classes
      switch(colorLevel) {
        case 0: return 'bg-gradient-to-br from-green-50 to-green-100 border-green-400';
        case 1: return 'bg-gradient-to-br from-green-50 to-yellow-50 border-green-300';
        case 2: return 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-400';
        case 3: return 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-400';
        case 4: return 'bg-gradient-to-br from-red-50 to-red-100 border-red-400';
        default: return 'bg-gray-100 border-gray-300';
      }
    } else {
      // Return text color classes
      switch(colorLevel) {
        case 0: return 'text-green-600';
        case 1: return 'text-green-600';
        case 2: return 'text-yellow-600';
        case 3: return 'text-orange-600';
        case 4: return 'text-red-600';
        default: return 'text-gray-600';
      }
    }
  };

  const selectedFlightData = flights.find(f => f.id === selectedFlight);

  // Apply filters to flights
  const filteredFlights = flights.filter(flight => {
    // Alarm type filter
    if (filters.alarmType && flight.alarmType !== filters.alarmType) {
      return false;
    }
    
    // Drone name filter
    if (filters.droneName && flight.droneName !== filters.droneName) {
      return false;
    }
    
    // Date from filter
    if (filters.dateFrom && flight.date < filters.dateFrom) {
      return false;
    }
    
    // Date to filter
    if (filters.dateTo && flight.date > filters.dateTo) {
      return false;
    }
    
    // Completion status filter
    if (filters.completionStatus && flight.completionStatus !== filters.completionStatus) {
      return false;
    }
    
    return true;
  });
  
  const clearFilters = () => {
    setFilters({
      alarmType: '',
      droneName: '',
      dateFrom: '',
      dateTo: '',
      completionStatus: ''
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="border-b">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Activity className="w-6 h-6" />
                Telemetry Analysis
              </h2>
              {/* View mode toggle */}
              {flights.length > 0 && (
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode('summary')}
                    className={`px-3 py-1.5 rounded flex items-center gap-1.5 text-sm font-medium transition-all ${
                      viewMode === 'summary' 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    Summary
                  </button>
                  <button
                    onClick={() => setViewMode('detail')}
                    className={`px-3 py-1.5 rounded flex items-center gap-1.5 text-sm font-medium transition-all ${
                      viewMode === 'detail' 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    Details
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Inline Filters */}
          {flights.length > 0 && (
            <div className="px-6 pb-3">
              <FlightFilters
                flights={flights}
                filters={filters}
                onFilterChange={setFilters}
                onClearFilters={clearFilters}
              />
            </div>
          )}
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
                Flights ({filteredFlights.length} of {flights.length})
              </h3>
              {filteredFlights.map(flight => (
                <div 
                  key={flight.id} 
                  className={`bg-white rounded-md p-2 border cursor-pointer transition-all ${
                    selectedFlight === flight.id ? 'border-blue-500 shadow-md bg-blue-50' : 'hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedFlight(flight.id)}
                >
                  {/* Header with drone, date, and status */}
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 flex-1">
                      <span className="font-semibold text-xs">{flight.droneName}</span>
                      <span className="text-xs text-gray-500">• {flight.date}</span>
                    </div>
                    <span className={`px-1 py-0.5 rounded text-xs font-medium ${
                      flight.completionStatus === 'normal' || flight.completionStatus === 'complete'
                        ? 'bg-green-100 text-green-700'
                        : flight.completionStatus === 'motbud'
                        ? 'bg-yellow-100 text-yellow-700'
                        : flight.completionStatus === 'abnormal'
                        ? 'bg-red-100 text-red-700'  
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {flight.completionStatus}
                    </span>
                  </div>
                  
                  {/* Alarm type */}
                  <div className="text-xs text-gray-600 mb-1">
                    <span className="font-medium">{flight.alarmType}</span>
                  </div>
                  
                  {/* Four KPIs in compact grid with color coding */}
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                    <div className="flex items-center gap-0.5">
                      <Zap className="w-2.5 h-2.5 text-gray-400" />
                      <span className="text-gray-500 text-xs">A→T:</span>
                      <span className={`font-semibold ${getKPIColor('alarmToTakeoff', flight.alarmToTakeoffTime, 'text')}`}>
                        {formatDuration(flight.alarmToTakeoffTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Pause className="w-2.5 h-2.5 text-gray-400" />
                      <span className="text-gray-500 text-xs">Wait:</span>
                      <span className={`font-semibold ${getKPIColor('awaitingClearance', flight.awaitingClearanceTime, 'text')}`}>
                        {formatDuration(flight.awaitingClearanceTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Activity className="w-2.5 h-2.5 text-gray-400" />
                      <span className="text-gray-500 text-xs">WP:</span>
                      <span className={`font-semibold ${getKPIColor('wpOut', flight.wpOutCalibratedTime, 'text')}`}>
                        {formatDuration(flight.wpOutCalibratedTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <MapPin className="w-2.5 h-2.5 text-gray-400" />
                      <span className="text-gray-500 text-xs">Del:</span>
                      <span className={`font-semibold ${getKPIColor('delivery', flight.calibratedDeliveryTime, 'text')}`}>
                        {formatDuration(flight.calibratedDeliveryTime)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFlight(flight.id);
                    }}
                    className="mt-1 text-xs text-red-500 hover:text-red-700 hover:underline"
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

          {/* Main Content - Flight Details or Summary */}
          <div className="flex-1 p-6 overflow-y-auto">
            
            {viewMode === 'summary' ? (
              <FlightsSummaryView 
                flights={filteredFlights}
                selectedFlight={selectedFlight}
                onSelectFlight={(flightId) => {
                  setSelectedFlight(flightId);
                  setViewMode('detail');
                }}
              />
            ) : selectedFlightData ? (
              <div className="space-y-6">
                {/* Simplified Header */}
                <div className="mb-4">
                  <h3 className="text-2xl font-bold text-gray-800">{selectedFlightData.droneName}</h3>
                  <p className="text-sm text-gray-500 mt-1">Date: {selectedFlightData.date} · File: {selectedFlightData.fileName}</p>
                </div>

                {/* Key KPIs - Top Priority */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-6">
                  <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-4">Key Performance Indicators</h3>
                  <div className={`grid grid-cols-2 ${selectedFlightData.aedDropTime > 0 ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4`}>
                    <div className={`rounded-xl p-4 border shadow-sm flex flex-col items-center justify-center text-center ${selectedFlightData.alarmToTakeoffTime <= 25 ? 'bg-emerald-50 border-emerald-200' : selectedFlightData.alarmToTakeoffTime <= 35 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Zap className="w-4 h-4 text-slate-600" />
                        <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">Alarm to Takeoff</span>
                      </div>
                      <div className={`text-2xl font-bold ${selectedFlightData.alarmToTakeoffTime <= 25 ? 'text-emerald-700' : selectedFlightData.alarmToTakeoffTime <= 35 ? 'text-amber-700' : 'text-rose-700'}`}>
                        {formatDuration(selectedFlightData.alarmToTakeoffTime)}
                      </div>
                    </div>

                    <div className={`rounded-xl p-4 border shadow-sm flex flex-col items-center justify-center text-center ${selectedFlightData.awaitingClearanceTime <= 10 ? 'bg-emerald-50 border-emerald-200' : selectedFlightData.awaitingClearanceTime <= 20 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Pause className="w-4 h-4 text-slate-600" />
                        <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">Awaiting Clearance</span>
                      </div>
                      <div className={`text-2xl font-bold ${selectedFlightData.awaitingClearanceTime <= 10 ? 'text-emerald-700' : selectedFlightData.awaitingClearanceTime <= 20 ? 'text-amber-700' : 'text-rose-700'}`}>
                        {selectedFlightData.awaitingClearanceTime > 0 
                          ? formatDuration(selectedFlightData.awaitingClearanceTime)
                          : '-'}
                      </div>
                    </div>

                    <div className={`rounded-xl p-4 border shadow-sm flex flex-col items-center justify-center text-center ${selectedFlightData.wpOutCalibratedTime <= 120 ? 'bg-emerald-50 border-emerald-200' : selectedFlightData.wpOutCalibratedTime <= 180 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Activity className="w-4 h-4 text-slate-600" />
                        <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">WP Out Time (2km)</span>
                      </div>
                      <div className={`text-2xl font-bold ${selectedFlightData.wpOutCalibratedTime <= 120 ? 'text-emerald-700' : selectedFlightData.wpOutCalibratedTime <= 180 ? 'text-amber-700' : 'text-rose-700'}`}>
                        {selectedFlightData.wpOutCalibratedTime > 0 
                          ? formatDuration(selectedFlightData.wpOutCalibratedTime)
                          : '-'}
                      </div>
                      {selectedFlightData.wpOutActualTime > 0 && (
                        <div className="text-[10px] text-slate-500 mt-1">
                          ({formatDuration(selectedFlightData.wpOutActualTime)} actual)
                        </div>
                      )}
                    </div>

                    {/* AED Drop Time - Only for OHCA */}
                    {selectedFlightData.aedDropTime > 0 && (
                      <div className="rounded-xl p-4 border shadow-sm bg-violet-50 border-violet-200 flex flex-col items-center justify-center text-center">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Heart className="w-4 h-4 text-violet-600" />
                          <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">AED Drop Time</span>
                        </div>
                        <div className="text-2xl font-bold text-violet-700">
                          {formatDuration(selectedFlightData.aedDropTime)}
                        </div>
                      </div>
                    )}

                    <div className={`rounded-xl p-4 border shadow-sm flex flex-col items-center justify-center text-center ${selectedFlightData.calibratedDeliveryTime <= 170 ? 'bg-emerald-50 border-emerald-200' : selectedFlightData.calibratedDeliveryTime <= 210 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <MapPin className="w-4 h-4 text-slate-600" />
                        <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">Calibrated Delivery</span>
                      </div>
                      <div className={`text-2xl font-bold ${selectedFlightData.calibratedDeliveryTime <= 170 ? 'text-emerald-700' : selectedFlightData.calibratedDeliveryTime <= 210 ? 'text-amber-700' : 'text-rose-700'}`}>
                        {selectedFlightData.calibratedDeliveryTime > 0 
                          ? formatDuration(selectedFlightData.calibratedDeliveryTime)
                          : '-'}
                      </div>
                      {selectedFlightData.calibratedDeliveryTime > 0 && (
                        <div className="text-[10px] text-slate-500 mt-1" title="Alarm to Takeoff + Awaiting Clearance + WP Out (2km)">
                          (Total calibrated)
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* KPI Timeline Visualization */}
                <div className="mb-4">
                  <KPITimeline
                    alarmToTakeoffTime={selectedFlightData.alarmToTakeoffTime}
                    awaitingClearanceTime={selectedFlightData.awaitingClearanceTime}
                    wpOutCalibratedTime={selectedFlightData.wpOutCalibratedTime}
                    aedDropTime={selectedFlightData.aedDropTime}
                  />
                </div>

                {/* Additional Metrics - Second Row */}
                <div className={`grid grid-cols-2 ${selectedFlightData.aedReleaseAGL > 0 ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-3 mb-4`}>
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

                  {/* AED Release AGL - Only for OHCA */}
                  {selectedFlightData.aedReleaseAGL > 0 && (
                    <div className="bg-purple-50 rounded-lg border border-purple-300 p-3">
                      <div className="flex items-center gap-2 text-gray-500 mb-1">
                        <Heart className="w-3 h-3 text-purple-600" />
                        <span className="text-xs">AED Release Alt</span>
                      </div>
                      <div className="text-lg font-bold text-purple-600">
                        {selectedFlightData.aedReleaseAGL}m
                      </div>
                    </div>
                  )}

                  <div className="bg-gray-50 rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      <AlertCircle className="w-3 h-3" />
                      <span className="text-xs">Alarm Type</span>
                    </div>
                    <div className="text-lg font-bold capitalize">
                      {selectedFlightData.alarmType}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                      {selectedFlightData.completionStatus === 'normal' ? (
                        <CheckCircle className="w-3 h-3 text-green-600" />
                      ) : selectedFlightData.completionStatus === 'complete' ? (
                        <CheckCircle className="w-3 h-3 text-green-600" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-red-600" />
                      )}
                      <span className="text-xs">Completion Status</span>
                    </div>
                    <div className={`text-lg font-bold capitalize ${
                      selectedFlightData.completionStatus === 'normal' || selectedFlightData.completionStatus === 'complete'
                        ? 'text-green-600' 
                        : selectedFlightData.completionStatus === 'abnormal'
                        ? 'text-red-600'
                        : selectedFlightData.completionStatus === 'motbud'
                        ? 'text-yellow-600'
                        : 'text-gray-600'
                    }`}>
                      {selectedFlightData.completionStatus || 'Unknown'}
                    </div>
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