const fs = require('fs');
const content = fs.readFileSync('supabase/functions/uazapi-webhook/index.ts', 'utf8');

let braceCount = 0;
let parenCount = 0;
let bracketCount = 0;
let inString = null;

for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (inString) {
        if (char === inString && content[i-1] !== '\\') inString = null;
        continue;
    }
    if (char === '"' || char === "'" || char === '`') {
        inString = char;
        continue;
    }
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '(') parenCount++;
    if (char === ')') parenCount--;
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;

    if (braceCount < 0 || parenCount < 0 || bracketCount < 0) {
        console.log(`Unbalanced at index ${i} (line ${content.slice(0, i).split('\n').length}): {=${braceCount}, (=${parenCount}, [=${bracketCount}`);
        // Reset to continue searching
        if (braceCount < 0) braceCount = 0;
        if (parenCount < 0) parenCount = 0;
        if (bracketCount < 0) bracketCount = 0;
    }
}
console.log(`Final counts: {=${braceCount}, (=${parenCount}, [=${bracketCount}`);
