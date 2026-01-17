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
      case 'pass': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'fail': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: 'pass' | 'fail' | 'warning') => {
    switch (status) {
      case 'pass': return 'text-green-600 bg-green-50 border-green-200';
      case 'fail': return 'text-red-600 bg-red-50 border-red-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
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
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto relative">
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Close"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      )}
      
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <BarChart className="w-6 h-6 text-blue-600" />
          Telemetry Data Analysis
        </h2>
        <p className="text-gray-600">Analyzing flight data for {droneId}</p>
      </div>

      {/* File Selection/Confirmation Stage */}
      {(stage === 'selecting' || stage === 'confirming') && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {stage === 'confirming' ? 'Confirm Telemetry File' : 'Select Telemetry File'}
            </h3>
            
            {stage === 'confirming' && (
              <div className="mb-4 p-3 bg-white rounded border border-blue-300">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{selectedFile?.filename}</p>
                    <p className="text-sm text-gray-600">
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
                        ? 'bg-blue-100 border-blue-400' 
                        : 'bg-white border-gray-300 hover:border-blue-300'
                    }`}
                    onClick={() => setSelectedFile(file)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{file.filename}</p>
                        <p className="text-sm text-gray-600">
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
            <h3 className="text-lg font-semibold mb-2">Analyzing Telemetry Data</h3>
            <p className="text-gray-600 mb-4">Extracting and validating flight parameters...</p>
            
            <div className="w-full max-w-md mx-auto">
              <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${analysisProgress}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-gray-600">{analysisProgress}% Complete</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Display */}
      {stage === 'results' && results && (
        <div className="space-y-6">
          {/* Compact Summary Cards */}
          <div className="flex gap-3 justify-center mb-4">
            <div className="bg-gray-50 rounded-lg px-4 py-2 text-center">
              <p className="text-lg font-bold">{results.summary.totalChecks}</p>
              <p className="text-xs text-gray-600">Checks</p>
            </div>
            <div className="bg-green-50 rounded-lg px-4 py-2 text-center">
              <p className="text-lg font-bold text-green-600">{results.summary.passed}</p>
              <p className="text-xs text-gray-600">Passed</p>
            </div>
            <div className="bg-yellow-50 rounded-lg px-4 py-2 text-center">
              <p className="text-lg font-bold text-yellow-600">{results.summary.warnings}</p>
              <p className="text-xs text-gray-600">Warnings</p>
            </div>
            <div className="bg-red-50 rounded-lg px-4 py-2 text-center">
              <p className="text-lg font-bold text-red-600">{results.summary.failed}</p>
              <p className="text-xs text-gray-600">Failed</p>
            </div>
          </div>

          {/* Enhanced Flight Data */}
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-semibold mb-3">Flight Mission Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Flight Time:</span>
                  <span className="font-medium text-sm">{results.flightData.flightTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Delivery Time:</span>
                  <span className="font-medium text-sm">{results.flightData.deliveryTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Status:</span>
                  <span className={`font-medium text-sm ${
                    results.flightData.completionStatus === 'completed' ? 'text-green-600' : 
                    results.flightData.completionStatus === 'aborted' ? 'text-red-600' : 'text-yellow-600'
                  }`}>
                    {results.flightData.completionStatus.charAt(0).toUpperCase() + results.flightData.completionStatus.slice(1)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Distance:</span>
                  <span className="font-medium text-sm">{results.flightData.totalDistance}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Max Altitude:</span>
                  <span className="font-medium text-sm">{results.flightData.maxAltitude}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Battery Used:</span>
                  <span className="font-medium text-sm">{results.flightData.batteryUsed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Weather:</span>
                  <span className="font-medium text-sm text-right">{results.flightData.weatherConditions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Abnormal Events:</span>
                  <span className="font-medium text-sm">
                    {results.flightData.abnormalEvents.length > 0 
                      ? results.flightData.abnormalEvents.join(', ') 
                      : 'None'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Metrics */}
          <div>
            <h4 className="font-semibold mb-3">Detailed Analysis</h4>
            <div className="space-y-2">
              {results.metrics.map((metric, idx) => (
                <div 
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-lg border ${getStatusColor(metric.status)}`}
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(metric.status)}
                    <span className="font-medium">{metric.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono">
                      {metric.value}{metric.unit && ` ${metric.unit}`}
                    </span>
                    {metric.limit && (
                      <span className="text-sm text-gray-500">
                        {metric.limit.min !== undefined && metric.limit.max !== undefined
                          ? `(${metric.limit.min} - ${metric.limit.max})`
                          : metric.limit.min !== undefined
                          ? `(min: ${metric.limit.min})`
                          : `(max: ${metric.limit.max})`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          {!viewOnly && (
            <div className="flex justify-between items-center pt-4 border-t">
              <div>
                {results.summary.warnings > 0 && onRequestOnsite && (
                  <Button 
                    variant="outline"
                    onClick={() => onRequestOnsite?.(results)}
                    className="border-yellow-500 text-yellow-600 hover:bg-yellow-50"
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
            <div className="flex justify-end pt-4 border-t">
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