const fs = require('fs');
const content = fs.readFileSync('supabase/functions/uazapi-webhook/index.ts', 'utf8');
const lines = content.split('\n');

let braceCount = 0;
let inString = null;
let inComment = null;

for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let prevCount = braceCount;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i+1];
        if (inComment === 'single') break;
        if (inComment === 'multi') {
            if (char === '*' && nextChar === '/') { inComment = null; i++; }
            continue;
        }
        if (inString) {
            if (char === inString && line[i-1] !== '\\') inString = null;
            continue;
        }
        if (char === '/' && nextChar === '/') { inComment = 'single'; i++; continue; }
        if (char === '/' && nextChar === '*') { inComment = 'multi'; i++; continue; }
        if (char === '"' || char === "'" || char === '`') { inString = char; continue; }
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
    }
    if (inComment === 'single') inComment = null;
    if (lineIdx + 1 > 1912 && lineIdx + 1 < 2265 && prevCount === 4 && braceCount === 3) {
        console.log(`Count dropped to 3 at line ${lineIdx + 1}`);
        console.log(`Line content: ${line}`);
    }
}
