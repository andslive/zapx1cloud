import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { generateColorScale, buildGradient, type GradientStyle } from '@/lib/colors';

interface GradientPickerProps {
  primaryColor: string;
  style: GradientStyle;
  custom?: { start: string; mid: string; end: string } | null;
  onStyleChange: (style: GradientStyle) => void;
  onCustomChange: (custom: { start: string; mid: string; end: string }) => void;
}

const STYLES: { value: GradientStyle; label: string; description: string }[] = [
  { value: 'solid', label: 'Sólido', description: 'Sem gradiente, cor única' },
  { value: 'soft', label: 'Suave', description: '2 paradas — cor → claro' },
  { value: 'vendus', label: 'Rico', description: '3 paradas — escuro → cor → claro' },
  { value: 'custom', label: 'Custom', description: 'Escolha 3 cores manualmente' },
];

export function GradientPicker({
  primaryColor,
  style,
  custom,
  onStyleChange,
  onCustomChange,
}: GradientPickerProps) {
  const scale = generateColorScale(primaryColor);
  const safeCustom = custom || {
    start: '#3F6212',
    mid: primaryColor || '#84CC16',
    end: '#BEF264',
  };

  return (
    <div className="space-y-3">
      <Label>Estilo do Gradiente</Label>
      <div className="grid grid-cols-2 gap-3">
        {STYLES.map((s) => {
          const previewBg = scale
            ? buildGradient(scale, s.value, s.value === 'custom' ? safeCustom : null)
            : undefined;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => onStyleChange(s.value)}
              className={cn(
                'relative rounded-lg border-2 p-3 text-left transition-all',
                style === s.value
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <div
                className="h-12 w-full rounded-md mb-2"
                style={{ background: previewBg }}
              />
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </button>
          );
        })}
      </div>

      {style === 'custom' && (
        <div className="grid grid-cols-3 gap-3 pt-2">
          {(['start', 'mid', 'end'] as const).map((key) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs capitalize">
                {key === 'start' ? 'Início' : key === 'mid' ? 'Meio' : 'Fim'}
              </Label>
              <div className="flex items-center gap-1">
                <input
                  type="color"
                  value={safeCustom[key]}
                  onChange={(e) =>
                    onCustomChange({ ...safeCustom, [key]: e.target.value })
                  }
                  className="w-8 h-8 rounded cursor-pointer border-0"
                />
                <Input
                  value={safeCustom[key]}
                  onChange={(e) =>
                    onCustomChange({ ...safeCustom, [key]: e.target.value })
                  }
                  className="flex-1 font-mono text-xs h-8"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
