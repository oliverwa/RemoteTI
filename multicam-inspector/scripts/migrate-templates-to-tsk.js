#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Task ID mapping based on our analysis
const taskIdMapping = {
  // Mission Reset mappings
  'safety_briefing': 'TSK-SAF001',
  'prs_disarm': 'TSK-PRS001',
  'prs_arm': 'TSK-PRS003',
  'open_lids': 'TSK-STR002',
  'close_lids': 'TSK-STR004',
  'verify_new_batteries': 'TSK-BAT001',
  'remove_old_batteries': 'TSK-BAT002',
  'charge_old_batteries': 'TSK-BAT003',
  'install_front_battery': 'TSK-BAT004',
  'install_back_battery': 'TSK-BAT005',
  'align_drone_perfect': 'TSK-PRE002',
  'umbilical_inspection': 'TSK-PWR001',
  'attach_umbilical': 'TSK-PWR002',
  'medkit_verification': 'TSK-MED001',
  'medkit_mounting': 'TSK-MED002',
  'winch_setup': 'TSK-WNC001',
  'motor_spin_test': 'TSK-PRO003',
  'propeller_quick_check': 'TSK-PRO004',
  'skybase_quick_check': 'TSK-SKY002',
  'documentation': 'TSK-DOC001',
  
  // Full Remote TI mappings
  'start_conditions': 'TSK-PRE003',
  'camera_coverage': 'TSK-CAM001',
  'skybase_environment': 'TSK-SKY003',
  'umbilical_connection': 'TSK-PWR001', // Same as umbilical_inspection (visual)
  'parachute_system': 'TSK-PRS002',
  'drone_structure': 'TSK-STR005',
  'propulsion_system': 'TSK-PRO002',
  'sensor_systems': 'TSK-PER003',
  'antenna_systems': 'TSK-PER004',
  'ports_peripherals': 'TSK-PER005',
  'identification': 'TSK-MRK001',
  'medkit_winch': 'TSK-MED003',
  'drone_status': 'TSK-SYS005',
  'alignment_verification': 'TSK-FIN002',
  'battery_compartment': 'TSK-STR006',
  
  // Initial Remote TI mappings (mostly reuse)
  'critical_safety_check': 'TSK-SKY003', // Same as skybase_environment
  'drone_safe_state': 'TSK-SYS005', // Same as drone_status
  'propulsion_arm_status': 'TSK-PRO005',
  'umbilical_charge_area': 'TSK-PWR001', // Visual inspection
  'sensor_peripheral_snapshot': 'TSK-PER006',
  'system_vitals': 'TSK-SYS004',
  'dispatch_decision': 'TSK-FIN003',
  
  // Service Inspection mappings
  'component_replacement': 'TSK-SVC001',
  'lubrication_service': 'TSK-SVC002',
  'firmware_updates': 'TSK-SVC003',
  'deep_cleaning': 'TSK-SVC004',
  'compliance_documentation': 'TSK-SVC005',
  
  // Extended TI mappings
  'comprehensive_structural_analysis': 'TSK-EXT001',
  'full_electrical_system_test': 'TSK-EXT002',
  'performance_calibration_verification': 'TSK-EXT003',
  'environmental_stress_testing': 'TSK-EXT004',
  'lifecycle_component_assessment': 'TSK-EXT005'
};

// Templates to migrate
const templatesToMigrate = [
  'mission-reset.json',
  'full-remote-ti-inspection.json',
  'initial-remote-ti-inspection.json',
  'service-inspection.json',
  'extended-ti-inspection.json'
];

const templatesDir = path.join(__dirname, '..', 'data', 'templates');

console.log('🔄 Starting template migration to TSK IDs...\n');

templatesToMigrate.forEach(templateFile => {
  const templatePath = path.join(templatesDir, templateFile);
  
  if (!fs.existsSync(templatePath)) {
    console.log(`⚠️  Template not found: ${templateFile}`);
    return;
  }
  
  console.log(`📄 Processing: ${templateFile}`);
  
  // Load template
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  
  // Create backup
  const backupPath = templatePath.replace('.json', '.backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(template, null, 2));
  console.log(`  ✅ Backup created: ${path.basename(backupPath)}`);
  
  // Update task IDs
  let updatedCount = 0;
  if (template.tasks && Array.isArray(template.tasks)) {
    template.tasks.forEach(task => {
      const oldId = task.id;
      const newId = taskIdMapping[oldId];
      
      if (newId) {
        task.id = newId;
        updatedCount++;
        console.log(`  📝 Updated: ${oldId} → ${newId}`);
      } else if (!oldId.startsWith('TSK-')) {
        console.log(`  ⚠️  No mapping for: ${oldId}`);
      }
    });
  }
  
  // Save updated template
  fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
  console.log(`  ✅ Updated ${updatedCount} task IDs\n`);
});

console.log('✨ Migration complete!');
console.log('\n📋 Summary:');
console.log(`  - Templates migrated: ${templatesToMigrate.length}`);
console.log('  - Backups created in same directory');
console.log('  - Onsite template already had TSK IDs (skipped)');
console.log('\n💡 Next step: Deploy to server with ./deploy.sh');