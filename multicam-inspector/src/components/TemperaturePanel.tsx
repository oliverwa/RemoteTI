import React from 'react';
import { Thermometer, TrendingUp, TrendingDown } from 'lucide-react';

interface TemperatureData {
  haloTakeOffTemp?: number;
  haloLandingTemp?: number;
  haloTempMin?: number;
  haloMaxTemp?: number;
  ftsTakeOffTemp?: number;
  ftsLandingTemp?: number;
  ftsAvgTemp?: number;
  ftsMaxTemp?: number;
}

interface TemperaturePanelProps {
  temperatureData?: TemperatureData;
}

const TemperaturePanel: React.FC<TemperaturePanelProps> = ({ temperatureData }) => {
  if (!temperatureData) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Thermometer className="w-4 h-4 text-gray-400" />
          <h3 className="font-medium text-sm text-gray-700 dark:text-gray-100">Temperature Data</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-200">No temperature data available</p>
      </div>
    );
  }

  // Format temperature
  const formatTemp = (temp?: number): string => {
    if (temp === undefined || temp === null) return 'N/A';
    return `${temp.toFixed(1)}°C`;
  };

  // Calculate temperature changes
  const haloTempChange = (temperatureData.haloLandingTemp !== undefined && temperatureData.haloTakeOffTemp !== undefined)
    ? temperatureData.haloLandingTemp - temperatureData.haloTakeOffTemp
    : null;
  
  const ftsTempChange = (temperatureData.ftsLandingTemp !== undefined && temperatureData.ftsTakeOffTemp !== undefined)
    ? temperatureData.ftsLandingTemp - temperatureData.ftsTakeOffTemp
    : null;

  // Get temperature status color
  const getTempStatusColor = (temp?: number): string => {
    if (!temp) return 'text-gray-600';
    if (temp > 70) return 'text-red-600';
    if (temp > 60) return 'text-orange-600';
    if (temp > 50) return 'text-yellow-600';
    return 'text-green-600';
  };

  // Get overall temperature status
  const getOverallStatus = () => {
    const maxTemp = Math.max(
      temperatureData.haloMaxTemp || 0,
      temperatureData.ftsMaxTemp || 0
    );
    
    if (maxTemp > 70) {
      return { status: 'Critical', color: 'text-red-600 bg-red-50' };
    } else if (maxTemp > 60) {
      return { status: 'High', color: 'text-orange-600 bg-orange-50' };
    } else if (maxTemp > 50) {
      return { status: 'Moderate', color: 'text-yellow-600 bg-yellow-50' };
    }
    return { status: 'Normal', color: 'text-green-600 bg-green-50' };
  };

  const overallStatus = getOverallStatus();

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Thermometer className="w-4 h-4 text-red-500" />
          <h3 className="font-medium text-sm text-gray-700 dark:text-gray-100">System Temperatures</h3>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${overallStatus.color}`}>
          {overallStatus.status}
        </span>
      </div>

      <div className="bg-white dark:bg-gray-700 rounded-lg p-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* HALO System */}
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-100">HALO System</h4>
              {haloTempChange !== null && (
                <div className="flex items-center gap-1">
                  {haloTempChange < 0 ? (
                    <TrendingDown className="w-3 h-3 text-green-500" />
                  ) : (
                    <TrendingUp className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-xs font-medium ${haloTempChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {haloTempChange > 0 ? '+' : ''}{haloTempChange.toFixed(1)}°
                  </span>
                </div>
              )}
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-200">Takeoff</span>
                <span className={`text-xs font-medium ${getTempStatusColor(temperatureData.haloTakeOffTemp)}`}>
                  {formatTemp(temperatureData.haloTakeOffTemp)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-200">Landing</span>
                <span className={`text-xs font-medium ${getTempStatusColor(temperatureData.haloLandingTemp)}`}>
                  {formatTemp(temperatureData.haloLandingTemp)}
                </span>
              </div>
              <div className="border-t pt-1.5 mt-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-200">Min</span>
                  <span className={`text-xs font-medium ${getTempStatusColor(temperatureData.haloTempMin)}`}>
                    {formatTemp(temperatureData.haloTempMin)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-200">Max</span>
                  <span className={`text-xs font-medium ${getTempStatusColor(temperatureData.haloMaxTemp)}`}>
                    {formatTemp(temperatureData.haloMaxTemp)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* FTS System */}
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-100">FTS System</h4>
              {ftsTempChange !== null && (
                <div className="flex items-center gap-1">
                  {ftsTempChange < 0 ? (
                    <TrendingDown className="w-3 h-3 text-green-500" />
                  ) : (
                    <TrendingUp className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-xs font-medium ${ftsTempChange < 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {ftsTempChange > 0 ? '+' : ''}{ftsTempChange.toFixed(1)}°
                  </span>
                </div>
              )}
            </div>
            
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-200">Takeoff</span>
                <span className={`text-xs font-medium ${getTempStatusColor(temperatureData.ftsTakeOffTemp)}`}>
                  {formatTemp(temperatureData.ftsTakeOffTemp)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-200">Landing</span>
                <span className={`text-xs font-medium ${getTempStatusColor(temperatureData.ftsLandingTemp)}`}>
                  {formatTemp(temperatureData.ftsLandingTemp)}
                </span>
              </div>
              <div className="border-t pt-1.5 mt-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-200">Average</span>
                  <span className={`text-xs font-medium ${getTempStatusColor(temperatureData.ftsAvgTemp)}`}>
                    {formatTemp(temperatureData.ftsAvgTemp)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-200">Max</span>
                  <span className={`text-xs font-medium ${getTempStatusColor(temperatureData.ftsMaxTemp)}`}>
                    {formatTemp(temperatureData.ftsMaxTemp)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Temperature Range Bar */}
        <div className="border-t pt-2">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-200 mb-1">
            <span>Temperature Range</span>
            <span>0°C — 100°C</span>
          </div>
          <div className="relative h-2 bg-gradient-to-r from-green-400 via-yellow-400 via-orange-400 to-red-400 rounded-full">
            {/* HALO markers */}
            {temperatureData.haloMaxTemp !== undefined && (
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow-sm"
                style={{ left: `${Math.min(100, Math.max(0, temperatureData.haloMaxTemp))}%` }}
                title={`HALO Max: ${formatTemp(temperatureData.haloMaxTemp)}`}
              />
            )}
            {/* FTS markers */}
            {temperatureData.ftsMaxTemp !== undefined && (
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-purple-600 rounded-full border-2 border-white shadow-sm"
                style={{ left: `${Math.min(100, Math.max(0, temperatureData.ftsMaxTemp))}%` }}
                title={`FTS Max: ${formatTemp(temperatureData.ftsMaxTemp)}`}
              />
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              <span className="text-gray-600 dark:text-gray-200">HALO Max</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-purple-600 rounded-full"></div>
              <span className="text-gray-600 dark:text-gray-200">FTS Max</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemperaturePanel;