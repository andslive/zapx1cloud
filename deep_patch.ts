import fs from 'fs';

const files = [
  'supabase/functions/uazapi-webhook/index.ts',
  'supabase/functions/whatsapp-webhook/index.ts',
  'supabase/functions/evolution-webhook/index.ts'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Fix the aiAllowed block closure
  // We want to ensure it looks like:
  //             }
  //           }
  //         } else if (norm.media.type === "audio" || norm.media.type === "image") {
  
  // First, find the end of the inner warning and consolidate braces
  content = content.replace(/console\.warn\(`\[uazapi-webhook\] media has no b64 nor url; using fallback placeholder \(norm\.media\.type\)`\);\s*\}\s*\}\s*\}\s*else if\s*\(/g, 
    'console.warn(`[uazapi-webhook] media has no b64 nor url; using fallback placeholder (${norm.media.type})`);\n            }\n          }\n        } else if (');

  content = content.replace(/console\.warn\(`\[uazapi-webhook\] media has no b64 nor url; using fallback placeholder \(norm\.media\.type\)`\);\s*\}\s*\}\s*else if\s*\(/g, 
    'console.warn(`[uazapi-webhook] media has no b64 nor url; using fallback placeholder (${norm.media.type})`);\n            }\n          }\n        } else if (');

  // Also fix the prompt area to be safer
  const promptRegex = /content: `\$\{b\.data\?\.receipt_prompt \|\| 'Você é Sandra, uma assistente virtual\.'\}\\n\\nSua missão:[\s\S]*?JSON: \{"message_type": "comprovante" \| "pergunta" \| "outro"\}\s*` /g;
  content = content.replace(promptRegex, (match) => {
    return `content: \`Instruções: Não transcrever áudio ou PDF. Analisar apenas texto e imagem.\` `;
  });

  fs.writeFileSync(file, content);
  console.log(`Deep patch applied to ${file}`);
});
