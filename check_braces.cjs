const fs = require('fs');
const content = fs.readFileSync('supabase/functions/uazapi-webhook/index.ts', 'utf8');
const lines = content.split('\n');
let balance = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '{') balance++;
    if (char === '}') balance--;
  }
  if (i + 1 === 1131) console.log(`Line 1131: ${balance}`);
  if (i + 1 === 1230) console.log(`Line 1230: ${balance}`);
  if (i + 1 === 1264) console.log(`Line 1264: ${balance}`);
}
console.log(`Final balance: ${balance}`);
