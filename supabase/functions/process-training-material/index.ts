import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
  material_id: string;
  file_url: string;
  file_path?: string;
  product_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: ProcessRequest = await req.json();
    
    console.log('[process-training-material] Processing material:', body.material_id);

    if (!body.material_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: material_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update status to processing
    await supabase
      .from('agent_training_materials')
      .update({ processing_status: 'processing' })
      .eq('id', body.material_id);

    // Download the file
    let fileContent = '';
    let fileData: Blob | null = null;
    
    try {
      if (body.file_path) {
        const { data, error: downloadError } = await supabase.storage
          .from('product-documents')
          .download(body.file_path);
        
        if (downloadError) throw new Error(`Storage download failed: ${downloadError.message}`);
        fileData = data;
      } else if (body.file_url) {
        const response = await fetch(body.file_url);
        if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
        fileData = await response.blob();
      } else {
        throw new Error('No file_url or file_path provided');
      }

      if (!fileData) throw new Error('No file data received');

      const contentType = fileData.type || '';
      const fileName = body.file_url || body.file_path || '';
      const isPdf = contentType.includes('pdf') || fileName.endsWith('.pdf');
      const isDocx = contentType.includes('wordprocessingml') || contentType.includes('msword') || fileName.endsWith('.docx') || fileName.endsWith('.doc');
      
      if (isPdf) {
        // PDF: use AI for faithful OCR/text extraction
        fileContent = await extractDocumentFaithfully(fileData, 'application/pdf', 'document.pdf');
      } else if (isDocx) {
        // DOCX: parse XML from ZIP archive
        fileContent = await extractDocxText(fileData);
      } else if (contentType.includes('text/') || contentType.includes('application/json')) {
        // Text/JSON: store as-is
        fileContent = await fileData.text();
      } else {
        // Unknown binary: try AI extraction as fallback
        const rawText = await fileData.text();
        const nonPrintable = (rawText.match(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g) || []).length;
        if (nonPrintable > rawText.length * 0.05) {
          // Binary file - try as PDF
          fileContent = await extractDocumentFaithfully(fileData, 'application/pdf', 'document.pdf');
        } else {
          fileContent = rawText;
        }
      }
      
      console.log('[process-training-material] Extracted content length:', fileContent.length);
    } catch (fetchError: unknown) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('[process-training-material] Error:', fetchError);
      
      await supabase
        .from('agent_training_materials')
        .update({ 
          processing_status: 'failed',
          processing_error: `Erro ao processar arquivo: ${errorMessage}`
        })
        .eq('id', body.material_id);

      return new Response(
        JSON.stringify({ error: 'Failed to process file', details: errorMessage }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!fileContent || fileContent.length < 10) {
      await supabase
        .from('agent_training_materials')
        .update({ 
          processing_status: 'failed',
          processing_error: 'Arquivo vazio ou não legível'
        })
        .eq('id', body.material_id);

      return new Response(
        JSON.stringify({ error: 'File is empty or unreadable' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store faithfully - remove null bytes and truncate at 50k chars for DB safety
    const extractedContent = fileContent.replace(/\u0000/g, '').substring(0, 50000);

    const { error: updateError } = await supabase
      .from('agent_training_materials')
      .update({
        extracted_content: extractedContent,
        processing_status: 'completed',
        processing_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', body.material_id);

    if (updateError) throw updateError;

    console.log('[process-training-material] Complete! Stored', extractedContent.length, 'chars faithfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        material_id: body.material_id,
        content_length: extractedContent.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[process-training-material] Error:', error);
    
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Extract text from documents (PDF, DOCX, DOC) faithfully using AI - no summarization.
 */
async function extractDocumentFaithfully(fileData: Blob, mimeType: string, filename: string): Promise<string> {
  const arrayBuffer = await fileData.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Convert to base64 in chunks
  let base64 = '';
  const chunkSize = 32768;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    base64 += String.fromCharCode.apply(null, [...chunk]);
  }
  base64 = btoa(base64);
  
  console.log('[process-training-material] Document base64 length:', base64.length, 'type:', mimeType);

  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  
  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        {
          role: 'system',
          content: `Você é um extrator de texto de documentos.

REGRAS ABSOLUTAS:
1. Extraia TODO o texto do documento de forma FIEL e COMPLETA
2. Mantenha a estrutura original (títulos, subtítulos, parágrafos, listas, tabelas)
3. NÃO resuma, NÃO altere, NÃO omita NENHUMA parte do texto
4. NÃO adicione comentários, interpretações ou análises
5. NÃO reorganize o conteúdo - mantenha a ordem original
6. Se houver tabelas, reproduza-as em formato legível
7. Se houver imagens com texto (OCR), extraia o texto fielmente
8. Retorne APENAS o texto extraído, nada mais`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extraia TODO o texto deste documento de forma fiel e completa:'
            },
            {
              type: 'file',
              file: {
                filename: filename,
                file_data: `data:${mimeType};base64,${base64}`
              }
            }
          ]
        }
      ],
      max_tokens: 16000,
      temperature: 0.1,
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error('[process-training-material] AI extraction failed:', errorText);
    throw new Error(`Failed to extract document content with AI: ${errorText.substring(0, 200)}`);
  }

  const aiData = await aiResponse.json();
  const content = aiData.choices?.[0]?.message?.content || '';
  console.log('[process-training-material] Faithful extraction complete, length:', content.length);
  return content;
}

/**
 * Extract text from DOCX by parsing the ZIP archive and reading word/document.xml
 * DOCX is a ZIP containing XML files. Main text is in word/document.xml
 */
async function extractDocxText(fileData: Blob): Promise<string> {
  const arrayBuffer = await fileData.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  // Find all local file headers in ZIP
  const files = parseZipEntries(uint8Array);
  
  // Find word/document.xml
  const docEntry = files.find(f => f.name === 'word/document.xml');
  if (!docEntry) {
    throw new Error('Invalid DOCX: word/document.xml not found');
  }
  
  // Decompress the entry
  const xmlContent = await decompressEntry(docEntry, uint8Array);
  
  // Parse XML to extract text
  const text = extractTextFromDocXml(xmlContent);
  
  console.log('[process-training-material] DOCX text extracted, length:', text.length);
  return text;
}

interface ZipEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  dataOffset: number;
}

function parseZipEntries(data: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;
  
  while (offset < data.length - 4) {
    // Local file header signature = 0x04034b50
    if (data[offset] === 0x50 && data[offset + 1] === 0x4b && 
        data[offset + 2] === 0x03 && data[offset + 3] === 0x04) {
      
      const compressionMethod = data[offset + 8] | (data[offset + 9] << 8);
      const compressedSize = data[offset + 18] | (data[offset + 19] << 8) | (data[offset + 20] << 16) | (data[offset + 21] << 24);
      const uncompressedSize = data[offset + 22] | (data[offset + 23] << 8) | (data[offset + 24] << 16) | (data[offset + 25] << 24);
      const nameLength = data[offset + 26] | (data[offset + 27] << 8);
      const extraLength = data[offset + 28] | (data[offset + 29] << 8);
      
      const nameBytes = data.slice(offset + 30, offset + 30 + nameLength);
      const name = new TextDecoder().decode(nameBytes);
      
      const dataOffset = offset + 30 + nameLength + extraLength;
      
      entries.push({ name, compressedSize, uncompressedSize, compressionMethod, dataOffset });
      
      offset = dataOffset + compressedSize;
    } else {
      offset++;
    }
  }
  
  return entries;
}

async function decompressEntry(entry: ZipEntry, data: Uint8Array): Promise<string> {
  const compressedData = data.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  
  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    return new TextDecoder().decode(compressedData);
  }
  
  if (entry.compressionMethod === 8) {
    // Deflate
    // Create a raw deflate stream (no header)
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    
    const chunks: Uint8Array[] = [];
    
    const writePromise = writer.write(compressedData).then(() => writer.close());
    
    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    })();
    
    await Promise.all([writePromise, readPromise]);
    
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    
    return new TextDecoder().decode(result);
  }
  
  throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
}

function extractTextFromDocXml(xml: string): string {
  const lines: string[] = [];
  let currentParagraph = '';
  
  // Split by paragraph tags <w:p ...>...</w:p>
  const paragraphs = xml.split(/<w:p[\s>]/);
  
  for (const para of paragraphs) {
    if (!para) continue;
    
    // Extract all text runs <w:t ...>text</w:t>
    const textMatches = para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    if (textMatches) {
      currentParagraph = textMatches
        .map(m => {
          const match = m.match(/<w:t[^>]*>([^<]*)<\/w:t>/);
          return match ? match[1] : '';
        })
        .join('');
    }
    
    // Check for line breaks <w:br/>
    if (para.includes('<w:br')) {
      if (currentParagraph.trim()) {
        lines.push(currentParagraph.trim());
      }
      currentParagraph = '';
    }
    
    if (currentParagraph.trim()) {
      lines.push(currentParagraph.trim());
      currentParagraph = '';
    }
  }
  
  // Clean up: remove excessive blank lines
  return lines.filter(l => l.length > 0).join('\n');
}
