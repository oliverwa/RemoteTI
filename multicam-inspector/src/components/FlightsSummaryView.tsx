import React from 'react';
import { Clock, Battery, MapPin, AlertCircle, TrendingUp, Award, AlertTriangle } from 'lucide-react';
import KPITimeline from './KPITimeline';

interface FlightData {
  id: string;
  fileName: string;
  droneName: string;
  date: string;
  alarmToTakeoffTime: number;
  awaitingClearanceTime: number;
  wpOutCalibratedTime: number;
  wpOutActualTime: number;
  aedDropTime: number;
  calibratedDeliveryTime: number;
  flightDuration: number;
  batteryUsed: number;
  alarmDistance: number;
  alarmType: string;
  completionStatus: string;
}

interface FlightsSummaryViewProps {
  flights: FlightData[];
  selectedFlight: string | null;
  onSelectFlight: (flightId: string) => void;
}

const FlightsSummaryView: React.FC<FlightsSummaryViewProps> = ({ 
  flights, 
  selectedFlight,
  onSelectFlight 
}) => {
  const GOAL_TIME = 150; // 2:30 in seconds
  
  // Sort flights chronologically (newest first)
  const sortedFlights = [...flights].sort((a, b) => {
    // Parse dates and sort in descending order (newest first)
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return dateB - dateA;
  });
  
  // Find the best performer (shortest calibrated delivery time)
  const bestPerformerId = flights.reduce((bestId, flight) => {
    if (!bestId) return flight.id;
    const bestFlight = flights.find(f => f.id === bestId);
    if (!bestFlight) return flight.id;
    if (flight.calibratedDeliveryTime > 0 && 
        (bestFlight.calibratedDeliveryTime === 0 || 
         flight.calibratedDeliveryTime < bestFlight.calibratedDeliveryTime)) {
      return flight.id;
    }
    return bestId;
  }, null as string | null);
  
  // Calculate statistics
  const stats = {
    totalFlights: flights.length,
    successfulFlights: flights.filter(f => 
      f.completionStatus === 'normal' || f.completionStatus === 'complete'
    ).length,
    withinGoal: flights.filter(f => 
      f.calibratedDeliveryTime > 0 && f.calibratedDeliveryTime <= GOAL_TIME
    ).length,
    avgDeliveryTime: flights.filter(f => f.calibratedDeliveryTime > 0).reduce((acc, f) => 
      acc + f.calibratedDeliveryTime, 0
    ) / flights.filter(f => f.calibratedDeliveryTime > 0).length || 0,
    avgBatteryUsed: flights.filter(f => f.batteryUsed > 0).reduce((acc, f) => 
      acc + f.batteryUsed, 0
    ) / flights.filter(f => f.batteryUsed > 0).length || 0,
    bestTime: Math.min(...flights.filter(f => f.calibratedDeliveryTime > 0)
      .map(f => f.calibratedDeliveryTime)) || 0
  };
  
  const formatTime = (seconds: number): string => {
    if (!seconds || seconds === 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const formatDistance = (meters: number): string => {
    if (!meters || meters === 0) return '-';
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };
  
  const getStatusColor = (status: string): string => {
    switch(status) {
      case 'normal':
      case 'complete':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'motbud':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'abnormal':
        return 'bg-red-100 text-red-700 border-red-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };
  
  if (flights.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No flights loaded yet. Upload JSON files to see the summary.</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
          <div className="text-xs text-blue-600 font-medium">Total Flights</div>
          <div className="text-2xl font-bold text-blue-900">{stats.totalFlights}</div>
        </div>
        
        <div className="bg-green-50 rounded-lg p-3 border border-green-200">
          <div className="text-xs text-green-600 font-medium">Successful</div>
          <div className="text-2xl font-bold text-green-900">
            {stats.successfulFlights}
            <span className="text-sm font-normal text-green-600 ml-1">
              ({Math.round(stats.successfulFlights / stats.totalFlights * 100)}%)
            </span>
          </div>
        </div>
        
        <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
          <div className="text-xs text-purple-600 font-medium">Within Goal</div>
          <div className="text-2xl font-bold text-purple-900">
            {stats.withinGoal}
            <span className="text-sm font-normal text-purple-600 ml-1">
              ({Math.round(stats.withinGoal / stats.totalFlights * 100)}%)
            </span>
          </div>
        </div>
        
        <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
          <div className="text-xs text-yellow-600 font-medium">Best Time</div>
          <div className="text-2xl font-bold text-yellow-900">
            {formatTime(stats.bestTime)}
          </div>
        </div>
        
        <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
          <div className="text-xs text-orange-600 font-medium">Avg Delivery</div>
          <div className="text-2xl font-bold text-orange-900">
            {formatTime(Math.round(stats.avgDeliveryTime))}
          </div>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
          <div className="text-xs text-gray-600 font-medium">Avg Battery</div>
          <div className="text-2xl font-bold text-gray-900">
            {Math.round(stats.avgBatteryUsed)}%
          </div>
        </div>
      </div>
      
      {/* Stacked Timeline Visualization */}
      <div className="bg-white rounded-lg border-2 border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Performance Comparison</h3>
        
        {/* Header with time scale */}
        <div className="relative mb-2">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>0:00</span>
            <span>1:15</span>
            <span>2:30</span>
            <span>3:45</span>
            <span>5:00</span>
          </div>
        </div>
        
        {/* Stacked timelines */}
        <div className="space-y-2 relative">
          {/* Goal line that spans all timelines */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-red-600 opacity-50 z-20"
            style={{ left: '50%' }}
            title="2:30 Goal"
          />
          
          {sortedFlights.map((flight, index) => (
            <div 
              key={flight.id}
              className={`relative group cursor-pointer transition-all ${
                selectedFlight === flight.id 
                  ? 'ring-2 ring-blue-500 rounded-lg' 
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => onSelectFlight(flight.id)}
            >
              {/* Flight info on the left */}
              <div className="flex items-center gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-[200px]">
                  {flight.id === bestPerformerId && (
                    <Award className="w-4 h-4 text-yellow-500" />
                  )}
                  <span className="text-xs font-semibold text-gray-700">
                    {flight.droneName}
                  </span>
                  <span className="text-xs text-gray-500">
                    {flight.date}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${getStatusColor(flight.completionStatus)}`}>
                    {flight.completionStatus}
                  </span>
                </div>
              </div>
              
              {/* Timeline */}
              <div className="pl-4">
                <KPITimeline
                  alarmToTakeoffTime={flight.alarmToTakeoffTime}
                  awaitingClearanceTime={flight.awaitingClearanceTime}
                  wpOutCalibratedTime={flight.wpOutCalibratedTime}
                  aedDropTime={flight.aedDropTime}
                />
              </div>
              
              {/* Additional metrics on hover */}
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-3 text-xs text-gray-600">
                  <div className="flex items-center gap-1">
                    <Battery className="w-3 h-3" />
                    {flight.batteryUsed}%
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {formatDistance(flight.alarmDistance)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(flight.flightDuration)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Legend */}
        <div className="mt-4 pt-3 border-t flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span>Alarm→Takeoff</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-yellow-500 rounded"></div>
              <span>Awaiting Clearance</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span>WP Out (2km)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-0.5 h-3 bg-red-600"></div>
              <span>2:30 Goal</span>
            </div>
            {flights.some(f => f.aedDropTime > 0) && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-purple-500 rounded"></div>
                <span>AED Drop</span>
              </div>
            )}
          </div>
          
          <div className="text-xs text-gray-500">
            Click any flight to view details
          </div>
        </div>
      </div>
      
      {/* Performance Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h4 className="font-semibold text-green-900">Best Performer</h4>
          </div>
          {bestPerformerId && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-green-800">
                {flights.find(f => f.id === bestPerformerId)?.droneName}
              </p>
              <p className="text-xs text-green-600">
                Delivery: {formatTime(flights.find(f => f.id === bestPerformerId)?.calibratedDeliveryTime || 0)}
                {(flights.find(f => f.id === bestPerformerId)?.calibratedDeliveryTime || 0) <= GOAL_TIME && ' ✓ Under Goal'}
              </p>
            </div>
          )}
        </div>
        
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <h4 className="font-semibold text-yellow-900">Needs Improvement</h4>
          </div>
          {flights.length > 1 && (() => {
            const worstPerformer = flights
              .filter(f => f.calibratedDeliveryTime > 0)
              .sort((a, b) => b.calibratedDeliveryTime - a.calibratedDeliveryTime)[0];
            return worstPerformer && worstPerformer.id !== bestPerformerId ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-yellow-800">
                  {worstPerformer.droneName}
                </p>
                <p className="text-xs text-yellow-600">
                  Delivery: {formatTime(worstPerformer.calibratedDeliveryTime)}
                  {worstPerformer.calibratedDeliveryTime > GOAL_TIME && 
                    ` (${formatTime(worstPerformer.calibratedDeliveryTime - GOAL_TIME)} over)`
                  }
                </p>
              </div>
            ) : null;
          })()}
        </div>
        
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <Battery className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-blue-900">Most Efficient</h4>
          </div>
          {flights.filter(f => f.batteryUsed > 0).sort((a, b) => a.batteryUsed - b.batteryUsed)[0] && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-800">
                {flights.filter(f => f.batteryUsed > 0).sort((a, b) => a.batteryUsed - b.batteryUsed)[0].droneName}
              </p>
              <p className="text-xs text-blue-600">
                Battery: {flights.filter(f => f.batteryUsed > 0).sort((a, b) => a.batteryUsed - b.batteryUsed)[0].batteryUsed}%
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FlightsSummaryView;