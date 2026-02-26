const fs = require('fs');
const path = require('path');

// Read the task library
const libraryPath = path.join(__dirname, '../data/tasks/task-library.json');
const taskLibrary = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));

// Read all templates
const templatesDir = path.join(__dirname, '../data/templates');
const templateFiles = fs.readdirSync(templatesDir)
  .filter(f => f.endsWith('.json') && !f.includes('.backup'));

console.log('=== MIGRATING TEMPLATES TO REFERENCE-ONLY FORMAT ===\n');

templateFiles.forEach(file => {
  const templatePath = path.join(templatesDir, file);
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  const templateName = file.replace('.json', '');
  
  console.log(`\nMigrating: ${templateName}`);
  
  if (template.tasks && template.tasks.length > 0) {
    // Create backup first
    const backupPath = templatePath.replace('.json', '.pre-reference.backup.json');
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, JSON.stringify(template, null, 2));
      console.log(`  Created backup: ${path.basename(backupPath)}`);
    }
    
    // Transform tasks to reference-only format
    let migratedCount = 0;
    template.tasks = template.tasks.map(task => {
      if (task.title || task.description || task.instructions) {
        // This task has content that needs to be removed
        migratedCount++;
        
        // Keep only ID and runtime data
        return {
          id: task.id,
          validationBoxes: task.validationBoxes || {},
          completion: task.completion || {
            completedBy: null,
            completedAt: null
          },
          note: task.note || ""
        };
      }
      return task; // Already in reference format
    });
    
    // Save the migrated template
    fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
    console.log(`  ✅ Migrated ${migratedCount} tasks to reference-only format`);
    console.log(`  Total tasks: ${template.tasks.length}`);
  } else {
    console.log(`  No tasks to migrate`);
  }
});

console.log('\n=== MIGRATION COMPLETE ===');
console.log('\nTemplates now only store:');
console.log('  - Task ID (reference to library)');
console.log('  - Validation boxes (inspection-specific)');
console.log('  - Completion status (inspection-specific)');
console.log('  - Notes (inspection-specific)');
console.log('\nAll task content (title, description, instructions) now comes from the Task Library!');