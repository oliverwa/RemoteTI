// Helper function to safely save alarm session while preserving completed status
function saveAlarmSession(sessionPath, alarmSession) {
  const fs = require('fs');
  
  // If alarm is already marked as completed, never change it back
  if (alarmSession.status === 'completed') {
    // Alarm is already completed, preserve this status
    console.log('[INFO] Preserving completed alarm status during save');
    // Ensure completedAt is set if missing
    if (!alarmSession.completedAt) {
      alarmSession.completedAt = new Date().toISOString();
    }
  } else if (!alarmSession.status) {
    // Only set to active if no status exists
    alarmSession.status = 'active';
  }
  
  // Similarly, preserve workflow completed status
  if (alarmSession.workflow && alarmSession.workflow.status === 'completed') {
    console.log('[INFO] Preserving completed workflow status during save');
  }
  
  // Write the file
  fs.writeFileSync(sessionPath, JSON.stringify(alarmSession, null, 2));
  
  console.log(`[INFO] Alarm saved with status: ${alarmSession.status}`);
  return alarmSession;
}

module.exports = { saveAlarmSession };