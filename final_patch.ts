import fs from 'fs';

const files = [
  'supabase/functions/uazapi-webhook/index.ts',
  'supabase/functions/whatsapp-webhook/index.ts',
  'supabase/functions/evolution-webhook/index.ts'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  
  // The goal is to ensure that the aiAllowed block is correctly closed.
  // We want to find the pattern where aiAllowed ends and is followed by else if.
  // There should be exactly TWO closing braces between the end of the inner logic and the else if.
  
  // First, let's normalize the area by removing extra whitespace/braces we might have added.
  // We'll look for the end of the inner if(b64||mediaUrl) block and the end of the aiAllowed block.
  
  // Find where it currently has something like } } } else if and change to } } else if
  content = content.replace(/\}\s*\}\s*\}\s*else if\s*\(norm\.media\.type\s*===\s*"audio"/g, '} } else if (norm.media.type === "audio"');
  
  // If it only has one brace, add one
  // (But let's be careful not to double add)
  // Actually, let's just use a more reliable pattern.
  
  // Match the whole block from aiAllowed to else if
  const regex = /if\s*\(aiAllowed\)\s*\{[\s\S]*?console\.warn\(`\[uazapi-webhook\] media has no b64 nor url; using fallback placeholder \(norm\.media\.type\)`\);\s*\}\s*\}\s*else if\s*\(norm\.media\.type\s*===\s*"audio"/g;
  
  // Wait, I'll just look for:
  // }
  // }
  // } else if
  // and replace with 
  // }
  // } else if
  
  content = content.replace(/\}\s*\}\s*\}\s*else if\s*\(/g, '          }\n          } else if (');

  fs.writeFileSync(file, content);
  console.log(`Final patch applied to ${file}`);
});
