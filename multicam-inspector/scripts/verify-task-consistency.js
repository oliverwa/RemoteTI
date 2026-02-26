const fs = require('fs');
const path = require('path');

// Read the current task library
const libraryPath = path.join(__dirname, '../data/tasks/task-library.json');
const taskLibrary = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));

// Read all templates
const templatesDir = path.join(__dirname, '../data/templates');
const templateFiles = fs.readdirSync(templatesDir)
  .filter(f => f.endsWith('.json') && !f.includes('.backup'));

console.log('=== COMPREHENSIVE TASK VERIFICATION ===\n');
console.log(`Task Library contains: ${Object.keys(taskLibrary.tasks).length} tasks`);
console.log(`Checking ${templateFiles.length} active templates\n`);

// Track all issues
const missingInLibrary = [];
const inconsistentTasks = {};
const taskUsage = {};

// Collect all tasks from templates
templateFiles.forEach(file => {
  const templatePath = path.join(templatesDir, file);
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const templateName = file.replace('.json', '');
  
  console.log(`\nChecking: ${templateName}`);
  console.log(`  Tasks: ${template.tasks ? template.tasks.length : 0}`);
  
  if (template.tasks) {
    template.tasks.forEach(task => {
      // Check if task exists in library
      if (!taskLibrary.tasks[task.id]) {
        missingInLibrary.push({
          template: templateName,
          taskId: task.id,
          title: task.title
        });
        console.log(`  ❌ Missing: ${task.id} - "${task.title}"`);
      } else {
        console.log(`  ✅ Found: ${task.id}`);
        
        // Track task usage for consistency check
        if (!taskUsage[task.id]) {
          taskUsage[task.id] = {
            libraryVersion: taskLibrary.tasks[task.id],
            templateVersions: []
          };
        }
        
        taskUsage[task.id].templateVersions.push({
          template: templateName,
          title: task.title,
          description: task.description,
          instructions: task.instructions
        });
      }
    });
  }
});

console.log('\n=== VERIFICATION RESULTS ===\n');

// 1. Report missing tasks
if (missingInLibrary.length > 0) {
  console.log('❌ TASKS MISSING FROM LIBRARY:');
  missingInLibrary.forEach(item => {
    console.log(`  - ${item.taskId} in ${item.template}: "${item.title}"`);
  });
} else {
  console.log('✅ ALL TEMPLATE TASKS EXIST IN LIBRARY');
}

// 2. Check for inconsistent task content
console.log('\n=== TASK CONSISTENCY CHECK ===\n');
let inconsistentCount = 0;

Object.entries(taskUsage).forEach(([taskId, usage]) => {
  const libraryTask = usage.libraryVersion;
  const templates = usage.templateVersions;
  
  // Check if all templates using this task have consistent content
  if (templates.length > 1) {
    const firstTemplate = templates[0];
    const hasInconsistency = templates.some(t => 
      t.title !== firstTemplate.title ||
      t.description !== firstTemplate.description ||
      JSON.stringify(t.instructions) !== JSON.stringify(firstTemplate.instructions)
    );
    
    if (hasInconsistency) {
      inconsistentCount++;
      console.log(`⚠️  ${taskId} has different content in different templates:`);
      templates.forEach(t => {
        console.log(`    - ${t.template}: "${t.title}"`);
        if (t.description) {
          console.log(`      ${t.description.substring(0, 60)}...`);
        }
      });
      console.log(`    Library version: "${libraryTask.title}"`);
      console.log('');
    }
  }
});

if (inconsistentCount === 0) {
  console.log('✅ ALL SHARED TASK IDs HAVE CONSISTENT CONTENT');
} else {
  console.log(`⚠️  Found ${inconsistentCount} task IDs with inconsistent content across templates`);
  console.log('   (The library version will be used for all)');
}

// 3. Summary
console.log('\n=== FINAL SUMMARY ===\n');
console.log(`Total tasks in library: ${Object.keys(taskLibrary.tasks).length}`);
console.log(`Total unique task IDs across all templates: ${Object.keys(taskUsage).length + missingInLibrary.length}`);
console.log(`Missing from library: ${missingInLibrary.length}`);
console.log(`Tasks with inconsistent content: ${inconsistentCount}`);

if (missingInLibrary.length === 0) {
  console.log('\n✅✅✅ READY FOR DEPLOYMENT - All tasks are in the library! ✅✅✅');
} else {
  console.log('\n❌ NOT READY - Some tasks are still missing from the library');
  console.log('Run the fix script to add missing tasks.');
}