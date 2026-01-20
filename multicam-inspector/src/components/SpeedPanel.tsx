import React from 'react';
import { Gauge, TrendingUp, TrendingDown, Zap, Activity } from 'lucide-react';

interface SpeedPanelProps {
  speeds?: {
    averageSpeed?: number;
    averageSpeedDuringWPHome?: number;
    maxSpeed?: number;
    maxDescentSpeed?: number;
    maxAscentSpeed?: number;
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
        {/* Average speeds with visual bars */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-white rounded-lg p-3 border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-blue-600" />
                <span className="text-xs font-medium text-gray-700">Avg Speed</span>
              </div>
            </div>
            <p className={`text-xl font-bold ${getSpeedColor(speeds.averageSpeed || 0)}`}>
              {formatSpeed(speeds.averageSpeed)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {formatSpeed(speeds.averageSpeed, 'kmh')}
            </p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
              <div 
                className="bg-gradient-to-r from-blue-400 to-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: getSpeedBarWidth(speeds.averageSpeed || 0) }}
              />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-green-50 to-white rounded-lg p-3 border border-green-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3 text-green-600" />
                <span className="text-xs font-medium text-gray-700">Return Speed</span>
              </div>
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

        {/* Enhanced speed comparison */}
        {speeds.averageSpeedDuringWPHome && speeds.averageSpeed && (
          <div className={`rounded-lg p-3 mt-3 border ${
            speeds.averageSpeedDuringWPHome > speeds.averageSpeed 
              ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200' 
              : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className={`h-4 w-4 ${
                  speeds.averageSpeedDuringWPHome > speeds.averageSpeed ? 'text-blue-600' : 'text-amber-600'
                }`} />
                <p className={`text-xs font-medium ${
                  speeds.averageSpeedDuringWPHome > speeds.averageSpeed ? 'text-blue-800' : 'text-amber-800'
                }`}>
                  Return Performance
                </p>
              </div>
              <p className={`text-sm font-bold ${
                speeds.averageSpeedDuringWPHome > speeds.averageSpeed ? 'text-blue-700' : 'text-amber-700'
              }`}>
                {Math.abs((speeds.averageSpeedDuringWPHome / speeds.averageSpeed - 1) * 100).toFixed(0)}% 
                {speeds.averageSpeedDuringWPHome > speeds.averageSpeed ? ' faster' : ' slower'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpeedPanel;