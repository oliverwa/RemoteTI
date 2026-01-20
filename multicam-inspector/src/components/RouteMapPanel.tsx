import React, { useMemo } from 'react';
import { Map, Navigation2, Home, Route, MapPin } from 'lucide-react';

interface RouteData {
  outDistance?: number;
  outDistanceDirect?: number;
  outCoordinates?: number[][];
  homeDistance?: number;
  homeDistanceDirect?: number;
  homeCoordinates?: number[][];
}

interface RouteMapPanelProps {
  routeData?: RouteData;
}

const RouteMapPanel: React.FC<RouteMapPanelProps> = ({ routeData }) => {
  // Calculate bounds and scaling for the route visualization
  const { bounds, scale, center } = useMemo(() => {
    if (!routeData || (!routeData.outCoordinates && !routeData.homeCoordinates)) {
      return { bounds: null, scale: 1, center: { lat: 0, lng: 0 } };
    }

    const allCoords = [
      ...(routeData.outCoordinates || []),
      ...(routeData.homeCoordinates || [])
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
  }, [routeData]);

  // Convert coordinates to SVG points
  const coordsToSvgPath = (coords: number[][], viewBox: number = 300): string => {
    if (!coords || coords.length === 0 || !bounds) return '';
    
    return coords.map((coord, index) => {
      const x = ((coord[1] - bounds.minLng) / bounds.lngRange) * viewBox;
      const y = viewBox - ((coord[0] - bounds.minLat) / bounds.latRange) * viewBox;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
  };

  // Convert single coordinate to SVG point
  const coordToSvgPoint = (coord: number[], viewBox: number = 300): { x: number, y: number } => {
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: ((coord[1] - bounds.minLng) / bounds.lngRange) * viewBox,
      y: viewBox - ((coord[0] - bounds.minLat) / bounds.latRange) * viewBox
    };
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

  if (!routeData) {
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

  const hasOutRoute = routeData.outCoordinates && routeData.outCoordinates.length > 0;
  const hasHomeRoute = routeData.homeCoordinates && routeData.homeCoordinates.length > 0;

  return (
    <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Map className="w-4 h-4 text-blue-600" />
          <h3 className="font-medium text-sm text-gray-700">Flight Route</h3>
        </div>
        <div className="text-xs text-gray-500">
          Total: {formatDistance((routeData.outDistance || 0) + (routeData.homeDistance || 0))}
        </div>
      </div>

      <div className="bg-white rounded-lg p-3 space-y-3">
        {/* Route Map Visualization */}
        {(hasOutRoute || hasHomeRoute) && bounds ? (
          <div className="bg-gray-50 rounded-lg p-2">
            <svg 
              viewBox="0 0 300 300" 
              className="w-full h-48 md:h-64"
              style={{ maxHeight: '300px' }}
            >
              {/* Grid */}
              <defs>
                <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="300" height="300" fill="url(#grid)" />
              
              {/* Out route */}
              {hasOutRoute && (
                <>
                  <path
                    d={coordsToSvgPath(routeData.outCoordinates!)}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    opacity="0.7"
                  />
                  {/* Out route points */}
                  {routeData.outCoordinates!.map((coord, index) => {
                    const point = coordToSvgPoint(coord);
                    return (
                      <circle
                        key={`out-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r="3"
                        fill="#3b82f6"
                        opacity="0.8"
                      />
                    );
                  })}
                </>
              )}
              
              {/* Home route */}
              {hasHomeRoute && (
                <>
                  <path
                    d={coordsToSvgPath(routeData.homeCoordinates!)}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    opacity="0.7"
                  />
                  {/* Home route points */}
                  {routeData.homeCoordinates!.map((coord, index) => {
                    const point = coordToSvgPoint(coord);
                    return (
                      <circle
                        key={`home-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r="3"
                        fill="#10b981"
                        opacity="0.8"
                      />
                    );
                  })}
                </>
              )}
              
              {/* Start/End markers */}
              {hasOutRoute && (
                <>
                  {/* Start point (Home base) */}
                  <g transform={`translate(${coordToSvgPoint(routeData.outCoordinates![0]).x}, ${coordToSvgPoint(routeData.outCoordinates![0]).y})`}>
                    <circle r="6" fill="#22c55e" stroke="white" strokeWidth="2"/>
                    <text y="0" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" dy="3">H</text>
                  </g>
                  
                  {/* End point (Alarm location) */}
                  {routeData.outCoordinates!.length > 1 && (
                    <g transform={`translate(${coordToSvgPoint(routeData.outCoordinates![routeData.outCoordinates!.length - 1]).x}, ${coordToSvgPoint(routeData.outCoordinates![routeData.outCoordinates!.length - 1]).y})`}>
                      <circle r="6" fill="#ef4444" stroke="white" strokeWidth="2"/>
                      <text y="0" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold" dy="3">A</text>
                    </g>
                  )}
                </>
              )}
              
              {/* Legend */}
              <g transform="translate(10, 280)">
                <line x1="0" y1="0" x2="20" y2="0" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5"/>
                <text x="25" y="3" fontSize="10" fill="#6b7280">Out</text>
                
                <line x1="60" y1="0" x2="80" y2="0" stroke="#10b981" strokeWidth="2"/>
                <text x="85" y="3" fontSize="10" fill="#6b7280">Home</text>
              </g>
            </svg>
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
              <Navigation2 className="w-3 h-3 text-blue-600" />
              <h4 className="text-xs font-semibold text-gray-700">Outbound</h4>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Distance</span>
                <span className="text-xs font-medium text-gray-900">
                  {formatDistance(routeData.outDistance)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Direct</span>
                <span className="text-xs font-medium text-gray-900">
                  {formatDistance(routeData.outDistanceDirect)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Efficiency</span>
                <span className="text-xs font-medium text-gray-900">
                  {calculateEfficiency(routeData.outDistance, routeData.outDistanceDirect)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Waypoints</span>
                <span className="text-xs font-medium text-gray-900">
                  {routeData.outCoordinates?.length || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Return Route */}
          <div className="border rounded-lg p-2">
            <div className="flex items-center gap-2 mb-2">
              <Home className="w-3 h-3 text-green-600" />
              <h4 className="text-xs font-semibold text-gray-700">Return</h4>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Distance</span>
                <span className="text-xs font-medium text-gray-900">
                  {formatDistance(routeData.homeDistance)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Direct</span>
                <span className="text-xs font-medium text-gray-900">
                  {formatDistance(routeData.homeDistanceDirect)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Efficiency</span>
                <span className="text-xs font-medium text-gray-900">
                  {calculateEfficiency(routeData.homeDistance, routeData.homeDistanceDirect)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">Waypoints</span>
                <span className="text-xs font-medium text-gray-900">
                  {routeData.homeCoordinates?.length || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

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