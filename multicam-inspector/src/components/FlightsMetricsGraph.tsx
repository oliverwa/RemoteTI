import React, { useState, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { TrendingUp, BarChart2, Filter, Download } from 'lucide-react';

interface FlightData {
  id: string;
  fileName: string;
  droneName: string;
  date: string;
  alarmToTakeoffTime: number;
  awaitingClearanceTime: number;
  wpOutCalibratedTime: number;
  wpOutActualTime: number;
  aedDropTime: number;
  calibratedDeliveryTime: number;
  flightDuration: number;
  batteryUsed: number;
  alarmDistance: number;
  alarmType: string;
  completionStatus: string;
  rawData?: any;
}

interface FlightsMetricsGraphProps {
  flights: FlightData[];
}

// Define metric type
interface MetricConfig {
  label: string;
  unit: string;
  color: string;
  goodThreshold?: number;
  warningThreshold?: number;
  format: (v: number) => string;
  calculate?: (flight: FlightData) => number | null;
}

// Define available metrics with their properties
const AVAILABLE_METRICS: Record<string, MetricConfig> = {
  // Time metrics
  calibratedDeliveryTime: { 
    label: 'Delivery Time', 
    unit: 's', 
    color: '#3b82f6',
    goodThreshold: 150, // Below this is good
    warningThreshold: 180,
    format: (v: number) => `${Math.floor(v/60)}:${(v%60).toString().padStart(2, '0')}`
  },
  alarmToTakeoffTime: { 
    label: 'Alarm to Takeoff', 
    unit: 's', 
    color: '#10b981',
    goodThreshold: 25,
    warningThreshold: 35,
    format: (v: number) => `${v}s`
  },
  awaitingClearanceTime: { 
    label: 'Awaiting Clearance', 
    unit: 's', 
    color: '#f59e0b',
    goodThreshold: 10,
    warningThreshold: 20,
    format: (v: number) => `${v}s`
  },
  wpOutCalibratedTime: { 
    label: 'WP Out Time (Calibrated)', 
    unit: 's', 
    color: '#8b5cf6',
    goodThreshold: 90,
    warningThreshold: 120,
    format: (v: number) => `${Math.floor(v/60)}:${(v%60).toString().padStart(2, '0')}`
  },
  flightDuration: { 
    label: 'Flight Duration', 
    unit: 's', 
    color: '#06b6d4',
    format: (v: number) => `${Math.floor(v/60)}m`
  },
  
  // Battery & Consumption
  batteryUsed: { 
    label: 'Battery Consumption', 
    unit: '%', 
    color: '#ef4444',
    goodThreshold: 30,
    warningThreshold: 50,
    format: (v: number) => `${v.toFixed(1)}%`
  },
  'batteryPerKm': { 
    label: 'Battery per KM', 
    unit: '%/km', 
    color: '#f97316',
    goodThreshold: 2,
    warningThreshold: 3,
    format: (v: number) => `${v.toFixed(2)}%/km`,
    calculate: (flight: FlightData) => {
      const battery = flight.rawData?.battery;
      const distance = flight.rawData?.speeds?.totalDistance || flight.rawData?.totalDistance;
      if (!battery || !distance) return null;
      const used = battery.takeOffPercentage - battery.landingPercentage;
      return used / (distance / 1000);
    }
  },
  'batteryPerMinute': { 
    label: 'Battery per Minute', 
    unit: '%/min', 
    color: '#ec4899',
    goodThreshold: 0.5,
    warningThreshold: 1,
    format: (v: number) => `${v.toFixed(2)}%/min`,
    calculate: (flight: FlightData) => {
      const battery = flight.rawData?.battery;
      if (!battery || !flight.flightDuration) return null;
      const used = battery.takeOffPercentage - battery.landingPercentage;
      return used / (flight.flightDuration / 60);
    }
  },
  
  // Speed metrics
  'outboundSpeed': { 
    label: 'Outbound Speed', 
    unit: 'km/h', 
    color: '#22c55e',
    goodThreshold: 70, // Above this is good for speed
    warningThreshold: 50,
    format: (v: number) => `${v.toFixed(1)} km/h`,
    calculate: (flight: FlightData) => {
      const speed = flight.rawData?.speeds?.averageSpeedDuringWPOut || 
                   flight.rawData?.speeds?.outboundSpeed;
      return speed ? speed * 3.6 : null; // Convert m/s to km/h
    }
  },
  'maxSpeed': { 
    label: 'Maximum Speed', 
    unit: 'km/h', 
    color: '#a855f7',
    format: (v: number) => `${v.toFixed(1)} km/h`,
    calculate: (flight: FlightData) => {
      const speed = flight.rawData?.speeds?.maxSpeed;
      return speed ? speed * 3.6 : null;
    }
  },
  
  // Distance metrics
  alarmDistance: { 
    label: 'Alarm Distance', 
    unit: 'km', 
    color: '#0ea5e9',
    format: (v: number) => `${(v/1000).toFixed(2)} km`
  },
  
  // AED Metrics
  'aedReleaseHeight': {
    label: 'AED Release Height',
    unit: 'm',
    color: '#9333ea',
    format: (v: number) => `${v.toFixed(1)} m`,
    calculate: (flight: FlightData) => {
      return flight.rawData?.mission?.aedReleaseAGL || null;
    }
  },
  
  // Weather Metrics
  'windSpeed': {
    label: 'Wind Speed',
    unit: 'm/s',
    color: '#06b6d4',
    goodThreshold: 9, // Max allowed sustained wind
    warningThreshold: 16, // Max gust
    format: (v: number) => `${v.toFixed(1)} m/s`,
    calculate: (flight: FlightData) => {
      return flight.rawData?.weather?.windPrognosis || 
             flight.rawData?.weather?.windspeedHangar || null;
    }
  },
  'gustSpeed': {
    label: 'Gust Speed',
    unit: 'm/s',
    color: '#0284c7',
    goodThreshold: 16,
    format: (v: number) => `${v.toFixed(1)} m/s`,
    calculate: (flight: FlightData) => {
      return flight.rawData?.weather?.gustPrognosis || 
             flight.rawData?.weather?.gustHangar || null;
    }
  },
  'temperature': {
    label: 'Temperature',
    unit: '°C',
    color: '#dc2626',
    format: (v: number) => `${v.toFixed(1)}°C`,
    calculate: (flight: FlightData) => {
      return flight.rawData?.weather?.temperaturePrognosis || null;
    }
  },
  'visibility': {
    label: 'Visibility',
    unit: 'km',
    color: '#64748b',
    goodThreshold: 5, // Above this is good
    warningThreshold: 2,
    format: (v: number) => `${(v/1000).toFixed(1)} km`,
    calculate: (flight: FlightData) => {
      return flight.rawData?.weather?.visibilityPrognosis || null;
    }
  },
  
  // Thrust & Current Metrics
  'thrustToHover': {
    label: 'Thrust to Hover',
    unit: '%',
    color: '#7c3aed',
    goodThreshold: 60, // Below this is good
    warningThreshold: 75,
    format: (v: number) => `${v.toFixed(1)}%`,
    calculate: (flight: FlightData) => {
      const rawData = flight.rawData;
      
      // Check performance.thrustToHover (found in the data sample)
      if (rawData?.performance?.thrustToHover != null) {
        // Convert to percentage if needed (value is 0.451 in sample, so multiply by 100)
        const value = rawData.performance.thrustToHover;
        return value < 1 ? value * 100 : value;
      }
      
      return null;
    }
  },
  'averageCurrent': {
    label: 'Average Current',
    unit: 'A',
    color: '#f59e0b',
    format: (v: number) => `${v.toFixed(1)} A`,
    calculate: (flight: FlightData) => {
      const rawData = flight.rawData;
      
      // Check performance.averageCurrentWPOut and averageCurrentWPHome
      if (rawData?.performance?.averageCurrentWPOut != null && rawData?.performance?.averageCurrentWPHome != null) {
        // Average the outbound and return current values
        return (rawData.performance.averageCurrentWPOut + rawData.performance.averageCurrentWPHome) / 2;
      } else if (rawData?.performance?.averageCurrentWPOut != null) {
        return rawData.performance.averageCurrentWPOut;
      } else if (rawData?.performance?.averageCurrentWPHome != null) {
        return rawData.performance.averageCurrentWPHome;
      }
      
      return null;
    }
  },
  
  // Vibration Metrics
  'vibrationX': {
    label: 'Vibration X (Max)',
    unit: 'm/s²',
    color: '#e11d48',
    goodThreshold: 30, // Below this is good
    warningThreshold: 60,
    format: (v: number) => `${v.toFixed(1)} m/s²`,
    calculate: (flight: FlightData) => {
      const rawData = flight.rawData;
      
      // Check performance.maxVibX (found in the data sample)
      if (rawData?.performance?.maxVibX != null) {
        return rawData.performance.maxVibX;
      }
      
      return null;
    }
  },
  'vibrationY': {
    label: 'Vibration Y (Max)',
    unit: 'm/s²',
    color: '#be123c',
    goodThreshold: 30,
    warningThreshold: 60,
    format: (v: number) => `${v.toFixed(1)} m/s²`,
    calculate: (flight: FlightData) => {
      const rawData = flight.rawData;
      
      // Check performance.maxVibY (found in the data sample)
      if (rawData?.performance?.maxVibY != null) {
        return rawData.performance.maxVibY;
      }
      
      return null;
    }
  },
  'vibrationZ': {
    label: 'Vibration Z (Max)',
    unit: 'm/s²',
    color: '#9f1239',
    goodThreshold: 30,
    warningThreshold: 60,
    format: (v: number) => `${v.toFixed(1)} m/s²`,
    calculate: (flight: FlightData) => {
      const rawData = flight.rawData;
      
      // Check performance.maxVibZ (found in the data sample)
      if (rawData?.performance?.maxVibZ != null) {
        return rawData.performance.maxVibZ;
      }
      
      return null;
    }
  }
};

const FlightsMetricsGraph: React.FC<FlightsMetricsGraphProps> = ({ flights }) => {
  const [selectedMetric, setSelectedMetric] = useState<string>('calibratedDeliveryTime');
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('line');
  const [groupBy, setGroupBy] = useState<'flight' | 'date' | 'drone'>('flight');
  const [showThresholds, setShowThresholds] = useState(true);
  const [excludedFlights, setExcludedFlights] = useState<Set<string>>(new Set());

  // Process data based on selected metric and grouping
  const chartData = useMemo(() => {
    const metric = AVAILABLE_METRICS[selectedMetric];
    if (!metric) return [];

    // Filter out excluded flights and sort by date (oldest first)
    const sortedFlights = flights
      .filter(flight => !excludedFlights.has(flight.id))
      .sort((a, b) => {
        // Parse dates - handle YYYYMMDD format
        const parseDate = (dateStr: string) => {
          // If it's YYYYMMDD format (8 digits)
          if (dateStr.length === 8 && !dateStr.includes('/') && !dateStr.includes('-')) {
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            return new Date(`${year}-${month}-${day}`);
          }
          // If it contains slashes (DD/MM/YYYY)
          if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
          }
          // Otherwise assume it's already in a parseable format
          return new Date(dateStr);
        };
        
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        
        // Sort ascending (oldest first for left-to-right chronological order)
        return dateA.getTime() - dateB.getTime();
      });

    if (groupBy === 'flight') {
      // Log to verify sorting
      console.log('Sorted flights (oldest to newest):', sortedFlights.map(f => ({
        date: f.date,
        drone: f.droneName
      })));
      
      return sortedFlights.map(flight => {
        let value;
        if (metric.calculate) {
          value = metric.calculate(flight);
        } else {
          value = flight[selectedMetric as keyof FlightData] as number;
        }
        
        return {
          name: `${flight.droneName} (${flight.date})`,
          value: value || 0,
          drone: flight.droneName,
          date: flight.date,
          status: flight.completionStatus,
          id: flight.id
        };
      }).filter(d => d.value > 0);
    } 
    
    if (groupBy === 'date') {
      const grouped = sortedFlights.reduce((acc, flight) => {
        const date = flight.date;
        if (!acc[date]) {
          acc[date] = { values: [], count: 0 };
        }
        
        let value;
        if (metric.calculate) {
          value = metric.calculate(flight);
        } else {
          value = flight[selectedMetric as keyof FlightData] as number;
        }
        
        if (value && value > 0) {
          acc[date].values.push(value);
          acc[date].count++;
        }
        return acc;
      }, {} as Record<string, { values: number[], count: number }>);

      // Parse date helper function (same as used for sorting)
      const parseDate = (dateStr: string) => {
        // If it's YYYYMMDD format (8 digits)
        if (dateStr.length === 8 && !dateStr.includes('/') && !dateStr.includes('-')) {
          const year = dateStr.substring(0, 4);
          const month = dateStr.substring(4, 6);
          const day = dateStr.substring(6, 8);
          return new Date(`${year}-${month}-${day}`);
        }
        // If it contains slashes (DD/MM/YYYY)
        if (dateStr.includes('/')) {
          const parts = dateStr.split('/');
          return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
        // Otherwise assume it's already in a parseable format
        return new Date(dateStr);
      };

      // Sort dates chronologically before returning
      return Object.entries(grouped)
        .filter(([_, data]) => data.count > 0) // Only include dates with data
        .sort(([dateA], [dateB]) => {
          const parsedA = parseDate(dateA);
          const parsedB = parseDate(dateB);
          return parsedA.getTime() - parsedB.getTime();
        })
        .map(([date, data]) => {
          const parsedDate = parseDate(date);
          return {
            name: date,
            timestamp: parsedDate.getTime(), // Add timestamp for proper spacing
            value: data.values.reduce((a, b) => a + b, 0) / data.values.length,
            min: Math.min(...data.values),
            max: Math.max(...data.values),
            count: data.count
          };
        });
    }
    
    if (groupBy === 'drone') {
      const grouped = sortedFlights.reduce((acc, flight) => {
        const drone = flight.droneName;
        if (!acc[drone]) {
          acc[drone] = { values: [], count: 0 };
        }
        
        let value;
        if (metric.calculate) {
          value = metric.calculate(flight);
        } else {
          value = flight[selectedMetric as keyof FlightData] as number;
        }
        
        if (value && value > 0) {
          acc[drone].values.push(value);
          acc[drone].count++;
        }
        return acc;
      }, {} as Record<string, { values: number[], count: number }>);

      // Sort drones alphabetically for consistency
      return Object.entries(grouped)
        .sort(([droneA], [droneB]) => droneA.localeCompare(droneB))
        .map(([drone, data]) => ({
          name: drone,
          value: data.values.reduce((a, b) => a + b, 0) / data.values.length,
          min: Math.min(...data.values),
          max: Math.max(...data.values),
          count: data.count
        }));
    }
    
    return [];
  }, [flights, selectedMetric, groupBy]);

  const metric = AVAILABLE_METRICS[selectedMetric];
  
  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload[0]) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-sm">{label}</p>
          <p className="text-sm">
            {metric.label}: <span className="font-bold">{metric.format(data.value)}</span>
          </p>
          {data.count && (
            <p className="text-xs text-gray-500">Samples: {data.count}</p>
          )}
          {data.min !== undefined && (
            <p className="text-xs text-gray-500">
              Range: {metric.format(data.min)} - {metric.format(data.max)}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const values = chartData.map(d => d.value).filter(v => v > 0);
    if (values.length === 0) return null;
    
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    return { avg, min, max, count: values.length };
  }, [chartData]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Metrics Analysis
          </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Metric Selection */}
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Select Metric</label>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <optgroup label="Time Metrics">
                <option value="calibratedDeliveryTime">Delivery Time</option>
                <option value="alarmToTakeoffTime">Alarm to Takeoff</option>
                <option value="awaitingClearanceTime">Awaiting Clearance</option>
                <option value="wpOutCalibratedTime">WP Out Time</option>
                <option value="flightDuration">Flight Duration</option>
              </optgroup>
              <optgroup label="Battery & Consumption">
                <option value="batteryUsed">Battery Used (%)</option>
                <option value="batteryPerKm">Battery per KM</option>
                <option value="batteryPerMinute">Battery per Minute</option>
              </optgroup>
              <optgroup label="Speed Metrics">
                <option value="outboundSpeed">Outbound Speed</option>
                <option value="maxSpeed">Maximum Speed</option>
              </optgroup>
              <optgroup label="Distance & Delivery">
                <option value="alarmDistance">Alarm Distance</option>
                <option value="aedReleaseHeight">AED Release Height</option>
              </optgroup>
              <optgroup label="Weather Conditions">
                <option value="windSpeed">Wind Speed</option>
                <option value="gustSpeed">Gust Speed</option>
                <option value="temperature">Temperature</option>
                <option value="visibility">Visibility</option>
              </optgroup>
              <optgroup label="Thrust & Power">
                <option value="thrustToHover">Thrust to Hover</option>
                <option value="averageCurrent">Average Current</option>
              </optgroup>
              <optgroup label="Vibrations">
                <option value="vibrationX">Vibration X</option>
                <option value="vibrationY">Vibration Y</option>
                <option value="vibrationZ">Vibration Z</option>
              </optgroup>
            </select>
          </div>
          
          {/* Chart Type */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Chart Type</label>
            <div className="flex gap-2">
              {(['line', 'bar', 'area'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    chartType === type 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          {/* Group By */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Group By</label>
            <div className="flex gap-2">
              {(['flight', 'date', 'drone'] as const).map(group => (
                <button
                  key={group}
                  onClick={() => setGroupBy(group)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    groupBy === group 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {group.charAt(0).toUpperCase() + group.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          {/* Options */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-1">Options</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showThresholds}
                onChange={(e) => setShowThresholds(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Show Thresholds</span>
            </label>
          </div>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="text-xs text-blue-600 font-medium">Average</div>
            <div className="text-xl font-bold text-blue-900">{metric.format(stats.avg)}</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 border border-green-200">
            <div className="text-xs text-green-600 font-medium">Best</div>
            <div className="text-xl font-bold text-green-900">{metric.format(stats.min)}</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
            <div className="text-xs text-orange-600 font-medium">Worst</div>
            <div className="text-xl font-bold text-orange-900">{metric.format(stats.max)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="text-xs text-gray-600 font-medium">Samples</div>
            <div className="text-xl font-bold text-gray-900">{stats.count}</div>
          </div>
        </div>
      )}

      {/* Excluded Flights Info */}
      {groupBy === 'flight' && excludedFlights.size > 0 && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
          <p className="text-xs text-blue-700">
            <strong>{excludedFlights.size} data point{excludedFlights.size > 1 ? 's' : ''} hidden.</strong>
            <button
              onClick={() => setExcludedFlights(new Set())}
              className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Show all
            </button>
          </p>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
        {/* Info about clicking dots */}
        {groupBy === 'flight' && chartData.length > 0 && (
          <div className="mb-2">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              💡 Click on any dot in the chart to hide/show that data point
            </p>
          </div>
        )}
        <ResponsiveContainer width="100%" height={400}>
          {chartType === 'line' ? (
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-600" />
              <XAxis 
                dataKey={groupBy === 'date' ? 'timestamp' : 'name'}
                angle={-45} 
                textAnchor="end" 
                height={100}
                tick={{ fontSize: 10 }}
                domain={groupBy === 'date' ? ['dataMin', 'dataMax'] : undefined}
                type={groupBy === 'date' ? 'number' : 'category'}
                tickFormatter={groupBy === 'date' ? 
                  (value: any) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 
                  undefined
                }
              />
              <YAxis tick={{ fontSize: 10 }} className="dark:text-gray-400" />
              <Tooltip 
                content={<CustomTooltip />}
                cursor={{ fill: 'transparent' }}
              />
              {showThresholds && metric.goodThreshold && (
                <>
                  <Line 
                    type="monotone" 
                    dataKey={() => metric.goodThreshold} 
                    stroke="#10b981" 
                    strokeDasharray="5 5" 
                    strokeWidth={2}
                    name="Good Threshold"
                    dot={false}
                  />
                  {metric.warningThreshold && (
                    <Line 
                      type="monotone" 
                      dataKey={() => metric.warningThreshold} 
                      stroke="#f59e0b" 
                      strokeDasharray="5 5" 
                      strokeWidth={2}
                      name="Warning Threshold"
                      dot={false}
                    />
                  )}
                </>
              )}
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={metric.color}
                strokeWidth={2}
                dot={groupBy === 'flight' ? (props: any) => {
                  const { cx, cy, payload, index } = props;
                  const isExcluded = payload?.id && excludedFlights.has(payload.id);
                  return (
                    <g>
                      {/* Visible dot with click handler directly on it */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isExcluded ? 4 : 6}
                        fill={isExcluded ? '#ccc' : metric.color}
                        stroke="#fff"
                        strokeWidth={1}
                        cursor="pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('Dot clicked!', payload, 'Index:', index);
                          if (payload && payload.id) {
                            const newExcluded = new Set(excludedFlights);
                            if (excludedFlights.has(payload.id)) {
                              newExcluded.delete(payload.id);
                              console.log('Re-including flight:', payload.id);
                            } else {
                              newExcluded.add(payload.id);
                              console.log('Excluding flight:', payload.id);
                            }
                            setExcludedFlights(newExcluded);
                          }
                        }}
                        onMouseEnter={(e) => {
                          const target = e.target as SVGCircleElement;
                          target.setAttribute('r', isExcluded ? '6' : '8');
                          target.setAttribute('fill', isExcluded ? '#999' : metric.color);
                        }}
                        onMouseLeave={(e) => {
                          const target = e.target as SVGCircleElement;
                          target.setAttribute('r', isExcluded ? '4' : '6');
                          target.setAttribute('fill', isExcluded ? '#ccc' : metric.color);
                        }}
                      />
                      {/* Larger invisible click area behind the dot for easier clicking */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={12}
                        fill="transparent"
                        cursor="pointer"
                        style={{ pointerEvents: isExcluded ? 'none' : 'auto' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log('Click area triggered for:', payload);
                          if (payload && payload.id && !excludedFlights.has(payload.id)) {
                            const newExcluded = new Set(excludedFlights);
                            newExcluded.add(payload.id);
                            setExcludedFlights(newExcluded);
                          }
                        }}
                      />
                    </g>
                  );
                } : { r: 5 }}
                activeDot={{
                  r: 7,
                  cursor: groupBy === 'flight' ? 'pointer' : 'default'
                }}
                name={metric.label}
              />
            </LineChart>
          ) : chartType === 'bar' ? (
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-600" />
              <XAxis 
                dataKey={groupBy === 'date' ? 'timestamp' : 'name'}
                angle={-45} 
                textAnchor="end"
                height={100}
                tick={{ fontSize: 10 }}
                domain={groupBy === 'date' ? ['dataMin', 'dataMax'] : undefined}
                type={groupBy === 'date' ? 'number' : 'category'}
                tickFormatter={groupBy === 'date' ? 
                  (value: any) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 
                  undefined
                }
              />
              <YAxis tick={{ fontSize: 10 }} className="dark:text-gray-400" />
              <Tooltip 
                content={<CustomTooltip />}
                cursor={{ fill: 'transparent' }}
              />
              <Bar 
                dataKey="value" 
                fill={metric.color} 
                name={metric.label}
                onClick={(data: any) => {
                  if (groupBy === 'flight' && data) {
                    const flight = flights.find(f => `${f.droneName} (${f.date})` === data.name);
                    if (flight) {
                      const newExcluded = new Set(excludedFlights);
                      if (excludedFlights.has(flight.id)) {
                        newExcluded.delete(flight.id);
                      } else {
                        newExcluded.add(flight.id);
                      }
                      setExcludedFlights(newExcluded);
                    }
                  }
                }}
              />
            </BarChart>
          ) : (
            <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-600" />
              <XAxis 
                dataKey={groupBy === 'date' ? 'timestamp' : 'name'}
                angle={-45} 
                textAnchor="end"
                height={100}
                tick={{ fontSize: 10 }}
                domain={groupBy === 'date' ? ['dataMin', 'dataMax'] : undefined}
                type={groupBy === 'date' ? 'number' : 'category'}
                tickFormatter={groupBy === 'date' ? 
                  (value: any) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 
                  undefined
                }
              />
              <YAxis tick={{ fontSize: 10 }} className="dark:text-gray-400" />
              <Tooltip 
                content={<CustomTooltip />}
                cursor={{ fill: 'transparent' }}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={metric.color}
                fill={metric.color}
                fillOpacity={0.3}
                name={metric.label}
                onClick={(data: any) => {
                  if (groupBy === 'flight' && data) {
                    const flight = flights.find(f => `${f.droneName} (${f.date})` === data.name);
                    if (flight) {
                      const newExcluded = new Set(excludedFlights);
                      if (excludedFlights.has(flight.id)) {
                        newExcluded.delete(flight.id);
                      } else {
                        newExcluded.add(flight.id);
                      }
                      setExcludedFlights(newExcluded);
                    }
                  }
                }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FlightsMetricsGraph;