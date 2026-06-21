import fs from 'fs';

const files = [
  'supabase/functions/uazapi-webhook/index.ts',
  'supabase/functions/whatsapp-webhook/index.ts',
  'supabase/functions/evolution-webhook/index.ts'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let lines = fs.readFileSync(file, 'utf8').split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    // Look for the end of the aiAllowed block which is followed by an else if
    if (lines[i].includes('} else if (norm.media.type === "audio" || norm.media.type === "image")')) {
       // Check if the previous line is also a closing brace for the inner if
       if (lines[i-1].trim() === '}' || lines[i-1].includes('console.warn')) {
         console.log(`Adding missing brace before line ${i+1} in ${file}`);
         lines[i] = '          }\n' + lines[i];
       }
    }
  }

  fs.writeFileSync(file, lines.join('\n'));
});
