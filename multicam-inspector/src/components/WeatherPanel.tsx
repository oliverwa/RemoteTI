import React from 'react';
import { Cloud, Wind, Droplets, Eye, Thermometer, Navigation2, MapPin } from 'lucide-react';

interface WeatherData {
  stationName?: string;
  stationDistance?: number;
  tempPrognosis?: number;
  windPrognosis?: number;
  gustPrognosis?: number;
  winddirPrognosis?: number;
  percipitationPrognosis?: number;
  visibilityPrognosis?: number;
  windHangar?: number;
  gustHangar?: number;
}

interface WeatherPanelProps {
  weatherData?: WeatherData;
}

const WeatherPanel: React.FC<WeatherPanelProps> = ({ weatherData }) => {
  if (!weatherData) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Cloud className="w-4 h-4 text-gray-400" />
          <h3 className="font-medium text-sm text-gray-700 dark:text-gray-200">Weather Conditions</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-200">No weather data available</p>
      </div>
    );
  }

  // Format visibility from meters to km
  const formatVisibility = (meters?: number): string => {
    if (!meters) return 'N/A';
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  };

  // Format wind direction to compass direction
  const formatWindDirection = (degrees?: number): string => {
    if (degrees === undefined || degrees === null) return 'N/A';
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return `${directions[index]} (${degrees}°)`;
  };

  // Format temperature
  const formatTemp = (temp?: number): string => {
    if (temp === undefined || temp === null) return 'N/A';
    return `${temp.toFixed(1)}°C`;
  };

  // Format wind speed
  const formatWind = (speed?: number): string => {
    if (speed === undefined || speed === null) return 'N/A';
    return `${speed.toFixed(1)} m/s`;
  };

  // Format precipitation
  const formatPrecipitation = (mm?: number): string => {
    if (mm === undefined || mm === null) return 'N/A';
    if (mm === 0) return 'None';
    return `${mm.toFixed(1)} mm`;
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-blue-600" />
          <h3 className="font-medium text-sm text-gray-700 dark:text-gray-200">Weather Conditions</h3>
        </div>
        {weatherData.stationName && (
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-200">
            <MapPin className="w-3 h-3" />
            <span>{weatherData.stationName}</span>
            {weatherData.stationDistance && (
              <span className="text-gray-400 dark:text-gray-300">({weatherData.stationDistance.toFixed(1)} km)</span>
            )}
          </div>
        )}
      </div>

      {/* Weather Grid */}
      <div className="bg-white dark:bg-gray-700 rounded-lg p-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Temperature */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 bg-orange-100 dark:bg-orange-900 rounded">
              <Thermometer className="w-3 h-3 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-200">Temperature</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{formatTemp(weatherData.tempPrognosis)}</p>
            </div>
          </div>

          {/* Wind Speed */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-900 rounded">
              <Wind className="w-3 h-3 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-200">Wind</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{formatWind(weatherData.windPrognosis)}</p>
              {weatherData.gustPrognosis && weatherData.gustPrognosis > 0 && (
                <p className="text-xs text-gray-600 dark:text-gray-200">Gusts: {formatWind(weatherData.gustPrognosis)}</p>
              )}
            </div>
          </div>

          {/* Wind Direction */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 bg-green-100 dark:bg-green-900 rounded">
              <Navigation2 className="w-3 h-3 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-200">Wind Direction</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{formatWindDirection(weatherData.winddirPrognosis)}</p>
            </div>
          </div>

          {/* Precipitation */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 bg-cyan-100 dark:bg-cyan-900 rounded">
              <Droplets className="w-3 h-3 text-cyan-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-200">Precipitation</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{formatPrecipitation(weatherData.percipitationPrognosis)}</p>
            </div>
          </div>

          {/* Visibility */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 bg-purple-100 dark:bg-purple-900 rounded">
              <Eye className="w-3 h-3 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-200">Visibility</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{formatVisibility(weatherData.visibilityPrognosis)}</p>
            </div>
          </div>

          {/* Hangar Wind */}
          {(weatherData.windHangar !== undefined || weatherData.gustHangar !== undefined) && (
            <div className="flex items-start gap-2">
              <div className="p-1.5 bg-gray-100 dark:bg-gray-700 rounded">
                <Wind className="w-3 h-3 text-gray-600 dark:text-gray-200" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-200">Hangar Wind</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{formatWind(weatherData.windHangar)}</p>
                {weatherData.gustHangar && weatherData.gustHangar > 0 && (
                  <p className="text-xs text-gray-600 dark:text-gray-200">Gusts: {formatWind(weatherData.gustHangar)}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Weather Assessment */}
        <div className="mt-3 pt-3 border-t">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-200">Flight Conditions</span>
            {(() => {
              const wind = weatherData.windPrognosis || 0;
              const gust = weatherData.gustPrognosis || 0;
              const visibility = weatherData.visibilityPrognosis || 0;
              const precipitation = weatherData.percipitationPrognosis || 0;
              
              let condition = 'Good';
              let colorClass = 'text-green-600 bg-green-50';
              
              if (gust > 15 || wind > 10 || visibility < 5000 || precipitation > 5) {
                condition = 'Poor';
                colorClass = 'text-red-600 bg-red-50';
              } else if (gust > 10 || wind > 7 || visibility < 10000 || precipitation > 2) {
                condition = 'Marginal';
                colorClass = 'text-yellow-600 bg-yellow-50';
              }
              
              return (
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${colorClass}`}>
                  {condition}
                </span>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherPanel;