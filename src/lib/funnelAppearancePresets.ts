// =====================================================
// PRESETS DE APARÊNCIA — temas prontos por canal
// =====================================================
import {
  ChannelAppearance,
  ChannelKey,
  FunnelAppearance,
  defaultChannelAppearance,
} from '@/types/funnel';

export type PresetCategory = 'messaging' | 'social' | 'generic';

export interface AppearancePreset {
  id: string;
  name: string;
  description: string;
  category: PresetCategory;
  preview: { primary: string; bg: string; accent: string; bubble?: string };
  /** Patch base aplicado a todos os canais */
  base: Partial<ChannelAppearance>;
  /** Overrides específicos das channel_options por canal (tipo livre — mesclado raso) */
  perChannelOptions?: Partial<Record<ChannelKey, Record<string, unknown>>>;
}

// -----------------------------------------------------
// Definição dos presets
// -----------------------------------------------------
export const APPEARANCE_PRESETS: AppearancePreset[] = [
  // ============ MENSAGERIA ============
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Verde clássico, bolhas estilo WA',
    category: 'messaging',
    preview: { primary: '#25D366', bg: '#ECE5DD', accent: '#075E54', bubble: '#DCF8C6' },
    base: {
      primary_color: '#25D366',
      secondary_color: '#075E54',
      background_color: '#ECE5DD',
      text_color: '#111B21',
      font_family: 'Inter',
      font_size_base: 14,
      density: 'cozy',
      border_radius: 14,
      shadow: 'soft',
      animations: 'subtle',
      dark_mode: 'light',
      avatar_enabled: true,
      avatar_shape: 'circle',
      bot_name: 'Assistente',
      show_online_status: true,
    },
    perChannelOptions: {
      chat: { bubble_style: 'bubble', bot_bubble_color: '#FFFFFF', user_bubble_color: '#DCF8C6', header_gradient: false, input_placeholder: 'Mensagem' },
      widget: { fab_icon: 'message-circle', callout_text: 'Fale conosco' },
    },
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Azul céu, bolhas suaves',
    category: 'messaging',
    preview: { primary: '#0088CC', bg: '#E7F3FA', accent: '#179CDE', bubble: '#EFFDDE' },
    base: {
      primary_color: '#0088CC',
      secondary_color: '#179CDE',
      background_color: '#E7F3FA',
      text_color: '#0F172A',
      font_family: 'Inter',
      font_size_base: 14,
      density: 'cozy',
      border_radius: 18,
      shadow: 'soft',
      animations: 'subtle',
      dark_mode: 'light',
      avatar_enabled: true,
      avatar_shape: 'circle',
      bot_name: 'Bot',
      show_online_status: true,
    },
    perChannelOptions: {
      chat: { bubble_style: 'rounded', bot_bubble_color: '#FFFFFF', user_bubble_color: '#EFFDDE', header_gradient: true, input_placeholder: 'Escreva uma mensagem' },
    },
  },
  {
    id: 'imessage',
    name: 'iMessage',
    description: 'Estética Apple, azul/cinza',
    category: 'messaging',
    preview: { primary: '#007AFF', bg: '#FFFFFF', accent: '#5856D6', bubble: '#E9E9EB' },
    base: {
      primary_color: '#007AFF',
      secondary_color: '#5856D6',
      background_color: '#FFFFFF',
      text_color: '#000000',
      font_family: 'Inter',
      font_size_base: 15,
      density: 'cozy',
      border_radius: 20,
      shadow: 'none',
      animations: 'subtle',
      dark_mode: 'light',
      avatar_enabled: false,
      avatar_shape: 'circle',
      bot_name: '',
      show_online_status: false,
    },
    perChannelOptions: {
      chat: { bubble_style: 'bubble', bot_bubble_color: '#E9E9EB', user_bubble_color: '#007AFF', header_gradient: false, input_placeholder: 'iMessage' },
    },
  },
  {
    id: 'messenger',
    name: 'Messenger',
    description: 'Azul Facebook, bolhas redondas',
    category: 'messaging',
    preview: { primary: '#0084FF', bg: '#F0F2F5', accent: '#1877F2', bubble: '#0084FF' },
    base: {
      primary_color: '#0084FF',
      secondary_color: '#1877F2',
      background_color: '#F0F2F5',
      text_color: '#050505',
      font_family: 'Inter',
      font_size_base: 14,
      density: 'cozy',
      border_radius: 22,
      shadow: 'soft',
      animations: 'subtle',
      dark_mode: 'light',
      avatar_enabled: true,
      avatar_shape: 'circle',
      bot_name: 'Atendente',
      show_online_status: true,
    },
    perChannelOptions: {
      chat: { bubble_style: 'rounded', bot_bubble_color: '#E4E6EB', user_bubble_color: '#0084FF', header_gradient: true, input_placeholder: 'Aa' },
    },
  },

  // ============ REDES SOCIAIS ============
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Gradiente vibrante laranja-rosa',
    category: 'social',
    preview: { primary: '#DD2A7B', bg: '#FFFFFF', accent: '#F58529', bubble: '#FCE7F3' },
    base: {
      primary_color: '#DD2A7B',
      secondary_color: '#F58529',
      background_color: '#FFFFFF',
      text_color: '#262626',
      font_family: 'Inter',
      font_size_base: 14,
      density: 'cozy',
      border_radius: 16,
      shadow: 'soft',
      animations: 'full',
      dark_mode: 'light',
      avatar_enabled: true,
      avatar_shape: 'circle',
      bot_name: 'X1ZAP',
      show_online_status: true,
    },
    perChannelOptions: {
      chat: { bubble_style: 'rounded', bot_bubble_color: '#FAFAFA', user_bubble_color: '#FCE7F3', header_gradient: true },
    },
  },
  {
    id: 'instagram-stories',
    name: 'Stories',
    description: 'Dark mode, glass, vibrante',
    category: 'social',
    preview: { primary: '#E1306C', bg: '#000000', accent: '#833AB4', bubble: '#262626' },
    base: {
      primary_color: '#E1306C',
      secondary_color: '#833AB4',
      background_color: '#000000',
      text_color: '#FFFFFF',
      font_family: 'Inter',
      font_size_base: 15,
      density: 'spacious',
      border_radius: 24,
      shadow: 'strong',
      animations: 'full',
      dark_mode: 'dark',
      avatar_enabled: true,
      avatar_shape: 'circle',
      bot_name: 'X1ZAP',
      show_online_status: true,
    },
    perChannelOptions: {
      chat: { bubble_style: 'bubble', bot_bubble_color: '#262626', user_bubble_color: '#E1306C', header_gradient: true },
    },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    description: 'Preto + ciano + magenta',
    category: 'social',
    preview: { primary: '#FE2C55', bg: '#000000', accent: '#25F4EE', bubble: '#1F1F1F' },
    base: {
      primary_color: '#FE2C55',
      secondary_color: '#25F4EE',
      background_color: '#000000',
      text_color: '#FFFFFF',
      font_family: 'Inter',
      font_size_base: 15,
      density: 'spacious',
      border_radius: 12,
      shadow: 'medium',
      animations: 'full',
      dark_mode: 'dark',
      avatar_enabled: true,
      avatar_shape: 'circle',
      bot_name: 'X1ZAP',
      show_online_status: true,
    },
    perChannelOptions: {
      chat: { bubble_style: 'squared', bot_bubble_color: '#1F1F1F', user_bubble_color: '#FE2C55', header_gradient: false },
    },
  },

  // ============ GENÉRICOS ============
  {
    id: 'light-clean',
    name: 'Light Clean',
    description: 'Limpo, branco, azul moderno',
    category: 'generic',
    preview: { primary: '#3B82F6', bg: '#F8FAFC', accent: '#6366F1', bubble: '#E2E8F0' },
    base: {
      primary_color: '#3B82F6',
      secondary_color: '#6366F1',
      background_color: '#F8FAFC',
      text_color: '#0F172A',
      font_family: 'Inter',
      font_size_base: 14,
      density: 'cozy',
      border_radius: 16,
      shadow: 'soft',
      animations: 'subtle',
      dark_mode: 'light',
      avatar_enabled: true,
      avatar_shape: 'circle',
      bot_name: 'Assistente',
      show_online_status: true,
    },
  },
  {
    id: 'dark-pro',
    name: 'Dark Pro',
    description: 'Fundo escuro, contraste alto',
    category: 'generic',
    preview: { primary: '#6366F1', bg: '#0F172A', accent: '#A78BFA', bubble: '#1E293B' },
    base: {
      primary_color: '#6366F1',
      secondary_color: '#A78BFA',
      background_color: '#0F172A',
      text_color: '#F8FAFC',
      font_family: 'Inter',
      font_size_base: 14,
      density: 'cozy',
      border_radius: 14,
      shadow: 'strong',
      animations: 'full',
      dark_mode: 'dark',
      avatar_enabled: true,
      avatar_shape: 'circle',
      bot_name: 'Assistente',
      show_online_status: true,
    },
    perChannelOptions: {
      chat: { bubble_style: 'rounded', bot_bubble_color: '#1E293B', user_bubble_color: '#6366F1', header_gradient: true },
    },
  },
  {
    id: 'minimal-mono',
    name: 'Minimal Mono',
    description: 'Preto e branco, sem sombras',
    category: 'generic',
    preview: { primary: '#000000', bg: '#FFFFFF', accent: '#404040', bubble: '#F5F5F5' },
    base: {
      primary_color: '#000000',
      secondary_color: '#404040',
      background_color: '#FFFFFF',
      text_color: '#000000',
      font_family: 'Inter',
      font_size_base: 14,
      density: 'cozy',
      border_radius: 0,
      shadow: 'none',
      animations: 'off',
      dark_mode: 'light',
      avatar_enabled: false,
      avatar_shape: 'square',
      bot_name: '',
      show_online_status: false,
    },
    perChannelOptions: {
      chat: { bubble_style: 'squared', bot_bubble_color: '#F5F5F5', user_bubble_color: '#000000', header_gradient: false },
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Laranja vibrante para rosa',
    category: 'generic',
    preview: { primary: '#FF6B35', bg: '#FFF7ED', accent: '#E84393', bubble: '#FFEDD5' },
    base: {
      primary_color: '#FF6B35',
      secondary_color: '#E84393',
      background_color: '#FFF7ED',
      text_color: '#1A1A1A',
      font_family: 'Outfit',
      font_size_base: 15,
      density: 'spacious',
      border_radius: 20,
      shadow: 'medium',
      animations: 'full',
      dark_mode: 'light',
      avatar_enabled: true,
      avatar_shape: 'circle',
      bot_name: 'X1ZAP',
      show_online_status: true,
    },
  },
  {
    id: 'corporate-blue',
    name: 'Corporate',
    description: 'Azul marinho + dourado',
    category: 'generic',
    preview: { primary: '#0F1B3D', bg: '#F5F0E0', accent: '#C9A84C', bubble: '#FFFFFF' },
    base: {
      primary_color: '#0F1B3D',
      secondary_color: '#C9A84C',
      background_color: '#F5F0E0',
      text_color: '#0F1B3D',
      font_family: 'Inter',
      font_size_base: 14,
      density: 'cozy',
      border_radius: 6,
      shadow: 'soft',
      animations: 'subtle',
      dark_mode: 'light',
      avatar_enabled: true,
      avatar_shape: 'square',
      bot_name: 'Atendimento',
      show_online_status: true,
    },
    perChannelOptions: {
      chat: { bubble_style: 'rounded', bot_bubble_color: '#FFFFFF', user_bubble_color: '#0F1B3D', header_gradient: false },
    },
  },
];

// -----------------------------------------------------
// Aplicação de preset
// -----------------------------------------------------

/**
 * Aplica um preset ao canal indicado, preservando as opções específicas
 * do canal quando o preset não as define.
 */
export function applyPresetToChannel(
  current: ChannelAppearance,
  preset: AppearancePreset,
  channel: ChannelKey
): ChannelAppearance {
  const base = defaultChannelAppearance(channel);
  const presetChannelOpts = preset.perChannelOptions?.[channel] || {};
  const mergedOptions = {
    ...base.channel_options,
    ...current.channel_options,
    ...presetChannelOpts,
  } as ChannelAppearance['channel_options'];

  return {
    ...base,
    ...preset.base,
    // preserva uploads do usuário (logos, avatares, bg) ao trocar tema
    logo_url: current.logo_url ?? null,
    avatar_url: current.avatar_url ?? null,
    background_image_url: current.background_image_url ?? null,
    channel_options: mergedOptions,
  };
}

/**
 * Aplica preset a todos os 4 canais de uma vez.
 */
export function applyPresetToAll(
  current: FunnelAppearance,
  preset: AppearancePreset
): FunnelAppearance {
  return {
    chat: applyPresetToChannel(current.chat, preset, 'chat'),
    form: applyPresetToChannel(current.form, preset, 'form'),
    widget: applyPresetToChannel(current.widget, preset, 'widget'),
    quiz: applyPresetToChannel(current.quiz, preset, 'quiz'),
  };
}

export function getPresetById(id: string): AppearancePreset | undefined {
  return APPEARANCE_PRESETS.find(p => p.id === id);
}

// silencia warning: defaultChannelOptions é importado mas usado tipologicamente
