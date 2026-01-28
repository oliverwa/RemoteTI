import React from 'react';
import { Gauge, TrendingUp, TrendingDown, Activity, MapPin, Clock } from 'lucide-react';

interface SpeedPanelProps {
  speeds?: {
    averageSpeed?: number;
    averageSpeedDuringWPOut?: number;
    averageSpeedDuringWPHome?: number;
    maxSpeed?: number;
    maxDescentSpeed?: number;
    maxAscentSpeed?: number;
    outboundSpeed?: number;
    totalDistance?: number;
    outDistance?: number;
    homeDistance?: number;
    calculationMethod?: {
      out: 'calculated' | 'gps' | 'none';
      home: 'calculated' | 'gps' | 'none';
    };
    gpsAverageSpeed?: number;
    gpsOutSpeed?: number;
    gpsHomeSpeed?: number;
  };
  flightDuration?: number; // in seconds
}

const SpeedPanel: React.FC<SpeedPanelProps> = ({ speeds, flightDuration }) => {
  if (!speeds) {
    return (
      <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="h-6 w-6 text-gray-400" />
          <h3 className="font-semibold text-gray-900 text-lg">Speed Performance</h3>
        </div>
        <p className="text-sm text-gray-500">No speed data available</p>
      </div>
    );
  }

  const formatSpeed = (speed: number | undefined, unit: 'ms' | 'kmh' = 'ms'): string => {
    if (speed === undefined) return 'N/A';
    if (unit === 'kmh') {
      return `${(Math.abs(speed) * 3.6).toFixed(1)} km/h`;
    }
    return `${Math.abs(speed).toFixed(1)} m/s`;
  };

  const getSpeedColor = (speedKmh: number): string => {
    if (speedKmh > 80) return 'text-red-600';
    if (speedKmh > 60) return 'text-orange-600';
    if (speedKmh > 40) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getSpeedBarWidth = (speedMs: number, maxKmh: number = 100): string => {
    const speedKmh = speedMs * 3.6;
    const percentage = Math.min((speedKmh / maxKmh) * 100, 100);
    return `${percentage}%`;
  };


  return (
    <div className="bg-gradient-to-br from-orange-50 to-white rounded-lg border border-orange-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-6 w-6 text-orange-600" />
          <h3 className="font-semibold text-gray-900 text-lg">Speed Performance</h3>
        </div>
        <span className="text-sm px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full font-medium">
          PRIMARY METRIC
        </span>
      </div>

      <div className="space-y-4">
        {/* PRIMARY METRIC: Outbound WP Speed */}
        {(speeds.averageSpeedDuringWPOut || speeds.outboundSpeed) !== undefined && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="h-6 w-6 text-blue-600" />
                <span className="text-base font-semibold text-gray-700">Mission Speed (Outbound)</span>
              </div>
              <span className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                PRIMARY METRIC
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-5xl font-bold ${getSpeedColor((speeds.averageSpeedDuringWPOut || speeds.outboundSpeed || 0) * 3.6)}`}>
                  {((speeds.averageSpeedDuringWPOut || speeds.outboundSpeed || 0) * 3.6).toFixed(1)}
                  <span className="text-2xl ml-2 text-gray-600">km/h</span>
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  {(speeds.averageSpeedDuringWPOut || speeds.outboundSpeed || 0).toFixed(1)} m/s
                </p>
              </div>
              <div className="text-right">
                <div className="w-48 bg-gray-200 rounded-full h-4">
                  <div 
                    className="bg-gradient-to-r from-blue-400 to-blue-600 h-4 rounded-full transition-all duration-500"
                    style={{ width: getSpeedBarWidth(speeds.averageSpeedDuringWPOut || speeds.outboundSpeed || 0) }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {(((speeds.averageSpeedDuringWPOut || speeds.outboundSpeed || 0) * 3.6 / 100) * 100).toFixed(0)}% of 100 km/h
                </p>
              </div>
            </div>
            {speeds.calculationMethod?.out && (
              <div className="mt-3 pt-3 border-t border-blue-100">
                <span className="text-xs text-gray-600">Calculation method: </span>
                <span className="text-xs font-medium text-gray-700">
                  {speeds.calculationMethod.out === 'calculated' ? 'Based on route distance/time' : 'GPS telemetry data'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Distance and Time Summary */}
        <div className="grid grid-cols-2 gap-3">
          {speeds.totalDistance && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-1 mb-2">
                <MapPin className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Total Distance</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {(speeds.totalDistance / 1000).toFixed(2)} km
              </p>
              <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                <div>Out: {((speeds.outDistance || 0) / 1000).toFixed(2)} km</div>
                <div>Return: {((speeds.homeDistance || 0) / 1000).toFixed(2)} km</div>
              </div>
            </div>
          )}
          {flightDuration && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-1 mb-2">
                <Clock className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">Flight Time</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {Math.floor(flightDuration / 60)}:{(flightDuration % 60).toString().padStart(2, '0')}
              </p>
              <div className="text-xs text-gray-500 mt-2">
                {(speeds.totalDistance && flightDuration > 0) ? 
                  `Avg: ${((speeds.totalDistance / 1000) / (flightDuration / 3600)).toFixed(1)} km/h` : 
                  'Duration in minutes'}
              </div>
            </div>
          )}
        </div>
        
        {/* Detailed Speed Breakdown */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white border rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium text-gray-600">Outbound</span>
            </div>
            <p className={`text-xl font-bold ${getSpeedColor((speeds.averageSpeedDuringWPOut || speeds.outboundSpeed || 0) * 3.6)}`}>
              {((speeds.averageSpeedDuringWPOut || speeds.outboundSpeed || 0) * 3.6).toFixed(1)}
              <span className="text-sm text-gray-500 ml-1">km/h</span>
            </p>
          </div>
          
          <div className="bg-white border rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <TrendingDown className="h-4 w-4 text-green-500" />
              <span className="text-xs font-medium text-gray-600">Return</span>
            </div>
            <p className={`text-xl font-bold ${getSpeedColor((speeds.averageSpeedDuringWPHome || 0) * 3.6)}`}>
              {((speeds.averageSpeedDuringWPHome || 0) * 3.6).toFixed(1)}
              <span className="text-sm text-gray-500 ml-1">km/h</span>
            </p>
          </div>
          
          <div className="bg-white border rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <Gauge className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium text-gray-600">Max</span>
            </div>
            <p className={`text-xl font-bold ${getSpeedColor((speeds.maxSpeed || 0) * 3.6)}`}>
              {((speeds.maxSpeed || 0) * 3.6).toFixed(1)}
              <span className="text-sm text-gray-500 ml-1">km/h</span>
            </p>
          </div>
        </div>


        {/* Vertical Speed Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium text-gray-600">Max Ascent</span>
            </div>
            <p className="text-xl font-bold text-gray-800">
              {speeds.maxAscentSpeed?.toFixed(1) || '0'} m/s
            </p>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-1 mb-1">
              <TrendingDown className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-medium text-gray-600">Max Descent</span>
            </div>
            <p className="text-xl font-bold text-gray-800">
              {speeds.maxDescentSpeed?.toFixed(1) || '0'} m/s
            </p>
          </div>
        </div>

        {/* Speed calculation info */}
        {speeds.calculationMethod && (
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <p className="text-xs font-medium text-blue-800 mb-2">Speed Calculation Method:</p>
            <div className="text-xs text-blue-700 space-y-1">
              <div>• Outbound: {speeds.calculationMethod.out === 'calculated' ? 'Route distance/time' : speeds.calculationMethod.out === 'gps' ? 'GPS data' : 'Not available'}</div>
              <div>• Return: {speeds.calculationMethod.home === 'calculated' ? 'Route distance/time' : speeds.calculationMethod.home === 'gps' ? 'GPS data' : 'Not available'}</div>
            </div>
          </div>
        )}
        
        {/* Enhanced speed comparison */}
        {speeds.averageSpeedDuringWPHome && speeds.averageSpeedDuringWPOut && (
          <div className={`rounded-lg p-3 mt-3 border ${
            speeds.averageSpeedDuringWPHome > speeds.averageSpeedDuringWPOut 
              ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200' 
              : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className={`h-5 w-5 ${
                  speeds.averageSpeedDuringWPHome > speeds.averageSpeedDuringWPOut ? 'text-blue-600' : 'text-amber-600'
                }`} />
                <p className={`text-sm font-medium ${
                  speeds.averageSpeedDuringWPHome > speeds.averageSpeedDuringWPOut ? 'text-blue-800' : 'text-amber-800'
                }`}>
                  Return vs Outbound
                </p>
              </div>
              <p className={`text-base font-bold ${
                speeds.averageSpeedDuringWPHome > speeds.averageSpeedDuringWPOut ? 'text-blue-700' : 'text-amber-700'
              }`}>
                {Math.abs((speeds.averageSpeedDuringWPHome / speeds.averageSpeedDuringWPOut - 1) * 100).toFixed(0)}% 
                {speeds.averageSpeedDuringWPHome > speeds.averageSpeedDuringWPOut ? ' faster' : ' slower'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpeedPanel;