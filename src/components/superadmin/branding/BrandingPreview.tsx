import { useMemo } from 'react';
import { generateColorScale, buildGradient, type GradientStyle } from '@/lib/colors';
import { Bell, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';

interface BrandingPreviewProps {
  primaryColor: string;
  accentColor?: string;
  gradientStyle: GradientStyle;
  gradientCustom?: { start: string; mid: string; end: string } | null;
  borderRadius: number;
  fontFamily?: string;
}

export function BrandingPreview({
  primaryColor,
  accentColor,
  gradientStyle,
  gradientCustom,
  borderRadius,
  fontFamily,
}: BrandingPreviewProps) {
  const styles = useMemo(() => {
    const scale = generateColorScale(primaryColor);
    if (!scale) return null;
    const accentScale = accentColor ? generateColorScale(accentColor) : scale;
    return {
      gradient: buildGradient(scale, gradientStyle, gradientCustom),
      primary: `hsl(${scale.baseStr})`,
      primaryFg: `hsl(${scale.foreground})`,
      accent: `hsl(${accentScale!.baseStr})`,
      accentFg: `hsl(${accentScale!.foreground})`,
      glow: `0 0 20px hsl(${scale.baseStr} / 0.35)`,
      ring: `0 0 0 3px hsl(${scale.baseStr} / 0.30)`,
    };
  }, [primaryColor, accentColor, gradientStyle, gradientCustom]);

  if (!styles) return null;

  const radius = `${borderRadius}px`;

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 sm:p-6 space-y-5"
      style={{ fontFamily: fontFamily ? `${fontFamily}, system-ui, sans-serif` : undefined }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Pré-visualização ao vivo
        </p>
        <span className="text-xs text-muted-foreground shrink-0">Atualiza ao alterar</span>
      </div>

      {/* Hero gradient block */}
      <div
        className="p-6 text-center text-white"
        style={{
          background: styles.gradient,
          borderRadius: radius,
          boxShadow: styles.glow,
        }}
      >
        <div className="flex justify-center mb-3 [&_img]:!h-10 [&_img]:brightness-0 [&_img]:invert">
          <Logo size="lg" />
        </div>
        <h3 className="text-lg font-bold">Sua Plataforma</h3>
        <p className="text-sm opacity-90">Gradiente principal aplicado</p>
      </div>

      {/* Buttons + badge */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="px-4 py-2 text-sm font-medium transition-shadow"
          style={{
            background: styles.primary,
            color: styles.primaryFg,
            borderRadius: radius,
          }}
        >
          Botão Primário
          <ArrowRight className="inline h-4 w-4 ml-1" />
        </button>

        <button
          type="button"
          className="px-4 py-2 text-sm font-medium border-2"
          style={{
            borderColor: styles.primary,
            color: styles.primary,
            borderRadius: radius,
            background: 'transparent',
          }}
        >
          Outline
        </button>

        <span
          className="px-3 py-1 text-xs font-semibold"
          style={{
            background: styles.accent,
            color: styles.accentFg,
            borderRadius: radius,
          }}
        >
          Badge
        </span>

        <button
          type="button"
          className="p-2"
          style={{
            background: styles.primary,
            color: styles.primaryFg,
            borderRadius: '999px',
            boxShadow: styles.ring,
          }}
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>

      {/* Card sample */}
      <div
        className="p-4 border border-border bg-background"
        style={{ borderRadius: radius }}
      >
        <div className="flex items-start gap-3">
          <div
            className="h-10 w-10 shrink-0 flex items-center justify-center overflow-hidden [&_img]:!h-6 [&_img]:brightness-0 [&_img]:invert"
            style={{
              background: styles.gradient,
              borderRadius: radius,
              color: styles.primaryFg,
            }}
          >
            <Logo size="sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Card de exemplo</p>
            <p className="text-xs text-muted-foreground">
              Bordas, ícones e cores acompanham seus tokens.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
