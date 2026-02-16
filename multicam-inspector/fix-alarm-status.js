#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Path to the alarm file
const alarmFile = path.join(__dirname, 'data/sessions/alarms/alarm_hangar_forsaker_vpn_260212_132420.json');

if (fs.existsSync(alarmFile)) {
  const alarm = JSON.parse(fs.readFileSync(alarmFile, 'utf8'));
  
  // Mark the alarm as completed
  alarm.status = 'completed';
  alarm.completedAt = new Date().toISOString();
  
  // Save the updated file
  fs.writeFileSync(alarmFile, JSON.stringify(alarm, null, 2));
  
  console.log('✅ Alarm status fixed! The alarm is now marked as completed.');
} else {
  console.log('❌ Alarm file not found at:', alarmFile);
}