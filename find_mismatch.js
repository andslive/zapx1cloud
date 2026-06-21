const fs = require('fs');

const content = fs.readFileSync('supabase/functions/uazapi-webhook/index.ts', 'utf8');

let stack_p = [];
let stack_b = [];
let line = 1;
let col = 1;

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  
  if (content.substring(i, i + 2) === '//') {
    const end = content.indexOf('\n', i);
    if (end === -1) break;
    i = end;
    line++;
    col = 1;
    continue;
  }
  if (content.substring(i, i + 2) === '/*') {
    const end = content.indexOf('*/', i);
    if (end === -1) break;
    const skipped = content.substring(i, end + 2);
    line += (skipped.match(/\n/g) || []).length;
    i = end + 1;
    col = 1;
    continue;
  }
  if (char === '"' || char === "'" || char === '`') {
    const quote = char;
    i++;
    while (i < content.length) {
      if (content[i] === '\\') {
        i += 2;
      } else if (content[i] === quote) {
        break;
      } else {
        if (content[i] === '\n') {
          line++;
          col = 1;
        }
        i++;
      }
    }
    continue;
  }

  if (char === '(') stack_p.push(line);
  else if (char === ')') stack_p.pop();
  else if (char === '{') stack_b.push(line);
  else if (char === '}') stack_b.pop();

  if (char === '\n') {
    line++;
    col = 1;
  } else {
    col++;
  }
}

console.log('Unclosed ( at lines:', stack_p);
console.log('Unclosed { at lines:', stack_b);
