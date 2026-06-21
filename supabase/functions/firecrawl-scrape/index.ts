const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Clean markdown from player configurations, base64 images, and other artifacts
function cleanMarkdown(markdown: string): string {
  if (!markdown) return '';
  
  let cleaned = markdown;
  
  // 1. Remove JSON code blocks containing player/widget configurations
  cleaned = cleaned.replace(/```(?:json)?\s*\n?\{[\s\S]*?"(?:callActions|smartAutoPlay|playerInit|thumbsniper|conversion|fakeBar|headlines|minihooks|pixels|playback|resume|secure)"[\s\S]*?\n```/gi, '');
  
  // 2. Remove inline JSON objects that look like player configs
  cleaned = cleaned.replace(/\{\s*"(?:callActions|smartAutoPlay|playerInit|conversion|fakeBar)"[\s\S]*?\n\s*\}/g, '');
  
  // 3. Remove large base64 data URIs (images embedded as base64)
  cleaned = cleaned.replace(/!\[.*?\]\(data:image\/[^)]{200,}\)/g, '[imagem]');
  
  // 4. Remove standalone true/false lines (common in JSON dumps)
  cleaned = cleaned.replace(/^\s*(true|false)\s*$/gm, '');
  
  // 5. Remove lines that are just array notation remnants
  cleaned = cleaned.replace(/^\s*[\[\]{}]\s*$/gm, '');
  
  // 6. Remove escaped characters typical of JSON strings
  cleaned = cleaned.replace(/\\n/g, '\n');
  cleaned = cleaned.replace(/\\"/g, '"');
  cleaned = cleaned.replace(/\\\\/g, '\\');
  
  // 7. Remove lines with only special characters or numbers (often from JSON)
  cleaned = cleaned.replace(/^\s*[\d.,]+\s*$/gm, '');
  
  // 8. Remove excessive blank lines (more than 2 consecutive)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // 9. Remove lines starting with common JSON artifacts
  cleaned = cleaned.replace(/^\s*"[a-zA-Z_]+"\s*:\s*[\[{]?\s*$/gm, '');
  cleaned = cleaned.replace(/^\s*},?\s*$/gm, '');
  cleaned = cleaned.replace(/^\s*],?\s*$/gm, '');
  
  // 10. Clean up any remaining artifacts
  cleaned = cleaned.trim();
  
  return cleaned;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, options } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log('Scraping URL:', formattedUrl);

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: options?.formats || ['markdown'],
        onlyMainContent: options?.onlyMainContent ?? true,
        waitFor: options?.waitFor,
        location: options?.location,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed with status ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Scrape successful');
    
    // Clean the markdown content if present
    if (data.data?.markdown) {
      data.data.markdown = cleanMarkdown(data.data.markdown);
    } else if (data.markdown) {
      data.markdown = cleanMarkdown(data.markdown);
    }
    
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
