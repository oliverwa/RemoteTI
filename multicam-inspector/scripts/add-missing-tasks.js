const fs = require('fs');
const path = require('path');

// Read the current task library
const libraryPath = path.join(__dirname, '../data/tasks/task-library.json');
const taskLibrary = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));

// Define the missing tasks from initial-remote-ti-inspection
const missingTasks = {
  "TSK-PRE003": {
    "id": "TSK-PRE003",
    "category": "Prerequisites",
    "title": "START CONDITIONS: Verify prerequisites",
    "description": "Confirm all prerequisites for initial remote inspection are met.",
    "instructions": [
      "Confirm correct hangar/Skybase ID.",
      "Verify camera feeds are LIVE (check timestamps).",
      "Confirm no people visible inside Skybase.",
      "STOP if any condition cannot be confirmed."
    ],
    "validationBoxes": {},
    "type": "verification",
    "scheduling": {},
    "consumables": [],
    "tooling": [],
    "testing": {}
  },
  "TSK-SKY003": {
    "id": "TSK-SKY003",
    "category": "Skybase",
    "title": "CRITICAL SAFETY: Skybase environment check",
    "description": "Inspect Skybase environment for immediate safety hazards.",
    "instructions": [
      "Check for debris/tools/loose objects on floor.",
      "Verify clearance near propellers and landing gear.",
      "Check doors/enclosure for obstruction or damage.",
      "STOP if anything could interfere with safety."
    ],
    "validationBoxes": {},
    "type": "visual",
    "scheduling": {},
    "consumables": [],
    "tooling": [],
    "testing": {}
  },
  "TSK-SYS005": {
    "id": "TSK-SYS005",
    "category": "System",
    "title": "DRONE SAFE STATE: Post-flight condition",
    "description": "Verify drone is in safe post-flight state.",
    "instructions": [
      "Verify drone is stationary (no movement/rocking).",
      "Check stability on landing gear (no abnormal tip/lean).",
      "Look for smoke, steam, liquid, or heat haze.",
      "Check for obvious structural damage.",
      "STOP immediately if smoke/liquid/damage observed."
    ],
    "validationBoxes": {},
    "type": "visual",
    "scheduling": {},
    "consumables": [],
    "tooling": [],
    "testing": {}
  },
  "TSK-PRO005": {
    "id": "TSK-PRO005",
    "category": "Propulsion",
    "title": "PROPULSION: Visual danger check",
    "description": "Quick visual inspection of propulsion system for immediate dangers.",
    "instructions": [
      "Verify all 8 propellers present (none missing).",
      "Check for broken/chipped propellers.",
      "Look for bent propellers or surface contact.",
      "Confirm motors are not spinning.",
      "Check nav light pattern if visible.",
      "STOP if propeller damaged or drone appears armed."
    ],
    "validationBoxes": {},
    "type": "visual",
    "scheduling": {},
    "consumables": [],
    "tooling": [],
    "testing": {}
  },
  "TSK-PER006": {
    "id": "TSK-PER006",
    "category": "Peripherals",
    "title": "PERIPHERALS: Quick inventory check",
    "description": "Fast visual check for missing or broken peripherals.",
    "instructions": [
      "Check 4G antennas present (not snapped off).",
      "Verify GPS masts present and upright.",
      "Check RealSense lenses not cracked/covered.",
      "Look for ETH/USB caps if visible.",
      "Check downlight and MiniFinder if visible.",
      "STOP if essential peripheral missing/broken."
    ],
    "validationBoxes": {},
    "type": "visual",
    "scheduling": {},
    "consumables": [],
    "tooling": [],
    "testing": {}
  },
  "TSK-FIN003": {
    "id": "TSK-FIN003",
    "category": "Final",
    "title": "DISPATCH GATE: Go/No-Go decision",
    "description": "Make dispatch decision based on inspection results.",
    "instructions": [
      "Review all inspection results.",
      "Make PASS or STOP decision.",
      "If PASS: Clear for dispatch.",
      "If STOP: Do not dispatch, escalate immediately."
    ],
    "validationBoxes": {},
    "type": "decision",
    "scheduling": {},
    "consumables": [],
    "tooling": [],
    "testing": {}
  }
};

// Add missing tasks to the library
Object.keys(missingTasks).forEach(taskId => {
  if (!taskLibrary.tasks[taskId]) {
    taskLibrary.tasks[taskId] = missingTasks[taskId];
    console.log(`Added missing task: ${taskId}`);
  }
});

// Update categories if needed
const newCategories = ["Prerequisites"];
newCategories.forEach(cat => {
  if (!taskLibrary.metadata.categories.includes(cat)) {
    taskLibrary.metadata.categories.push(cat);
  }
});

// Update total task count
taskLibrary.metadata.totalTasks = Object.keys(taskLibrary.tasks).length;

// Write back the updated library
fs.writeFileSync(libraryPath, JSON.stringify(taskLibrary, null, 2));

console.log(`\nTask library updated successfully!`);
console.log(`Total tasks in library: ${taskLibrary.metadata.totalTasks}`);