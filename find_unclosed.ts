import fs from 'fs';

const content = fs.readFileSync('supabase/functions/uazapi-webhook/index.ts', 'utf8');
let inSingleQuote = false;
let inDoubleQuote = false;
let inBacktick = false;
let escaped = false;
let lastStartLine = 0;

const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (inSingleQuote) {
      if (char === "'") inSingleQuote = false;
      continue;
    }
    if (inDoubleQuote) {
      if (char === '"') inDoubleQuote = false;
      continue;
    }
    if (inBacktick) {
      if (char === '`') inBacktick = false;
      continue;
    }
    if (char === "'") { inSingleQuote = true; lastStartLine = i + 1; }
    else if (char === '"') inDoubleQuote = true;
    else if (char === '`') inBacktick = true;
  }
}

if (inSingleQuote) console.log('Unclosed single quote started at line', lastStartLine);
