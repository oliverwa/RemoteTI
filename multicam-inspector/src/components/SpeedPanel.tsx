import React from 'react';
import { Gauge, TrendingUp, TrendingDown, Activity } from 'lucide-react';

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
}

const SpeedPanel: React.FC<SpeedPanelProps> = ({ speeds }) => {
  if (!speeds) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="h-5 w-5 text-blue-600" />
          <h3 className="font-medium text-gray-900">Speed Metrics</h3>
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

  const getSpeedColor = (speed: number): string => {
    if (speed > 20) return 'text-red-600';
    if (speed > 15) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getSpeedBarWidth = (speed: number, max: number = 25): string => {
    const percentage = Math.min((speed / max) * 100, 100);
    return `${percentage}%`;
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-3">
        <Gauge className="h-5 w-5 text-blue-600" />
        <h3 className="font-medium text-gray-900">Speed Metrics</h3>
      </div>

      <div className="space-y-3">
        {/* Route distance info if available */}
        {speeds.totalDistance && (
          <div className="bg-gray-50 rounded-lg p-2 text-xs">
            <div className="flex justify-between items-center mb-1">
              <span className="text-gray-600">Total Distance</span>
              <span className="font-semibold">{(speeds.totalDistance / 1000).toFixed(2)} km</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Out: {((speeds.outDistance || 0) / 1000).toFixed(2)} km</span>
              <span className="text-gray-500">Return: {((speeds.homeDistance || 0) / 1000).toFixed(2)} km</span>
            </div>
          </div>
        )}
        
        {/* Average speeds with visual bars */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-white rounded-lg p-3 border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-blue-600" />
                <span className="text-xs font-medium text-gray-700">Outbound Speed</span>
              </div>
              {speeds.calculationMethod?.out && speeds.calculationMethod.out !== 'none' && (
                <span className={`text-[9px] px-1 py-0.5 rounded ${
                  speeds.calculationMethod.out === 'calculated' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {speeds.calculationMethod.out === 'calculated' ? 'CALC' : 'GPS'}
                </span>
              )}
            </div>
            <p className={`text-xl font-bold ${getSpeedColor(speeds.averageSpeedDuringWPOut || speeds.outboundSpeed || 0)}`}>
              {formatSpeed(speeds.averageSpeedDuringWPOut || speeds.outboundSpeed)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {formatSpeed(speeds.averageSpeedDuringWPOut || speeds.outboundSpeed, 'kmh')}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
              <div 
                className="bg-gradient-to-r from-blue-400 to-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: getSpeedBarWidth(speeds.averageSpeedDuringWPOut || speeds.outboundSpeed || 0) }}
              />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-green-50 to-white rounded-lg p-3 border border-green-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-green-600" />
                <span className="text-xs font-medium text-gray-700">Return Speed</span>
              </div>
              {speeds.calculationMethod?.home && speeds.calculationMethod.home !== 'none' && (
                <span className={`text-[9px] px-1 py-0.5 rounded ${
                  speeds.calculationMethod.home === 'calculated' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {speeds.calculationMethod.home === 'calculated' ? 'CALC' : 'GPS'}
                </span>
              )}
            </div>
            <p className={`text-xl font-bold ${getSpeedColor(speeds.averageSpeedDuringWPHome || 0)}`}>
              {formatSpeed(speeds.averageSpeedDuringWPHome)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {formatSpeed(speeds.averageSpeedDuringWPHome, 'kmh')}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
              <div 
                className="bg-gradient-to-r from-green-400 to-green-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: getSpeedBarWidth(speeds.averageSpeedDuringWPHome || 0) }}
              />
            </div>
          </div>
        </div>

        {/* Overall average speed */}
        {speeds.averageSpeed && (
          <div className="flex justify-between items-center py-2 px-2 rounded bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-gray-600" />
              <span className="text-xs font-medium text-gray-700">Overall Avg Speed</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-gray-800">
                {formatSpeed(speeds.averageSpeed)}
              </span>
              <span className="text-xs text-gray-500 ml-1">
                ({formatSpeed(speeds.averageSpeed, 'kmh')})
              </span>
            </div>
          </div>
        )}
        
        {/* Max speeds with enhanced styling */}
        <div className="space-y-2">
          <div className="flex justify-between items-center py-2 px-2 rounded hover:bg-gray-50 transition-colors border-t">
            <span className="text-xs font-medium text-gray-700">Max Speed</span>
            <div className="text-right">
              <span className={`text-sm font-bold ${getSpeedColor(speeds.maxSpeed || 0)}`}>
                {formatSpeed(speeds.maxSpeed)}
              </span>
              <span className="text-xs text-gray-500 ml-2">
                ({formatSpeed(speeds.maxSpeed, 'kmh')})
              </span>
            </div>
          </div>
          
          <div className="flex justify-between items-center py-2 px-2 rounded hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs font-medium text-gray-700">Max Ascent</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold text-gray-900">
                {formatSpeed(speeds.maxAscentSpeed)}
              </span>
            </div>
          </div>
          
          <div className="flex justify-between items-center py-2 px-2 rounded hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-xs font-medium text-gray-700">Max Descent</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold text-gray-900">
                {formatSpeed(speeds.maxDescentSpeed)}
              </span>
            </div>
          </div>
        </div>

        {/* Speed calculation info */}
        {speeds.calculationMethod && (
          <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
            <p className="text-[10px] font-medium text-blue-800 mb-1">Speed Calculation Method:</p>
            <div className="text-[10px] text-blue-700 space-y-0.5">
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
                <Activity className={`h-4 w-4 ${
                  speeds.averageSpeedDuringWPHome > speeds.averageSpeedDuringWPOut ? 'text-blue-600' : 'text-amber-600'
                }`} />
                <p className={`text-xs font-medium ${
                  speeds.averageSpeedDuringWPHome > speeds.averageSpeedDuringWPOut ? 'text-blue-800' : 'text-amber-800'
                }`}>
                  Return vs Outbound
                </p>
              </div>
              <p className={`text-sm font-bold ${
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