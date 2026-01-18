import React, { useState, useRef } from 'react';
import { X, Upload, Eye, Trash2, Activity, Camera, Tablet, Plane, Clock, Battery, Thermometer, Radio, MapPin, AlertCircle, CheckCircle, TrendingUp, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, RadialBarChart, RadialBar, PolarAngleAxis, ScatterChart, Scatter, Cell } from 'recharts';
import { generateMultipleSampleFlights } from '../utils/generateSampleTelemetry';

interface TelemetryDataAnalysisProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FlightData {
  id: string;
  fileName: string;
  droneName: string;
  date: string;
  duration: number;
  completionStatus: string;
  data: TelemetryData;
  timeline?: TimelineEvent[];
}

interface TimelineEvent {
  timestamp: string;
  time: number; // seconds from start
  type: 'mission' | 'pilot' | 'ipad' | 'alarm';
  category: string;
  description: string;
  value?: any;
}

interface TelemetryData {
  mission?: {
    alarmRecievedTimestamp?: string;
    telemetryStartedTimestamp?: string;
    pilotConnectedTimestamp?: string;
    missionApprovedTimestamp?: string;
    takeOffTimestamp?: string;
    moveOutOfHangarTimestamp?: string;
    ascendFromHangarTimestamp?: string;
    hangarExitCompleteTimestamp?: string;
    clearanceConfirmedTimestamp?: string;
    wpStartedTimestamp?: string;
    returnToSkybaseTimestamp?: string;
    atLastWPTimestamp?: string;
    totalFlightTime?: number;
    timeToWP?: number;
  };
  pilot?: {
    cameraSwitches?: Array<{
      timestamp: string;
      cameraName: string;
    }>;
    manualControl?: Array<{
      timestamp: string;
      action?: string;
    }>;
  };
  ipadInteractions?: Array<{
    timestamp: string;
    action?: string;
  }>;
  battery?: {
    takeOffPercentage?: number;
    takeOffVoltage?: number;
    wpOutStartPercentage?: number;
    wpOutStartVoltage?: number;
    wpHomeStartPercentage?: number;
    wpHomeStartVoltage?: number;
    landingPercentage?: number;
    landingVoltage?: number;
  };
  performance?: {
    averageCurrentWPOut?: number;
    averageCurrentWPHome?: number;
    thrustToHover?: number;
    avgVibX?: number;
    avgVibY?: number;
    avgVibZ?: number;
    maxVibX?: number;
    maxVibY?: number;
    maxVibZ?: number;
  };
  temperature?: {
    haloTakeOffTemp?: number;
    haloLandingTemp?: number;
    haloMaxTemp?: number;
    ftsTakeOffTemp?: number;
    ftsLandingTemp?: number;
    ftsMaxTemp?: number;
  };
  reception?: {
    sim1RssiAvg?: number;
    sim1Carrier?: string;
    sim2RssiAvg?: number;
    sim2Carrier?: string;
    sim3RssiAvg?: number;
    sim3Carrier?: string;
    sim4RssiAvg?: number;
    sim4Carrier?: string;
  };
  speeds?: {
    averageSpeed?: number;
    maxSpeed?: number;
  };
  routes?: {
    outDistance?: number;
    homeDistance?: number;
  };
  skybaseName?: string;
  droneName?: string;
  dashMetadata?: {
    date?: string;
    completionStatus?: string;
  };
  alarm?: {
    subtype?: string;
  };
}

const TelemetryDataAnalysis: React.FC<TelemetryDataAnalysisProps> = ({ isOpen, onClose }) => {
  const [flights, setFlights] = useState<FlightData[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'metrics' | 'summary'>('timeline');
  const [activeMetric, setActiveMetric] = useState<'overview' | 'battery' | 'performance' | 'temperature' | 'reception'>('overview');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Convert timestamp to seconds from start
  const timestampToSeconds = (timestamp: string, startTimestamp: string) => {
    const parseTimestamp = (ts: string) => {
      // Format: 20260101_204324.709
      const [date, time] = ts.split('_');
      const [hms, ms] = time.split('.');
      const hours = parseInt(hms.substring(0, 2));
      const minutes = parseInt(hms.substring(2, 4));
      const seconds = parseInt(hms.substring(4, 6));
      const milliseconds = parseInt(ms || '0');
      return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
    };
    
    const start = parseTimestamp(startTimestamp);
    const current = parseTimestamp(timestamp);
    return current - start;
  };

  const buildTimeline = (data: TelemetryData): TimelineEvent[] => {
    const events: TimelineEvent[] = [];
    const startTime = data.mission?.telemetryStartedTimestamp || data.mission?.alarmRecievedTimestamp;
    
    if (!startTime) return events;

    // Mission events
    if (data.mission) {
      const missionEvents = [
        { key: 'alarmRecievedTimestamp', desc: 'Alarm Received' },
        { key: 'telemetryStartedTimestamp', desc: 'Telemetry Started' },
        { key: 'pilotConnectedTimestamp', desc: 'Pilot Connected' },
        { key: 'missionApprovedTimestamp', desc: 'Mission Approved' },
        { key: 'takeOffTimestamp', desc: 'Take Off' },
        { key: 'moveOutOfHangarTimestamp', desc: 'Move Out of Hangar' },
        { key: 'ascendFromHangarTimestamp', desc: 'Ascend from Hangar' },
        { key: 'hangarExitCompleteTimestamp', desc: 'Hangar Exit Complete' },
        { key: 'clearanceConfirmedTimestamp', desc: 'Clearance Confirmed' },
        { key: 'wpStartedTimestamp', desc: 'Waypoint Navigation Started' },
        { key: 'returnToSkybaseTimestamp', desc: 'Return to Skybase' },
        { key: 'atLastWPTimestamp', desc: 'At Last Waypoint' }
      ];

      missionEvents.forEach(event => {
        const eventKey = event.key as keyof typeof data.mission;
        if (data.mission && data.mission[eventKey]) {
          events.push({
            timestamp: data.mission[eventKey] as string,
            time: timestampToSeconds(data.mission[eventKey] as string, startTime),
            type: 'mission',
            category: 'Flight Phase',
            description: event.desc
          });
        }
      });
    }

    // Pilot camera switches
    if (data.pilot?.cameraSwitches) {
      data.pilot.cameraSwitches.forEach((sw) => {
        events.push({
          timestamp: sw.timestamp,
          time: timestampToSeconds(sw.timestamp, startTime),
          type: 'pilot',
          category: 'Camera Switch',
          description: `Switched to ${sw.cameraName}`,
          value: sw.cameraName
        });
      });
    }

    // Pilot manual control
    if (data.pilot?.manualControl) {
      data.pilot.manualControl.forEach((mc) => {
        events.push({
          timestamp: mc.timestamp,
          time: timestampToSeconds(mc.timestamp, startTime),
          type: 'pilot',
          category: 'Manual Control',
          description: mc.action || 'Manual control activated'
        });
      });
    }

    // iPad interactions
    if (data.ipadInteractions && data.ipadInteractions.length > 0) {
      data.ipadInteractions.forEach((interaction) => {
        events.push({
          timestamp: interaction.timestamp,
          time: timestampToSeconds(interaction.timestamp, startTime),
          type: 'ipad',
          category: 'iPad',
          description: interaction.action || 'iPad interaction'
        });
      });
    }

    // Sort events by time
    events.sort((a, b) => a.time - b.time);
    
    return events;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          
          // Calculate duration
          let duration = 0;
          if (data.mission?.takeOffTimestamp && data.mission?.atLastWPTimestamp) {
            const start = data.mission.takeOffTimestamp;
            const end = data.mission.atLastWPTimestamp;
            duration = timestampToSeconds(end, start);
          } else if (data.mission?.totalFlightTime) {
            duration = data.mission.totalFlightTime;
          }

          // Build timeline
          const timeline = buildTimeline(data);

          const flightData: FlightData = {
            id: `flight-${Date.now()}-${Math.random()}`,
            fileName: file.name,
            droneName: data.droneName || 'Unknown',
            date: data.dashMetadata?.date || 'Unknown',
            duration: duration,
            completionStatus: data.dashMetadata?.completionStatus || 'unknown',
            data: data,
            timeline: timeline
          };
          setFlights(prev => [...prev, flightData]);
          
          // Auto-select if first flight
          if (flights.length === 0) {
            setSelectedFlight(flightData.id);
          }
        } catch (error) {
          console.error('Error parsing flight data:', error);
        }
      };
      reader.readAsText(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const loadSampleData = () => {
    const sampleFlights = generateMultipleSampleFlights(5);
    
    sampleFlights.forEach((data, index) => {
      // Calculate duration
      let duration = 0;
      if (data.mission?.takeOffTimestamp && data.mission?.atLastWPTimestamp) {
        const start = data.mission.takeOffTimestamp;
        const end = data.mission.atLastWPTimestamp;
        duration = timestampToSeconds(end, start);
      } else if (data.mission?.totalFlightTime) {
        duration = data.mission.totalFlightTime;
      }

      // Build timeline
      const timeline = buildTimeline(data);

      const flightData: FlightData = {
        id: `sample-flight-${Date.now()}-${index}`,
        fileName: `sample_flight_${index + 1}.json`,
        droneName: data.droneName || 'Unknown',
        date: data.dashMetadata?.date || new Date().toISOString().split('T')[0],
        duration: duration,
        completionStatus: data.dashMetadata?.completionStatus || 'normal',
        data: data,
        timeline: timeline
      };
      
      setFlights(prev => [...prev, flightData]);
      
      // Auto-select first flight
      if (index === 0) {
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

  const getMetricData = (flight: FlightData, metric: string) => {
    const data = flight.data;
    if (!data) return [];

    switch(metric) {
      case 'overview':
        // Calculate critical delivery times
        const alarmToTakeoff = data.mission?.alarmRecievedTimestamp && data.mission?.takeOffTimestamp
          ? timestampToSeconds(data.mission.takeOffTimestamp, data.mission.alarmRecievedTimestamp)
          : 0;
        const alarmToWP = data.mission?.alarmRecievedTimestamp && data.mission?.wpStartedTimestamp
          ? timestampToSeconds(data.mission.wpStartedTimestamp, data.mission.alarmRecievedTimestamp)
          : 0;
        const takeoffToWP = data.mission?.takeOffTimestamp && data.mission?.wpStartedTimestamp
          ? timestampToSeconds(data.mission.wpStartedTimestamp, data.mission.takeOffTimestamp)
          : 0;
          
        return [
          { name: 'Response Times', alarmToTakeoff, alarmToWP, takeoffToWP, unit: 's' },
          { name: 'Flight Distance', outbound: data.routes?.outDistance || 0, return: data.routes?.homeDistance || 0, unit: 'm' },
          { name: 'Speed', avg: data.speeds?.averageSpeed || 0, max: data.speeds?.maxSpeed || 0, unit: 'm/s' },
          { name: 'Flight Time', total: data.mission?.totalFlightTime || 0, toWP: data.mission?.timeToWP || 0, unit: 's' }
        ];
      
      case 'battery':
        if (!data.battery) return [];
        return [
          { phase: 'Take Off', percentage: data.battery.takeOffPercentage || 0, voltage: data.battery.takeOffVoltage || 0 },
          { phase: 'WP Out', percentage: data.battery.wpOutStartPercentage || 0, voltage: data.battery.wpOutStartVoltage || 0 },
          { phase: 'WP Home', percentage: data.battery.wpHomeStartPercentage || 0, voltage: data.battery.wpHomeStartVoltage || 0 },
          { phase: 'Landing', percentage: data.battery.landingPercentage || 0, voltage: data.battery.landingVoltage || 0 }
        ];
        
      case 'performance':
        if (!data.performance) return [];
        return [
          { metric: 'Current Out', value: data.performance.averageCurrentWPOut || 0, unit: 'A' },
          { metric: 'Current Home', value: data.performance.averageCurrentWPHome || 0, unit: 'A' },
          { metric: 'Thrust/Hover', value: data.performance.thrustToHover || 0, unit: '' },
          { metric: 'Vib X', avg: data.performance.avgVibX || 0, max: data.performance.maxVibX || 0 },
          { metric: 'Vib Y', avg: data.performance.avgVibY || 0, max: data.performance.maxVibY || 0 },
          { metric: 'Vib Z', avg: data.performance.avgVibZ || 0, max: data.performance.maxVibZ || 0 }
        ];
        
      case 'temperature':
        if (!data.temperature) return [];
        return [
          { component: 'Halo', takeOff: data.temperature.haloTakeOffTemp || 0, landing: data.temperature.haloLandingTemp || 0, max: data.temperature.haloMaxTemp || 0 },
          { component: 'FTS', takeOff: data.temperature.ftsTakeOffTemp || 0, landing: data.temperature.ftsLandingTemp || 0, max: data.temperature.ftsMaxTemp || 0 }
        ];
        
      case 'reception':
        if (!data.reception) return [];
        return [
          { sim: 'SIM 1', rssi: data.reception.sim1RssiAvg || 0, carrier: data.reception.sim1Carrier || 'Unknown' },
          { sim: 'SIM 2', rssi: data.reception.sim2RssiAvg || 0, carrier: data.reception.sim2Carrier || 'Unknown' },
          { sim: 'SIM 3', rssi: data.reception.sim3RssiAvg || 0, carrier: data.reception.sim3Carrier || 'Unknown' },
          { sim: 'SIM 4', rssi: data.reception.sim4RssiAvg || 0, carrier: data.reception.sim4Carrier || 'Unknown' }
        ];
        
      default:
        return [];
    }
  };

  const renderTimeline = (flight: FlightData) => {
    if (!flight.timeline || flight.timeline.length === 0) {
      return <div className="text-gray-500 text-center py-8">No timeline data available</div>;
    }

    const maxTime = Math.max(...flight.timeline.map(e => e.time));
    const missionEvents = flight.timeline.filter(e => e.type === 'mission');
    const pilotEvents = flight.timeline.filter(e => e.type === 'pilot');
    const ipadEvents = flight.timeline.filter(e => e.type === 'ipad');

    return (
      <div className="space-y-6">
        {/* Mission Timeline */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Plane className="w-5 h-5 text-blue-500" />
            Drone Mission Timeline
          </h3>
          <div className="relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-200"></div>
            {missionEvents.map((event, idx) => (
              <div key={idx} className="relative flex items-center mb-4 ml-3">
                <div className="absolute -left-3 w-3 h-3 bg-blue-500 rounded-full"></div>
                <div className="ml-6">
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-500 font-mono">
                      {Math.floor(event.time / 60)}:{(event.time % 60).toFixed(0).padStart(2, '0')}
                    </span>
                    <span className="font-medium">{event.description}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pilot Actions Timeline */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5 text-green-500" />
            Pilot Actions Timeline
          </h3>
          {pilotEvents.length > 0 ? (
            <div className="space-y-2">
              {pilotEvents.map((event, idx) => (
                <div key={idx} className="flex items-center gap-4 p-2 hover:bg-gray-50 rounded">
                  <span className="text-xs text-gray-500 font-mono">
                    {Math.floor(event.time / 60)}:{(event.time % 60).toFixed(0).padStart(2, '0')}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    event.value === 'IR' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {event.value || event.category}
                  </span>
                  <span className="text-sm">{event.description}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500 text-sm">No pilot actions recorded</div>
          )}
        </div>

        {/* iPad Interactions Timeline */}
        {ipadEvents.length > 0 && (
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Tablet className="w-5 h-5 text-purple-500" />
              iPad Interactions Timeline
            </h3>
            <div className="space-y-2">
              {ipadEvents.map((event, idx) => (
                <div key={idx} className="flex items-center gap-4 p-2 hover:bg-gray-50 rounded">
                  <span className="text-xs text-gray-500 font-mono">
                    {Math.floor(event.time / 60)}:{(event.time % 60).toFixed(0).padStart(2, '0')}
                  </span>
                  <span className="text-sm">{event.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Combined Timeline Chart */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold mb-4">Combined Timeline Overview</h3>
          <ResponsiveContainer width="100%" height={250}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                type="number"
                dataKey="time" 
                tickFormatter={(value) => `${Math.floor(value / 60)}:${(value % 60).toFixed(0).padStart(2, '0')}`}
                domain={[0, 'dataMax']}
                label={{ value: 'Time (mm:ss)', position: 'insideBottom', offset: -10 }}
              />
              <YAxis 
                type="category"
                dataKey="category"
                width={100}
                tick={{ fontSize: 12 }}
              />
              <Tooltip 
                formatter={(value: any, name: any) => {
                  if (name === 'time') {
                    const time = Number(value);
                    return `${Math.floor(time / 60)}:${(time % 60).toFixed(0).padStart(2, '0')}`;
                  }
                  return value;
                }}
                labelFormatter={() => ''}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white p-2 border rounded shadow-sm">
                        <p className="text-sm font-medium">{data.description}</p>
                        <p className="text-xs text-gray-600">
                          Time: {Math.floor(data.time / 60)}:{(data.time % 60).toFixed(0).padStart(2, '0')}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter 
                name="Events"
                data={flight.timeline.map(e => ({
                  ...e,
                  category: e.type === 'mission' ? 'Mission' : e.type === 'pilot' ? 'Pilot' : 'iPad',
                  fill: e.type === 'mission' ? '#3b82f6' : e.type === 'pilot' ? '#10b981' : '#8b5cf6'
                }))}
                fill="#8884d8"
              >
                {flight.timeline.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={
                    entry.type === 'mission' ? '#3b82f6' : 
                    entry.type === 'pilot' ? (entry.value === 'IR' ? '#ef4444' : '#10b981') : 
                    '#8b5cf6'
                  } />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderSummary = () => {
    if (flights.length === 0) {
      return <div className="text-gray-500 text-center py-8">No flights loaded for summary</div>;
    }

    // Calculate aggregate metrics
    const metrics = {
      totalFlights: flights.length,
      normalFlights: flights.filter(f => f.data.dashMetadata?.completionStatus === 'normal').length,
      abnormalFlights: flights.filter(f => f.data.dashMetadata?.completionStatus === 'abnormal').length,
      
      // Response times (in seconds)
      avgAlarmToTakeoff: [] as number[],
      avgAlarmToWP: [] as number[],
      avgTakeoffToWP: [] as number[],
      
      // Flight metrics
      avgFlightTime: [] as number[],
      avgDistance: [] as number[],
      avgSpeed: [] as number[],
      
      // Battery metrics
      avgBatteryUsed: [] as number[],
      
      // By drone breakdown
      byDrone: {} as Record<string, {
        flights: number;
        normal: number;
        abnormal: number;
        avgResponseTime: number[];
      }>
    };

    flights.forEach(flight => {
      const data = flight.data;
      
      // Calculate response times
      if (data.mission?.alarmRecievedTimestamp && data.mission?.takeOffTimestamp) {
        const alarmToTakeoff = timestampToSeconds(data.mission.takeOffTimestamp, data.mission.alarmRecievedTimestamp);
        metrics.avgAlarmToTakeoff.push(alarmToTakeoff);
      }
      
      if (data.mission?.alarmRecievedTimestamp && data.mission?.wpStartedTimestamp) {
        const alarmToWP = timestampToSeconds(data.mission.wpStartedTimestamp, data.mission.alarmRecievedTimestamp);
        metrics.avgAlarmToWP.push(alarmToWP);
      }
      
      if (data.mission?.takeOffTimestamp && data.mission?.wpStartedTimestamp) {
        const takeoffToWP = timestampToSeconds(data.mission.wpStartedTimestamp, data.mission.takeOffTimestamp);
        metrics.avgTakeoffToWP.push(takeoffToWP);
      }
      
      // Flight metrics
      if (data.mission?.totalFlightTime) {
        metrics.avgFlightTime.push(data.mission.totalFlightTime);
      }
      
      if (data.routes?.outDistance) {
        metrics.avgDistance.push(data.routes.outDistance);
      }
      
      if (data.speeds?.averageSpeed) {
        metrics.avgSpeed.push(data.speeds.averageSpeed);
      }
      
      // Battery usage
      if (data.battery?.takeOffPercentage && data.battery?.landingPercentage) {
        metrics.avgBatteryUsed.push(data.battery.takeOffPercentage - data.battery.landingPercentage);
      }
      
      // Group by drone
      const droneName = flight.droneName || 'Unknown';
      if (!metrics.byDrone[droneName]) {
        metrics.byDrone[droneName] = {
          flights: 0,
          normal: 0,
          abnormal: 0,
          avgResponseTime: []
        };
      }
      metrics.byDrone[droneName].flights++;
      if (data.dashMetadata?.completionStatus === 'normal') {
        metrics.byDrone[droneName].normal++;
      } else if (data.dashMetadata?.completionStatus === 'abnormal') {
        metrics.byDrone[droneName].abnormal++;
      }
      if (data.mission?.alarmRecievedTimestamp && data.mission?.wpStartedTimestamp) {
        const responseTime = timestampToSeconds(data.mission.wpStartedTimestamp, data.mission.alarmRecievedTimestamp);
        metrics.byDrone[droneName].avgResponseTime.push(responseTime);
      }
    });

    // Calculate averages
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    
    const avgMetrics = {
      avgAlarmToTakeoff: avg(metrics.avgAlarmToTakeoff),
      avgAlarmToWP: avg(metrics.avgAlarmToWP),
      avgTakeoffToWP: avg(metrics.avgTakeoffToWP),
      avgFlightTime: avg(metrics.avgFlightTime),
      avgDistance: avg(metrics.avgDistance),
      avgSpeed: avg(metrics.avgSpeed),
      avgBatteryUsed: avg(metrics.avgBatteryUsed)
    };

    // Process drone metrics
    const droneMetricsProcessed: Record<string, {
      flights: number;
      normal: number;
      abnormal: number;
      avgResponseTime: number;
    }> = {};
    
    Object.keys(metrics.byDrone).forEach(drone => {
      droneMetricsProcessed[drone] = {
        ...metrics.byDrone[drone],
        avgResponseTime: avg(metrics.byDrone[drone].avgResponseTime)
      };
    });

    return (
      <div className="space-y-6">
        {/* Overview Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <h4 className="text-sm font-medium text-gray-600 mb-2">Total Flights</h4>
            <div className="text-3xl font-bold">{metrics.totalFlights}</div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 text-green-600">
                <CheckCircle className="w-4 h-4" />
                {metrics.normalFlights} normal
              </span>
              <span className="inline-flex items-center gap-1 text-red-600">
                <AlertCircle className="w-4 h-4" />
                {metrics.abnormalFlights} abnormal
              </span>
            </div>
          </div>
          
          <div className="bg-white rounded-lg border p-4">
            <h4 className="text-sm font-medium text-gray-600 mb-2">Avg Response Time</h4>
            <div className="text-3xl font-bold">
              {Math.floor(avgMetrics.avgAlarmToWP / 60)}:{(avgMetrics.avgAlarmToWP % 60).toFixed(0).padStart(2, '0')}
            </div>
            <div className="text-xs text-gray-500 mt-1">Alarm → Waypoint Navigation</div>
          </div>
          
          <div className="bg-white rounded-lg border p-4">
            <h4 className="text-sm font-medium text-gray-600 mb-2">Success Rate</h4>
            <div className="text-3xl font-bold">
              {((metrics.normalFlights / metrics.totalFlights) * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">Normal completions</div>
          </div>
        </div>

        {/* Critical Response Times */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            Average Response Times Across All Flights
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded">
              <div className="text-2xl font-bold text-blue-600">
                {Math.floor(avgMetrics.avgAlarmToTakeoff / 60)}:{(avgMetrics.avgAlarmToTakeoff % 60).toFixed(0).padStart(2, '0')}
              </div>
              <div className="text-sm text-gray-600 mt-1">Alarm → Takeoff</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded border-2 border-blue-200">
              <div className="text-2xl font-bold text-blue-600">
                {Math.floor(avgMetrics.avgAlarmToWP / 60)}:{(avgMetrics.avgAlarmToWP % 60).toFixed(0).padStart(2, '0')}
              </div>
              <div className="text-sm text-gray-600 mt-1">Alarm → WP Start</div>
              <div className="text-xs text-gray-500">(Critical Metric)</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded">
              <div className="text-2xl font-bold text-blue-600">
                {Math.floor(avgMetrics.avgTakeoffToWP / 60)}:{(avgMetrics.avgTakeoffToWP % 60).toFixed(0).padStart(2, '0')}
              </div>
              <div className="text-sm text-gray-600 mt-1">Takeoff → WP Start</div>
            </div>
          </div>
        </div>

        {/* Flight Performance Metrics */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            Average Flight Performance
          </h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-xl font-bold">{avgMetrics.avgFlightTime.toFixed(0)}s</div>
              <div className="text-sm text-gray-600">Flight Time</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold">{(avgMetrics.avgDistance / 1000).toFixed(1)}km</div>
              <div className="text-sm text-gray-600">Distance</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold">{avgMetrics.avgSpeed.toFixed(1)}m/s</div>
              <div className="text-sm text-gray-600">Speed</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold">{avgMetrics.avgBatteryUsed.toFixed(1)}%</div>
              <div className="text-sm text-gray-600">Battery Used</div>
            </div>
          </div>
        </div>

        {/* By Drone Analysis */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Plane className="w-5 h-5 text-purple-500" />
            Performance by Drone
          </h3>
          <div className="space-y-3">
            {Object.entries(droneMetricsProcessed).map(([drone, stats]) => (
              <div key={drone} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <div className="font-medium">{drone}</div>
                  <div className="text-sm text-gray-600">
                    {stats.flights} flights • {((stats.normal / stats.flights) * 100).toFixed(0)}% success rate
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">
                    Avg Response: {Math.floor(stats.avgResponseTime / 60)}:{Math.round(stats.avgResponseTime % 60).toString().padStart(2, '0')}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs text-green-600">{stats.normal} normal</span>
                    {stats.abnormal > 0 && <span className="text-xs text-red-600">{stats.abnormal} abnormal</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderMetrics = (flight: FlightData) => {
    const data = getMetricData(flight, activeMetric);
    
    if (data.length === 0) {
      return <div className="text-gray-500 text-center py-8">No data available for this metric</div>;
    }

    switch(activeMetric) {
      case 'battery':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="phase" />
              <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" />
              <YAxis yAxisId="right" orientation="right" stroke="#ef4444" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="percentage" fill="#3b82f6" name="Battery %" />
              <Bar yAxisId="right" dataKey="voltage" fill="#ef4444" name="Voltage (V)" />
            </BarChart>
          </ResponsiveContainer>
        );
        
      case 'temperature':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="component" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="takeOff" fill="#3b82f6" name="Take Off (°C)" />
              <Bar dataKey="landing" fill="#10b981" name="Landing (°C)" />
              <Bar dataKey="max" fill="#ef4444" name="Max (°C)" />
            </BarChart>
          </ResponsiveContainer>
        );
        
      case 'reception':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sim" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="rssi" fill="#3b82f6" name="RSSI (dBm)" />
            </BarChart>
          </ResponsiveContainer>
        );
        
      default:
        return (
          <div className="space-y-4">
            {/* Response Times - Priority Metric */}
            {(() => {
              const responseData = (data as any[]).find((d: any) => d.name === 'Response Times');
              if (!responseData) return null;
              return (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Critical Response Times
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-700">
                        {responseData.alarmToTakeoff > 0 ? `${Math.floor(responseData.alarmToTakeoff / 60)}:${(responseData.alarmToTakeoff % 60).toFixed(0).padStart(2, '0')}` : 'N/A'}
                      </div>
                      <div className="text-sm text-gray-600">Alarm → Takeoff</div>
                    </div>
                    <div className="text-center bg-white rounded p-2 border-2 border-blue-300">
                      <div className="text-2xl font-bold text-blue-700">
                        {responseData.alarmToWP > 0 ? `${Math.floor(responseData.alarmToWP / 60)}:${(responseData.alarmToWP % 60).toFixed(0).padStart(2, '0')}` : 'N/A'}
                      </div>
                      <div className="text-sm text-gray-600">Alarm → Delivery</div>
                      <div className="text-xs text-blue-600 font-medium">PRIMARY METRIC</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-700">
                        {responseData.takeoffToWP > 0 ? `${Math.floor(responseData.takeoffToWP / 60)}:${(responseData.takeoffToWP % 60).toFixed(0).padStart(2, '0')}` : 'N/A'}
                      </div>
                      <div className="text-sm text-gray-600">Takeoff → Delivery</div>
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* Other Metrics */}
            <div className="grid grid-cols-2 gap-4">
              {(data as any[]).filter((d: any) => d.name !== 'Response Times').map((item: any, idx: number) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">{item.name || item.metric}</h4>
                  <div className="space-y-1 text-sm">
                    {Object.entries(item).filter(([k]) => k !== 'name' && k !== 'metric' && k !== 'unit').map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-600 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                        <span className="font-medium">
                          {typeof value === 'number' ? value.toFixed(1) : value} {item.unit || ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
    }
  };

  if (!isOpen) return null;

  const selectedFlightData = flights.find(f => f.id === selectedFlight);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6" />
            Telemetry Data Analysis
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
          {/* Sidebar */}
          <div className="w-80 border-r bg-gray-50 p-4 overflow-y-auto">
            {/* Upload Button */}
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
                Upload Flight Data
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

            {/* View Mode Toggle */}
            <div className="mb-4 flex flex-col gap-2">
              <Button
                onClick={() => setViewMode('timeline')}
                variant={viewMode === 'timeline' ? 'default' : 'outline'}
                size="sm"
                className="w-full"
              >
                Timeline
              </Button>
              <Button
                onClick={() => setViewMode('metrics')}
                variant={viewMode === 'metrics' ? 'default' : 'outline'}
                size="sm"
                className="w-full"
              >
                Metrics
              </Button>
              <Button
                onClick={() => setViewMode('summary')}
                variant={viewMode === 'summary' ? 'default' : 'outline'}
                size="sm"
                className="w-full"
              >
                Summary
              </Button>
            </div>

            {/* Flight List */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Loaded Flights ({flights.length})</h3>
              {flights.map(flight => (
                <div 
                  key={flight.id} 
                  className={`bg-white rounded-lg p-3 border cursor-pointer transition-all ${
                    selectedFlight === flight.id ? 'border-blue-500 shadow-sm' : 'hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedFlight(flight.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{flight.droneName}</div>
                      <div className="text-xs text-gray-500">{flight.date}</div>
                      <div className="text-xs text-gray-500">
                        Duration: {Math.floor(flight.duration / 60)}m {flight.duration % 60}s
                      </div>
                      <div className="mt-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          flight.completionStatus === 'normal' 
                            ? 'bg-green-100 text-green-800' 
                            : flight.completionStatus === 'abnormal'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {flight.completionStatus === 'normal' && <CheckCircle className="w-3 h-3" />}
                          {flight.completionStatus === 'abnormal' && <AlertCircle className="w-3 h-3" />}
                          {flight.completionStatus !== 'normal' && flight.completionStatus !== 'abnormal' && <AlertTriangle className="w-3 h-3" />}
                          {flight.completionStatus}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFlight(flight.id);
                        }}
                        className="p-1 hover:bg-gray-100 rounded text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {selectedFlightData ? (
              <>
                {/* Flight Info Header */}
                <div className="mb-6 bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{selectedFlightData.droneName}</h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {selectedFlightData.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {selectedFlightData.data.skybaseName}
                        </span>
                        {selectedFlightData.data.alarm && (
                          <span className="flex items-center gap-1 text-red-600">
                            <Activity className="w-4 h-4" />
                            {selectedFlightData.data.alarm.subtype}
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          selectedFlightData.completionStatus === 'normal' 
                            ? 'bg-green-100 text-green-800' 
                            : selectedFlightData.completionStatus === 'abnormal'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {selectedFlightData.completionStatus === 'normal' && <CheckCircle className="w-3 h-3" />}
                          {selectedFlightData.completionStatus === 'abnormal' && <AlertCircle className="w-3 h-3" />}
                          {selectedFlightData.completionStatus !== 'normal' && selectedFlightData.completionStatus !== 'abnormal' && <AlertTriangle className="w-3 h-3" />}
                          {selectedFlightData.completionStatus}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-gray-600">Flight Time</div>
                        <div className="font-semibold">{Math.floor(selectedFlightData.duration / 60)}:{(selectedFlightData.duration % 60).toString().padStart(2, '0')}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-600">Distance</div>
                        <div className="font-semibold">{((selectedFlightData.data.routes?.outDistance || 0) / 1000).toFixed(1)} km</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* View Content */}
                {viewMode === 'timeline' ? (
                  renderTimeline(selectedFlightData)
                ) : viewMode === 'metrics' ? (
                  <>
                    {/* Metric Selector */}
                    <div className="mb-4 flex gap-2">
                      {['overview', 'battery', 'performance', 'temperature', 'reception'].map(metric => (
                        <Button
                          key={metric}
                          onClick={() => setActiveMetric(metric as any)}
                          variant={activeMetric === metric ? 'default' : 'outline'}
                          size="sm"
                          className="capitalize flex items-center gap-2"
                        >
                          {metric === 'battery' && <Battery className="w-4 h-4" />}
                          {metric === 'temperature' && <Thermometer className="w-4 h-4" />}
                          {metric === 'reception' && <Radio className="w-4 h-4" />}
                          {metric === 'performance' && <Activity className="w-4 h-4" />}
                          {metric === 'overview' && <Eye className="w-4 h-4" />}
                          {metric}
                        </Button>
                      ))}
                    </div>
                    
                    {/* Metric Charts */}
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="font-semibold mb-4 capitalize">{activeMetric} Analysis</h3>
                      {renderMetrics(selectedFlightData)}
                    </div>
                  </>
                ) : null}
              </>
            ) : viewMode === 'summary' ? (
              renderSummary()
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Upload and select a flight to view analysis
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelemetryDataAnalysis;