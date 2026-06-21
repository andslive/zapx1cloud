import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  generateColorScale,
  buildGradient,
  hexToHsl,
  hslToString,
  pickReadableForeground,
  type GradientStyle,
} from '@/lib/colors';

interface PlatformSettings {
  id: string;
  platform_name: string | null;
  support_email: string | null;
  primary_color: string | null;
  accent_color: string | null;
  gradient_style: string | null;
  gradient_custom: any | null;
  border_radius: number | null;
  default_theme: string | null;
  font_family: string | null;
  font_url: string | null;
  base_font_size: number | null;
  footer_text: string | null;
  terms_url: string | null;
  privacy_url: string | null;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  login_headline: string | null;
  login_subheadline: string | null;
  login_stats_enabled: boolean | null;
  login_bg_image_url: string | null;
  login_bg_layout: string | null;
  login_logo_position: string | null;
  hide_widget_branding: boolean | null;
  widget_accent_color: string | null;
  powered_by_text: string | null;
  browser_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  twitter_handle: string | null;
  default_language: string | null;
}

const FONT_URLS: Record<string, string> = {
  Inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  Poppins: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
  Roboto: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap',
  Manrope: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap',
  'DM Sans': 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap',
  'Plus Jakarta Sans':
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
};

function injectFont(family: string, customUrl?: string | null) {
  const url = customUrl || FONT_URLS[family];
  if (!url) return;
  const linkId = 'platform-dynamic-font';
  let link = document.getElementById(linkId) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== url) link.href = url;
  document.documentElement.style.setProperty(
    '--font-sans',
    `'${family}', system-ui, -apple-system, sans-serif`
  );
  document.body.style.fontFamily = `'${family}', system-ui, -apple-system, sans-serif`;
}

const BRANDING_CACHE_KEY = 'platform-branding-cache-v1';

export const PLATFORM_BRANDING_QUERY_KEY = ['platform-branding'] as const;

export async function fetchPlatformBranding(): Promise<PlatformSettings | null> {
  const { data, error } = await (supabase as any)
    .from('platform_branding_public')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching platform settings:', error);
    return null;
  }

  if (data) {
    try {
      localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(data));
    } catch {
      // ignore quota errors
    }
  }

  return data as unknown as PlatformSettings | null;
}

/**
 * Hook canônico de identidade visual.
 *
 * Importante:
 *  - NÃO usamos `initialData` aqui. Quando combinado com `staleTime > 0`,
 *    o React Query trata o cache como "fresco" e não busca o estado real
 *    do banco — foi por isso que alterações feitas no painel Super Admin
 *    paravam de aparecer ("travadas" em uma versão antiga).
 *  - O `localStorage` continua sendo usado como fallback visual imediato
 *    apenas para evitar flash, lido em sync na primeira renderização.
 */
export function usePlatformBranding() {
  const { data: settings } = useQuery({
    queryKey: PLATFORM_BRANDING_QUERY_KEY,
    queryFn: fetchPlatformBranding,
    // Sempre revalidar — alterações no Super Admin precisam aparecer rápido
    staleTime: 0,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;

    // ===== COLORS =====
    const primary = settings.primary_color || '#84CC16';
    const scale = generateColorScale(primary);
    if (scale) {
      root.style.setProperty('--primary', scale.baseStr);
      root.style.setProperty('--primary-foreground', scale.foreground);
      root.style.setProperty('--ring', scale.baseStr);
      root.style.setProperty('--sidebar-primary', scale.baseStr);
      root.style.setProperty('--sidebar-primary-foreground', scale.foreground);
      root.style.setProperty('--sidebar-ring', scale.baseStr);

      const gradStyle = (settings.gradient_style as GradientStyle) || 'vendus';
      const gradient = buildGradient(scale, gradStyle, settings.gradient_custom || null);
      root.style.setProperty('--gradient-primary', gradient);
      root.style.setProperty(
        '--gradient-accent',
        `linear-gradient(135deg, hsl(${scale.baseStr} / 0.18), hsl(${scale.lighterStr} / 0.06))`
      );
      root.style.setProperty(
        '--gradient-hero',
        `linear-gradient(135deg, hsl(${scale.lighterStr} / 0.12), hsl(${scale.baseStr} / 0.04))`
      );
      root.style.setProperty('--shadow-glow', `0 0 20px hsl(${scale.baseStr} / 0.30)`);
    }

    if (settings.accent_color) {
      const accentHsl = hexToHsl(settings.accent_color);
      if (accentHsl) {
        const accentStr = hslToString(accentHsl);
        root.style.setProperty('--accent', accentStr);
        root.style.setProperty('--accent-foreground', pickReadableForeground(accentHsl));
      }
    }

    if (settings.border_radius != null) {
      root.style.setProperty('--radius', `${settings.border_radius}px`);
    }

    if (settings.font_family) {
      injectFont(settings.font_family, settings.font_url);
    }
    if (settings.base_font_size) {
      root.style.fontSize = `${settings.base_font_size}px`;
    }

    // ===== FAVICON =====
    if (settings.favicon_url) {
      let faviconLink = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        document.head.appendChild(faviconLink);
      }
      faviconLink.href = settings.favicon_url;

      let appleIcon = document.querySelector(
        "link[rel='apple-touch-icon']:not([sizes])"
      ) as HTMLLinkElement;
      if (!appleIcon) {
        appleIcon = document.createElement('link');
        appleIcon.rel = 'apple-touch-icon';
        document.head.appendChild(appleIcon);
      }
      appleIcon.href = settings.favicon_url;

      const appleSizes = ['180x180', '152x152', '144x144', '120x120', '76x76', '60x60'];
      appleSizes.forEach((size) => {
        let icon = document.querySelector(
          `link[rel='apple-touch-icon'][sizes='${size}']`
        ) as HTMLLinkElement;
        if (!icon) {
          icon = document.createElement('link');
          icon.rel = 'apple-touch-icon';
          icon.setAttribute('sizes', size);
          document.head.appendChild(icon);
        }
        icon.href = settings.favicon_url;
      });
    }

    document.title = settings.browser_title || settings.platform_name || 'Plataforma';

    if (settings.primary_color) {
      let themeColor = document.querySelector("meta[name='theme-color']") as HTMLMetaElement;
      if (!themeColor) {
        themeColor = document.createElement('meta');
        themeColor.name = 'theme-color';
        document.head.appendChild(themeColor);
      }
      themeColor.content = settings.primary_color;
    }

    const platformName = settings.platform_name || 'Plataforma';
    const description = settings.meta_description || 'Plataforma de vendas com IA';

    const updateMeta = (selector: string, attr: string, value: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement;
      if (!el) {
        el = document.createElement('meta');
        const match = selector.match(/\[(name|property)='([^']+)'\]/);
        if (match) el.setAttribute(match[1], match[2]);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, value);
    };

    updateMeta("meta[name='description']", 'content', description);
    updateMeta("meta[name='author']", 'content', platformName);
    updateMeta("meta[property='og:title']", 'content', platformName);
    updateMeta("meta[property='og:description']", 'content', description);
    updateMeta("meta[name='twitter:card']", 'content', 'summary_large_image');

    if (settings.twitter_handle) {
      updateMeta("meta[name='twitter:site']", 'content', settings.twitter_handle);
    }

    const ogImage = settings.og_image_url || settings.logo_url;
    if (ogImage) {
      updateMeta("meta[property='og:image']", 'content', ogImage);
      updateMeta("meta[name='twitter:image']", 'content', ogImage);
    }
  }, [settings]);

  return settings;
}

/**
 * Lê o cache local de branding síncronamente — usado apenas como
 * placeholder visual antes do React Query carregar a versão real.
 */
export function readCachedBrandingSync(): PlatformSettings | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(BRANDING_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PlatformSettings) : null;
  } catch {
    return null;
  }
}
