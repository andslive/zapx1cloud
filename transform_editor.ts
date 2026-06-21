
import fs from 'fs';

const filePath = 'src/components/admin/capture/FunnelBlockEditor.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace <Label> with <Label className="text-xs">
content = content.replace(/<Label>/g, '<Label className="text-xs">');

// Ensure all Inputs have text-xs
content = content.replace(/<Input\s+([^>]*className=")([^"]*)(")/g, (match, p1, p2, p3) => {
  if (!p2.includes('text-xs')) {
    return `<Input ${p1}${p2} text-xs${p3}`;
  }
  return match;
});
content = content.replace(/<Input(?!\s+[^>]*className=)/g, '<Input className="text-xs"');

// Ensure all Textareas have text-xs
content = content.replace(/<Textarea\s+([^>]*className=")([^"]*)(")/g, (match, p1, p2, p3) => {
  if (!p2.includes('text-xs')) {
    return `<Textarea ${p1}${p2} text-xs${p3}`;
  }
  return match;
});
content = content.replace(/<Textarea(?!\s+[^>]*className=)/g, '<Textarea className="text-xs"');

// Ensure all SelectTriggers have text-xs and h-8
content = content.replace(/<SelectTrigger\s+([^>]*className=")([^"]*)(")/g, (match, p1, p2, p3) => {
  let newClasses = p2;
  if (!newClasses.includes('text-xs')) newClasses += ' text-xs';
  if (!newClasses.includes('h-8')) newClasses += ' h-8';
  return `<SelectTrigger ${p1}${newClasses}${p3}`;
});
content = content.replace(/<SelectTrigger(?!\s+[^>]*className=)/g, '<SelectTrigger className="h-8 text-xs"');

fs.writeFileSync(filePath, content);
console.log('Transformed FunnelBlockEditor.tsx');
