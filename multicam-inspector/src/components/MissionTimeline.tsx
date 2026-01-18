import React, { useState, useEffect } from 'react';
import { Plus, X, Clock, Check, Plane, Navigation, Home, AlertCircle, Shield, Radio } from 'lucide-react';
import { Button } from './ui/button';

interface TimelineEvent {
  id: string;
  timestamp: string; // Format: YYYYMMDD_HHMMSS.mmm
  label: string;
  type: 'takeoff' | 'landing' | 'waypoint' | 'alarm' | 'custom';
  position?: number; // Position on timeline (0-100%)
  icon?: React.ReactNode;
}

interface MissionTimelineProps {
  takeOffTimestamp: string;
  landedTimestamp: string;
  existingEvents?: TimelineEvent[];
  onEventsChange?: (events: TimelineEvent[]) => void;
  rawData?: any; // Raw telemetry data to extract timestamps from
}

const MissionTimeline: React.FC<MissionTimelineProps> = ({
  takeOffTimestamp,
  landedTimestamp,
  existingEvents = [],
  onEventsChange,
  rawData
}) => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventLabel, setNewEventLabel] = useState('');
  const [selectedEventType, setSelectedEventType] = useState<TimelineEvent['type']>('custom');

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

  // Get icon for event type
  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'takeoff':
        return <Plane className="w-4 h-4" />;
      case 'landing':
        return <Home className="w-4 h-4" />;
      case 'waypoint':
        return <Navigation className="w-4 h-4" />;
      case 'alarm':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  // Calculate flight duration in milliseconds
  const takeoffTime = parseTimestamp(takeOffTimestamp);
  const landingTime = parseTimestamp(landedTimestamp);
  const flightDuration = landingTime - takeoffTime;
  const flightDurationSeconds = flightDuration / 1000;

  // Initialize events from raw data
  useEffect(() => {
    const extractedEvents: TimelineEvent[] = [];
    
    // Always add takeoff and landing
    extractedEvents.push({
      id: 'takeoff',
      timestamp: takeOffTimestamp,
      label: 'Takeoff',
      type: 'takeoff',
      position: 0,
      icon: getEventIcon('takeoff')
    });

    extractedEvents.push({
      id: 'landing',
      timestamp: landedTimestamp,
      label: 'Landing',
      type: 'landing',
      position: 100,
      icon: getEventIcon('landing')
    });

    // Extract other timestamps from raw data if available
    if (rawData?.mission) {
      const mission = rawData.mission;
      
      // Common mission timestamps to look for
      const timestampFields = [
        { key: 'alarmRecievedTimestamp', label: 'Alarm Received', type: 'alarm' as const },
        { key: 'pilotConnectedTimestamp', label: 'Pilot Connected', type: 'custom' as const },
        { key: 'missionApprovedTimestamp', label: 'Mission Approved', type: 'custom' as const },
        { key: 'hangarExitCompleteTimestamp', label: 'Hangar Exit', type: 'custom' as const },
        { key: 'wpStartedTimestamp', label: 'Waypoint Start', type: 'waypoint' as const },
        { key: 'atAlarmLocationTimestamp', label: 'At Alarm Location', type: 'alarm' as const },
        { key: 'startingMissionProfilesTimestamp', label: 'Mission Start', type: 'alarm' as const },
        { key: 'missionProfileDoneTimestamp', label: 'Mission Complete', type: 'alarm' as const },
        { key: 'atLastWPTimestamp', label: 'Last Waypoint', type: 'waypoint' as const },
        { key: 'returnToSkybaseTimestamp', label: 'Return to Base', type: 'custom' as const },
        { key: 'missionAbortedTimestamp', label: 'Mission Aborted', type: 'alarm' as const }
      ];

      timestampFields.forEach(field => {
        if (mission[field.key]) {
          const eventTime = parseTimestamp(mission[field.key]);
          const position = ((eventTime - takeoffTime) / flightDuration) * 100;
          
          // Only add if within flight duration
          if (position >= 0 && position <= 100) {
            extractedEvents.push({
              id: field.key,
              timestamp: mission[field.key],
              label: field.label,
              type: field.type,
              position,
              icon: getEventIcon(field.type)
            });
          }
        }
      });
    }

    // Add iPad interactions for operator commands
    if (rawData?.ipadInteractions && Array.isArray(rawData.ipadInteractions)) {
      rawData.ipadInteractions.forEach((interaction: any, index: number) => {
        if (interaction.interactionType === 'operator_command' && interaction.timestamp) {
          const eventTime = parseTimestamp(interaction.timestamp);
          const position = ((eventTime - takeoffTime) / flightDuration) * 100;
          
          if (position >= 0 && position <= 100) {
            const command = interaction.details?.command || 'Command';
            const label = command === 'hold_position' ? 'Hold Position' :
                         command === 'circle_target' ? 'Circle Target' :
                         command === 'return_to_base' ? 'Return Command' :
                         `Operator: ${command}`;
                         
            extractedEvents.push({
              id: `ipad-${index}`,
              timestamp: interaction.timestamp,
              label: label,
              type: 'custom',
              position,
              icon: getEventIcon('custom')
            });
          }
        }
      });
    }

    // Sort by position
    extractedEvents.sort((a, b) => (a.position || 0) - (b.position || 0));
    
    setEvents(extractedEvents);
  }, [takeOffTimestamp, landedTimestamp, rawData]);

  // Add new event
  const handleAddEvent = () => {
    if (!newEventTime || !newEventLabel) return;

    // Parse the input time (MM:SS format)
    const [minutes, seconds] = newEventTime.split(':').map(Number);
    const totalSeconds = (minutes || 0) * 60 + (seconds || 0);
    
    if (totalSeconds < 0 || totalSeconds > flightDurationSeconds) {
      alert(`Time must be between 0:00 and ${formatTime(flightDurationSeconds)}`);
      return;
    }

    // Calculate position on timeline
    const position = (totalSeconds / flightDurationSeconds) * 100;
    
    // Create timestamp (approximate)
    const eventTime = new Date(takeoffTime + totalSeconds * 1000);
    const timestamp = `${eventTime.getFullYear()}${(eventTime.getMonth() + 1).toString().padStart(2, '0')}${eventTime.getDate().toString().padStart(2, '0')}_${eventTime.getHours().toString().padStart(2, '0')}${eventTime.getMinutes().toString().padStart(2, '0')}${eventTime.getSeconds().toString().padStart(2, '0')}.000`;

    const newEvent: TimelineEvent = {
      id: `custom-${Date.now()}`,
      timestamp,
      label: newEventLabel,
      type: selectedEventType,
      position,
      icon: getEventIcon(selectedEventType)
    };

    const updatedEvents = [...events, newEvent].sort((a, b) => (a.position || 0) - (b.position || 0));
    setEvents(updatedEvents);
    onEventsChange?.(updatedEvents);

    // Reset form
    setNewEventTime('');
    setNewEventLabel('');
    setShowAddEvent(false);
  };

  // Remove event
  const handleRemoveEvent = (eventId: string) => {
    // Don't allow removing takeoff/landing
    if (eventId === 'takeoff' || eventId === 'landing') return;
    
    const updatedEvents = events.filter(e => e.id !== eventId);
    setEvents(updatedEvents);
    onEventsChange?.(updatedEvents);
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Mission Timeline
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAddEvent(!showAddEvent)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Event
        </Button>
      </div>

      {/* Add Event Form */}
      {showAddEvent && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <label className="text-xs text-gray-600">Time (MM:SS)</label>
              <input
                type="text"
                placeholder="2:30"
                value={newEventTime}
                onChange={(e) => setNewEventTime(e.target.value)}
                className="w-full px-2 py-1 text-sm border rounded"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Label</label>
              <input
                type="text"
                placeholder="Event name"
                value={newEventLabel}
                onChange={(e) => setNewEventLabel(e.target.value)}
                className="w-full px-2 py-1 text-sm border rounded"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Type</label>
              <select
                value={selectedEventType}
                onChange={(e) => setSelectedEventType(e.target.value as TimelineEvent['type'])}
                className="w-full px-2 py-1 text-sm border rounded"
              >
                <option value="waypoint">Waypoint</option>
                <option value="alarm">Alarm</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddEvent}>
              <Check className="w-4 h-4 mr-1" />
              Add
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowAddEvent(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Time labels */}
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>0:00</span>
          <span>{formatTime(flightDurationSeconds / 2)}</span>
          <span>{formatTime(flightDurationSeconds)}</span>
        </div>

        {/* Timeline bar */}
        <div className="relative h-2 bg-gray-200 rounded-full mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-green-400 via-blue-400 to-red-400 rounded-full opacity-50"></div>
          
          {/* Event markers */}
          {events.map(event => (
            <div
              key={event.id}
              className="absolute top-1/2 transform -translate-y-1/2"
              style={{ left: `${event.position}%` }}
            >
              {/* Marker dot */}
              <div className={`w-4 h-4 rounded-full border-2 border-white shadow-md cursor-pointer transform -translate-x-1/2 ${
                event.type === 'takeoff' ? 'bg-green-500' :
                event.type === 'landing' ? 'bg-red-500' :
                event.type === 'waypoint' ? 'bg-blue-500' :
                event.type === 'alarm' ? 'bg-yellow-500' :
                'bg-purple-500'
              }`}>
                {/* Event popup */}
                <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg p-2 border min-w-[120px] opacity-0 hover:opacity-100 transition-opacity pointer-events-none hover:pointer-events-auto">
                  <div className="flex items-center gap-2 mb-1">
                    {event.icon}
                    <span className="font-medium text-sm">{event.label}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {(() => {
                      const eventTime = parseTimestamp(event.timestamp);
                      const secondsFromStart = (eventTime - takeoffTime) / 1000;
                      return formatTime(secondsFromStart);
                    })()}
                  </div>
                  {event.id !== 'takeoff' && event.id !== 'landing' && (
                    <button
                      onClick={() => handleRemoveEvent(event.id)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              
              {/* Event label below timeline */}
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 mt-2">
                <div className="text-xs text-gray-600 whitespace-nowrap">
                  {event.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Event List */}
      <div className="mt-8 space-y-1">
        <h4 className="text-sm font-medium text-gray-600 mb-2">Timeline Events</h4>
        {events.map(event => {
          const eventTime = parseTimestamp(event.timestamp);
          const secondsFromStart = (eventTime - takeoffTime) / 1000;
          
          return (
            <div key={event.id} className="flex items-center gap-3 text-sm p-2 hover:bg-gray-50 rounded">
              <span className="text-gray-500 font-mono w-12">
                {formatTime(secondsFromStart)}
              </span>
              {event.icon}
              <span className="flex-1">{event.label}</span>
              {event.id !== 'takeoff' && event.id !== 'landing' && (
                <button
                  onClick={() => handleRemoveEvent(event.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MissionTimeline;