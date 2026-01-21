import React from 'react';
import { Clock, Zap, Pause, Activity, Target } from 'lucide-react';

interface KPITimelineProps {
  alarmToTakeoffTime: number; // in seconds
  awaitingClearanceTime: number; // in seconds
  wpOutCalibratedTime: number; // in seconds
  aedDropTime?: number; // in seconds (optional - only for OHCA)
}

const KPITimeline: React.FC<KPITimelineProps> = ({
  alarmToTakeoffTime,
  awaitingClearanceTime,
  wpOutCalibratedTime,
  aedDropTime = 0
}) => {
  const TIMELINE_DURATION = 300; // 5 minutes in seconds
  const GOAL_TIME = 150; // 2:30 in seconds
  
  // Ensure we have valid numbers
  const alarm = alarmToTakeoffTime || 0;
  const awaiting = awaitingClearanceTime || 0;
  const wpOut = wpOutCalibratedTime || 0;
  const aed = aedDropTime || 0;
  
  // Skip rendering if no data
  if (alarm === 0 && awaiting === 0 && wpOut === 0 && aed === 0) {
    return null;
  }
  
  // Calculate percentages
  const alarmToTakeoffPercent = (alarm / TIMELINE_DURATION) * 100;
  const awaitingClearancePercent = (awaiting / TIMELINE_DURATION) * 100;
  const wpOutPercent = (wpOut / TIMELINE_DURATION) * 100;
  const aedDropPercent = (aed / TIMELINE_DURATION) * 100;
  const goalPercent = (GOAL_TIME / TIMELINE_DURATION) * 100;
  
  // Calculate cumulative percentages for positioning
  const awaitingClearanceStart = alarmToTakeoffPercent;
  const wpOutStart = alarmToTakeoffPercent + awaitingClearancePercent;
  const aedDropStart = alarmToTakeoffPercent + awaitingClearancePercent + wpOutPercent;
  const totalPercent = alarmToTakeoffPercent + awaitingClearancePercent + wpOutPercent + aedDropPercent;
  
  // Format time for display
  const formatTime = (seconds: number): string => {
    if (!seconds || seconds === 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Calculate total time (including AED drop if present)
  const totalTime = alarm + awaiting + wpOut + aed;
  
  return (
    <div className="relative">
      {/* Timeline bar */}
      <div className="relative h-6 bg-gray-100 rounded overflow-hidden border border-gray-300">
          
        {/* Phase 1: Alarm to Takeoff */}
        {alarm > 0 && (
          <div
            className="absolute top-0 left-0 h-full bg-blue-500"
            style={{ width: `${Math.min(alarmToTakeoffPercent, 100)}%` }}
            title={`Alarm to Takeoff: ${formatTime(alarm)}`}
          />
        )}
          
        {/* Phase 2: Awaiting Clearance */}
        {awaiting > 0 && (
          <div
            className="absolute top-0 h-full bg-yellow-500"
            style={{ 
              left: `${Math.min(awaitingClearanceStart, 100)}%`,
              width: `${Math.min(awaitingClearancePercent, Math.max(0, 100 - awaitingClearanceStart))}%` 
            }}
            title={`Awaiting Clearance: ${formatTime(awaiting)}`}
          />
        )}
          
        {/* Phase 3: WP Out Time */}
        {wpOut > 0 && (
          <div
            className="absolute top-0 h-full bg-green-500"
            style={{ 
              left: `${Math.min(wpOutStart, 100)}%`,
              width: `${Math.min(wpOutPercent, Math.max(0, 100 - wpOutStart))}%` 
            }}
            title={`WP Out Time (2km): ${formatTime(wpOut)}`}
          />
        )}
        
        {/* Phase 4: AED Drop Time (OHCA only) */}
        {aed > 0 && (
          <div
            className="absolute top-0 h-full bg-purple-500"
            style={{ 
              left: `${Math.min(aedDropStart, 100)}%`,
              width: `${Math.min(aedDropPercent, Math.max(0, 100 - aedDropStart))}%` 
            }}
            title={`AED Drop Time: ${formatTime(aed)}`}
          />
        )}
          
        {/* Goal line at 2:30 */}
        <div
          className="absolute top-0 h-full w-0.5 bg-red-600 shadow-lg z-10"
          style={{ left: `${goalPercent}%` }}
          title="Goal: 2:30"
        />
      </div>
      
      {/* Time markers and total on the right */}
      <div className="absolute -right-1 top-0 h-full flex items-center">
        <div className="text-xs text-gray-600 ml-2">
          <span className={totalTime <= GOAL_TIME ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
            {formatTime(totalTime)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default KPITimeline;