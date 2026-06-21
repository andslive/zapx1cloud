import { format, isToday, isYesterday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Tenta extrair o texto de um JSON stringificado se o input parecer um objeto da Evolution/UazAPI.
 */
export function parseMessageContent(input: string | null | undefined): string {
  if (!input) return '';
  let text = String(input).trim();

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      
      // Helper to drill into the message object if nested
      const getDeepText = (obj: any): string | null => {
        if (!obj) return null;
        if (typeof obj === 'string') return obj;
        
        // Texto simples ou estendido (Evolution/UazAPI patterns)
        if (obj.text) return typeof obj.text === 'string' ? obj.text : (obj.text.text || null);
        if (obj.conversation) return obj.conversation;
        if (obj.extendedTextMessage?.text) return obj.extendedTextMessage.text;
        
        // Se for um objeto de mídia flat (URL + mimetype) sem caption, retorna string vazia
        // para que o MessageBubble não renderize o JSON bruto, já que extractMedia cuidará da imagem.
        if ((obj.url || obj.URL || obj.directPath) && (obj.mimetype || obj.Mimetype || obj.mime)) {
          return obj.caption || obj.Caption || '';
        }

        // Nested message structure
        if (obj.message) return getDeepText(obj.message);
        
        // Interactive Message / Buttons
        const interactive = obj.interactiveMessage || obj.InteractiveMessage;
        if (interactive) {
          const flow = interactive.nativeFlowMessage || interactive.NativeFlowMessage;
          if (flow?.buttons?.some((b: any) => b.name === 'payment_info')) {
            return '🛒 Solicitação de Pagamento (PIX)';
          }
          if (interactive.header?.title) return interactive.header.title;
          if (interactive.body?.text) return interactive.body.text;
          return '🔘 Mensagem Interativa';
        }

        // List Message
        const listMessage = obj.listMessage;
        if (listMessage) {
          return listMessage.title || listMessage.description || '📋 Lista de Opções';
        }

        // Buttons Message (Legacy)
        const buttonsMessage = obj.buttonsMessage;
        if (buttonsMessage) {
          return buttonsMessage.contentText || '🔘 Mensagem com Botões';
        }

        // Outros tipos de mídia
        if (obj.imageMessage) return obj.imageMessage.caption || '';
        if (obj.videoMessage) return obj.videoMessage.caption || '';
        if (obj.audioMessage) return '';
        if (obj.documentMessage) return obj.documentMessage.caption || obj.documentMessage.fileName || '';
        if (obj.stickerMessage) return '';
        if (obj.contactMessage) return '👤 Contato';
        if (obj.locationMessage) return '📍 Localização';
        
        return null;
      };

      const deepText = getDeepText(parsed);
      if (deepText !== null) return deepText;

    } catch (e) {
      // Ignora erro de parse e retorna o texto original
    }
  }
  return String(input);
}

/**
 * Converte sintaxe nativa do WhatsApp em Markdown seguro.
 */
export function formatWhatsAppText(input: string | null | undefined): string {
  const rawText = parseMessageContent(input);
  if (!rawText) return '';
  let text = rawText;

  // Preserva blocos de código (``` ... ```) e código inline (` ... `) durante a conversão
  const codeBlocks: string[] = [];
  text = text.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `§§CB${codeBlocks.length - 1}§§`;
  });
  const inlineCodes: string[] = [];
  text = text.replace(/`[^`\n]+`/g, (m) => {
    inlineCodes.push(m);
    return `§§IC${inlineCodes.length - 1}§§`;
  });

  // Escapa caracteres markdown sensíveis fora de código (mantém * _ ~ que vamos converter)
  text = text.replace(/([\\\[\]()#>])/g, '\\$1');

  // *bold* (apenas pares com conteúdo, não asteriscos isolados)
  text = text.replace(/(^|[\s(])\*([^\s*][^*\n]*?[^\s*]|\S)\*(?=[\s.,;:!?)]|$)/g, '$1**$2**');

  // _italic_  -> *italic*
  text = text.replace(/(^|[\s(])_([^\s_][^_\n]*?[^\s_]|\S)_(?=[\s.,;:!?)]|$)/g, '$1*$2*');

  // ~strike~ -> ~~strike~~
  text = text.replace(/(^|[\s(])~([^\s~][^~\n]*?[^\s~]|\S)~(?=[\s.,;:!?)]|$)/g, '$1~~$2~~');

  // Auto-link URLs
  text = text.replace(
    /(^|[\s])((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]])/gi,
    (_m, pre, url) => `${pre}[${url}](${url.startsWith('http') ? url : 'https://' + url})`,
  );

  // Auto-link e-mails
  text = text.replace(
    /(^|[\s])([\w.+-]+@[\w-]+\.[\w.-]+)/g,
    (_m, pre, email) => `${pre}[${email}](mailto:${email})`,
  );

  // Auto-link telefones
  text = text.replace(
    /(^|[\s])(\+\d{1,3}[\s\d().-]{7,}\d)/g,
    (_m, pre, phone) => {
      const clean = phone.replace(/\D/g, '');
      return `${pre}[${phone}](tel:+${clean})`;
    },
  );

  // Restaura códigos
  text = text.replace(/§§IC(\d+)§§/g, (_m, i) => inlineCodes[Number(i)] || '');
  text = text.replace(/§§CB(\d+)§§/g, (_m, i) => codeBlocks[Number(i)] || '');

  return text;
}

/**
 * Remove marcadores de formatação para previews em listas.
 */
export function truncatePreview(input: string | null | undefined, maxLen = 80): string {
  const rawText = parseMessageContent(input);
  if (!rawText) return '';
  let text = rawText
    .replace(/```[\s\S]*?```/g, '[código]')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]{1,2}([^*_~\n]+)[*_~]{1,2}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLen) text = text.slice(0, maxLen - 1).trimEnd() + '…';
  return text;
}

const MEDIA_LABEL: Record<string, string> = {
  audio: '🎤 Áudio',
  image: '📷 Foto',
  sticker: '💟 Figurinha',
  video: '🎬 Vídeo',
  document: '📎 Documento',
};

export function previewWithMedia(
  content: string | null | undefined,
  metadata?: any,
  maxLen = 80,
): string {
  const media = metadata?.media;
  const mediaKind = typeof media?.kind === 'string' ? media.kind.toLowerCase() : null;
  const label = mediaKind ? MEDIA_LABEL[mediaKind] : null;
  const text = truncatePreview(content, maxLen);

  if (label && text) return `${label} · ${truncatePreview(text, maxLen - label.length - 3)}`;
  if (label) return label;
  return text;
}

export type MessageTimeVariant = 'bubble' | 'list' | 'full';

export function formatMessageTime(
  date: string | Date | null | undefined,
  variant: MessageTimeVariant = 'bubble',
): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';

  if (variant === 'bubble') return format(d, 'HH:mm');

  if (variant === 'list') {
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Ontem';
    const diff = Math.abs(differenceInDays(new Date(), d));
    if (diff < 7) return format(d, 'EEEE', { locale: ptBR }).replace(/^./, (c) => c.toUpperCase());
    return format(d, 'dd/MM/yy');
  }

  return format(d, "d 'de' MMM 'às' HH:mm", { locale: ptBR });
}

export function formatSenderLabel(opts: {
  senderType: 'visitor' | 'agent' | 'bot';
  senderName?: string | null;
  isOwnMessage?: boolean;
  agentName?: string | null;
  metadata?: any;
}): string {
  const { senderType, senderName, isOwnMessage, agentName, metadata } = opts;
  
  // Se for visitante, retorna o nome dele
  if (senderType === 'visitor') return senderName?.trim() || 'Visitante';
  
  // Se for bot ou IA
  if (senderType === 'bot') return 'Agente IA';
  
  // Se for sistema (ex: automação sem agente)
  if (metadata?.is_system || metadata?.source === 'system') return 'Sistema';
  
  // Se for o próprio usuário logado
  if (isOwnMessage) return 'Você';
  
  // Se for outro agente (Operador)
  const name = senderName?.trim();
  if (!name) return 'Operador';
  
  // Formata nome curto (ex: "Anderson S.")
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}. (Operador)`;
}
