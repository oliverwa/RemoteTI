const fs = require('fs');
const path = require('path');

// Read the current task library
const libraryPath = path.join(__dirname, '../data/tasks/task-library.json');
const taskLibrary = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));

// Read all templates
const templatesDir = path.join(__dirname, '../data/templates');
const templateFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.json'));

console.log('=== TASK AUDIT REPORT ===\n');
console.log(`Task Library has ${Object.keys(taskLibrary.tasks).length} tasks\n`);

// Collect all tasks from templates
const allTemplateTasks = {};
const taskUsageByTemplate = {};
const duplicateTasksWithDifferentContent = {};

templateFiles.forEach(file => {
  const templatePath = path.join(templatesDir, file);
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const templateName = file.replace('.json', '');
  
  console.log(`\nChecking template: ${templateName}`);
  console.log(`  Tasks in template: ${template.tasks ? template.tasks.length : 0}`);
  
  if (template.tasks) {
    const missingInLibrary = [];
    
    template.tasks.forEach(task => {
      // Track task usage
      if (!taskUsageByTemplate[task.id]) {
        taskUsageByTemplate[task.id] = [];
      }
      taskUsageByTemplate[task.id].push(templateName);
      
      // Store task content
      if (!allTemplateTasks[task.id]) {
        allTemplateTasks[task.id] = {
          templates: [templateName],
          content: task
        };
      } else {
        allTemplateTasks[task.id].templates.push(templateName);
        
        // Check if content is different
        const existingTask = allTemplateTasks[task.id].content;
        if (task.title !== existingTask.title || 
            task.description !== existingTask.description ||
            JSON.stringify(task.instructions) !== JSON.stringify(existingTask.instructions)) {
          
          if (!duplicateTasksWithDifferentContent[task.id]) {
            duplicateTasksWithDifferentContent[task.id] = [];
            duplicateTasksWithDifferentContent[task.id].push({
              template: allTemplateTasks[task.id].templates[0],
              title: existingTask.title,
              description: existingTask.description
            });
          }
          duplicateTasksWithDifferentContent[task.id].push({
            template: templateName,
            title: task.title,
            description: task.description
          });
        }
      }
      
      // Check if task exists in library
      if (!taskLibrary.tasks[task.id]) {
        missingInLibrary.push(task.id);
      }
    });
    
    if (missingInLibrary.length > 0) {
      console.log(`  ❌ Missing in library: ${missingInLibrary.join(', ')}`);
    } else {
      console.log(`  ✅ All tasks found in library`);
    }
  }
});

// Report duplicate tasks with different content
console.log('\n=== DUPLICATE TASK IDs WITH DIFFERENT CONTENT ===');
const duplicates = Object.keys(duplicateTasksWithDifferentContent);
if (duplicates.length > 0) {
  duplicates.forEach(taskId => {
    console.log(`\n${taskId}:`);
    duplicateTasksWithDifferentContent[taskId].forEach(variant => {
      console.log(`  - ${variant.template}: "${variant.title}"`);
      console.log(`    ${variant.description.substring(0, 100)}...`);
    });
  });
} else {
  console.log('None found - all duplicate IDs have identical content');
}

// Report tasks not in library
console.log('\n=== TASKS IN TEMPLATES BUT NOT IN LIBRARY ===');
const missingTasks = Object.keys(allTemplateTasks).filter(id => !taskLibrary.tasks[id]);
if (missingTasks.length > 0) {
  missingTasks.forEach(id => {
    const task = allTemplateTasks[id];
    console.log(`\n${id} (used in: ${task.templates.join(', ')})`);
    console.log(`  Title: ${task.content.title}`);
    console.log(`  Description: ${task.content.description.substring(0, 100)}...`);
  });
} else {
  console.log('None - all tasks are in the library');
}

// Report tasks in library but not used
console.log('\n=== TASKS IN LIBRARY BUT NOT USED IN ANY TEMPLATE ===');
const unusedTasks = Object.keys(taskLibrary.tasks).filter(id => !allTemplateTasks[id]);
if (unusedTasks.length > 0) {
  unusedTasks.forEach(id => {
    console.log(`- ${id}: ${taskLibrary.tasks[id].title}`);
  });
} else {
  console.log('None - all library tasks are used');
}

console.log('\n=== SUMMARY ===');
console.log(`Total unique task IDs in templates: ${Object.keys(allTemplateTasks).length}`);
console.log(`Total tasks in library: ${Object.keys(taskLibrary.tasks).length}`);
console.log(`Missing from library: ${missingTasks.length}`);
console.log(`Unused in library: ${unusedTasks.length}`);
console.log(`Duplicate IDs with different content: ${duplicates.length}`);