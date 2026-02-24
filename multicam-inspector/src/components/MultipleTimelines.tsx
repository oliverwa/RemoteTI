import React from 'react';
import { Clock, Camera, Tablet, Navigation, User, AlertTriangle, Terminal } from 'lucide-react';

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
      
      // Get ALL timestamp fields from mission object dynamically
      const allMissionTimestamps: Array<{key: string, label: string, color: string}> = [];
      
      Object.keys(mission).forEach(key => {
        if (key.toLowerCase().includes('timestamp') && typeof mission[key] === 'string') {
          // Format the key into a readable label
          const label = key
            .replace(/Timestamp$/i, '')
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
          
          // Assign colors based on event type
          let color = 'bg-gray-500';
          if (key.includes('alarm') || key.includes('Alarm')) color = 'bg-yellow-500';
          else if (key.includes('takeOff') || key.includes('TakeOff')) color = 'bg-green-500';
          else if (key.includes('land') || key.includes('Land')) color = 'bg-red-500';
          else if (key.includes('abort') || key.includes('Abort')) color = 'bg-red-600';
          else if (key.includes('clearance') || key.includes('Clearance')) color = 'bg-cyan-500';
          else if (key.includes('hangar') || key.includes('Hangar')) color = 'bg-indigo-500';
          else if (key.includes('wp') || key.includes('WP') || key.includes('waypoint')) color = 'bg-blue-500';
          else if (key.includes('return') || key.includes('Return')) color = 'bg-purple-500';
          else if (key.includes('mission') || key.includes('Mission')) color = 'bg-orange-500';
          else if (key.includes('pilot') || key.includes('Pilot')) color = 'bg-teal-500';
          else if (key.includes('telemetry') || key.includes('Telemetry')) color = 'bg-gray-400';
          
          allMissionTimestamps.push({ key, label, color });
        }
      });
      
      const missionEvents = allMissionTimestamps;

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

  // Build pilot timeline (camera switches and manual control)
  const buildPilotTimeline = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [];
    
    // Add camera switches
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
              color: cameraName === 'IR' ? 'bg-red-500' : 
                     cameraName === 'DOWN' ? 'bg-blue-500' : 
                     cameraName === 'FRONT' ? 'bg-emerald-500' : 
                     cameraName === 'COLOR' ? 'bg-amber-500' : 'bg-gray-500'
            });
          }
        }
      });
    }
    
    // Add manual control events
    if (rawData?.pilot?.manualControl && Array.isArray(rawData.pilot.manualControl)) {
      rawData.pilot.manualControl.forEach((control: any, index: number) => {
        if (control.timestamp) {
          const eventTime = parseTimestamp(control.timestamp);
          const position = ((eventTime - takeoffTime) / flightDuration) * 100;
          
          if (position >= 0 && position <= 100) {
            const reason = control.reason || 'Unknown';
            const label = reason === 'operator_requested' ? 'Manual Control: Operator Request' :
                         reason === 'emergency' ? 'Manual Control: Emergency' :
                         reason === 'safety' ? 'Manual Control: Safety' :
                         `Manual Control: ${reason}`;
            events.push({
              timestamp: control.timestamp,
              label,
              position,
              color: 'bg-purple-600' // Purple for manual control events
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

  // Build console messages timeline
  const buildConsoleTimeline = (): TimelineEvent[] => {
    const events: TimelineEvent[] = [];
    
    if (rawData?.consoleMessages && Array.isArray(rawData.consoleMessages)) {
      rawData.consoleMessages.forEach((msg: any, index: number) => {
        if (msg.timestamp) {
          const eventTime = parseTimestamp(msg.timestamp);
          const position = ((eventTime - takeoffTime) / flightDuration) * 100;
          
          if (position >= 0 && position <= 100) {
            const level = msg.level || 'INFO';
            const message = msg.message || 'Console message';
            
            // Truncate long messages for label, full message in tooltip
            const truncatedMessage = message.length > 30 
              ? message.substring(0, 30).replace(/\n/g, ' ') + '...' 
              : message.replace(/\n/g, ' ');
            
            events.push({
              timestamp: msg.timestamp,
              label: truncatedMessage,
              position,
              color: level === 'SEVERE' ? 'bg-red-600' : 
                     level === 'WARNING' ? 'bg-yellow-500' : 
                     level === 'ERROR' ? 'bg-orange-600' :
                     'bg-gray-500'
            });
          }
        }
      });
    }

    return events.sort((a, b) => a.position - b.position);
  };

  const missionEvents = buildMissionTimeline();
  const pilotEvents = buildPilotTimeline();
  const ipadEvents = buildIPadTimeline();
  const consoleEvents = buildConsoleTimeline();

  // Render a single timeline
  const renderTimeline = (
    title: string,
    icon: React.ReactNode,
    events: TimelineEvent[],
    barColor: string,
    showLegend: boolean = false
  ) => (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">{title}</h4>
          <span className="text-xs text-gray-400 dark:text-gray-500">({events.length} events)</span>
        </div>
        {/* Time labels */}
        <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500">
          <span>0:00</span>
          <span>{formatTime(flightDurationSeconds / 2)}</span>
          <span>{formatTime(flightDurationSeconds)}</span>
        </div>
      </div>

      {/* Timeline bar */}
      <div className="relative h-2 bg-gray-100 dark:bg-gray-600 rounded-full">
        <div className={`absolute inset-0 ${barColor} rounded-full opacity-10`}></div>
        
        {/* Event markers */}
        {events.map((event, index) => {
          const eventTime = (parseTimestamp(event.timestamp) - takeoffTime) / 1000;
          const timeStr = formatTime(eventTime);
          
          return (
            <div
              key={`${event.timestamp}-${index}`}
              className="absolute top-1/2 transform -translate-y-1/2 group"
              style={{ left: `${event.position}%` }}
            >
              {/* Marker dot with better hover */}
              <div className={`w-3 h-3 rounded-full border-2 border-white shadow-sm cursor-pointer transform -translate-x-1/2 transition-all group-hover:scale-150 group-hover:z-20 ${event.color}`}>
                {/* Compact tooltip */}
                <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 bg-gray-900 dark:bg-gray-800 text-white dark:text-gray-200 rounded px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none shadow-lg text-2xs" style={{ zIndex: 9999, minWidth: 'max-content' }}>
                  <div className="font-medium whitespace-nowrap">{event.label}</div>
                  <div className="text-gray-400 dark:text-gray-500 text-3xs whitespace-nowrap">{timeStr}</div>
                  {/* Small arrow */}
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
                    <div className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[3px] border-t-gray-900 dark:border-t-gray-800"></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <Clock className="w-4 h-4" />
          Flight Timelines
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Duration: {formatTime(flightDurationSeconds)}
        </span>
      </div>

      <div className="space-y-3 bg-white dark:bg-gray-700 rounded-lg p-3">
        {/* Mission Timeline */}
        {renderTimeline(
          'Mission Events',
          <Navigation className="w-3 h-3 text-blue-600" />,
          missionEvents,
          'bg-blue-500'
        )}

        {/* Pilot Timeline (Camera Switches and Manual Control) */}
        {pilotEvents.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
            {renderTimeline(
              'Pilot Timeline',
              <User className="w-3 h-3 text-purple-600" />,
              pilotEvents,
              'bg-purple-500',
              true // Show legend for pilot timeline
            )}
            {/* Legend for Pilot Timeline */}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-700 dark:text-gray-300">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-purple-600 border border-gray-300 dark:border-gray-600"></div>
                <span className="font-medium">Manual Control</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-amber-500 border border-gray-300 dark:border-gray-600"></div>
                <span className="font-medium">COLOR Camera</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500 border border-gray-300 dark:border-gray-600"></div>
                <span className="font-medium">IR Camera</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-blue-500 border border-gray-300 dark:border-gray-600"></div>
                <span className="font-medium">DOWN Camera</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-emerald-500 border border-gray-300 dark:border-gray-600"></div>
                <span className="font-medium">FRONT Camera</span>
              </div>
            </div>
          </div>
        )}

        {/* iPad Interactions Timeline */}
        {ipadEvents.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
            {renderTimeline(
              'iPad Interactions',
              <Tablet className="w-3 h-3 text-purple-600" />,
              ipadEvents,
              'bg-purple-500'
            )}
          </div>
        )}
        
        {/* Console Messages Timeline */}
        {consoleEvents.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-600 pt-3">
            {renderTimeline(
              'Console Messages',
              <Terminal className="w-3 h-3 text-gray-600" />,
              consoleEvents,
              'bg-gray-500',
              true // Show legend
            )}
            {/* Legend for Console Messages */}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-700 dark:text-gray-300">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-yellow-500 border border-gray-300 dark:border-gray-600"></div>
                <span className="font-medium">WARNING</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-600 border border-gray-300 dark:border-gray-600"></div>
                <span className="font-medium">SEVERE</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-orange-600 border border-gray-300 dark:border-gray-600"></div>
                <span className="font-medium">ERROR</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Hover for full message
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultipleTimelines;