import fs from 'fs';

const content = fs.readFileSync('supabase/functions/uazapi-webhook/index.ts', 'utf8');
const stack = [];
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '{' || char === '(' || char === '[') {
      stack.push({ char, line: i + 1, col: j + 1 });
    } else if (char === '}' || char === ')' || char === ']') {
      if (stack.length === 0) {
        console.log(`Unexpected ${char} at line ${i + 1}, col ${j + 1}`);
      } else {
        const last = stack.pop();
        if ((char === '}' && last.char !== '{') ||
            (char === ')' && last.char !== '(') ||
            (char === ']' && last.char !== '[')) {
          console.log(`Mismatched ${char} at line ${i + 1}, col ${j + 1} (expected matching ${last.char} from line ${last.line})`);
        }
      }
    }
  }
}

if (stack.length > 0) {
  console.log('Unclosed brackets:');
  stack.forEach(s => console.log(`${s.char} at line ${s.line}, col ${s.col}`));
}
