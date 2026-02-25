#!/bin/bash

# Script to update dark mode text contrast across all components
# This script improves readability by making text lighter in dark mode

echo "Updating dark mode text contrast across all components..."

FILES=$(find src -name "*.tsx" -o -name "*.ts" | xargs grep -l "dark:text-")

for FILE in $FILES; do
    echo "Processing: $FILE"
    
    # Main text improvements: gray-300 -> gray-200
    sed -i '' 's/dark:text-gray-300/dark:text-gray-200/g' "$FILE"
    
    # Secondary text improvements: gray-400 -> gray-300
    sed -i '' 's/dark:text-gray-400/dark:text-gray-300/g' "$FILE"
    
    # Subtle text improvements: gray-500 -> gray-400
    sed -i '' 's/dark:text-gray-500/dark:text-gray-400/g' "$FILE"
    
    # Very subtle text: gray-600 -> gray-500
    sed -i '' 's/dark:text-gray-600/dark:text-gray-500/g' "$FILE"
    
    # Colored text improvements for better contrast
    # Blue tones
    sed -i '' 's/dark:text-blue-400/dark:text-blue-300/g' "$FILE"
    sed -i '' 's/dark:text-blue-500/dark:text-blue-400/g' "$FILE"
    
    # Green tones
    sed -i '' 's/dark:text-green-400/dark:text-green-300/g' "$FILE"
    sed -i '' 's/dark:text-green-500/dark:text-green-400/g' "$FILE"
    
    # Red tones
    sed -i '' 's/dark:text-red-400/dark:text-red-300/g' "$FILE"
    sed -i '' 's/dark:text-red-500/dark:text-red-400/g' "$FILE"
    
    # Yellow tones
    sed -i '' 's/dark:text-yellow-400/dark:text-yellow-300/g' "$FILE"
    sed -i '' 's/dark:text-yellow-500/dark:text-yellow-400/g' "$FILE"
    
    # Purple tones
    sed -i '' 's/dark:text-purple-400/dark:text-purple-300/g' "$FILE"
    sed -i '' 's/dark:text-purple-500/dark:text-purple-400/g' "$FILE"
    
    # Indigo tones
    sed -i '' 's/dark:text-indigo-400/dark:text-indigo-300/g' "$FILE"
    sed -i '' 's/dark:text-indigo-500/dark:text-indigo-400/g' "$FILE"
    
    # Pink tones
    sed -i '' 's/dark:text-pink-400/dark:text-pink-300/g' "$FILE"
    sed -i '' 's/dark:text-pink-500/dark:text-pink-400/g' "$FILE"
    
    # Orange tones
    sed -i '' 's/dark:text-orange-400/dark:text-orange-300/g' "$FILE"
    sed -i '' 's/dark:text-orange-500/dark:text-orange-400/g' "$FILE"
done

echo "✅ Text contrast improvements completed!"
echo "Summary of changes made:"
echo "- Main text (gray-300) → lighter (gray-200)"
echo "- Secondary text (gray-400) → lighter (gray-300)" 
echo "- Subtle text (gray-500) → lighter (gray-400)"
echo "- Very subtle text (gray-600) → lighter (gray-500)"
echo "- All colored text moved one shade lighter for better contrast"
echo ""
echo "Files updated: $(echo "$FILES" | wc -w)"