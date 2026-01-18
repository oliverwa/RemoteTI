import React from 'react';
import { Clock, Camera, Tablet, Navigation } from 'lucide-react';

interface TimelineEvent {
  timestamp: string;
  label: string;
  position: number; // 0-100%
  color?: string;
}

interface MultipleTimelinesProps {
  takeOffTimestamp: string;
  landedTimestamp: string;
  rawData?: any;
}

const MultipleTimelines: React.FC<MultipleTimelinesProps> = ({
  takeOffTimestamp,
  landedTimestamp,
  rawData
}) => {
  // Parse timestamp to get seconds from start
  const parseTimestamp = (ts: string): number => {
    if (!ts) return 0;
    const [datePart, timePart] = ts.split('_');
    if (!datePart || !timePart) return 0;
    
    const year = parseInt(datePart.substring(0, 4));
    const month = parseInt(datePart.substring(4, 6)) - 1;
    const day = parseInt(datePart.substring(6, 8));
    
    const [time, ms] = timePart.split('.');
    const hours = parseInt(time.substring(0, 2));
    const minutes = parseInt(time.substring(2, 4));
    const seconds = parseInt(time.substring(4, 6));
    const milliseconds = parseInt(ms || '0');
    
    return new Date(year, month, day, hours, minutes, seconds, milliseconds).getTime();
  };

  // Format seconds to MM:SS
  const formatTime = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const takeoffTime = parseTimestamp(takeOffTimestamp);
  const landingTime = parseTimestamp(landedTimestamp);
  const flightDuration = landingTime - takeoffTime;
  const flightDurationSeconds = flightDuration / 1000;

  // Build mission events timeline
  const buildMissionTimeline = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [];
    
    // Add takeoff and landing
    events.push({
      timestamp: takeOffTimestamp,
      label: 'Takeoff',
      position: 0,
      color: 'bg-green-500'
    });
    
    events.push({
      timestamp: landedTimestamp,
      label: 'Landing',
      position: 100,
      color: 'bg-red-500'
    });

    if (rawData?.mission) {
      const mission = rawData.mission;
      
      const missionEvents = [
        { key: 'alarmRecievedTimestamp', label: 'Alarm Received', color: 'bg-yellow-500' },
        { key: 'missionApprovedTimestamp', label: 'Mission Approved', color: 'bg-blue-500' },
        { key: 'wpStartedTimestamp', label: 'Waypoint Start', color: 'bg-blue-500' },
        { key: 'atAlarmLocationTimestamp', label: 'At Alarm Location', color: 'bg-yellow-500' },
        { key: 'startingMissionProfilesTimestamp', label: 'Mission Start', color: 'bg-orange-500' },
        { key: 'missionProfileDoneTimestamp', label: 'Mission Complete', color: 'bg-orange-500' },
        { key: 'returnToSkybaseTimestamp', label: 'Return to Base', color: 'bg-purple-500' },
        { key: 'missionAbortedTimestamp', label: 'Mission Aborted', color: 'bg-red-600' }
      ];

      missionEvents.forEach(event => {
        if (mission[event.key]) {
          const eventTime = parseTimestamp(mission[event.key]);
          const position = ((eventTime - takeoffTime) / flightDuration) * 100;
          
          if (position >= 0 && position <= 100) {
            events.push({
              timestamp: mission[event.key],
              label: event.label,
              position,
              color: event.color
            });
          }
        }
      });
    }

    return events.sort((a, b) => a.position - b.position);
  };

  // Build camera switches timeline
  const buildCameraTimeline = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [];
    
    if (rawData?.pilot?.cameraSwitches && Array.isArray(rawData.pilot.cameraSwitches)) {
      rawData.pilot.cameraSwitches.forEach((sw: any, index: number) => {
        if (sw.timestamp) {
          const eventTime = parseTimestamp(sw.timestamp);
          const position = ((eventTime - takeoffTime) / flightDuration) * 100;
          
          if (position >= 0 && position <= 100) {
            const cameraName = sw.cameraName || 'Unknown';
            events.push({
              timestamp: sw.timestamp,
              label: `Camera: ${cameraName}`,
              position,
              color: cameraName === 'IR' ? 'bg-red-400' : 
                     cameraName === 'DOWN' ? 'bg-blue-400' : 
                     cameraName === 'FRONT' ? 'bg-green-400' : 'bg-gray-400'
            });
          }
        }
      });
    }

    return events.sort((a, b) => a.position - b.position);
  };

  // Build iPad interactions timeline
  const buildIPadTimeline = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [];
    
    if (rawData?.ipadInteractions && Array.isArray(rawData.ipadInteractions)) {
      rawData.ipadInteractions.forEach((interaction: any, index: number) => {
        if (interaction.timestamp) {
          const eventTime = parseTimestamp(interaction.timestamp);
          const position = ((eventTime - takeoffTime) / flightDuration) * 100;
          
          if (position >= 0 && position <= 100) {
            let label = '';
            let color = 'bg-purple-400';
            
            if (interaction.interactionType === 'operator_command') {
              const command = interaction.details?.command || 'command';
              label = command === 'hold_position' ? 'Hold Position' :
                     command === 'circle_target' ? 'Circle Target' :
                     command === 'return_to_base' ? 'Return Command' :
                     `Command: ${command}`;
              color = 'bg-indigo-500';
            } else if (interaction.interactionType === '/camera/adjustposition') {
              label = 'Camera Adjust';
              color = 'bg-cyan-500';
            } else if (interaction.interactionType === '/camera/imagetype') {
              const type = interaction.details?.type || 'unknown';
              label = `Image: ${type}`;
              color = 'bg-teal-500';
            } else {
              label = interaction.interactionType || 'iPad Action';
            }
            
            events.push({
              timestamp: interaction.timestamp,
              label,
              position,
              color
            });
          }
        }
      });
    }

    return events.sort((a, b) => a.position - b.position);
  };

  const missionEvents = buildMissionTimeline();
  const cameraEvents = buildCameraTimeline();
  const ipadEvents = buildIPadTimeline();

  // Render a single timeline
  const renderTimeline = (
    title: string,
    icon: React.ReactNode,
    events: TimelineEvent[],
    barColor: string
  ) => (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="font-medium text-sm text-gray-700">{title}</h4>
        <span className="text-xs text-gray-500">({events.length} events)</span>
      </div>

      {/* Time labels */}
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>0:00</span>
        <span>{formatTime(flightDurationSeconds / 2)}</span>
        <span>{formatTime(flightDurationSeconds)}</span>
      </div>

      {/* Timeline bar */}
      <div className="relative h-3 bg-gray-200 rounded-full mb-6">
        <div className={`absolute inset-0 ${barColor} rounded-full opacity-20`}></div>
        
        {/* Event markers */}
        {events.map((event, index) => (
          <div
            key={`${event.timestamp}-${index}`}
            className="absolute top-1/2 transform -translate-y-1/2"
            style={{ left: `${event.position}%` }}
          >
            <div className={`w-3 h-3 rounded-full border-2 border-white shadow-md cursor-pointer transform -translate-x-1/2 ${event.color}`}>
              {/* Event tooltip */}
              <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg p-2 border min-w-[100px] opacity-0 hover:opacity-100 transition-opacity pointer-events-none hover:pointer-events-auto z-10 whitespace-nowrap">
                <div className="font-medium text-xs">{event.label}</div>
                <div className="text-xs text-gray-500">
                  {formatTime((parseTimestamp(event.timestamp) - takeoffTime) / 1000)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Event list (compact) */}
      {events.length > 0 && (
        <div className="grid grid-cols-3 gap-1 text-xs max-h-20 overflow-y-auto">
          {events.map((event, index) => (
            <div key={`list-${event.timestamp}-${index}`} className="flex items-center gap-1 text-gray-600">
              <span className="font-mono text-gray-400">
                {formatTime((parseTimestamp(event.timestamp) - takeoffTime) / 1000)}
              </span>
              <span className="truncate">{event.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Flight Timelines
        </h3>
        <span className="text-sm text-gray-500">
          Duration: {formatTime(flightDurationSeconds)}
        </span>
      </div>

      {/* Mission Timeline */}
      {renderTimeline(
        'Mission Events',
        <Navigation className="w-4 h-4 text-blue-600" />,
        missionEvents,
        'bg-blue-500'
      )}

      {/* Camera Switches Timeline */}
      {cameraEvents.length > 0 && renderTimeline(
        'Camera Switches',
        <Camera className="w-4 h-4 text-green-600" />,
        cameraEvents,
        'bg-green-500'
      )}

      {/* iPad Interactions Timeline */}
      {ipadEvents.length > 0 && renderTimeline(
        'iPad Interactions',
        <Tablet className="w-4 h-4 text-purple-600" />,
        ipadEvents,
        'bg-purple-500'
      )}
    </div>
  );
};

export default MultipleTimelines;