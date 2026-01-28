import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Map, Navigation2, Home, Play, Pause, RotateCw, Gauge, TrendingUp, Wind, Battery, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface AdditionalRoute {
  routeType: string;
  coordinates: number[][];
  distance: number;
  directDistance: number;
  startFrame?: number;
  isManualOverride?: boolean;
  sequenceNumber?: number;
}

interface RouteData {
  outDistance?: number;
  outDistanceDirect?: number;
  outCoordinates?: number[][];
  homeDistance?: number;
  homeDistanceDirect?: number;
  homeCoordinates?: number[][];
  additionalRoutes?: AdditionalRoute[];
}

interface TelemetryPoint {
  timestamp: string;
  lat: number;
  lon: number;
  aglHeight: number;
  horizontalSpeed: number;
  verticalSpeed: number;
  terrainElevationAmsl?: number;
  altitudeAmsl?: number;
  batteryPercentage?: number;
  batteryVoltage?: number;
}

interface MissionTimestamps {
  takeOffTimestamp?: string;
  landedTimestamp?: string;
  [key: string]: any;
}

interface WeatherData {
  windPrognosis?: number;
  gustPrognosis?: number;
  winddirPrognosis?: number;
  windHangar?: number;
  gustHangar?: number;
  [key: string]: any;
}

interface RouteMapPanelProps {
  routeData?: RouteData;
  telemetryPoints?: TelemetryPoint[];
  missionTimestamps?: MissionTimestamps;
  weatherData?: WeatherData;
  aedReleaseAGL?: number;
  completionStatus?: string;
}

const RouteMapPanel: React.FC<RouteMapPanelProps> = ({ routeData, telemetryPoints, missionTimestamps, weatherData, aedReleaseAGL, completionStatus }) => {
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [routeColorMode, setRouteColorMode] = useState<'speed' | 'altitude' | 'battery'>('speed');
  
  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Parse timestamp to get seconds from start
  const parseTimestamp = (ts: string): number => {
    if (!ts) return 0;
    const [datePart, timePart] = ts.split('_');
    if (!datePart || !timePart) return 0;
    
    const year = parseInt(datePart.substring(0, 4));
    const month = parseInt(datePart.substring(4, 6)) - 1;
    const day = parseInt(datePart.substring(6, 8));
    
    const [time, ms] = timePart.split('.');
    const hours = parseInt(time.substring(0, 2));
    const minutes = parseInt(time.substring(2, 4));
    const seconds = parseInt(time.substring(4, 6));
    const milliseconds = parseInt(ms || '0');
    
    return new Date(year, month, day, hours, minutes, seconds, milliseconds).getTime();
  };

  // Calculate distance between two GPS points using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };

  // Calculate actual distance from GPS telemetry (only for completed flights)
  const { actualGpsDistance, routeOnlyDistance } = React.useMemo(() => {
    // Only calculate for completed flights (normal or complete status)
    const isCompleted = completionStatus === 'normal' || completionStatus === 'complete';
    
    if (!isCompleted || !telemetryPoints || telemetryPoints.length < 2) {
      return { actualGpsDistance: 0, routeOnlyDistance: 0 };
    }
    
    let totalDistance = 0;
    
    for (let i = 1; i < telemetryPoints.length; i++) {
      const prev = telemetryPoints[i - 1];
      const curr = telemetryPoints[i];
      
      if (prev.lat && prev.lon && curr.lat && curr.lon) {
        const dist = calculateDistance(
          prev.lat, prev.lon,
          curr.lat, curr.lon
        );
        
        totalDistance += dist;
      }
    }
    
    // For now, we'll just show total actual vs planned
    // A more sophisticated approach would identify mission phases using timestamps or proximity to waypoints
    return {
      actualGpsDistance: totalDistance / 1000, // Convert to kilometers
      routeOnlyDistance: totalDistance / 1000 // For now, same as total
    };
  }, [telemetryPoints, completionStatus]);


  // Calculate bounds and scaling for the route visualization
  const { bounds, scale, center } = useMemo(() => {
    const allCoords = [
      ...(routeData?.outCoordinates || []),
      ...(routeData?.homeCoordinates || []),
      ...(routeData?.additionalRoutes?.flatMap(route => route.coordinates) || []),
      ...(telemetryPoints?.map(p => [p.lat, p.lon]) || [])
    ];

    if (allCoords.length === 0) {
      return { bounds: null, scale: 1, center: { lat: 0, lng: 0 } };
    }

    const lats = allCoords.map(c => c[0]);
    const lngs = allCoords.map(c => c[1]);
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    
    const latRange = maxLat - minLat;
    const lngRange = maxLng - minLng;
    
    // Add padding
    const padding = 0.1;
    const paddedLatRange = latRange * (1 + padding * 2);
    const paddedLngRange = lngRange * (1 + padding * 2);
    
    return {
      bounds: {
        minLat: minLat - latRange * padding,
        maxLat: maxLat + latRange * padding,
        minLng: minLng - lngRange * padding,
        maxLng: maxLng + lngRange * padding,
        latRange: paddedLatRange,
        lngRange: paddedLngRange
      },
      scale: Math.max(paddedLatRange, paddedLngRange),
      center: {
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2
      }
    };
  }, [routeData, telemetryPoints]);

  // Convert coordinates to SVG points with aspect ratio correction
  const coordsToSvgPath = (coords: number[][], viewBox: number = 400, smooth: boolean = false): string => {
    if (!coords || coords.length === 0 || !bounds) return '';
    
    // Calculate aspect ratio correction based on latitude
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const aspectRatio = Math.cos(centerLat * Math.PI / 180);
    
    // Determine which dimension should fill the viewBox
    const correctedLngRange = bounds.lngRange * aspectRatio;
    const maxRange = Math.max(bounds.latRange, correctedLngRange);
    
    if (smooth && coords.length > 2) {
      const points = coords.map(coord => ({
        x: ((coord[1] - bounds.minLng) * aspectRatio / maxRange) * viewBox + (viewBox - (correctedLngRange / maxRange) * viewBox) / 2,
        y: viewBox - ((coord[0] - bounds.minLat) / maxRange) * viewBox - (viewBox - (bounds.latRange / maxRange) * viewBox) / 2
      }));
      
      let path = `M ${points[0].x} ${points[0].y}`;
      
      for (let i = 1; i < points.length - 1; i++) {
        const cp = points[i];
        const next = points[i + 1];
        const cpx = (cp.x + next.x) / 2;
        const cpy = (cp.y + next.y) / 2;
        path += ` Q ${cp.x} ${cp.y}, ${cpx} ${cpy}`;
      }
      
      const first = points[0];
      const last = points[points.length - 1];
      if (Math.abs(first.x - last.x) < 10 && Math.abs(first.y - last.y) < 10) {
        path += ` Q ${last.x} ${last.y}, ${first.x} ${first.y} Z`;
      } else {
        path += ` L ${last.x} ${last.y}`;
      }
      
      return path;
    }
    
    return coords.map((coord, index) => {
      const x = ((coord[1] - bounds.minLng) * aspectRatio / maxRange) * viewBox + (viewBox - (correctedLngRange / maxRange) * viewBox) / 2;
      const y = viewBox - ((coord[0] - bounds.minLat) / maxRange) * viewBox - (viewBox - (bounds.latRange / maxRange) * viewBox) / 2;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };
  
  // Reconstruct circular pattern from distorted coordinates
  const reconstructCircularPattern = (coords: number[][]): number[][] => {
    if (!coords || coords.length < 4) return coords;
    
    const centerLat = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
    const centerLng = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
    
    const distances = coords.map(c => 
      Math.sqrt(Math.pow(c[0] - centerLat, 2) + Math.pow(c[1] - centerLng, 2))
    );
    const avgRadius = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    
    const numPoints = Math.max(coords.length, 20);
    const circleCoords: number[][] = [];
    
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      circleCoords.push([
        centerLat + avgRadius * Math.cos(angle),
        centerLng + avgRadius * Math.sin(angle)
      ]);
    }
    
    return circleCoords;
  };

  // Convert single coordinate to SVG point with aspect ratio correction
  const coordToSvgPoint = (coord: number[], viewBox: number = 400): { x: number, y: number } => {
    if (!bounds) return { x: 0, y: 0 };
    
    // Calculate aspect ratio correction based on latitude
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const aspectRatio = Math.cos(centerLat * Math.PI / 180);
    
    // Determine which dimension should fill the viewBox
    const correctedLngRange = bounds.lngRange * aspectRatio;
    const maxRange = Math.max(bounds.latRange, correctedLngRange);
    
    return {
      x: ((coord[1] - bounds.minLng) * aspectRatio / maxRange) * viewBox + (viewBox - (correctedLngRange / maxRange) * viewBox) / 2,
      y: viewBox - ((coord[0] - bounds.minLat) / maxRange) * viewBox - (viewBox - (bounds.latRange / maxRange) * viewBox) / 2
    };
  };

  // Get color based on speed (m/s converted to km/h for thresholds) - Inverted: Green = slow, Red = fast
  const getSpeedColor = (speedMs: number): string => {
    const speedKmh = speedMs * 3.6;
    if (speedKmh < 20) return '#22c55e'; // Bright green for slow
    if (speedKmh < 40) return '#84cc16'; // Lime for medium-slow
    if (speedKmh < 60) return '#fbbf24'; // Yellow for medium
    if (speedKmh < 70) return '#fb923c'; // Orange for fast
    return '#dc2626'; // Red for extreme
  };

  // Get color based on altitude
  const getAltitudeColor = (altitude: number): string => {
    if (altitude < 30) return '#22c55e'; // green - low
    if (altitude < 60) return '#fbbf24'; // yellow - medium
    return '#dc2626'; // red - high
  };

  // Get color based on battery
  const getBatteryColor = (battery: number | undefined): string => {
    if (!battery) return '#6b7280'; // gray if no data
    if (battery > 60) return '#22c55e'; // green
    if (battery > 30) return '#fbbf24'; // yellow
    return '#dc2626'; // red
  };

  // Get color for route based on selected mode
  const getRouteColor = (point: TelemetryPoint): string => {
    switch (routeColorMode) {
      case 'altitude':
        return getAltitudeColor(point.aglHeight);
      case 'battery':
        return getBatteryColor(point.batteryPercentage);
      case 'speed':
      default:
        return getSpeedColor(point.horizontalSpeed);
    }
  };

  // Format distance
  const formatDistance = (meters?: number): string => {
    if (!meters) return 'N/A';
    if (meters < 1000) return `${meters.toFixed(0)}m`;
    return `${(meters / 1000).toFixed(2)}km`;
  };

  // Calculate route efficiency
  const calculateEfficiency = (actual?: number, direct?: number): string => {
    if (!actual || !direct || direct === 0) return 'N/A';
    const efficiency = (direct / actual) * 100;
    return `${efficiency.toFixed(1)}%`;
  };

  // Format time
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Animation control
  useEffect(() => {
    if (!isPlaying || !telemetryPoints || currentPointIndex >= telemetryPoints.length - 1) {
      if (telemetryPoints && currentPointIndex >= telemetryPoints.length - 1) {
        setIsPlaying(false);
      }
      return;
    }

    const interval = setInterval(() => {
      setCurrentPointIndex(prev => {
        if (prev >= telemetryPoints.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 100 / playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, currentPointIndex, telemetryPoints, playbackSpeed]);

  const handlePlayPause = () => {
    if (currentPointIndex >= (telemetryPoints?.length || 0) - 1) {
      setCurrentPointIndex(0);
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setCurrentPointIndex(0);
    setIsPlaying(false);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentPointIndex(parseInt(e.target.value));
    setIsPlaying(false);
  };

  const currentPoint = telemetryPoints?.[currentPointIndex];
  const startTime = telemetryPoints?.[0] ? parseTimestamp(telemetryPoints[0].timestamp) : 0;
  const currentTime = currentPoint ? parseTimestamp(currentPoint.timestamp) : 0;
  const totalTime = telemetryPoints?.length ? parseTimestamp(telemetryPoints[telemetryPoints.length - 1].timestamp) : 0;
  const elapsedSeconds = (currentTime - startTime) / 1000;
  const totalSeconds = (totalTime - startTime) / 1000;

  if (!routeData && !telemetryPoints) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Map className="w-4 h-4 text-gray-400" />
          <h3 className="font-medium text-sm text-gray-700">Flight Route</h3>
        </div>
        <p className="text-xs text-gray-500">No route data available</p>
      </div>
    );
  }

  const hasOutRoute = routeData?.outCoordinates && routeData.outCoordinates.length > 0;
  const hasHomeRoute = routeData?.homeCoordinates && routeData.homeCoordinates.length > 0;
  const hasTelemetry = telemetryPoints && telemetryPoints.length > 0;

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Map className="w-4 h-4 text-blue-600" />
          <h3 className="font-medium text-sm text-gray-700">Flight Route</h3>
        </div>
        <div className="text-gray-500 text-xs">
          Total: {formatDistance((routeData?.outDistance || 0) + (routeData?.homeDistance || 0))}
        </div>
      </div>

      <div className="bg-white rounded-lg p-3 space-y-3">
        {/* Route Map Visualization */}
        {(hasOutRoute || hasHomeRoute || hasTelemetry) && bounds ? (
          <div className="bg-gray-50 rounded-lg p-2 relative overflow-hidden">
            {/* Zoom Controls */}
            <div className="absolute top-2 right-2 z-10 bg-white rounded-lg shadow-md p-1 flex flex-col gap-1">
              <button
                onClick={() => setZoom(prev => Math.min(5, prev * 1.2))}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="text-xs text-center font-medium text-gray-600 py-1">
                {Math.round(zoom * 100)}%
              </div>
              <button
                onClick={() => setZoom(prev => Math.max(0.5, prev / 1.2))}
                className="p-2 hover:bg-gray-100 rounded transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <div className="border-t pt-1">
                <button
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                  className="p-2 hover:bg-gray-100 rounded transition-colors"
                  title="Reset View"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <svg 
              viewBox={`${pan.x} ${pan.y} ${400/zoom} ${400/zoom}`}
              className="w-full h-full cursor-move"
              style={{ maxHeight: '600px', minHeight: '400px' }}
              onMouseDown={(e) => {
                setIsDragging(true);
                setDragStart({ x: e.clientX + pan.x, y: e.clientY + pan.y });
              }}
              onMouseMove={(e) => {
                if (isDragging) {
                  setPan({
                    x: dragStart.x - e.clientX,
                    y: dragStart.y - e.clientY
                  });
                }
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
            >
              {/* Grid and Wind Animation Patterns */}
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
                </pattern>
              </defs>
              
              {/* Background grid */}
              <rect width="400" height="400" fill="url(#grid)" />
              
              {/* Main content */}
              <g>
                
              
              {/* Telemetry trace following ACTUAL GPS path with dynamic coloring - only for completed flights */}
              {hasTelemetry && (completionStatus === 'normal' || completionStatus === 'complete') && telemetryPoints.slice(0, currentPointIndex + 1).map((point, index) => {
                if (index === 0) return null;
                const prevPoint = telemetryPoints[index - 1];
                // Use actual GPS coordinates from telemetry
                const p1 = coordToSvgPoint([prevPoint.lat, prevPoint.lon]);
                const p2 = coordToSvgPoint([point.lat, point.lon]);
                const color = getRouteColor(point);
                
                return (
                  <g key={`trace-${index}`}>
                    {/* Shadow/glow effect for better visibility */}
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={color}
                      strokeWidth="6"
                      opacity="0.3"
                    />
                    {/* Main trace line */}
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={color}
                      strokeWidth="3.5"
                      opacity="0.9"
                      strokeLinecap="round"
                    />
                    {/* Bright core for emphasis */}
                    <line
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={color}
                      strokeWidth="1.5"
                      opacity="1"
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
              
              {/* Out route - Green */}
              {hasOutRoute && (
                <>
                  <path
                    d={coordsToSvgPath(routeData!.outCoordinates!)}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1"
                    opacity="0.3"
                  />
                </>
              )}
              
              {/* Home route - Blue */}
              {hasHomeRoute && (
                <>
                  <path
                    d={coordsToSvgPath(routeData!.homeCoordinates!)}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="1"
                    opacity="0.3"
                  />
                </>
              )}
              
              {/* Premature Return Route - Red */}
              {routeData?.additionalRoutes?.filter(route => route.routeType === 'PREMATURE_RETURN').map((route, routeIndex) => (
                <g key={`premature-${routeIndex}`}>
                  <path
                    d={coordsToSvgPath(route.coordinates)}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1"
                    opacity="0.3"
                  />
                </g>
              ))}
              
              {/* Mission Profile Routes - Orange, using actual coordinates */}
              {routeData?.additionalRoutes?.filter(route => route.routeType === 'MISSION_PROFILE').map((route, routeIndex) => {
                const color = '#f97316'; // Orange for mission profiles
                
                return (
                  <g key={`mission-${routeIndex}`}>
                    <path
                      d={coordsToSvgPath(route.coordinates)}
                      fill="none"
                      stroke={color}
                      strokeWidth="1"
                      opacity="0.3"
                    />
                  </g>
                );
              })}
              
              
              {/* Start/End markers */}
              {hasOutRoute && (
                <>
                  {/* Start point (Home base) */}
                  <g transform={`translate(${coordToSvgPoint(routeData!.outCoordinates![0]).x}, ${coordToSvgPoint(routeData!.outCoordinates![0]).y})`}>
                    <circle r="6" fill="#22c55e" stroke="white" strokeWidth="2"/>
                    <text y="0" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" dy="3">H</text>
                  </g>
                  
                  {/* End point (Alarm location) */}
                  {routeData!.outCoordinates!.length > 1 && (
                    <g transform={`translate(${coordToSvgPoint(routeData!.outCoordinates![routeData!.outCoordinates!.length - 1]).x}, ${coordToSvgPoint(routeData!.outCoordinates![routeData!.outCoordinates!.length - 1]).y})`}>
                      <circle r="6" fill="#ef4444" stroke="white" strokeWidth="2"/>
                      <text y="0" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" dy="3">A</text>
                    </g>
                  )}
                </>
              )}
              
              
              {/* Drone symbol */}
              {currentPoint && (
                <g transform={`translate(${coordToSvgPoint([currentPoint.lat, currentPoint.lon]).x}, ${coordToSvgPoint([currentPoint.lat, currentPoint.lon]).y})`}>
                  {/* Drone body */}
                  <g transform="rotate(0)">
                    {/* Main body */}
                    <circle r="8" fill="#1e40af" stroke="white" strokeWidth="2"/>
                    {/* Propellers */}
                    <line x1="-12" y1="-12" x2="12" y2="12" stroke="#1e40af" strokeWidth="3" strokeLinecap="round"/>
                    <line x1="-12" y1="12" x2="12" y2="-12" stroke="#1e40af" strokeWidth="3" strokeLinecap="round"/>
                    <circle cx="-12" cy="-12" r="4" fill="#60a5fa" stroke="white" strokeWidth="1"/>
                    <circle cx="12" cy="-12" r="4" fill="#60a5fa" stroke="white" strokeWidth="1"/>
                    <circle cx="-12" cy="12" r="4" fill="#60a5fa" stroke="white" strokeWidth="1"/>
                    <circle cx="12" cy="12" r="4" fill="#60a5fa" stroke="white" strokeWidth="1"/>
                  </g>
                </g>
              )}
              </g> {/* Close transform group for zoom/pan */}
            </svg>
            
            {/* Current Metrics Summary */}
            {currentPoint && currentPointIndex >= 0 && currentPointIndex < telemetryPoints.length && (
              <div className="grid grid-cols-6 gap-2 mt-3">
                <div className="bg-gradient-to-br from-blue-50 to-white rounded-lg p-2 border border-blue-200">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">AGL Height</div>
                  <div className="text-sm font-bold text-blue-700 mt-0.5">
                    {currentPoint.aglHeight.toFixed(1)}m
                    {currentPoint.altitudeAmsl && (
                      <span className="text-[9px] text-gray-500 ml-1">({currentPoint.altitudeAmsl.toFixed(0)}m AMSL)</span>
                    )}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-white rounded-lg p-2 border border-orange-200">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">H Speed</div>
                  <div className="text-sm font-bold text-orange-600 mt-0.5">
                    {(currentPoint.horizontalSpeed * 3.6).toFixed(0)} km/h
                  </div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-white rounded-lg p-2 border border-purple-200">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">V Speed</div>
                  <div className={`text-sm font-bold mt-0.5 ${currentPoint.verticalSpeed > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {currentPoint.verticalSpeed > 0 ? '+' : ''}{currentPoint.verticalSpeed.toFixed(2)} m/s
                  </div>
                </div>
                {currentPoint.batteryPercentage !== undefined && (
                  <div className="bg-gradient-to-br from-green-50 to-white rounded-lg p-2 border border-green-200">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Battery</div>
                    <div className={`text-sm font-bold mt-0.5 ${
                      currentPoint.batteryPercentage > 30 ? 'text-green-600' :
                      currentPoint.batteryPercentage > 15 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {currentPoint.batteryPercentage.toFixed(0)}%
                    </div>
                  </div>
                )}
                {currentPoint.batteryVoltage !== undefined && (
                  <div className="bg-gradient-to-br from-indigo-50 to-white rounded-lg p-2 border border-indigo-200">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Voltage</div>
                    <div className="text-sm font-bold text-indigo-600 mt-0.5">
                      {currentPoint.batteryVoltage?.toFixed(1)}V
                    </div>
                  </div>
                )}
                {weatherData && weatherData.windPrognosis && (
                  <div className="bg-gradient-to-br from-cyan-50 to-white rounded-lg p-2 border border-cyan-200">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Wind</div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-cyan-700">
                        {weatherData.windPrognosis.toFixed(1)} m/s
                      </div>
                      <svg width="20" height="20" viewBox="0 0 20 20" className="ml-1">
                        <g transform={`translate(10, 10) rotate(${(weatherData.winddirPrognosis || 0) + 180})`}>
                          <path 
                            d="M 0,-8 L -3,-2 L -1,-2 L -1,6 L 1,6 L 1,-2 L 3,-2 Z" 
                            fill={(() => {
                              const windRatio = Math.min((weatherData.windPrognosis || 0) / 9, 1);
                              const r = Math.round(34 + (220 - 34) * windRatio);
                              const g = Math.round(197 + (53 - 197) * windRatio);
                              const b = Math.round(94 + (38 - 94) * windRatio);
                              return `rgb(${r}, ${g}, ${b})`;
                            })()}
                            opacity="0.8"
                          />
                        </g>
                      </svg>
                    </div>
                    {weatherData.gustPrognosis && weatherData.gustPrognosis > weatherData.windPrognosis && (
                      <div className="text-[9px] text-orange-600 font-medium mt-0.5">
                        Gusts: {weatherData.gustPrognosis.toFixed(1)} m/s
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Flight controls and telemetry display */}
            {hasTelemetry && (
              <div className="mt-4 space-y-3">
                {/* Timeline slider */}
                <div className="bg-white rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700">Flight Timeline</span>
                    <span className="text-xs text-gray-500">
                      {formatTime(elapsedSeconds)} / {formatTime(totalSeconds)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={(telemetryPoints.length - 1).toString()}
                    value={currentPointIndex}
                    onChange={handleSliderChange}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentPointIndex / (telemetryPoints.length - 1)) * 100}%, #e5e7eb ${(currentPointIndex / (telemetryPoints.length - 1)) * 100}%, #e5e7eb 100%)`
                    }}
                  />
                </div>
                
                {/* Playback controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePlayPause}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium"
                  >
                    {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    {isPlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-xs font-medium"
                  >
                    <RotateCw className="w-3 h-3" />
                    Reset
                  </button>
                  <select
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
                  >
                    <option value="0.5">0.5x</option>
                    <option value="1">1x</option>
                    <option value="2">2x</option>
                    <option value="5">5x</option>
                    <option value="10">10x</option>
                  </select>
                </div>

                {/* Route color mode selector */}
                <div className="mb-3 p-2 bg-gray-50 rounded-lg">
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Route Coloring</label>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="routeColor"
                        value="speed"
                        checked={routeColorMode === 'speed'}
                        onChange={(e) => setRouteColorMode('speed')}
                        className="w-3 h-3"
                      />
                      <span className="text-xs">Speed</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="routeColor"
                        value="altitude"
                        checked={routeColorMode === 'altitude'}
                        onChange={(e) => setRouteColorMode('altitude')}
                        className="w-3 h-3"
                      />
                      <span className="text-xs">Altitude</span>
                    </label>
                    {telemetryPoints.some(p => p.batteryPercentage !== undefined) && (
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="routeColor"
                          value="battery"
                          checked={routeColorMode === 'battery'}
                          onChange={(e) => setRouteColorMode('battery')}
                          className="w-3 h-3"
                        />
                        <span className="text-xs">Battery</span>
                      </label>
                    )}
                  </div>
                </div>
                
                
                {/* Flight Metrics Dashboard */}
                {telemetryPoints.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 mt-3 p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                        <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                        Flight Metrics
                      </h4>
                      {currentPointIndex > 0 && currentPointIndex < telemetryPoints.length && (
                        <span className="text-xs text-gray-500">
                          {((currentPointIndex / (telemetryPoints.length - 1)) * 100).toFixed(0)}% Complete
                        </span>
                      )}
                    </div>
                    
                    {/* Altitude & Terrain Timeline */}
                    <div className="space-y-3">
                      <div className="bg-gradient-to-r from-blue-50 to-sky-50 rounded-lg p-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                            Altitude (AMSL)
                          </span>
                          <div className="flex gap-3 text-xs">
                            {telemetryPoints.some(p => p.altitudeAmsl) && (
                              <span className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                <span className="text-gray-600">Altitude</span>
                              </span>
                            )}
                            {telemetryPoints.some(p => p.terrainElevationAmsl) && (
                              <span className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-amber-600 rounded-full"></div>
                                <span className="text-gray-600">Terrain</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="relative h-20 bg-white rounded-md overflow-hidden border border-gray-200">
                        <svg className="w-full h-full">
                          {/* Grid lines */}
                          {[0, 25, 50, 75, 100].map(pct => (
                            <line
                              key={`agl-grid-${pct}`}
                              x1="0"
                              x2="100%"
                              y1={`${100 - pct}%`}
                              y2={`${100 - pct}%`}
                              stroke="#e5e7eb"
                              strokeWidth="0.5"
                              opacity="0.5"
                            />
                          ))}
                          
                          {/* Calculate max values for scaling */}
                          {(() => {
                            const hasAltitudeData = telemetryPoints.some(p => p.altitudeAmsl);
                            const hasTerrainData = telemetryPoints.some(p => p.terrainElevationAmsl);
                            
                            // Get all altitude and terrain values
                            const altitudeValues = telemetryPoints.map(p => p.altitudeAmsl || 0);
                            const terrainValues = telemetryPoints.map(p => p.terrainElevationAmsl || 0);
                            
                            // Find min and max for proper scaling
                            const allValues = [...altitudeValues, ...terrainValues].filter(v => v > 0);
                            const minValue = allValues.length > 0 ? Math.min(...allValues) - 10 : 0;
                            const maxValue = allValues.length > 0 ? Math.max(...allValues) + 10 : 100;
                            const range = maxValue - minValue;
                            
                            return (
                              <>
                                {/* Terrain AMSL Path - as a line */}
                                {hasTerrainData && telemetryPoints.map((point, index) => {
                                  if (index === 0) return null;
                                  const prevPoint = telemetryPoints[index - 1];
                                  const x1 = ((index - 1) / (telemetryPoints.length - 1)) * 100;
                                  const x2 = (index / (telemetryPoints.length - 1)) * 100;
                                  
                                  const y1 = 100 - ((prevPoint.terrainElevationAmsl || minValue) - minValue) / range * 90;
                                  const y2 = 100 - ((point.terrainElevationAmsl || minValue) - minValue) / range * 90;
                                  
                                  return (
                                    <line
                                      key={`terrain-${index}`}
                                      x1={`${x1}%`}
                                      x2={`${x2}%`}
                                      y1={`${y1}%`}
                                      y2={`${y2}%`}
                                      stroke="#d97706"
                                      strokeWidth="1.5"
                                      opacity="0.7"
                                    />
                                  );
                                })}
                                
                                {/* Altitude AMSL Path */}
                                {hasAltitudeData && telemetryPoints.map((point, index) => {
                                  if (index === 0) return null;
                                  const prevPoint = telemetryPoints[index - 1];
                                  const x1 = ((index - 1) / (telemetryPoints.length - 1)) * 100;
                                  const x2 = (index / (telemetryPoints.length - 1)) * 100;
                                  
                                  const y1 = 100 - ((prevPoint.altitudeAmsl || minValue) - minValue) / range * 90;
                                  const y2 = 100 - ((point.altitudeAmsl || minValue) - minValue) / range * 90;
                                  
                                  return (
                                    <line
                                      key={`altitude-${index}`}
                                      x1={`${x1}%`}
                                      x2={`${x2}%`}
                                      y1={`${y1}%`}
                                      y2={`${y2}%`}
                                      stroke="#3b82f6"
                                      strokeWidth="2"
                                    />
                                  );
                                })}
                                
                                {/* Current position indicator */}
                                {currentPointIndex > 0 && currentPointIndex < telemetryPoints.length && (
                                  <>
                                    {/* Vertical line at current position */}
                                    <line
                                      x1={`${(currentPointIndex / (telemetryPoints.length - 1)) * 100}%`}
                                      x2={`${(currentPointIndex / (telemetryPoints.length - 1)) * 100}%`}
                                      y1="0"
                                      y2="100%"
                                      stroke="#6b7280"
                                      strokeWidth="1"
                                      strokeDasharray="2,2"
                                      opacity="0.5"
                                    />
                                    {/* Altitude indicator */}
                                    {hasAltitudeData && (
                                      <circle
                                        cx={`${(currentPointIndex / (telemetryPoints.length - 1)) * 100}%`}
                                        cy={`${100 - ((telemetryPoints[currentPointIndex].altitudeAmsl || minValue) - minValue) / range * 90}%`}
                                        r="4"
                                        fill="#3b82f6"
                                        stroke="white"
                                        strokeWidth="2"
                                      />
                                    )}
                                    {/* Terrain indicator */}
                                    {hasTerrainData && (
                                      <circle
                                        cx={`${(currentPointIndex / (telemetryPoints.length - 1)) * 100}%`}
                                        cy={`${100 - ((telemetryPoints[currentPointIndex].terrainElevationAmsl || minValue) - minValue) / range * 90}%`}
                                        r="3"
                                        fill="#d97706"
                                        stroke="white"
                                        strokeWidth="1.5"
                                      />
                                    )}
                                  </>
                                )}
                                
                                {/* Height labels */}
                                <text x="2" y="10" className="text-[9px] fill-gray-500">
                                  {maxValue.toFixed(0)}m
                                </text>
                                <text x="2" y="95" className="text-[9px] fill-gray-500">
                                  {minValue.toFixed(0)}m
                                </text>
                                {/* Current AGL display */}
                                {currentPointIndex > 0 && currentPointIndex < telemetryPoints.length && (
                                  <text 
                                    x="98%" 
                                    y="10" 
                                    className="text-[10px] fill-blue-600 font-semibold"
                                    textAnchor="end"
                                  >
                                    AGL: {telemetryPoints[currentPointIndex].aglHeight.toFixed(0)}m
                                  </text>
                                )}
                              </>
                            );
                          })()}
                        </svg>
                      </div>
                    </div>
                    
                    {/* Speed Timeline */}
                    <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                          <Gauge className="w-3.5 h-3.5 text-orange-600" />
                          Speed (km/h)
                        </span>
                        <span className="text-xs text-gray-600">
                          Max: {(Math.max(...telemetryPoints.map(p => p.horizontalSpeed)) * 3.6).toFixed(1)} km/h
                        </span>
                      </div>
                      <div className="relative h-20 bg-white rounded-md overflow-hidden border border-gray-200">
                        <svg className="w-full h-full">
                          {/* Grid lines */}
                          {[0, 25, 50, 75, 100].map(pct => (
                            <line
                              key={`speed-grid-${pct}`}
                              x1="0"
                              x2="100%"
                              y1={`${100 - pct}%`}
                              y2={`${100 - pct}%`}
                              stroke="#e5e7eb"
                              strokeWidth="0.5"
                              opacity="0.5"
                            />
                          ))}
                          
                          {/* Speed Path with color gradient */}
                          {telemetryPoints.map((point, index) => {
                            if (index === 0) return null;
                            const prevPoint = telemetryPoints[index - 1];
                            const x1 = ((index - 1) / (telemetryPoints.length - 1)) * 100;
                            const x2 = (index / (telemetryPoints.length - 1)) * 100;
                            const maxSpeed = Math.max(...telemetryPoints.map(p => p.horizontalSpeed));
                            const y1 = 100 - (prevPoint.horizontalSpeed / maxSpeed) * 90;
                            const y2 = 100 - (point.horizontalSpeed / maxSpeed) * 90;
                            
                            return (
                              <line
                                key={`speed-${index}`}
                                x1={`${x1}%`}
                                x2={`${x2}%`}
                                y1={`${y1}%`}
                                y2={`${y2}%`}
                                stroke={getSpeedColor(point.horizontalSpeed)}
                                strokeWidth="2"
                              />
                            );
                          })}
                          
                          {/* Current position indicator */}
                          {currentPointIndex > 0 && (
                            <circle
                              cx={`${(currentPointIndex / (telemetryPoints.length - 1)) * 100}%`}
                              cy={`${100 - (telemetryPoints[currentPointIndex].horizontalSpeed / Math.max(...telemetryPoints.map(p => p.horizontalSpeed))) * 90}%`}
                              r="4"
                              fill={getSpeedColor(telemetryPoints[currentPointIndex].horizontalSpeed)}
                              stroke="white"
                              strokeWidth="2"
                            />
                          )}
                        </svg>
                      </div>
                    </div>

                    {/* Battery and Voltage Timeline */}
                    {telemetryPoints.some(p => p.batteryPercentage !== undefined || p.batteryVoltage !== undefined) && (
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                            <Battery className="w-3.5 h-3.5 text-green-600" />
                            Battery & Voltage
                          </span>
                          <div className="flex gap-3 text-xs">
                            {telemetryPoints.some(p => p.batteryPercentage) && (
                              <span className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span className="text-gray-600">Battery %</span>
                              </span>
                            )}
                            {telemetryPoints.some(p => p.batteryVoltage) && (
                              <span className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                                <span className="text-gray-600">Voltage</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="relative h-20 bg-white rounded-md overflow-hidden border border-gray-200">
                          <svg className="w-full h-full">
                            {/* Grid lines */}
                            {[0, 25, 50, 75, 100].map(pct => (
                              <line
                                key={`battery-grid-${pct}`}
                                x1="0"
                                x2="100%"
                                y1={`${100 - pct}%`}
                                y2={`${100 - pct}%`}
                                stroke="#e5e7eb"
                                strokeWidth="1"
                              />
                            ))}
                            
                            {(() => {
                              const hasBatteryData = telemetryPoints.some(p => p.batteryPercentage);
                              const hasVoltageData = telemetryPoints.some(p => p.batteryVoltage);
                              
                              // Get voltage range for scaling
                              const voltageValues = telemetryPoints.map(p => p.batteryVoltage || 0).filter(v => v > 0);
                              const minVoltage = voltageValues.length > 0 ? Math.min(...voltageValues) - 1 : 0;
                              const maxVoltage = voltageValues.length > 0 ? Math.max(...voltageValues) + 1 : 30;
                              const voltageRange = maxVoltage - minVoltage;
                              
                              return (
                                <>
                                  {/* Battery percentage path */}
                                  {hasBatteryData && telemetryPoints.map((point, index) => {
                                    if (index === 0) return null;
                                    const prevPoint = telemetryPoints[index - 1];
                                    const x1 = ((index - 1) / (telemetryPoints.length - 1)) * 100;
                                    const x2 = (index / (telemetryPoints.length - 1)) * 100;
                                    
                                    const y1 = 100 - (prevPoint.batteryPercentage || 0) * 0.9;
                                    const y2 = 100 - (point.batteryPercentage || 0) * 0.9;
                                    
                                    const color = point.batteryPercentage && point.batteryPercentage > 30 ? '#22c55e' : 
                                                 point.batteryPercentage && point.batteryPercentage > 15 ? '#fbbf24' : '#dc2626';
                                    
                                    return (
                                      <line
                                        key={`battery-${index}`}
                                        x1={`${x1}%`}
                                        x2={`${x2}%`}
                                        y1={`${y1}%`}
                                        y2={`${y2}%`}
                                        stroke={color}
                                        strokeWidth="2"
                                      />
                                    );
                                  })}
                                  
                                  {/* Voltage path */}
                                  {hasVoltageData && telemetryPoints.map((point, index) => {
                                    if (index === 0) return null;
                                    const prevPoint = telemetryPoints[index - 1];
                                    const x1 = ((index - 1) / (telemetryPoints.length - 1)) * 100;
                                    const x2 = (index / (telemetryPoints.length - 1)) * 100;
                                    
                                    const y1 = 100 - ((prevPoint.batteryVoltage || minVoltage) - minVoltage) / voltageRange * 90;
                                    const y2 = 100 - ((point.batteryVoltage || minVoltage) - minVoltage) / voltageRange * 90;
                                    
                                    return (
                                      <line
                                        key={`voltage-${index}`}
                                        x1={`${x1}%`}
                                        x2={`${x2}%`}
                                        y1={`${y1}%`}
                                        y2={`${y2}%`}
                                        stroke="#9333ea"
                                        strokeWidth="1.5"
                                        opacity="0.8"
                                      />
                                    );
                                  })}
                                  
                                  {/* Current position indicator */}
                                  {currentPointIndex > 0 && currentPointIndex < telemetryPoints.length && (
                                    <>
                                      {/* Vertical line */}
                                      <line
                                        x1={`${(currentPointIndex / (telemetryPoints.length - 1)) * 100}%`}
                                        x2={`${(currentPointIndex / (telemetryPoints.length - 1)) * 100}%`}
                                        y1="0"
                                        y2="100%"
                                        stroke="#6b7280"
                                        strokeWidth="1"
                                        strokeDasharray="2,2"
                                        opacity="0.5"
                                      />
                                      {/* Battery indicator */}
                                      {hasBatteryData && telemetryPoints[currentPointIndex]?.batteryPercentage && (
                                        <circle
                                          cx={`${(currentPointIndex / (telemetryPoints.length - 1)) * 100}%`}
                                          cy={`${100 - (telemetryPoints[currentPointIndex]?.batteryPercentage || 0) * 0.9}%`}
                                          r="3"
                                          fill="#22c55e"
                                          stroke="white"
                                          strokeWidth="1.5"
                                        />
                                      )}
                                      {/* Voltage indicator */}
                                      {hasVoltageData && telemetryPoints[currentPointIndex]?.batteryVoltage && (
                                        <circle
                                          cx={`${(currentPointIndex / (telemetryPoints.length - 1)) * 100}%`}
                                          cy={`${100 - ((telemetryPoints[currentPointIndex]?.batteryVoltage || minVoltage) - minVoltage) / voltageRange * 90}%`}
                                          r="3"
                                          fill="#9333ea"
                                          stroke="white"
                                          strokeWidth="1.5"
                                        />
                                      )}
                                    </>
                                  )}
                                  
                                  {/* Labels */}
                                  <text x="2" y="10" className="text-[9px] fill-gray-500">
                                    100%
                                  </text>
                                  <text x="2" y="95" className="text-[9px] fill-gray-500">
                                    0%
                                  </text>
                                  {hasVoltageData && (
                                    <>
                                      <text x="98%" y="10" className="text-[9px] fill-purple-500" textAnchor="end">
                                        {maxVoltage.toFixed(0)}V
                                      </text>
                                      <text x="98%" y="95" className="text-[9px] fill-purple-500" textAnchor="end">
                                        {minVoltage.toFixed(0)}V
                                      </text>
                                    </>
                                  )}
                                  {/* Current values display */}
                                  {currentPointIndex > 0 && currentPointIndex < telemetryPoints.length && (
                                    <>
                                      {telemetryPoints[currentPointIndex]?.batteryPercentage && (
                                        <text 
                                          x="50%" 
                                          y="10" 
                                          className="text-[10px] fill-green-600 font-semibold"
                                          textAnchor="middle"
                                        >
                                          {telemetryPoints[currentPointIndex]?.batteryPercentage?.toFixed(0)}%
                                        </text>
                                      )}
                                      {telemetryPoints[currentPointIndex]?.batteryVoltage && (
                                        <text 
                                          x="50%" 
                                          y="95" 
                                          className="text-[10px] fill-purple-600 font-semibold"
                                          textAnchor="middle"
                                        >
                                          {telemetryPoints[currentPointIndex]?.batteryVoltage?.toFixed(1)}V
                                        </text>
                                      )}
                                    </>
                                  )}
                                </>
                              );
                            })()}
                          </svg>
                        </div>
                      </div>
                    )}

                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500 text-sm">
            No route coordinates available
          </div>
        )}

        {/* Actual GPS Flight Path Stats */}
        {actualGpsDistance > 0 && (
          <div className="bg-purple-50 rounded-lg p-3 mb-3 border border-purple-200">
            <div className="flex items-center gap-2 mb-2">
              <Navigation2 className="w-4 h-4 text-purple-600" />
              <h4 className="text-sm font-semibold text-purple-900">Actual GPS Flight Path</h4>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-xs text-gray-600">Actual Distance</span>
                <p className="text-lg font-bold text-purple-900">{actualGpsDistance.toFixed(2)} km</p>
              </div>
              <div>
                <span className="text-xs text-gray-600">Planned Distance</span>
                <p className="text-lg font-bold text-gray-700">
                  {formatDistance((routeData?.outDistance || 0) + (routeData?.homeDistance || 0))}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-600">Deviation</span>
                <p className={`text-lg font-bold ${
                  Math.abs((actualGpsDistance / (((routeData?.outDistance || 0) + (routeData?.homeDistance || 0)) / 1000) - 1) * 100) > 10
                    ? 'text-orange-600' 
                    : 'text-green-600'
                }`}>
                  {actualGpsDistance > (((routeData?.outDistance || 0) + (routeData?.homeDistance || 0)) / 1000) ? '+' : ''}
                  {((actualGpsDistance / (((routeData?.outDistance || 0) + (routeData?.homeDistance || 0)) / 1000) - 1) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-purple-100 text-xs text-gray-600">
              <p>Note: Actual distance includes all flight movements (outbound, on-site operations, and return).</p>
              <p>Deviation shows how the total actual distance compares to the planned route distance.</p>
            </div>
          </div>
        )}
        
        {/* Route Statistics */}
        <div className="grid grid-cols-2 gap-3">
          {/* Outbound Route */}
          <div className="border rounded-lg p-2">
            <div className="flex items-center gap-2 mb-2">
              <Navigation2 className="w-3 h-3 text-green-600" />
              <h4 className="text-xs font-semibold text-gray-700">Outbound</h4>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Distance</span>
                <span className="text-xs font-medium text-gray-900">
                  {formatDistance(routeData?.outDistance)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Direct</span>
                <span className="text-xs font-medium text-gray-900">
                  {formatDistance(routeData?.outDistanceDirect)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Efficiency</span>
                <span className="text-xs font-medium text-gray-900">
                  {calculateEfficiency(routeData?.outDistance, routeData?.outDistanceDirect)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Waypoints</span>
                <span className="text-xs font-medium text-gray-900">
                  {routeData?.outCoordinates?.length || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Return Route */}
          <div className="border rounded-lg p-2">
            <div className="flex items-center gap-2 mb-2">
              <Home className="w-3 h-3 text-blue-600" />
              <h4 className="text-xs font-semibold text-gray-700">Return</h4>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Distance</span>
                <span className="text-xs font-medium text-gray-900">
                  {formatDistance(routeData?.homeDistance)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Direct</span>
                <span className="text-xs font-medium text-gray-900">
                  {formatDistance(routeData?.homeDistanceDirect)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Efficiency</span>
                <span className="text-xs font-medium text-gray-900">
                  {calculateEfficiency(routeData?.homeDistance, routeData?.homeDistanceDirect)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Waypoints</span>
                <span className="text-xs font-medium text-gray-900">
                  {routeData?.homeCoordinates?.length || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Routes Info */}
        {routeData?.additionalRoutes && routeData.additionalRoutes.length > 0 && (
          <div className="border-t pt-3">
            <div className="space-y-2">
              {routeData.additionalRoutes.filter(r => r.routeType === 'PREMATURE_RETURN').length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <span className="text-xs font-semibold text-gray-700">
                    Premature Return - {formatDistance(routeData.additionalRoutes.find(r => r.routeType === 'PREMATURE_RETURN')?.distance)}
                  </span>
                </div>
              )}
              {routeData.additionalRoutes.filter(r => r.routeType === 'MISSION_PROFILE').length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                  <span className="text-xs font-semibold text-gray-700">
                    {routeData.additionalRoutes.filter(r => r.routeType === 'MISSION_PROFILE').length} Mission Profile{routeData.additionalRoutes.filter(r => r.routeType === 'MISSION_PROFILE').length !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Coordinates Summary */}
        {(hasOutRoute || hasHomeRoute) && (
          <div className="border-t pt-2">
            <div className="text-xs text-gray-500">
              <div className="flex items-center justify-between">
                <span>Route Coverage</span>
                <span className="font-medium text-gray-700">
                  {center.lat.toFixed(4)}°N, {center.lng.toFixed(4)}°E
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RouteMapPanel;