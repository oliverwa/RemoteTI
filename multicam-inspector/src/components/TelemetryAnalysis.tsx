import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { CheckCircle, XCircle, FileText, RefreshCw, AlertTriangle, BarChart, X, Wrench } from 'lucide-react';

interface TelemetryAnalysisProps {
  droneId: string;
  hangarId: string;
  onComplete: (status: 'pass' | 'fail' | 'warning', telemetryData?: any) => void;
  onRequestOnsite?: (telemetryData?: any) => void;
  onClose?: () => void;
  existingData?: any;  // Pass existing telemetry data to skip file selection
  viewOnly?: boolean;  // View-only mode, no decision buttons
}

interface TelemetryFile {
  id: string;
  filename: string;
  timestamp: string;
  size: string;
  drone: string;
}

interface TelemetryMetric {
  name: string;
  value: number | string;
  unit?: string;
  status: 'pass' | 'fail' | 'warning';
  limit?: {
    min?: number;
    max?: number;
  };
}

interface TelemetryResults {
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  flightData: {
    flightTime: string;
    deliveryTime: string;
    completionStatus: 'completed' | 'aborted' | 'rerouted';
    abnormalEvents: string[];
    totalDistance: string;
    maxAltitude: string;
    weatherConditions: string;
    batteryUsed: string;
  };
  metrics: TelemetryMetric[];
}

const TelemetryAnalysis: React.FC<TelemetryAnalysisProps> = ({ droneId, hangarId, onComplete, onRequestOnsite, onClose, existingData, viewOnly }) => {
  const [stage, setStage] = useState<'selecting' | 'confirming' | 'analyzing' | 'results'>(existingData ? 'results' : 'selecting');
  const [selectedFile, setSelectedFile] = useState<TelemetryFile | null>(null);
  const [availableFiles, setAvailableFiles] = useState<TelemetryFile[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [results, setResults] = useState<TelemetryResults | null>(existingData || null);

  // Simulate fetching telemetry files
  useEffect(() => {
    // If we have existing data, skip file selection
    if (existingData) {
      return;
    }
    
    // Simulate API call to get telemetry files
    const mockFiles: TelemetryFile[] = [
      {
        id: 'tel_001',
        filename: `${droneId}_flight_${new Date().toISOString().split('T')[0]}_143022.log`,
        timestamp: new Date(Date.now() - 5 * 60000).toISOString(), // 5 minutes ago
        size: '12.4 MB',
        drone: droneId
      },
      {
        id: 'tel_002',
        filename: `${droneId}_flight_${new Date().toISOString().split('T')[0]}_142517.log`,
        timestamp: new Date(Date.now() - 15 * 60000).toISOString(), // 15 minutes ago
        size: '11.8 MB',
        drone: droneId
      },
      {
        id: 'tel_003',
        filename: `${droneId}_flight_${new Date().toISOString().split('T')[0]}_141203.log`,
        timestamp: new Date(Date.now() - 30 * 60000).toISOString(), // 30 minutes ago
        size: '13.1 MB',
        drone: droneId
      }
    ];
    
    setAvailableFiles(mockFiles);
    // Auto-select the most recent file
    setSelectedFile(mockFiles[0]);
    setStage('confirming');
  }, [droneId, existingData]);

  const runAnalysis = () => {
    setStage('analyzing');
    setAnalysisProgress(0);

    // Simulate analysis progress
    const interval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          generateMockResults();
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  const generateMockResults = () => {
    // Based on real telemetry data structure from bender/molndal
    const mockTelemetryData = {
      battery: {
        takeOffVoltage: 23.212,
        landingVoltage: 21.415,
        landingPercentage: 39.0
      },
      performance: {
        avgVibX: 4.581,
        avgVibY: 4.844,
        avgVibZ: 4.778,
        maxVibX: 8.689,
        maxVibY: 7.68,
        maxVibZ: 7.765,
        averageCurrentWPOut: 96.054,
        averageCurrentWPHome: 96.806
      },
      temperature: {
        haloMaxTemp: 55.0,
        ftsMaxTemp: 63.0,
        ftsAvgTemp: 48.21
      },
      speeds: {
        averageSpeed: 11.787,
        maxSpeed: 21.972,
        maxDescentSpeed: -3.257,
        maxAscentSpeed: 4.245
      },
      landing: {
        distanceToMarker: 3.53,
        landingImpact: 1.03
      },
      mission: {
        totalFlightTime: 622,
        timeToWP: 52,
        distanceFromMarker: 3.53
      },
      routes: {
        outDistance: 3561.612,
        homeDistance: 4018.481
      },
      reception: {
        sim1RssiAvg: -42.292,
        sim2RssiAvg: -43.97,
        sim3RssiAvg: -47.10,
        sim4RssiAvg: -45.81
      },
      weather: {
        windPrognosis: 0.3,
        gustPrognosis: 1.6,
        tempPrognosis: 3.7
      }
    };

    // Adjust some values to create warnings for demonstration
    mockTelemetryData.battery.landingPercentage = 28; // Will trigger warning
    mockTelemetryData.performance.avgVibX = 5.8; // Will trigger warning on vibration
    mockTelemetryData.landing.landingImpact = 1.7; // Will trigger warning
    
    // Focus on critical inspection metrics with some warnings for demonstration
    const metrics: TelemetryMetric[] = [
      // Critical: Battery health
      { 
        name: 'Landing Battery Reserve', 
        value: mockTelemetryData.battery.landingPercentage, 
        unit: '%', 
        status: mockTelemetryData.battery.landingPercentage > 30 ? 'pass' : mockTelemetryData.battery.landingPercentage > 20 ? 'warning' : 'fail',
        limit: { min: 30 }
      },
      
      // Battery voltage
      { 
        name: 'Battery Voltage', 
        value: mockTelemetryData.battery.landingVoltage.toFixed(2), 
        unit: 'V', 
        status: mockTelemetryData.battery.landingVoltage > 21.0 ? 'pass' : mockTelemetryData.battery.landingVoltage > 20.0 ? 'warning' : 'fail',
        limit: { min: 21.0, max: 25.2 }
      },
      
      // Critical: Vibration health
      { 
        name: 'Vibration Levels', 
        value: Math.max(mockTelemetryData.performance.avgVibX, mockTelemetryData.performance.avgVibY, mockTelemetryData.performance.avgVibZ).toFixed(2), 
        unit: 'm/s²', 
        status: Math.max(mockTelemetryData.performance.avgVibX, mockTelemetryData.performance.avgVibY, mockTelemetryData.performance.avgVibZ) < 5 ? 'pass' : 
                Math.max(mockTelemetryData.performance.avgVibX, mockTelemetryData.performance.avgVibY, mockTelemetryData.performance.avgVibZ) < 7 ? 'warning' : 'fail',
        limit: { max: 5 }
      },
      
      // Critical: Temperature
      { 
        name: 'System Temperature', 
        value: Math.max(mockTelemetryData.temperature.haloMaxTemp, mockTelemetryData.temperature.ftsMaxTemp), 
        unit: '°C', 
        status: Math.max(mockTelemetryData.temperature.haloMaxTemp, mockTelemetryData.temperature.ftsMaxTemp) < 65 ? 'pass' : 
                Math.max(mockTelemetryData.temperature.haloMaxTemp, mockTelemetryData.temperature.ftsMaxTemp) < 75 ? 'warning' : 'fail',
        limit: { max: 65 }
      },
      
      // Critical: Landing precision
      { 
        name: 'Landing Precision', 
        value: mockTelemetryData.landing.distanceToMarker.toFixed(2), 
        unit: 'm', 
        status: mockTelemetryData.landing.distanceToMarker < 5 ? 'pass' : mockTelemetryData.landing.distanceToMarker < 10 ? 'warning' : 'fail',
        limit: { max: 5 }
      },
      
      // Landing impact
      { 
        name: 'Landing Impact Force', 
        value: mockTelemetryData.landing.landingImpact.toFixed(2), 
        unit: 'G', 
        status: mockTelemetryData.landing.landingImpact < 1.5 ? 'pass' : mockTelemetryData.landing.landingImpact < 2.0 ? 'warning' : 'fail',
        limit: { max: 1.5 }
      },
      
      // Critical: Signal connectivity
      { 
        name: 'Signal Strength', 
        value: Math.max(mockTelemetryData.reception.sim1RssiAvg, mockTelemetryData.reception.sim2RssiAvg, mockTelemetryData.reception.sim3RssiAvg, mockTelemetryData.reception.sim4RssiAvg).toFixed(1), 
        unit: 'dBm', 
        status: Math.max(mockTelemetryData.reception.sim1RssiAvg, mockTelemetryData.reception.sim2RssiAvg, mockTelemetryData.reception.sim3RssiAvg, mockTelemetryData.reception.sim4RssiAvg) > -50 ? 'pass' : 'warning',
        limit: { min: -60 }
      },
      
      // Current consumption
      { 
        name: 'Power Consumption', 
        value: ((mockTelemetryData.performance.averageCurrentWPOut + mockTelemetryData.performance.averageCurrentWPHome) / 2).toFixed(1), 
        unit: 'A', 
        status: ((mockTelemetryData.performance.averageCurrentWPOut + mockTelemetryData.performance.averageCurrentWPHome) / 2) < 100 ? 'pass' : 
                ((mockTelemetryData.performance.averageCurrentWPOut + mockTelemetryData.performance.averageCurrentWPHome) / 2) < 110 ? 'warning' : 'fail',
        limit: { max: 100 }
      },
      
      // Critical: Weather conditions
      { 
        name: 'Wind Conditions', 
        value: (Math.max(mockTelemetryData.weather.windPrognosis, mockTelemetryData.weather.gustPrognosis) * 3.6).toFixed(1), 
        unit: 'km/h', 
        status: Math.max(mockTelemetryData.weather.windPrognosis, mockTelemetryData.weather.gustPrognosis) < 5 ? 'pass' : 
                Math.max(mockTelemetryData.weather.windPrognosis, mockTelemetryData.weather.gustPrognosis) < 8 ? 'warning' : 'fail',
        limit: { max: 18 }
      }
    ];

    // Count statuses
    const passed = metrics.filter(m => m.status === 'pass').length;
    const warnings = metrics.filter(m => m.status === 'warning').length;
    const failed = metrics.filter(m => m.status === 'fail').length;

    const mockResults: TelemetryResults = {
      summary: {
        totalChecks: metrics.length,
        passed,
        failed,
        warnings
      },
      flightData: {
        flightTime: `${Math.floor(mockTelemetryData.mission.totalFlightTime / 60)}m ${mockTelemetryData.mission.totalFlightTime % 60}s`,
        deliveryTime: `${Math.floor(mockTelemetryData.mission.timeToWP / 60)}m ${mockTelemetryData.mission.timeToWP % 60}s`,
        completionStatus: 'completed',
        abnormalEvents: mockTelemetryData.landing.distanceToMarker > 5 ? ['Landing precision warning'] : [],
        totalDistance: `${((mockTelemetryData.routes.outDistance + mockTelemetryData.routes.homeDistance) / 1000).toFixed(1)}km`,
        maxAltitude: '120m',
        weatherConditions: `Wind: ${(mockTelemetryData.weather.windPrognosis * 3.6).toFixed(1)}km/h, Temp: ${mockTelemetryData.weather.tempPrognosis.toFixed(1)}°C`,
        batteryUsed: `${(100 - mockTelemetryData.battery.landingPercentage).toFixed(0)}%`
      },
      metrics
    };

    setResults(mockResults);
    setStage('results');
  };

  const getStatusIcon = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'fail': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass': return 'bg-green-50 border-l-4 border-l-green-500';
      case 'fail': return 'bg-red-50 border-l-4 border-l-red-500';
      case 'warning': return 'bg-yellow-50 border-l-4 border-l-yellow-500';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000 / 60; // minutes
    
    if (diff < 60) {
      return `${Math.round(diff)} minutes ago`;
    } else if (diff < 1440) {
      return `${Math.round(diff / 60)} hours ago`;
    }
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-8">
      {/* Header with close button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          </div>
          <div>
            <h2 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">Telemetry Data Analysis</h2>
            <p className="text-gray-500 dark:text-gray-300 text-sm mt-1">Analyzing flight data for {droneId}</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5 text-gray-400 dark:text-gray-200" />
          </button>
        )}
      </div>

      {/* File Selection/Confirmation Stage */}
      {(stage === 'selecting' || stage === 'confirming') && (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-600 rounded-lg p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <FileText className="w-5 h-5" />
              {stage === 'confirming' ? 'Confirm Telemetry File' : 'Select Telemetry File'}
            </h3>
            
            {stage === 'confirming' && (
              <div className="mb-4 p-3 bg-white dark:bg-gray-700 rounded border border-blue-300 dark:border-blue-600">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{selectedFile?.filename}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {selectedFile && formatTimestamp(selectedFile.timestamp)} • {selectedFile?.size}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => runAnalysis()}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Yes, Analyze This File
                    </Button>
                    <Button
                      onClick={() => setStage('selecting')}
                      variant="outline"
                    >
                      Select Different File
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {stage === 'selecting' && (
              <div className="space-y-2">
                {availableFiles.map(file => (
                  <div
                    key={file.id}
                    className={`p-3 rounded border cursor-pointer transition-colors ${
                      selectedFile?.id === file.id 
                        ? 'bg-blue-100 dark:bg-blue-900 border-blue-400 dark:border-blue-600' 
                        : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600'
                    }`}
                    onClick={() => setSelectedFile(file)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{file.filename}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {formatTimestamp(file.timestamp)} • {file.size}
                        </p>
                      </div>
                      {selectedFile?.id === file.id && (
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                  </div>
                ))}
                <div className="mt-4 flex gap-2">
                  <Button
                    onClick={() => runAnalysis()}
                    disabled={!selectedFile}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Analyze Selected File
                  </Button>
                  <Button variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh List
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analysis Progress */}
      {stage === 'analyzing' && (
        <div className="space-y-4">
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Analyzing Telemetry Data</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">Extracting and validating flight parameters...</p>
            
            <div className="w-full max-w-md mx-auto">
              <div className="bg-gray-200 dark:bg-gray-600 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${analysisProgress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{analysisProgress}% Complete</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Display */}
      {stage === 'results' && results && (
        <div>
          {/* Summary Stats */}
          <div className="flex gap-8 justify-center mb-8">
            <div className="text-center">
              <p className="text-4xl font-bold text-gray-900 dark:text-gray-100">{results.summary.totalChecks}</p>
              <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">Checks</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-green-500">{results.summary.passed}</p>
              <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">Passed</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-yellow-500">{results.summary.warnings}</p>
              <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">Warnings</p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-red-500">{results.summary.failed}</p>
              <p className="text-sm text-gray-500 dark:text-gray-300 mt-1">Failed</p>
            </div>
          </div>

          {/* Flight Mission Details */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-6 text-gray-900 dark:text-gray-100">Flight Mission Details</h3>
            <div className="grid grid-cols-4 gap-8">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-300 mb-1">Total Flight Time:</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{results.flightData.flightTime}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-300 mb-1">Max Altitude:</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{results.flightData.maxAltitude}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-300 mb-1">Delivery Time:</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{results.flightData.deliveryTime}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-300 mb-1">Battery Used:</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{results.flightData.batteryUsed}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-300 mb-1">Status:</p>
                <p className={`text-lg font-semibold ${
                  results.flightData.completionStatus === 'completed' ? 'text-green-500' : 
                  results.flightData.completionStatus === 'aborted' ? 'text-red-500' : 'text-yellow-500'
                }`}>
                  {results.flightData.completionStatus.charAt(0).toUpperCase() + results.flightData.completionStatus.slice(1)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-300 mb-1">Weather:</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{results.flightData.weatherConditions}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-300 mb-1">Total Distance:</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{results.flightData.totalDistance}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-300 mb-1">Abnormal Events:</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {results.flightData.abnormalEvents.length > 0 
                    ? results.flightData.abnormalEvents.join(', ') 
                    : 'None'}
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Analysis */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-6 text-gray-900 dark:text-gray-100">Detailed Analysis</h3>
            <div className="space-y-3">
              {results.metrics.map((metric, idx) => (
                <div 
                  key={idx}
                  className={`flex items-center justify-between p-4 rounded-lg ${getStatusColor(metric.status).replace('bg-green-50', 'bg-green-50 dark:bg-green-900').replace('bg-red-50', 'bg-red-50 dark:bg-red-900').replace('bg-yellow-50', 'bg-yellow-50 dark:bg-yellow-900')}`}
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(metric.status)}
                    <span className="font-medium text-gray-700 dark:text-gray-200">{metric.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                      {metric.value}
                    </span>
                    {metric.unit && (
                      <span className="ml-2 text-gray-500 dark:text-gray-300">
                        {metric.unit}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          {!viewOnly && (
            <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-600">
              <div>
                {results.summary.warnings > 0 && onRequestOnsite && (
                  <Button 
                    variant="outline"
                    onClick={() => onRequestOnsite?.(results)}
                    className="border-yellow-500 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900"
                  >
                    <Wrench className="w-4 h-4 mr-2" />
                    Request Onsite Inspection
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => onComplete(
                    results.summary.failed > 0 ? 'fail' : 
                    results.summary.warnings > 0 ? 'warning' : 'pass',
                    results
                  )}
                  className={
                    results.summary.failed > 0 
                      ? 'bg-red-600 hover:bg-red-700'
                      : results.summary.warnings > 0
                      ? 'bg-yellow-600 hover:bg-yellow-700'
                      : 'bg-green-600 hover:bg-green-700'
                  }
                >
                  {results.summary.failed > 0 
                    ? 'Continue with Issues'
                    : 'Continue to Next Step'}
                </Button>
              </div>
            </div>
          )}
          {viewOnly && (
            <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-600">
              <Button
                onClick={() => onClose?.()}
                variant="outline"
              >
                Close
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TelemetryAnalysis;