import type { MediaPayload, MediaKind } from '@/components/seller/inbox/MediaAttachment';

/**
 * Lê `metadata.media` de uma mensagem e devolve um payload normalizado para
 * o componente <MediaAttachment/>. Retorna null se a mensagem não tem mídia.
 *
 * Aceita formatos legados (campos espalhados em metadata.* — audio_url,
 * image_url, etc.) e o formato canônico novo (metadata.media = {...}).
 */
export function extractMedia(metadata: any, content?: string | null): MediaPayload | null {
  // Se não temos metadata mas temos um content que parece JSON, tentamos usá-lo como fonte
  let data = metadata;
  if ((!data || Object.keys(data).length === 0 || !data.media) && content && content.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(content);
      // Evolution/UazAPI costuma colocar o objeto da mensagem dentro de "message" ou na raiz
      // Alguns payloads são "chat flows" ou estruturas flat de mídia do WhatsApp
      data = parsed.message || parsed;
    } catch (e) {
      // Ignora erro de parse
    }
  }

  if (!data || typeof data !== 'object') return null;


  // Formato canônico
  if (data.media && typeof data.media === 'object') {
    const m = data.media;
    if (!m.url || !m.kind) return null;
    return {
      kind: normalizeKind(m.kind, m.mime),
      url: String(m.url),
      mime: m.mime ?? null,
      filename: m.filename ?? null,
      size_bytes: typeof m.size_bytes === 'number' ? m.size_bytes : null,
      duration_ms: typeof m.duration_ms === 'number' ? m.duration_ms : null,
      width: typeof m.width === 'number' ? m.width : null,
      height: typeof m.height === 'number' ? m.height : null,
      caption: m.caption ?? null,
      thumbnail_url: m.thumbnail_url ?? null,
    };
  }

  // Formatos nativos do WhatsApp/Evolution (imageMessage, audioMessage, etc.)
  const messageTypes: Array<{ key: string; kind: MediaKind }> = [
    { key: 'imageMessage', kind: 'image' },
    { key: 'videoMessage', kind: 'video' },
    { key: 'audioMessage', kind: 'audio' },
    { key: 'documentMessage', kind: 'document' },
    { key: 'stickerMessage', kind: 'sticker' },
  ];

  for (const { key, kind } of messageTypes) {
    const m = data[key];
    if (m && (m.url || m.directPath || m.URL || m.DirectPath)) {
      const url = m.url || m.directPath || m.URL || m.DirectPath;
      return {
        kind,
        url: String(url),
        mime: m.mimetype || null,
        filename: m.fileName || m.filename || null,
        size_bytes: m.fileLength ? Number(m.fileLength) : null,
        duration_ms: m.seconds ? m.seconds * 1000 : null,
        caption: m.caption || null,
        width: m.width || null,
        height: m.height || null,
      };
    }
  }

  // Formatos legados — tenta achar uma URL conhecida em chaves diretas
  const legacy: Array<{ key: string; kind: MediaKind }> = [
    { key: 'audio_url', kind: 'audio' },
    { key: 'image_url', kind: 'image' },
    { key: 'video_url', kind: 'video' },
    { key: 'document_url', kind: 'document' },
    { key: 'file_url', kind: 'document' },
    { key: 'url', kind: 'document' }, // Genérico
  ];
  for (const { key, kind } of legacy) {
    const url = data[key];
    if (typeof url === 'string' && url.startsWith('http')) {
      return {
        kind: data.kind || kind,
        url,
        mime: data.mime || data.mimetype || null,
        filename: data.filename || data.file_name || null,
        size_bytes: data.size_bytes ?? data.file_size ?? null,
        duration_ms: data.duration_ms ?? null,
        caption: data.caption ?? null,
        thumbnail_url: data.thumbnail_url ?? null,
      };
    }
  }

  // Formato FLAT (Uazapi / whatsmeow naked object)
  // Se o objeto tem directPath ou URL e mimetype, tratamos como mídia
  const flatUrl = data.url || data.URL || data.directPath || data.DirectPath;
  const flatMime = data.mimetype || data.Mimetype || data.mime || data.Mime;
  if (flatUrl && flatMime) {
    const kind = normalizeKind(data.kind, flatMime);
    return {
      kind,
      url: String(flatUrl),
      mime: flatMime,
      filename: data.fileName || data.filename || null,
      size_bytes: data.fileLength || data.file_size || null,
      caption: data.caption || data.Caption || null,
      width: data.width || null,
      height: data.height || null,
    };
  }

  return null;
}


function normalizeKind(raw: any, mime?: string | null): MediaKind {
  const k = String(raw || '').toLowerCase();
  if (k === 'audio' || k === 'image' || k === 'video' || k === 'document' || k === 'sticker') {
    return k;
  }
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('video/')) return 'video';
  return 'document';
}
