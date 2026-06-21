
import fs from 'fs';

const filePath = 'src/components/admin/capture/FunnelBlockEditor.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Regex to find JSX tags with multiple className props
// This is tricky, but let's try to merge them
const tagsWithDuplicates = /<([A-Za-z0-9]+)\s+([^>]*className="[^"]*"[^>]*className="[^"]*"[^>]*)\/?>/g;

content = content.replace(tagsWithDuplicates, (match, tagName, attributes) => {
  // Extract all classNames
  const classNameMatches = attributes.matchAll(/className="([^"]*)"/g);
  let combinedClasses = '';
  for (const classNameMatch of classNameMatches) {
    combinedClasses += ' ' + classNameMatch[1];
  }
  combinedClasses = [...new Set(combinedClasses.trim().split(/\s+/))].join(' ');
  
  // Remove all individual className attributes and replace with one
  let cleanedAttributes = attributes.replace(/className="[^"]*"/g, '').replace(/\s+/g, ' ').trim();
  return `<${tagName} ${cleanedAttributes} className="${combinedClasses}" />`.replace(' /> />', ' />').replace(' >', '>');
});

// A more robust way might be needed if they are not self-closing or have other props between.
// Let's just fix the specific ones by hand if the script is too risky.
// Actually, let's try a simpler regex that handles most cases.
content = content.replace(/className="([^"]*)"\s+className="([^"]*)"/g, 'className="$1 $2"');

fs.writeFileSync(filePath, content);
console.log('Cleaned up duplicate classNames');
