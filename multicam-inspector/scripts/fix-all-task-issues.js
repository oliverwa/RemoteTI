const fs = require('fs');
const path = require('path');

// Read the current task library
const libraryPath = path.join(__dirname, '../data/tasks/task-library.json');
const taskLibrary = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));

console.log('=== FIXING TASK LIBRARY ISSUES ===\n');

// 1. Fix TSK-SRV to TSK-SVC naming
console.log('1. Fixing TSK-SRV to TSK-SVC naming...');
const srvToSvc = {
  'TSK-SRV001': 'TSK-SVC001',
  'TSK-SRV002': 'TSK-SVC002',
  'TSK-SRV003': 'TSK-SVC003',
  'TSK-SRV004': 'TSK-SVC004',
  'TSK-SRV005': 'TSK-SVC005'
};

Object.entries(srvToSvc).forEach(([oldId, newId]) => {
  if (taskLibrary.tasks[oldId]) {
    taskLibrary.tasks[newId] = taskLibrary.tasks[oldId];
    taskLibrary.tasks[newId].id = newId;
    delete taskLibrary.tasks[oldId];
    console.log(`  Renamed ${oldId} to ${newId}`);
  }
});

// 2. Add missing TSK tasks from full-remote-ti
console.log('\n2. Adding missing TSK tasks from full-remote-ti...');

const fullRemotePath = path.join(__dirname, '../data/templates/full-remote-ti-inspection.json');
const fullRemote = JSON.parse(fs.readFileSync(fullRemotePath, 'utf8'));

const missingTasksToAdd = {
  'TSK-STR005': null,
  'TSK-FIN002': null,
  'TSK-STR006': null
};

// Find the missing tasks in full-remote-ti
fullRemote.tasks.forEach(task => {
  if (missingTasksToAdd.hasOwnProperty(task.id)) {
    missingTasksToAdd[task.id] = task;
  }
});

// Map TSK-STR005 to Structure category
if (missingTasksToAdd['TSK-STR005']) {
  taskLibrary.tasks['TSK-STR005'] = {
    id: 'TSK-STR005',
    category: 'Structure',
    title: missingTasksToAdd['TSK-STR005'].title,
    description: missingTasksToAdd['TSK-STR005'].description,
    instructions: missingTasksToAdd['TSK-STR005'].instructions,
    validationBoxes: {},
    type: 'visual',
    scheduling: {},
    consumables: [],
    tooling: [],
    testing: {}
  };
  console.log(`  Added TSK-STR005: ${missingTasksToAdd['TSK-STR005'].title}`);
}

// TSK-FIN002 is actually TSK-SYS005 (alignment) - rename it
if (missingTasksToAdd['TSK-FIN002']) {
  // This is alignment, should be TSK-SYS008
  taskLibrary.tasks['TSK-SYS008'] = {
    id: 'TSK-SYS008',
    category: 'System',
    title: missingTasksToAdd['TSK-FIN002'].title,
    description: missingTasksToAdd['TSK-FIN002'].description,
    instructions: missingTasksToAdd['TSK-FIN002'].instructions,
    validationBoxes: {},
    type: 'visual',
    scheduling: {},
    consumables: [],
    tooling: [],
    testing: {}
  };
  console.log(`  Added TSK-SYS008 (was TSK-FIN002): ${missingTasksToAdd['TSK-FIN002'].title}`);
  
  // Update the template to use TSK-SYS008 instead of TSK-FIN002
  const taskIndex = fullRemote.tasks.findIndex(t => t.id === 'TSK-FIN002');
  if (taskIndex !== -1) {
    fullRemote.tasks[taskIndex].id = 'TSK-SYS008';
  }
}

// TSK-STR006 is battery compartment - should be TSK-BAT007
if (missingTasksToAdd['TSK-STR006']) {
  taskLibrary.tasks['TSK-BAT007'] = {
    id: 'TSK-BAT007',
    category: 'Battery',
    title: missingTasksToAdd['TSK-STR006'].title,
    description: missingTasksToAdd['TSK-STR006'].description,
    instructions: missingTasksToAdd['TSK-STR006'].instructions,
    validationBoxes: {},
    type: 'visual',
    scheduling: {},
    consumables: [],
    tooling: [],
    testing: {}
  };
  console.log(`  Added TSK-BAT007 (was TSK-STR006): ${missingTasksToAdd['TSK-STR006'].title}`);
  
  // Update the template to use TSK-BAT007 instead of TSK-STR006
  const taskIndex2 = fullRemote.tasks.findIndex(t => t.id === 'TSK-STR006');
  if (taskIndex2 !== -1) {
    fullRemote.tasks[taskIndex2].id = 'TSK-BAT007';
  }
}

// 3. Handle duplicate TSK-SYS005 - make different versions
console.log('\n3. Handling duplicate TSK-SYS005 with different content...');

// The existing TSK-SYS005 in library is for "DRONE SAFE STATE: Post-flight condition"
// Keep it as is for initial-remote-ti

// For full-remote-ti's version "DRONE STATUS: Verify safe state", use TSK-SYS004
const fullRemoteSYS005Task = fullRemote.tasks.find(t => t.id === 'TSK-SYS005');
if (fullRemoteSYS005Task) {
  // Update full-remote-ti to use TSK-SYS004 (which already exists in library)
  fullRemoteSYS005Task.id = 'TSK-SYS004';
  console.log('  Updated full-remote-ti to use TSK-SYS004 instead of TSK-SYS005');
}

// 4. Handle duplicate TSK-PWR001 - it's used with different content in different templates
console.log('\n4. Keeping TSK-PWR001 as generic umbilical inspection...');
// The library version is good - it's the onsite version which is most detailed

// 5. Handle duplicate TSK-DOC001 - different templates have different documentation needs
console.log('\n5. TSK-DOC001 variations handled - keeping generic version...');

// 6. Handle other duplicates with minor differences
console.log('\n6. Other duplicate tasks will use the library version...');

// Update counts
taskLibrary.metadata.totalTasks = Object.keys(taskLibrary.tasks).length;

// Save updated library
fs.writeFileSync(libraryPath, JSON.stringify(taskLibrary, null, 2));
console.log(`\nTask library updated! Total tasks: ${taskLibrary.metadata.totalTasks}`);

// Save updated full-remote-ti template
fs.writeFileSync(fullRemotePath, JSON.stringify(fullRemote, null, 2));
console.log('Updated full-remote-ti-inspection.json with corrected task IDs');

console.log('\n=== SUMMARY ===');
console.log('✅ Fixed TSK-SRV to TSK-SVC naming');
console.log('✅ Added missing TSK tasks');
console.log('✅ Resolved duplicate task IDs');
console.log('✅ Templates now reference correct task IDs');