import fs from 'fs';

const content = fs.readFileSync('supabase/functions/uazapi-webhook/index.ts', 'utf8');
const stack = [];
let inString = null; // ' or " or `
let escaped = false;

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  
  if (escaped) {
    escaped = false;
    continue;
  }
  
  if (char === '\\') {
    escaped = true;
    continue;
  }
  
  if (inString) {
    if (char === inString) {
      if (inString === '`') {
        // Template literal can have ${...}
        // But we are not handling nested interpolations yet.
      }
      inString = null;
    }
    continue;
  }
  
  if (char === "'" || char === '"' || char === '`') {
    inString = char;
    continue;
  }
  
  if (char === '{' || char === '(' || char === '[') {
    stack.push({ char, pos: i });
  } else if (char === '}' || char === ')' || char === ']') {
    if (stack.length === 0) {
      console.log(`Unexpected ${char} at pos ${i}`);
    } else {
      const last = stack.pop();
      if ((char === '}' && last.char !== '{') ||
          (char === ')' && last.char !== '(') ||
          (char === ']' && last.char !== '[')) {
        console.log(`Mismatched ${char} at pos ${i} (expected matching ${last.char} from pos ${last.pos})`);
      }
    }
  }
}

if (inString) console.log(`Unclosed string: ${inString}`);
if (stack.length > 0) {
  console.log('Unclosed brackets:');
  stack.forEach(s => console.log(`${s.char} at pos ${s.pos}`));
}
