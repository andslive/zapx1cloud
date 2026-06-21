import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sparkles, Check } from 'lucide-react';
import { ChannelKey } from '@/types/funnel';
import {
  APPEARANCE_PRESETS,
  AppearancePreset,
  PresetCategory,
} from '@/lib/funnelAppearancePresets';

interface Props {
  channel: ChannelKey;
  onApply: (preset: AppearancePreset, scope: 'channel' | 'all') => void;
}

const CATEGORY_LABEL: Record<PresetCategory | 'all', string> = {
  all: 'Todos',
  messaging: 'Mensageria',
  social: 'Redes sociais',
  generic: 'Genéricos',
};

const CHANNEL_LABEL: Record<ChannelKey, string> = {
  chat: 'Chat',
  form: 'Formulário',
  widget: 'Widget',
  quiz: 'Quiz',
};

export function PresetGallery({ channel, onApply }: Props) {
  const [filter, setFilter] = useState<PresetCategory | 'all'>('all');
  const [pending, setPending] = useState<AppearancePreset | null>(null);

  const filtered = APPEARANCE_PRESETS.filter(
    p => filter === 'all' || p.category === filter
  );

  return (
    <div className="space-y-3 pb-4 border-b">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Temas prontos</h3>
          <Badge variant="secondary" className="text-[10px]">
            {APPEARANCE_PRESETS.length}
          </Badge>
        </div>
        <div className="flex gap-1">
          {(['all', 'messaging', 'social', 'generic'] as const).map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              className={`text-xs px-2.5 py-1 rounded-md transition ${
                filter === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70'
              }`}
            >
              {CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {filtered.map(preset => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setPending(preset)}
            className="group text-left rounded-lg border bg-card overflow-hidden hover:border-primary hover:shadow-md transition"
          >
            <PresetPreview preset={preset} />
            <div className="p-2">
              <div className="text-xs font-semibold leading-tight">{preset.name}</div>
              <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                {preset.description}
              </div>
            </div>
          </button>
        ))}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar tema "{pending?.name}"</AlertDialogTitle>
            <AlertDialogDescription>
              Isso substituirá as configurações visuais atuais. Logos, avatares e imagens de fundo enviados pelo usuário serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onApply(pending, 'channel');
                setPending(null);
              }}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Só no {CHANNEL_LABEL[channel]}
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (pending) onApply(pending, 'all');
                setPending(null);
              }}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Em todos os canais
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// -------- mini preview visual ----------
function PresetPreview({ preset }: { preset: AppearancePreset }) {
  const { primary, bg, accent, bubble } = preset.preview;
  return (
    <div
      className="h-20 w-full relative overflow-hidden"
      style={{ background: bg }}
    >
      {/* header */}
      <div
        className="h-5 w-full flex items-center px-2 gap-1"
        style={{ background: accent }}
      >
        <div className="h-2 w-2 rounded-full bg-white/60" />
        <div className="h-1.5 w-10 bg-white/40 rounded" />
      </div>
      {/* bot bubble */}
      <div className="absolute left-2 top-8">
        <div
          className="h-3 w-12 rounded-md"
          style={{ background: bubble || '#fff', border: '1px solid rgba(0,0,0,0.06)' }}
        />
      </div>
      {/* user bubble */}
      <div className="absolute right-2 top-12">
        <div
          className="h-3 w-10 rounded-md"
          style={{ background: primary }}
        />
      </div>
    </div>
  );
}
