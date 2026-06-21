import fs from 'fs';

const files = [
  'supabase/functions/uazapi-webhook/index.ts',
  'supabase/functions/whatsapp-webhook/index.ts',
  'supabase/functions/evolution-webhook/index.ts'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // Fix the aiAllowed block closure logic
  // We'll use a regex that matches the whole messy area and replaces it with a clean version.
  
  const startPattern = 'if (aiAllowed) {';
  const endPattern = 'if (norm.media.type === "audio") {'; // The start of the next section
  
  // We'll look for the block starting with if (aiAllowed) and ending before the next section
  // Since the file is huge, let's target the lines we know are broken.
  
  // In uazapi-webhook it's around 2444 to 2500
  // I will just look for the specific sequence of braces that is likely broken.
  
  // Replace the closing of the aiAllowed block
  content = content.replace(/}\s*}\s*(?=\/\/ Toggle off)/, '}\n          }\n        } else ');
  
  // Fix the prompt backtick issue if any
  content = content.replace(/1\. Analise com atenção o conteúdo enviado \(texto ou imagem\)\. Áudios e PDFs são apenas informativos e você não deve transcrevê-los ou explicá-los\./g, 
    '1. Analise com atenção o conteúdo enviado (texto ou imagem). Áudios e PDFs são apenas informativos e você não deve transcrevê-los ou explicá-los.');

  fs.writeFileSync(file, content);
  console.log(`Final syntax fix applied to ${file}`);
});
