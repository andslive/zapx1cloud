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
    if (lines[i].includes('receipt_identify_receipt !== false')) {
      console.log(`Fixing line ${i+1} in ${file}`);
      // Replace the whole line to ensure no mismatched quotes
      lines[i] = "                     ${b.data?.receipt_identify_receipt !== false ? '2. Identificar Comprovante: Verifique com atenção se a imagem ou texto é um comprovante de pagamento (Pix, Transferência, Boleto, etc). Mesmo que falte alguma informação, se for claramente um comprovante, marque como identified: true.\\n3. Extração: Extraia o Nome do pagador (ou beneficiário se o pagador não constar) e o Valor exato.' : ''}";
    }
  }

  fs.writeFileSync(file, lines.join('\n'));
});
