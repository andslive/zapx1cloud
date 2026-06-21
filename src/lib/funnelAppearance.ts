import type { ChannelAppearance, ShadowLevel, Density } from '@/types/funnel';

/** Mapeia shadow level para box-shadow CSS. */
export function shadowToCss(s: ShadowLevel): string {
  switch (s) {
    case 'none': return 'none';
    case 'soft': return '0 2px 8px -2px rgb(0 0 0 / 0.08)';
    case 'medium': return '0 8px 24px -8px rgb(0 0 0 / 0.18)';
    case 'strong': return '0 20px 48px -12px rgb(0 0 0 / 0.30)';
  }
}

export function densityToPadding(d: Density): string {
  switch (d) {
    case 'compact': return '0.5rem';
    case 'cozy': return '0.875rem';
    case 'spacious': return '1.25rem';
  }
}

export function densityToGap(d: Density): string {
  switch (d) {
    case 'compact': return '0.5rem';
    case 'cozy': return '0.75rem';
    case 'spacious': return '1rem';
  }
}

/**
 * Gera variáveis CSS + style inline a partir da aparência de um canal.
 * Use no elemento root do renderizador.
 */
export function applyAppearance(a: ChannelAppearance): React.CSSProperties {
  const bgImage = a.background_image_url
    ? `linear-gradient(${a.background_color}${Math.round((1 - (a.background_image_opacity ?? 0.15)) * 255).toString(16).padStart(2,'0')}, ${a.background_color}${Math.round((1 - (a.background_image_opacity ?? 0.15)) * 255).toString(16).padStart(2,'0')}), url(${a.background_image_url})`
    : undefined;

  return {
    // CSS vars consumidas pelo renderer
    ['--fa-primary' as any]: a.primary_color,
    ['--fa-secondary' as any]: a.secondary_color,
    ['--fa-bg' as any]: a.background_color,
    ['--fa-text' as any]: a.text_color,
    ['--fa-radius' as any]: `${a.border_radius}px`,
    ['--fa-shadow' as any]: shadowToCss(a.shadow),
    ['--fa-padding' as any]: densityToPadding(a.density),
    ['--fa-gap' as any]: densityToGap(a.density),
    // Estilo aplicado direto
    backgroundColor: a.background_color,
    color: a.text_color,
    fontFamily: `${a.font_family}, system-ui, sans-serif`,
    fontSize: `${a.font_size_base}px`,
    backgroundImage: bgImage,
    backgroundSize: a.background_image_mode === 'repeat' ? 'auto' : (a.background_image_mode || 'cover'),
    backgroundRepeat: a.background_image_mode === 'repeat' ? 'repeat' : 'no-repeat',
    backgroundPosition: 'center',
  };
}

/** Carrega dinamicamente uma fonte do Google Fonts (idempotente). */
const LOADED_FONTS = new Set<string>();
export function ensureFontLoaded(family: string) {
  if (typeof document === 'undefined') return;
  if (!family || LOADED_FONTS.has(family) || family === 'Inter' || family === 'system-ui') return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
  LOADED_FONTS.add(family);
}

export const FONT_OPTIONS = [
  'Inter', 'Poppins', 'Roboto', 'Manrope', 'DM Sans',
  'Space Grotesk', 'Lora', 'Playfair Display', 'Nunito', 'Outfit',
  'Montserrat', 'Open Sans', 'Work Sans', 'Plus Jakarta Sans',
];
