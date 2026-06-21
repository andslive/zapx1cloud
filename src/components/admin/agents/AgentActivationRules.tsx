import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, X, Target, Info, Minus } from 'lucide-react';
import { ProductAgent } from '@/types/agents';
import { toast } from 'sonner';

interface Props {
  formData: Partial<ProductAgent>;
  onChange: (updates: Partial<ProductAgent>) => void;
}

const SCOPE_CHANNELS: Array<{ key: 'whatsapp' | 'chat' | 'inbox' | 'funnel'; label: string }> = [
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'chat', label: 'Chat do site' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'funnel', label: 'Funis' },
];

function scopeToChannels(scope: string | undefined): Set<string> {
  if (!scope || scope === 'all') return new Set(['whatsapp', 'chat', 'inbox', 'funnel']);
  return new Set([scope]);
}

function channelsToScope(channels: Set<string>): string {
  if (channels.size >= 4) return 'all';
  if (channels.size === 0) return 'all';
  if (channels.size === 1) return Array.from(channels)[0];
  return 'all';
}

export function AgentActivationRules({ formData, onChange }: Props) {
  const [kwInput, setKwInput] = useState('');
  const [phraseInput, setPhraseInput] = useState('');

  const keywords = formData.activation_keywords || [];
  const phrases = formData.activation_phrases || [];
  const priority = formData.activation_priority ?? 0;
  const takeover = formData.takeover_on_match ?? true;
  const channelSet = scopeToChannels(formData.activation_scope);

  const addKeyword = () => {
    const v = kwInput.trim();
    if (!v) return;
    if (v.length < 3) {
      toast.error('Use palavras com pelo menos 3 letras');
      return;
    }
    if (keywords.includes(v)) {
      setKwInput('');
      return;
    }
    onChange({ activation_keywords: [...keywords, v] });
    setKwInput('');
  };

  const removeKeyword = (i: number) => {
    onChange({ activation_keywords: keywords.filter((_, idx) => idx !== i) });
  };

  const addPhrase = () => {
    const v = phraseInput.trim();
    if (!v) return;
    if (v.length < 3) {
      toast.error('Use frases com pelo menos 3 caracteres');
      return;
    }
    if (phrases.includes(v)) {
      setPhraseInput('');
      return;
    }
    onChange({ activation_phrases: [...phrases, v] });
    setPhraseInput('');
  };

  const removePhrase = (i: number) => {
    onChange({ activation_phrases: phrases.filter((_, idx) => idx !== i) });
  };

  const toggleChannel = (key: string) => {
    const next = new Set(channelSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ activation_scope: channelsToScope(next) });
  };

  return (
    <TooltipProvider>
      <div className="space-y-4 p-4 rounded-lg border border-primary/20 bg-primary/5">
        <div className="flex items-start gap-2">
          <Target className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="flex-1">
            <Label className="text-sm font-semibold">Acionamento Automático</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Quando o lead disser qualquer uma destas palavras ou frases, este agente assume a conversa automaticamente.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label className="text-xs">Palavras-chave</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Match por palavra isolada (ex.: "preço" bate em "qual o preço?", mas não em "imprecisão").
                Mínimo 3 letras.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex gap-2">
            <Input
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              placeholder="Ex: preço, comprar, valor"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
              className="h-9"
            />
            <Button type="button" size="icon" variant="outline" onClick={addKeyword}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((k, i) => (
                <Badge key={i} variant="secondary" className="pr-1">
                  {k}
                  <button
                    type="button"
                    onClick={() => removeKeyword(i)}
                    className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1">
            <Label className="text-xs">Frases exatas</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Match por substring (ignorando acentos/maiúsculas). Ex.: "quero contratar" bate em
                "Eu quero contratar agora".
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex gap-2">
            <Input
              value={phraseInput}
              onChange={(e) => setPhraseInput(e.target.value)}
              placeholder='Ex: "quero contratar", "como faço pra pagar"'
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPhrase())}
              className="h-9"
            />
            <Button type="button" size="icon" variant="outline" onClick={addPhrase}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {phrases.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {phrases.map((p, i) => (
                <Badge key={i} variant="outline" className="pr-1">
                  "{p}"
                  <button
                    type="button"
                    onClick={() => removePhrase(i)}
                    className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Canais onde vale o gatilho</Label>
          <div className="flex flex-wrap gap-2">
            {SCOPE_CHANNELS.map((c) => {
              const active = channelSet.has(c.key);
              return (
                <button
                  type="button"
                  key={c.key}
                  onClick={() => toggleChannel(c.key)}
                  className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-xs">Prioridade de acionamento</Label>
              <p className="text-[11px] text-muted-foreground">
                Usada se mais de um agente bater ao mesmo tempo (maior vence)
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-7 w-7"
                onClick={() => onChange({ activation_priority: Math.max(0, priority - 1) })}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-8 text-center font-mono text-sm">{priority}</span>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-7 w-7"
                onClick={() => onChange({ activation_priority: priority + 1 })}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <Label className="text-xs">Assumir a conversa após acionamento</Label>
            <p className="text-[11px] text-muted-foreground">
              Se desligado, responde só uma vez sem trocar o titular
            </p>
          </div>
          <Switch
            checked={takeover}
            onCheckedChange={(v) => onChange({ takeover_on_match: v })}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
