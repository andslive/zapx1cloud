import fs from 'fs';

const files = [
  'supabase/functions/uazapi-webhook/index.ts',
  'supabase/functions/whatsapp-webhook/index.ts',
  'supabase/functions/evolution-webhook/index.ts'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');

  // 1. Disable AI processing for audio and PDF
  // Find: (norm.media.type === "audio" && canAudio) || (norm.media.type === "image" && canImage) || (isPdf && canImage)
  content = content.replace(
    /\(norm\.media\.type\s*===\s*"audio"\s*&&\s*canAudio\)\s*\|\|\s*\(norm\.media\.type\s*===\s*"image"\s*&&\s*canImage\)\s*\|\|\s*\(isPdf\s*&&\s*canImage\)/g,
    '(norm.media.type === "image" && canImage)'
  );

  // 2. Update processedContent placeholders
  content = content.replace(
    /processedContent\s*=\s*`🎙️ Áudio do cliente \(transcrito\): \$\{text\}`;/g,
    'processedContent = `🎙️ [Áudio recebido]`;'
  );
  content = content.replace(
    /processedContent\s*=\s*`📎 Documento PDF \(\$\{fname\}\): \$\{text\}`;/g,
    'processedContent = `📎 Documento PDF (${fname})`;'
  );

  // 3. Update AI prompt
  content = content.replace(
    /1\. Analise com atenção o conteúdo enviado \(texto, áudio transcrito, imagem ou PDF\)\./g,
    '1. Analise com atenção o conteúdo enviado (texto ou imagem). Áudios e PDFs são apenas informativos e você não deve transcrevê-los ou explicá-los.'
  );
  content = content.replace(
    /1\. Analise com atenção o conteúdo enviado \(texto ou imagem\)\. Áudios e PDFs são apenas informativos e você não deve transcrevê-los ou explicá-los\./g,
    '1. Analise com atenção o conteúdo enviado (texto ou imagem). Áudios e PDFs são apenas informativos e você não deve transcrevê-los ou explicá-los.'
  );
  
  // 4. Remove PDF from identify receipt instructions
  content = content.replace(
    /Verifique com atenção se a imagem, PDF ou texto é um comprovante/g,
    'Verifique com atenção se a imagem ou texto é um comprovante'
  );

  fs.writeFileSync(file, content);
  console.log(`Patched ${file}`);
});
