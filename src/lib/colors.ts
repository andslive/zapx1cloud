// Color helpers for dynamic theming

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  try {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;

    const r = parseInt(result[1], 16) / 255;
    const g = parseInt(result[2], 16) / 255;
    const b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    let h = 0,
      s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  } catch {
    return null;
  }
}

/**
 * Retorna '#111827' (quase preto) ou '#ffffff' garantindo o melhor contraste
 * sobre uma cor de fundo em HEX. Aceita "#rgb", "#rrggbb" e cores nomeadas básicas.
 */
export function pickContrast(bg: string | undefined | null): string {
  if (!bg) return '#111827';
  let hex = bg.trim();
  if (hex.startsWith('#')) hex = hex.slice(1);
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length !== 6 || /[^a-f\d]/i.test(hex)) return '#111827';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Luminância perceptual (sRGB)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111827' : '#ffffff';
}

export function hslToString(hsl: { h: number; s: number; l: number }): string {
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function adjustLightness(
  hsl: { h: number; s: number; l: number },
  delta: number
): { h: number; s: number; l: number } {
  return { ...hsl, l: clamp(hsl.l + delta, 0, 100) };
}

export function pickReadableForeground(hsl: { h: number; s: number; l: number }): string {
  // White on dark colors, black on light colors
  return hsl.l > 55 ? '0 0% 10%' : '0 0% 100%';
}

export interface ColorScale {
  base: { h: number; s: number; l: number };
  darker: { h: number; s: number; l: number };
  lighter: { h: number; s: number; l: number };
  baseStr: string;
  darkerStr: string;
  lighterStr: string;
  foreground: string;
}

export function generateColorScale(hex: string): ColorScale | null {
  const base = hexToHsl(hex);
  if (!base) return null;

  // For very dark colors, start a bit lighter to keep gradient visible
  const darkerL = base.l < 30 ? clamp(base.l - 8, 5, 100) : clamp(base.l - 25, 8, 100);
  const lighterL = base.l > 70 ? clamp(base.l + 8, 0, 95) : clamp(base.l + 26, 0, 95);

  const darker = { h: base.h, s: clamp(base.s + 8, 0, 100), l: darkerL };
  const lighter = { h: base.h, s: clamp(base.s - 5, 0, 100), l: lighterL };

  return {
    base,
    darker,
    lighter,
    baseStr: hslToString(base),
    darkerStr: hslToString(darker),
    lighterStr: hslToString(lighter),
    foreground: pickReadableForeground(base),
  };
}

export type GradientStyle = 'solid' | 'soft' | 'vendus' | 'custom';

export function buildGradient(
  scale: ColorScale,
  style: GradientStyle,
  custom?: { start: string; mid: string; end: string } | null
): string {
  if (style === 'solid') {
    return `linear-gradient(135deg, hsl(${scale.baseStr}), hsl(${scale.baseStr}))`;
  }
  if (style === 'soft') {
    return `linear-gradient(135deg, hsl(${scale.baseStr}), hsl(${scale.lighterStr}))`;
  }
  if (style === 'custom' && custom) {
    const s = hexToHsl(custom.start);
    const m = hexToHsl(custom.mid);
    const e = hexToHsl(custom.end);
    if (s && m && e) {
      return `linear-gradient(135deg, hsl(${hslToString(s)}), hsl(${hslToString(m)}), hsl(${hslToString(e)}))`;
    }
  }
  // 'vendus' style (default) — 3 stop rich gradient
  return `linear-gradient(135deg, hsl(${scale.darkerStr}), hsl(${scale.baseStr}), hsl(${scale.lighterStr}))`;
}
