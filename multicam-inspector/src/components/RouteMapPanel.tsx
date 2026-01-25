import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Map, Navigation2, Home, Play, Pause, RotateCw, Gauge, TrendingUp, Wind } from 'lucide-react';

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
}

const RouteMapPanel: React.FC<RouteMapPanelProps> = ({ routeData, telemetryPoints, missionTimestamps, weatherData, aedReleaseAGL }) => {
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
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
          <div className="bg-gray-50 rounded-lg p-2">
            <svg 
              viewBox="0 0 400 400" 
              className="w-full h-64 md:h-80"
              style={{ maxHeight: '400px' }}
            >
              {/* Grid and Wind Animation Patterns */}
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
                </pattern>
                
                {/* Wind particle with tail gradient */}
                {weatherData && weatherData.windPrognosis && (
                  <>
                    <linearGradient id="windGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#64748b" stopOpacity="0"/>
                      <stop offset="50%" stopColor="#64748b" stopOpacity="0.2"/>
                      <stop offset="90%" stopColor="#64748b" stopOpacity="0.4"/>
                      <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.6"/>
                    </linearGradient>
                    
                    <filter id="windBlur">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="0.5"/>
                    </filter>
                  </>
                )}
              </defs>
              <rect width="400" height="400" fill="url(#grid)" />
              
              {/* Animated Wind Visualization with Flowing Particles */}
              {weatherData && weatherData.windPrognosis && (
                <g className="wind-animation" opacity="0.7">
                  {/* Generate wind particles with tails - Fill entire screen */}
                  {Array.from({ length: Math.max(80, Math.floor((weatherData.windPrognosis || 0) * 10)) }, (_, i) => {
                    const windAngle = (weatherData.winddirPrognosis || 0) - 90; // Convert from meteorological to math angle
                    const speed = weatherData.windPrognosis || 0;
                    // Same animation duration for all particles
                    const animationDuration = Math.max(3, 8 - speed * 0.4);
                    
                    // Random Y position but fixed for each particle
                    const yPos = Math.random() * 400;
                    
                    // Stagger start positions to create continuous flow from off-screen
                    const particleOffset = (i / Math.max(80, Math.floor((weatherData.windPrognosis || 0) * 10))) * 800;
                    const startX = -100 - particleOffset; // All start off-screen to the left
                    const tailLength = 20 + speed * 2; // Consistent tail length based on speed
                    
                    return (
                      <g key={`wind-${i}`} transform={`rotate(${windAngle}, 200, 200)`}>
                        {/* Wind particle with tail */}
                        <g>
                          {/* Tail - horizontal line */}
                          <rect
                            x={startX}
                            y={yPos}
                            width={tailLength}
                            height="0.8"
                            fill="#94a3b8"
                            opacity="0.4"
                          >
                            <animateTransform
                              attributeName="transform"
                              type="translate"
                              from="0 0"
                              to="900 0"
                              dur={`${animationDuration}s`}
                              repeatCount="indefinite"
                            />
                          </rect>
                          
                          {/* No head particle - just the line */}
                        </g>
                      </g>
                    );
                  })}
                  
                  {/* Additional turbulent particles for gusty conditions */}
                  {weatherData.gustPrognosis && weatherData.gustPrognosis > 5 && 
                    Array.from({ length: Math.max(20, Math.ceil(weatherData.gustPrognosis * 3)) }, (_, i) => {
                      const windAngle = (weatherData.winddirPrognosis || 0) - 90 + (Math.random() - 0.5) * 15; // Slight turbulence
                      const animationDuration = Math.max(2.5, 7 - (weatherData.gustPrognosis || 0) * 0.3);
                      const yPos = Math.random() * 400; // Random Y position
                      const gustOffset = (i / Math.max(20, Math.ceil((weatherData.gustPrognosis || 0) * 3))) * 600;
                      const startX = -150 - gustOffset; // Staggered off-screen starts
                      const tailLength = 25 + (weatherData.gustPrognosis || 0) * 2;
                      
                      return (
                        <g key={`gust-${i}`} transform={`rotate(${windAngle}, 200, 200)`}>
                          {/* Gusty line - slightly thicker */}
                          <rect
                            x={startX}
                            y={yPos}
                            width={tailLength}
                            height="1"
                            fill="#a8b2c3"
                            opacity="0.5"
                          >
                            <animateTransform
                              attributeName="transform"
                              type="translate"
                              from="0 0"
                              to="900 0"
                              dur={`${animationDuration}s`}
                              repeatCount="indefinite"
                            />
                          </rect>
                        </g>
                      );
                    })
                  }
                </g>
              )}
              
              {/* Telemetry trace with speed coloring - Enhanced visibility */}
              {hasTelemetry && telemetryPoints.slice(0, currentPointIndex + 1).map((point, index) => {
                if (index === 0) return null;
                const prevPoint = telemetryPoints[index - 1];
                const p1 = coordToSvgPoint([prevPoint.lat, prevPoint.lon]);
                const p2 = coordToSvgPoint([point.lat, point.lon]);
                const speed = point.horizontalSpeed;
                const color = getSpeedColor(speed);
                
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
              
              {/* Legend - Updated with inverted colors */}
              <g transform="translate(10, 380)">
                <rect x="0" y="-15" width="380" height="30" fill="white" opacity="0.95"/>
                <text x="5" y="-2" fontSize="10" fontWeight="600" fill="#374151">Speed:</text>
                <rect x="42" y="-8" width="15" height="8" fill="#22c55e"/>
                <text x="60" y="0" fontSize="9" fontWeight="500" fill="#374151">&lt;20km/h</text>
                <rect x="102" y="-8" width="15" height="8" fill="#84cc16"/>
                <text x="120" y="0" fontSize="9" fontWeight="500" fill="#374151">20-40km/h</text>
                <rect x="172" y="-8" width="15" height="8" fill="#fbbf24"/>
                <text x="190" y="0" fontSize="9" fontWeight="500" fill="#374151">40-60km/h</text>
                <rect x="242" y="-8" width="15" height="8" fill="#fb923c"/>
                <text x="260" y="0" fontSize="9" fontWeight="500" fill="#374151">60-70km/h</text>
                <rect x="312" y="-8" width="15" height="8" fill="#dc2626"/>
                <text x="330" y="0" fontSize="9" fontWeight="500" fill="#374151">&gt;70km/h</text>
              </g>
            </svg>
            
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
                
                {/* Current telemetry data */}
                {currentPoint && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gradient-to-br from-blue-50 to-white rounded-lg p-2 border border-blue-200">
                      <div className="flex items-center gap-1 mb-1">
                        <TrendingUp className="w-3 h-3 text-blue-600" />
                        <span className="text-xs font-medium text-gray-700">AGL Height</span>
                      </div>
                      <p className="text-lg font-bold text-blue-700">{currentPoint.aglHeight.toFixed(1)}m</p>
                      {currentPoint.altitudeAmsl && (
                        <p className="text-xs text-gray-500 mt-0.5">AMSL: {currentPoint.altitudeAmsl.toFixed(0)}m</p>
                      )}
                    </div>
                    
                    <div className={`bg-gradient-to-br from-${getSpeedColor(currentPoint.horizontalSpeed).substring(1, 4)}-50 to-white rounded-lg p-2 border border-${getSpeedColor(currentPoint.horizontalSpeed).substring(1, 4)}-200`}>
                      <div className="flex items-center gap-1 mb-1">
                        <Gauge className="w-3 h-3" style={{ color: getSpeedColor(currentPoint.horizontalSpeed) }} />
                        <span className="text-xs font-medium text-gray-700">H Speed</span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: getSpeedColor(currentPoint.horizontalSpeed) }}>
                        {(currentPoint.horizontalSpeed * 3.6).toFixed(1)} km/h
                      </p>
                    </div>
                    
                    <div className="bg-gradient-to-br from-purple-50 to-white rounded-lg p-2 border border-purple-200">
                      <div className="flex items-center gap-1 mb-1">
                        <TrendingUp className={`w-3 h-3 ${currentPoint.verticalSpeed > 0 ? 'text-green-600' : 'text-red-600'}`} 
                          style={{ transform: currentPoint.verticalSpeed < 0 ? 'rotate(180deg)' : 'none' }} />
                        <span className="text-xs font-medium text-gray-700">V Speed</span>
                      </div>
                      <p className={`text-lg font-bold ${currentPoint.verticalSpeed > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {currentPoint.verticalSpeed > 0 ? '+' : ''}{currentPoint.verticalSpeed.toFixed(2)} m/s
                      </p>
                    </div>
                  </div>
                )}
                
                {/* AGL and Speed Timeline Chart */}
                {telemetryPoints.length > 0 && (
                  <div className="bg-white rounded-lg p-3 border border-gray-200 mt-3">
                    <h4 className="text-xs font-semibold text-gray-700 mb-3">Flight Metrics Timeline</h4>
                    
                    {/* Altitude and Terrain Timeline */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-blue-600" />
                          Altitude & Terrain (AMSL)
                        </span>
                        <div className="flex gap-3 text-xs">
                          {telemetryPoints.some(p => p.altitudeAmsl) && (
                            <span className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-blue-500 rounded-sm"></div>
                              <span className="text-gray-500">Altitude</span>
                            </span>
                          )}
                          {telemetryPoints.some(p => p.terrainElevationAmsl) && (
                            <span className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-amber-600 rounded-sm"></div>
                              <span className="text-gray-500">Terrain</span>
                            </span>
                          )}
                          {aedReleaseAGL && telemetryPoints.some(p => p.terrainElevationAmsl) && (
                            <span className="flex items-center gap-1">
                              <div className="w-2 h-0.5 bg-purple-500"></div>
                              <span className="text-gray-500">AED Release</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="relative h-24 bg-gray-50 rounded overflow-hidden">
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
                              strokeWidth="1"
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
                                {/* Terrain elevation profile - filled area */}
                                {hasTerrainData && (
                                  <g>
                                    <defs>
                                      <linearGradient id="terrainGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" stopColor="#d97706" stopOpacity="0.3"/>
                                        <stop offset="100%" stopColor="#d97706" stopOpacity="0.05"/>
                                      </linearGradient>
                                    </defs>
                                    <path
                                      d={telemetryPoints.reduce((path, point, index) => {
                                        const x = (index / (telemetryPoints.length - 1)) * 100;
                                        const terrainHeight = point.terrainElevationAmsl || minValue;
                                        const y = 100 - ((terrainHeight - minValue) / range) * 90;
                                        
                                        if (index === 0) {
                                          return `M ${x} 100 L ${x} ${y}`;
                                        }
                                        return `${path} L ${x} ${y}`;
                                      }, '') + ' L 100 100 Z'}
                                      fill="url(#terrainGradient)"
                                      opacity="0.5"
                                    />
                                    
                                    {/* Terrain elevation line */}
                                    {telemetryPoints.map((point, index) => {
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
                                        />
                                      );
                                    })}
                                  </g>
                                )}
                                
                                {/* AED Release Height Line - positioned relative to terrain */}
                                {aedReleaseAGL && hasTerrainData && (
                                  <>
                                    {telemetryPoints.map((point, index) => {
                                      if (index === 0) return null;
                                      const prevPoint = telemetryPoints[index - 1];
                                      const x1 = ((index - 1) / (telemetryPoints.length - 1)) * 100;
                                      const x2 = (index / (telemetryPoints.length - 1)) * 100;
                                      const aedHeight1 = (prevPoint.terrainElevationAmsl || minValue) + aedReleaseAGL;
                                      const aedHeight2 = (point.terrainElevationAmsl || minValue) + aedReleaseAGL;
                                      const y1 = 100 - ((aedHeight1 - minValue) / range) * 90;
                                      const y2 = 100 - ((aedHeight2 - minValue) / range) * 90;
                                      
                                      return (
                                        <line
                                          key={`aed-${index}`}
                                          x1={`${x1}%`}
                                          x2={`${x2}%`}
                                          y1={`${y1}%`}
                                          y2={`${y2}%`}
                                          stroke="#9333ea"
                                          strokeWidth="1.5"
                                          strokeDasharray="4,4"
                                          opacity="0.7"
                                        />
                                      );
                                    })}
                                  </>
                                )}
                                
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
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-600 flex items-center gap-1">
                          <Gauge className="w-3 h-3 text-orange-600" />
                          Speed (km/h)
                        </span>
                        <span className="text-xs text-gray-500">
                          Max: {(Math.max(...telemetryPoints.map(p => p.horizontalSpeed)) * 3.6).toFixed(1)} km/h
                        </span>
                      </div>
                      <div className="relative h-16 bg-gray-50 rounded overflow-hidden">
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
                              strokeWidth="1"
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