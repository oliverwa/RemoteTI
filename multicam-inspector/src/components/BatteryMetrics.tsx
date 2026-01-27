import React from 'react';
import { Battery, Zap, TrendingDown, Activity, MapPin, Clock, AlertCircle } from 'lucide-react';

interface BatteryMetricsProps {
  battery?: {
    takeOffPercentage?: number;
    takeOffVoltage?: number;
    wpOutStartPercentage?: number;
    wpOutStartVoltage?: number;
    wpOutEndPercentage?: number;
    wpOutEndVoltage?: number;
    missionProfileStartPercentage?: number;
    missionProfileStartVoltage?: number;
    missionProfileEndPercentage?: number;
    missionProfileEndVoltage?: number;
    wpHomeStartPercentage?: number;
    wpHomeStartVoltage?: number;
    wpHomeEndPercentage?: number;
    wpHomeEndVoltage?: number;
    landingPercentage?: number;
    landingVoltage?: number;
    // Legacy fields for backward compatibility
    startPercentage?: number;
    endPercentage?: number;
    totalConsumption?: number;
    averageVoltage?: number;
    minVoltage?: number;
    maxVoltage?: number;
  };
  flightDuration?: number; // in seconds
  totalDistance?: number; // in meters
  outDistance?: number; // in meters
  homeDistance?: number; // in meters
}

const BatteryMetrics: React.FC<BatteryMetricsProps> = ({ 
  battery, 
  flightDuration, 
  totalDistance,
  outDistance,
  homeDistance 
}) => {
  // Calculate comprehensive battery metrics
  const calculateMetrics = () => {
    if (!battery) return null;
    
    // Calculate total battery consumption
    let batteryUsed = 0;
    
    // Try different combinations to get battery consumption
    if (battery.totalConsumption) {
      batteryUsed = battery.totalConsumption;
    } else if (battery.takeOffPercentage && battery.landingPercentage) {
      batteryUsed = battery.takeOffPercentage - battery.landingPercentage;
    } else if (battery.wpOutStartPercentage && battery.wpHomeEndPercentage) {
      batteryUsed = battery.wpOutStartPercentage - battery.wpHomeEndPercentage;
    } else if (battery.startPercentage && battery.endPercentage) {
      batteryUsed = battery.startPercentage - battery.endPercentage;
    }
    
    if (batteryUsed <= 0) return null;
    
    // Validate we have required data for meaningful metrics
    if (!flightDuration || flightDuration <= 0 || !totalDistance || totalDistance <= 0) {
      console.warn('BatteryMetrics: Missing flight duration or distance data', {
        flightDuration,
        totalDistance
      });
    }
    
    const flightMinutes = (flightDuration || 0) / 60;
    const flightHours = flightMinutes / 60;
    const totalKm = (totalDistance || 0) / 1000;
    const outKm = (outDistance || 0) / 1000;
    const homeKm = (homeDistance || 0) / 1000;
    
    // Core metrics
    const consumptionPerMinute = flightMinutes > 0 ? batteryUsed / flightMinutes : 0;
    const consumptionPerKm = totalKm > 0 ? batteryUsed / totalKm : 0;
    
    // Efficiency metrics
    const kmPerPercent = batteryUsed > 0 ? totalKm / batteryUsed : 0;
    const minutesPerPercent = batteryUsed > 0 ? flightMinutes / batteryUsed : 0;
    
    // Projected metrics (based on current consumption rate from actual flight)
    // If the flight used X% battery for Y minutes, extrapolate to full battery usage
    const estimatedTotalFlightTime = batteryUsed > 0 ? (flightMinutes * 100) / batteryUsed : 0;
    const estimatedTotalRange = batteryUsed > 0 ? (totalKm * 100) / batteryUsed : 0;
    const remainingBattery = battery.landingPercentage || battery.wpHomeEndPercentage || battery.endPercentage || (100 - batteryUsed);
    const estimatedRemainingTime = consumptionPerMinute > 0 ? remainingBattery / consumptionPerMinute : 0;
    const estimatedRemainingRange = consumptionPerKm > 0 ? remainingBattery / consumptionPerKm : 0;
    
    // Segment analysis using actual waypoint data if available
    let outConsumption = 0;
    let homeConsumption = 0;
    
    if (battery.wpOutStartPercentage && battery.wpOutEndPercentage) {
      outConsumption = battery.wpOutStartPercentage - battery.wpOutEndPercentage;
    } else if (outKm > 0 && homeKm > 0) {
      outConsumption = batteryUsed * (outKm / totalKm);
    } else {
      outConsumption = batteryUsed / 2;
    }
    
    if (battery.wpHomeStartPercentage && battery.wpHomeEndPercentage) {
      homeConsumption = battery.wpHomeStartPercentage - battery.wpHomeEndPercentage;
    } else {
      homeConsumption = batteryUsed - outConsumption;
    }
    
    // Calculate waypoint-specific consumption rates
    const outConsumptionPerKm = outKm > 0 ? outConsumption / outKm : 0;
    const homeConsumptionPerKm = homeKm > 0 ? homeConsumption / homeKm : 0;
    
    // For time-based calculations, assume proportional time split based on distance
    const outMinutes = totalKm > 0 ? flightMinutes * (outKm / totalKm) : flightMinutes / 2;
    const homeMinutes = totalKm > 0 ? flightMinutes * (homeKm / totalKm) : flightMinutes / 2;
    const outConsumptionPerMinute = outMinutes > 0 ? outConsumption / outMinutes : 0;
    const homeConsumptionPerMinute = homeMinutes > 0 ? homeConsumption / homeMinutes : 0;
    
    return {
      batteryUsed,
      consumptionPerMinute,
      consumptionPerKm,
      kmPerPercent,
      minutesPerPercent,
      estimatedTotalFlightTime,
      estimatedTotalRange,
      estimatedRemainingTime,
      estimatedRemainingRange,
      remainingBattery,
      outConsumption,
      homeConsumption,
      outConsumptionPerKm,
      homeConsumptionPerKm,
      outConsumptionPerMinute,
      homeConsumptionPerMinute,
      voltageDrop: battery.maxVoltage && battery.minVoltage ? 
        battery.maxVoltage - battery.minVoltage : 
        (battery.takeOffVoltage && battery.landingVoltage ? 
         battery.takeOffVoltage - battery.landingVoltage : 0)
    };
  };

  const metrics = calculateMetrics();

  if (!metrics) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Battery className="h-5 w-5 text-gray-400" />
          <h3 className="font-medium text-gray-900">Battery Metrics</h3>
        </div>
        <p className="text-sm text-gray-500">No battery data available</p>
      </div>
    );
  }

  // Determine battery health status
  const getHealthStatus = () => {
    if (metrics.consumptionPerKm > 3) return { color: 'red', text: 'Poor Efficiency' };
    if (metrics.consumptionPerKm > 2) return { color: 'yellow', text: 'Moderate Efficiency' };
    return { color: 'green', text: 'Good Efficiency' };
  };

  const healthStatus = getHealthStatus();

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Battery className="h-5 w-5 text-green-600" />
          <h3 className="font-medium text-gray-900">Battery Analytics</h3>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          healthStatus.color === 'green' ? 'bg-green-100 text-green-700' :
          healthStatus.color === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {healthStatus.text}
        </span>
      </div>

      <div className="space-y-4">
        {/* Primary Consumption Metrics */}
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 border border-green-200">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Consumption Rates</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <Clock className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-[10px] font-medium text-gray-600">Per Minute</span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {metrics.consumptionPerMinute.toFixed(2)}%
              </p>
              <p className="text-[9px] text-gray-500 mt-1">
                ~{metrics.estimatedTotalFlightTime.toFixed(0)} min max flight
              </p>
            </div>
            
            <div className="bg-white rounded-lg p-3">
              <div className="flex items-center gap-1 mb-1">
                <MapPin className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-[10px] font-medium text-gray-600">Per Kilometer</span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {metrics.consumptionPerKm.toFixed(2)}%
              </p>
              <p className="text-[9px] text-gray-500 mt-1">
                ~{metrics.estimatedTotalRange.toFixed(1)} km range
              </p>
            </div>
          </div>
        </div>

        {/* Efficiency Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-medium text-gray-700">Flight Efficiency</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-600">Range per %</span>
                <span className="text-sm font-bold text-gray-900">
                  {metrics.kmPerPercent.toFixed(3)} km
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-600">Time per %</span>
                <span className="text-sm font-bold text-gray-900">
                  {metrics.minutesPerPercent.toFixed(2)} min
                </span>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium text-gray-700">Battery Status</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-600">Total Used</span>
                <span className="text-sm font-bold text-gray-900">
                  {metrics.batteryUsed.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-600">Remaining</span>
                <span className={`text-sm font-bold ${
                  metrics.remainingBattery > 30 ? 'text-green-600' :
                  metrics.remainingBattery > 15 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {metrics.remainingBattery.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Segment Analysis */}
        {outDistance && homeDistance && (
          <div className="border-t pt-3">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Waypoint Segment Analysis</h4>
            <div className="space-y-3">
              {/* Outbound Segment */}
              <div className="bg-blue-50 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-blue-800">Outbound</span>
                  <span className="text-sm font-bold text-blue-900">
                    {metrics.outConsumption.toFixed(1)}% total
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded p-1.5">
                    <span className="text-[10px] text-gray-600 block">Per km</span>
                    <span className="text-xs font-bold text-gray-900">
                      {metrics.outConsumptionPerKm.toFixed(2)}%
                    </span>
                  </div>
                  <div className="bg-white rounded p-1.5">
                    <span className="text-[10px] text-gray-600 block">Per minute</span>
                    <span className="text-xs font-bold text-gray-900">
                      {metrics.outConsumptionPerMinute.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
              {/* Return Segment */}
              <div className="bg-green-50 rounded-lg p-2.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-green-800">Return</span>
                  <span className="text-sm font-bold text-green-900">
                    {metrics.homeConsumption.toFixed(1)}% total
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white rounded p-1.5">
                    <span className="text-[10px] text-gray-600 block">Per km</span>
                    <span className="text-xs font-bold text-gray-900">
                      {metrics.homeConsumptionPerKm.toFixed(2)}%
                    </span>
                  </div>
                  <div className="bg-white rounded p-1.5">
                    <span className="text-[10px] text-gray-600 block">Per minute</span>
                    <span className="text-xs font-bold text-gray-900">
                      {metrics.homeConsumptionPerMinute.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Voltage Information */}
        {battery?.averageVoltage && (
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">Voltage Stats</span>
              <div className="flex gap-3 text-xs">
                <span>
                  Avg: <strong className="text-gray-900">{battery.averageVoltage.toFixed(1)}V</strong>
                </span>
                {battery?.minVoltage && (
                  <span>
                    Min: <strong className="text-gray-900">{battery.minVoltage.toFixed(1)}V</strong>
                  </span>
                )}
                {metrics.voltageDrop > 0 && (
                  <span>
                    Drop: <strong className="text-orange-600">{metrics.voltageDrop.toFixed(1)}V</strong>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Remaining Estimates */}
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
          <div className="flex items-center gap-1.5 mb-2">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-medium text-blue-800">Remaining Estimates</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-blue-700">Flight Time:</span>
              <strong className="text-blue-900 ml-1">
                {metrics.estimatedRemainingTime.toFixed(0)} min
              </strong>
            </div>
            <div>
              <span className="text-blue-700">Range:</span>
              <strong className="text-blue-900 ml-1">
                {metrics.estimatedRemainingRange.toFixed(1)} km
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatteryMetrics;