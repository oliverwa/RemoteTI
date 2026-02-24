import React from 'react';
import { Zap, Activity, TrendingUp, Gauge } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Scatter, ScatterChart } from 'recharts';

interface PerformanceData {
  averageCurrentWPOut?: number;
  averageCurrentWPHome?: number;
  thrustToHover?: number;
  avgVibX?: number;
  avgVibY?: number;
  avgVibZ?: number;
  maxVibX?: number;
  maxVibY?: number;
  maxVibZ?: number;
  realsensecalibration?: number[][];
}

interface PerformancePanelProps {
  performanceData?: PerformanceData;
}

const PerformancePanel: React.FC<PerformancePanelProps> = ({ performanceData }) => {
  if (!performanceData) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="w-4 h-4 text-gray-400" />
          <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300">Performance Metrics</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">No performance data available</p>
      </div>
    );
  }

  // Format current
  const formatCurrent = (current?: number): string => {
    if (current === undefined || current === null) return 'N/A';
    return `${current.toFixed(1)} A`;
  };

  // Format vibration
  const formatVibration = (vib?: number): string => {
    if (vib === undefined || vib === null) return 'N/A';
    return vib.toFixed(2);
  };

  // Format thrust
  const formatThrust = (thrust?: number): string => {
    if (thrust === undefined || thrust === null) return 'N/A';
    return `${(thrust * 100).toFixed(1)}%`;
  };

  // Prepare realsense calibration data for chart
  const calibrationData = performanceData.realsensecalibration?.map((point, index) => ({
    index: index + 1,
    expected: point[0],
    measured: point[1],
    error: Math.abs(point[0] - point[1])
  })) || [];

  // Calculate domain for 1:1 aspect ratio
  const getCalibrationDomain = () => {
    if (calibrationData.length === 0) return [0, 30];
    
    const allValues = calibrationData.flatMap(d => [d.expected, d.measured]).filter(v => v !== undefined && v !== null);
    if (allValues.length === 0) return [0, 30];
    
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min;
    const padding = range * 0.15 || 2;
    
    // Round to nice numbers
    const domainMin = Math.floor(min - padding);
    const domainMax = Math.ceil(max + padding);
    
    return [domainMin, domainMax];
  };

  const calibrationDomain = getCalibrationDomain();

  // Assess vibration levels
  const getVibrationStatus = () => {
    const avgVib = Math.max(
      performanceData.avgVibX || 0,
      performanceData.avgVibY || 0,
      performanceData.avgVibZ || 0
    );
    const maxVib = Math.max(
      performanceData.maxVibX || 0,
      performanceData.maxVibY || 0,
      performanceData.maxVibZ || 0
    );

    if (maxVib > 10 || avgVib > 7) {
      return { status: 'High', color: 'text-red-600 bg-red-50' };
    } else if (maxVib > 7 || avgVib > 5) {
      return { status: 'Moderate', color: 'text-yellow-600 bg-yellow-50' };
    }
    return { status: 'Normal', color: 'text-green-600 bg-green-50' };
  };

  const vibStatus = getVibrationStatus();

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-purple-600" />
          <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300">Performance Metrics</h3>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-700 rounded-lg p-3 space-y-3">
        {/* Power & Thrust Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Average Current Out */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 bg-yellow-100 rounded">
              <Zap className="w-3 h-3 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Current WP Out</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrent(performanceData.averageCurrentWPOut)}</p>
            </div>
          </div>

          {/* Average Current Home */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 bg-yellow-100 rounded">
              <Zap className="w-3 h-3 text-yellow-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Current WP Home</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrent(performanceData.averageCurrentWPHome)}</p>
            </div>
          </div>

          {/* Thrust to Hover */}
          <div className="flex items-start gap-2">
            <div className="p-1.5 bg-blue-100 rounded">
              <TrendingUp className="w-3 h-3 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Thrust to Hover</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatThrust(performanceData.thrustToHover)}</p>
            </div>
          </div>
        </div>

        {/* Vibration Metrics */}
        <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <Activity className="w-3 h-3" />
              Vibration Levels
            </h4>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${vibStatus.color}`}>
              {vibStatus.status}
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {/* Average Vibrations */}
            <div className="bg-gray-50 dark:bg-gray-600 rounded p-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Average</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-gray-400 dark:text-gray-500">X:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">{formatVibration(performanceData.avgVibX)}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Y:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">{formatVibration(performanceData.avgVibY)}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Z:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">{formatVibration(performanceData.avgVibZ)}</span>
                </div>
              </div>
            </div>

            {/* Max Vibrations */}
            <div className="bg-gray-50 dark:bg-gray-600 rounded p-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Maximum</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-gray-400 dark:text-gray-500">X:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">{formatVibration(performanceData.maxVibX)}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Y:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">{formatVibration(performanceData.maxVibY)}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Z:</span>
                  <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">{formatVibration(performanceData.maxVibZ)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Realsense Calibration Chart */}
        {calibrationData.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-600 pt-2">
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">RealSense Calibration</h4>
            <div style={{ width: '160px', height: '160px' }} className="mx-auto">
              <div className="h-full bg-gray-50 dark:bg-gray-600 rounded p-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="expected" 
                      type="number"
                      domain={calibrationDomain}
                      tickFormatter={(value) => value.toFixed(0)}
                      ticks={Array.from({length: 3}, (_, i) => 
                        Math.round(calibrationDomain[0] + (calibrationDomain[1] - calibrationDomain[0]) * (i + 0.5) / 3)
                      )}
                      label={{ value: 'Expected (m)', position: 'insideBottom', offset: -15, style: { fontSize: 8 } }}
                      tick={{ fontSize: 8 }}
                      allowDataOverflow={false}
                    />
                    <YAxis 
                      dataKey="measured"
                      type="number"
                      domain={calibrationDomain}
                      tickFormatter={(value) => value.toFixed(0)}
                      ticks={Array.from({length: 3}, (_, i) => 
                        Math.round(calibrationDomain[0] + (calibrationDomain[1] - calibrationDomain[0]) * (i + 0.5) / 3)
                      )}
                      label={{ value: 'Measured (m)', position: 'insideLeft', angle: -90, style: { fontSize: 8 } }}
                      tick={{ fontSize: 8 }}
                      allowDataOverflow={false}
                    />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-600 rounded shadow text-xs">
                            <p className="font-semibold text-gray-900 dark:text-gray-100">Calibration Point {data.index}</p>
                            <p className="text-gray-700 dark:text-gray-300">Expected: {data.expected?.toFixed(2)}m</p>
                            <p className="text-gray-700 dark:text-gray-300">Measured: {data.measured?.toFixed(2)}m</p>
                            <p className={`font-medium ${data.error < 1 ? 'text-green-600' : data.error < 3 ? 'text-yellow-600' : 'text-red-600'}`}>
                              Error: {data.error?.toFixed(2)}m
                            </p>
                          </div>
                        );
                      }}
                    />
                    {/* Reference line (perfect calibration y=x) */}
                    <Line 
                      type="linear" 
                      data={[
                        { expected: calibrationDomain[0], measured: calibrationDomain[0] },
                        { expected: calibrationDomain[1], measured: calibrationDomain[1] }
                      ]}
                      dataKey="measured"
                      stroke="#94a3b8" 
                      strokeDasharray="5 5"
                      dot={false}
                      strokeWidth={1}
                      legendType="none"
                    />
                    {/* Actual calibration points */}
                    <Scatter 
                      data={calibrationData} 
                      fill="#8b5cf6"
                      shape="circle"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            {/* Calibration Summary */}
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">Calibration Points: {calibrationData.length}</span>
              <span className="text-gray-500 dark:text-gray-400">
                Avg Error: {calibrationData.length > 0 ? (calibrationData.reduce((sum, d) => sum + d.error, 0) / calibrationData.length).toFixed(2) : '0.00'}m
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformancePanel;