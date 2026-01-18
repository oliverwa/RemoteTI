export interface SampleTelemetryData {
  mission?: {
    alarmRecievedTimestamp?: string;
    telemetryStartedTimestamp?: string;
    pilotConnectedTimestamp?: string;
    missionApprovedTimestamp?: string;
    takeOffTimestamp?: string;
    moveOutOfHangarTimestamp?: string;
    ascendFromHangarTimestamp?: string;
    hangarExitCompleteTimestamp?: string;
    clearanceConfirmedTimestamp?: string;
    wpStartedTimestamp?: string;
    returnToSkybaseTimestamp?: string;
    atLastWPTimestamp?: string;
    totalFlightTime?: number;
    timeToWP?: number;
  };
  pilot?: {
    cameraSwitches?: Array<{
      timestamp: string;
      cameraName: string;
    }>;
    manualControl?: Array<{
      timestamp: string;
      action?: string;
    }>;
  };
  ipadInteractions?: Array<{
    timestamp: string;
    action?: string;
  }>;
  battery?: {
    takeOffPercentage?: number;
    takeOffVoltage?: number;
    wpOutStartPercentage?: number;
    wpOutStartVoltage?: number;
    wpHomeStartPercentage?: number;
    wpHomeStartVoltage?: number;
    landingPercentage?: number;
    landingVoltage?: number;
  };
  performance?: {
    averageCurrentWPOut?: number;
    averageCurrentWPHome?: number;
    thrustToHover?: number;
    avgVibX?: number;
    avgVibY?: number;
    avgVibZ?: number;
    maxVibX?: number;
    maxVibY?: number;
    maxVibZ?: number;
  };
  temperature?: {
    haloTakeOffTemp?: number;
    haloLandingTemp?: number;
    haloMaxTemp?: number;
    ftsTakeOffTemp?: number;
    ftsLandingTemp?: number;
    ftsMaxTemp?: number;
  };
  reception?: {
    sim1RssiAvg?: number;
    sim1Carrier?: string;
    sim2RssiAvg?: number;
    sim2Carrier?: string;
    sim3RssiAvg?: number;
    sim3Carrier?: string;
    sim4RssiAvg?: number;
    sim4Carrier?: string;
  };
  speeds?: {
    averageSpeed?: number;
    maxSpeed?: number;
  };
  routes?: {
    outDistance?: number;
    homeDistance?: number;
  };
  skybaseName?: string;
  droneName?: string;
  dashMetadata?: {
    date?: string;
    completionStatus?: 'normal' | 'abnormal' | 'aborted';
  };
  alarm?: {
    subtype?: string;
  };
}

const droneNames = ['Bender', 'Marvin', 'HAL', 'Optimus', 'Wall-E', 'R2D2'];
const skybaseNames = ['Sisjon', 'Rouen', 'Molndal', 'Stockholm', 'Oslo'];
const alarmTypes = ['Medical Emergency', 'Fire Alert', 'Security Breach', 'Equipment Delivery'];
const carriers = ['Telia', 'Telenor', 'Tele2', 'Three'];

function generateTimestamp(baseTime: Date, offsetMinutes: number, offsetSeconds: number = 0): string {
  const time = new Date(baseTime);
  time.setMinutes(time.getMinutes() + offsetMinutes);
  time.setSeconds(time.getSeconds() + offsetSeconds);
  
  const year = time.getFullYear();
  const month = (time.getMonth() + 1).toString().padStart(2, '0');
  const day = time.getDate().toString().padStart(2, '0');
  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const ms = Math.floor(Math.random() * 999).toString().padStart(3, '0');
  
  return `${year}${month}${day}_${hours}${minutes}${seconds}.${ms}`;
}

export function generateSampleTelemetry(scenario: 'normal' | 'warning' | 'critical' = 'normal'): SampleTelemetryData {
  const now = new Date();
  const baseTime = new Date(now.getTime() - Math.random() * 3600000); // Random time within last hour
  
  const droneName = droneNames[Math.floor(Math.random() * droneNames.length)];
  const skybaseName = skybaseNames[Math.floor(Math.random() * skybaseNames.length)];
  const alarmType = alarmTypes[Math.floor(Math.random() * alarmTypes.length)];
  
  // Generate mission timestamps
  const alarmTime = generateTimestamp(baseTime, 0);
  const telemetryStartTime = generateTimestamp(baseTime, 0, 5);
  const pilotConnectedTime = generateTimestamp(baseTime, 0, 15);
  const missionApprovedTime = generateTimestamp(baseTime, 0, 30);
  const takeoffTime = generateTimestamp(baseTime, 1, 0);
  const hangarExitTime = generateTimestamp(baseTime, 1, 30);
  const wpStartTime = generateTimestamp(baseTime, 2, 0);
  const lastWpTime = generateTimestamp(baseTime, 8, 0);
  const returnTime = generateTimestamp(baseTime, 10, 0);
  
  // Generate camera switches
  const cameraSwitches = [];
  const numSwitches = Math.floor(Math.random() * 5) + 2;
  for (let i = 0; i < numSwitches; i++) {
    cameraSwitches.push({
      timestamp: generateTimestamp(baseTime, 3 + i * 2),
      cameraName: Math.random() > 0.5 ? 'IR' : 'RGB'
    });
  }
  
  // Battery values based on scenario
  let batteryValues = {
    takeOffPercentage: 95 + Math.random() * 5,
    takeOffVoltage: 24.5 + Math.random() * 0.5,
    wpOutStartPercentage: 88 + Math.random() * 5,
    wpOutStartVoltage: 23.8 + Math.random() * 0.5,
    wpHomeStartPercentage: 65 + Math.random() * 10,
    wpHomeStartVoltage: 22.5 + Math.random() * 0.5,
    landingPercentage: 45 + Math.random() * 10,
    landingVoltage: 21.8 + Math.random() * 0.5
  };
  
  if (scenario === 'warning') {
    batteryValues.landingPercentage = 25 + Math.random() * 5;
    batteryValues.landingVoltage = 20.8 + Math.random() * 0.3;
  } else if (scenario === 'critical') {
    batteryValues.landingPercentage = 15 + Math.random() * 5;
    batteryValues.landingVoltage = 20.2 + Math.random() * 0.3;
  }
  
  // Performance values based on scenario
  let vibrationBase = scenario === 'normal' ? 3 : scenario === 'warning' ? 5 : 7;
  const performance = {
    averageCurrentWPOut: 85 + Math.random() * 20,
    averageCurrentWPHome: 90 + Math.random() * 20,
    thrustToHover: 0.65 + Math.random() * 0.15,
    avgVibX: vibrationBase + Math.random() * 2,
    avgVibY: vibrationBase + Math.random() * 2,
    avgVibZ: vibrationBase + Math.random() * 2,
    maxVibX: vibrationBase + 2 + Math.random() * 3,
    maxVibY: vibrationBase + 2 + Math.random() * 3,
    maxVibZ: vibrationBase + 2 + Math.random() * 3
  };
  
  // Temperature values based on scenario
  let tempBase = scenario === 'normal' ? 45 : scenario === 'warning' ? 60 : 70;
  const temperature = {
    haloTakeOffTemp: 25 + Math.random() * 5,
    haloLandingTemp: tempBase + Math.random() * 5,
    haloMaxTemp: tempBase + 5 + Math.random() * 5,
    ftsTakeOffTemp: 28 + Math.random() * 5,
    ftsLandingTemp: tempBase + 3 + Math.random() * 5,
    ftsMaxTemp: tempBase + 8 + Math.random() * 5
  };
  
  // Reception values
  const reception = {
    sim1RssiAvg: -35 - Math.random() * 15,
    sim1Carrier: carriers[0],
    sim2RssiAvg: -40 - Math.random() * 15,
    sim2Carrier: carriers[1],
    sim3RssiAvg: -45 - Math.random() * 15,
    sim3Carrier: carriers[2],
    sim4RssiAvg: -42 - Math.random() * 15,
    sim4Carrier: carriers[3]
  };
  
  // Calculate distances and speeds
  const outDistance = 2000 + Math.random() * 3000;
  const homeDistance = outDistance + Math.random() * 500;
  const totalDistance = outDistance + homeDistance;
  const flightTime = 480 + Math.random() * 240; // 8-12 minutes
  const avgSpeed = totalDistance / flightTime;
  
  return {
    mission: {
      alarmRecievedTimestamp: alarmTime,
      telemetryStartedTimestamp: telemetryStartTime,
      pilotConnectedTimestamp: pilotConnectedTime,
      missionApprovedTimestamp: missionApprovedTime,
      takeOffTimestamp: takeoffTime,
      moveOutOfHangarTimestamp: hangarExitTime,
      ascendFromHangarTimestamp: generateTimestamp(baseTime, 1, 40),
      hangarExitCompleteTimestamp: generateTimestamp(baseTime, 1, 50),
      clearanceConfirmedTimestamp: generateTimestamp(baseTime, 1, 55),
      wpStartedTimestamp: wpStartTime,
      atLastWPTimestamp: lastWpTime,
      returnToSkybaseTimestamp: returnTime,
      totalFlightTime: Math.floor(flightTime),
      timeToWP: 50 + Math.floor(Math.random() * 20)
    },
    pilot: {
      cameraSwitches,
      manualControl: scenario !== 'normal' ? [
        {
          timestamp: generateTimestamp(baseTime, 5),
          action: 'Manual override - obstacle avoidance'
        }
      ] : []
    },
    ipadInteractions: [],
    battery: batteryValues,
    performance,
    temperature,
    reception,
    speeds: {
      averageSpeed: avgSpeed,
      maxSpeed: avgSpeed * 1.5 + Math.random() * 5
    },
    routes: {
      outDistance,
      homeDistance
    },
    skybaseName,
    droneName,
    dashMetadata: {
      date: baseTime.toISOString().split('T')[0],
      completionStatus: scenario === 'critical' ? 'abnormal' : 'normal'
    },
    alarm: {
      subtype: alarmType
    }
  };
}

export function generateMultipleSampleFlights(count: number = 5): SampleTelemetryData[] {
  const flights: SampleTelemetryData[] = [];
  
  for (let i = 0; i < count; i++) {
    // Mix of scenarios: 60% normal, 30% warning, 10% critical
    const rand = Math.random();
    const scenario = rand < 0.6 ? 'normal' : rand < 0.9 ? 'warning' : 'critical';
    flights.push(generateSampleTelemetry(scenario));
  }
  
  return flights;
}