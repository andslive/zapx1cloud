import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Timer, Scissors, Type, Play, User, MessageCircle, Plus, X, Zap, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Mirrors supabase/functions/_shared/humanizer.ts
export interface PersonaStory { title: string; description: string }
export interface PersonaConfig {
  age?: number | null;
  city?: string;
  backstory?: string;
  hobbies?: string[];
  stories?: PersonaStory[];
  loved_words?: string[];
  forbidden_words?: string[];
}
export type LinguisticRegion =
  | 'neutral' | 'paulista' | 'carioca' | 'nordestino' | 'sulista' | 'mineiro' | 'custom';
export interface TicsConfig {
  region?: LinguisticRegion;
  slang?: string[];
  openers?: string[];
  connectors?: string[];
  fillers?: string[];
}

export type ReactionTriggerType = 'inactive_hours' | 'message_type' | 'keyword';
export type ReactionMessageType = 'audio' | 'sticker' | 'emoji_only' | 'image' | 'video';
export type ReactionAction = 'reply' | 'context';
export interface ReactionRule {
  id: string;
  enabled?: boolean;
  label?: string;
  type: ReactionTriggerType;
  hours?: number;
  message_type?: ReactionMessageType;
  keywords?: string[];
  match?: 'any' | 'all';
  action: ReactionAction;
  reply?: string;
  context?: string;
}
export interface ReactionsConfig { enabled?: boolean; rules?: ReactionRule[] }

export interface HumanizationConfig {
  enabled?: boolean;
  timing?: {
    enabled?: boolean;
    first_reply_min_s?: number;
    first_reply_max_s?: number;
    between_bubbles_min_s?: number;
    between_bubbles_max_s?: number;
    typing_indicator?: boolean;
    vary_by_hours?: boolean;
    no_reply_dawn?: boolean;
    vary_by_channel?: boolean;
  };
  splitting?: {
    enabled?: boolean;
    aggressiveness?: number;
    min_bubbles?: number;
    max_bubbles?: number;
  };
  style?: {
    lowercase_prob?: number;
    relaxed_punct_prob?: number;
    abbrev_prob?: number;
    abbreviations?: string;
    typo_correction_prob?: number;
    laughter_prob?: number;
    laughter_style?: 'kkk' | 'rs' | 'haha' | 'kk' | 'auto';
    emoji_density?: 'none' | 'low' | 'medium' | 'high';
  };
  persona?: PersonaConfig;
  tics?: TicsConfig;
  reactions?: ReactionsConfig;
}

export const DEFAULT_HUMANIZATION: HumanizationConfig = {
  enabled: true,
  timing: {
    enabled: true,
    first_reply_min_s: 4,
    first_reply_max_s: 12,
    between_bubbles_min_s: 1,
    between_bubbles_max_s: 4,
    typing_indicator: true,
    vary_by_hours: false,
    no_reply_dawn: false,
    vary_by_channel: true,
  },
  splitting: { enabled: true, aggressiveness: 3, min_bubbles: 1, max_bubbles: 4 },
  style: {
    lowercase_prob: 0.6,
    relaxed_punct_prob: 0.4,
    abbrev_prob: 0.5,
    abbreviations: 'você=vc\ntambém=tbm\nporque=pq\nestá=tá\nbeleza=blz',
    typo_correction_prob: 0.05,
    laughter_prob: 0.3,
    laughter_style: 'auto',
    emoji_density: 'low',
  },
  persona: {
    age: null,
    city: '',
    backstory: '',
    hobbies: [],
    stories: [],
    loved_words: [],
    forbidden_words: [],
  },
  tics: {
    region: 'neutral',
    slang: [],
    openers: [],
    connectors: [],
    fillers: [],
  },
  reactions: {
    enabled: true,
    rules: [
      { id: 'r-emoji', enabled: true, label: 'Lead respondeu só com emoji', type: 'message_type', message_type: 'emoji_only', action: 'context', context: 'O lead acabou de responder APENAS com emoji. Reaja de forma curta e natural (1 linha) e faça uma pergunta leve para destravar a conversa.' },
      { id: 'r-audio', enabled: true, label: 'Lead mandou áudio', type: 'message_type', message_type: 'audio', action: 'context', context: 'O lead enviou um áudio (você recebeu a transcrição). Comente brevemente ("entendi seu áudio…") antes de responder, soando humano.' },
      { id: 'r-sticker', enabled: true, label: 'Lead mandou figurinha', type: 'message_type', message_type: 'sticker', action: 'reply', reply: 'kkk boa 😄' },
      { id: 'r-bot-suspicion', enabled: true, label: 'Lead acha que é robô', type: 'keyword', match: 'any', keywords: ['é robô', 'é bot', 'é uma ia', 'voce é humano', 'é humano?'], action: 'context', context: 'O lead está desconfiado se você é bot/IA. NÃO confirme nem negue mecanicamente — responda de forma humana e natural.' },
      { id: 'r-busy', enabled: true, label: 'Lead disse que está ocupado', type: 'keyword', match: 'any', keywords: ['ocupado', 'sem tempo', 'depois falo', 'agora não', 'em reunião'], action: 'reply', reply: 'tranquilo! qual o melhor horário pra te chamar mais tarde?' },
      { id: 'r-apology', enabled: true, label: 'Lead pediu desculpa pela demora', type: 'keyword', match: 'any', keywords: ['desculpa a demora', 'foi mal a demora', 'demorei pra responder'], action: 'context', context: 'O lead pediu desculpa pela demora. Acolha de forma leve ("imagina, sem stress") antes de continuar.' },
    ],
  },
};

interface Props {
  value?: HumanizationConfig | null;
  onChange: (next: HumanizationConfig) => void;
}

export function AgentHumanizationTab({ value, onChange }: Props) {
  const cfg: HumanizationConfig = useMemo(() => ({
    ...DEFAULT_HUMANIZATION,
    ...(value || {}),
    timing: { ...DEFAULT_HUMANIZATION.timing, ...(value?.timing || {}) },
    splitting: { ...DEFAULT_HUMANIZATION.splitting, ...(value?.splitting || {}) },
    style: { ...DEFAULT_HUMANIZATION.style, ...(value?.style || {}) },
    persona: { ...DEFAULT_HUMANIZATION.persona, ...(value?.persona || {}) },
    tics: { ...DEFAULT_HUMANIZATION.tics, ...(value?.tics || {}) },
    reactions: { ...DEFAULT_HUMANIZATION.reactions, ...(value?.reactions || {}), rules: value?.reactions?.rules ?? DEFAULT_HUMANIZATION.reactions!.rules },
  }), [value]);

  const set = (patch: Partial<HumanizationConfig>) => onChange({ ...cfg, ...patch });
  const setTiming = (p: Partial<HumanizationConfig['timing']>) =>
    onChange({ ...cfg, timing: { ...cfg.timing, ...p } });
  const setSplit = (p: Partial<HumanizationConfig['splitting']>) =>
    onChange({ ...cfg, splitting: { ...cfg.splitting, ...p } });
  const setStyle = (p: Partial<HumanizationConfig['style']>) =>
    onChange({ ...cfg, style: { ...cfg.style, ...p } });
  const setPersona = (p: Partial<PersonaConfig>) =>
    onChange({ ...cfg, persona: { ...cfg.persona, ...p } });
  const setTics = (p: Partial<TicsConfig>) =>
    onChange({ ...cfg, tics: { ...cfg.tics, ...p } });
  const setReactions = (p: Partial<ReactionsConfig>) =>
    onChange({ ...cfg, reactions: { ...cfg.reactions, ...p } });
  const updateRule = (idx: number, patch: Partial<ReactionRule>) => {
    const rules = [...(cfg.reactions?.rules ?? [])];
    rules[idx] = { ...rules[idx], ...patch };
    setReactions({ rules });
  };
  const addRule = () => {
    const rules = [...(cfg.reactions?.rules ?? [])];
    rules.push({
      id: `r-${Date.now()}`,
      enabled: true,
      label: 'Nova reação',
      type: 'keyword',
      keywords: [],
      match: 'any',
      action: 'context',
      context: '',
    });
    setReactions({ rules });
  };
  const removeRule = (idx: number) => {
    const rules = (cfg.reactions?.rules ?? []).filter((_, i) => i !== idx);
    setReactions({ rules });
  };

  return (
    <div className="space-y-4">
      {/* Master toggle */}
      <Card>
        <CardContent className="pt-6 flex items-center justify-between gap-4">
          <div>
            <div className="font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Humanização ativada
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Quando desligado, mensagens são enviadas como antes (sem delays nem quebra).
            </p>
          </div>
          <Switch checked={cfg.enabled !== false} onCheckedChange={(v) => set({ enabled: v })} />
        </CardContent>
      </Card>

      <div className={cn(cfg.enabled === false && 'opacity-50 pointer-events-none')}>
        {/* SECTION 1: Persona Estendida */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Persona Estendida
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Idade</Label>
                <Input
                  type="number" min={18} max={90}
                  value={cfg.persona?.age ?? ''}
                  onChange={(e) => setPersona({ age: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Ex: 28"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Cidade/Região</Label>
                <Input
                  value={cfg.persona?.city ?? ''}
                  onChange={(e) => setPersona({ city: e.target.value })}
                  placeholder="Ex: São Paulo, SP"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Backstory profissional (até 500 chars)</Label>
              <Textarea
                rows={3} maxLength={500}
                value={cfg.persona?.backstory ?? ''}
                onChange={(e) => setPersona({ backstory: e.target.value })}
                placeholder="Ex: Trabalhei 3 anos em agência de tráfego antes de entrar no time."
              />
            </div>
            <TagsInput
              label="Hobbies/interesses pessoais (até 5)"
              max={5}
              items={cfg.persona?.hobbies ?? []}
              onChange={(items) => setPersona({ hobbies: items })}
              placeholder="ex: café especial, corrida, séries"
            />
            <StoriesInput
              items={cfg.persona?.stories ?? []}
              onChange={(items) => setPersona({ stories: items })}
            />
            <TagsInput
              label="Palavras que ela ADORA usar"
              items={cfg.persona?.loved_words ?? []}
              onChange={(items) => setPersona({ loved_words: items })}
              placeholder="ex: show, top, massa"
            />
            <TagsInput
              label="Palavras que ela NUNCA usa"
              items={cfg.persona?.forbidden_words ?? []}
              onChange={(items) => setPersona({ forbidden_words: items })}
              placeholder="ex: incrível, fantástico, maravilhoso"
            />
          </CardContent>
        </Card>

        {/* SECTION 2: Timing */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" /> Timing & Delays
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ToggleRow
              label="Ativar timing humano"
              checked={cfg.timing?.enabled !== false}
              onCheckedChange={(v) => setTiming({ enabled: v })}
            />

            <RangeSlider
              label="Delay antes da primeira resposta"
              unit="s"
              min={1} max={15}
              minValue={cfg.timing?.first_reply_min_s ?? 4}
              maxValue={cfg.timing?.first_reply_max_s ?? 12}
              onChange={(mn, mx) => setTiming({ first_reply_min_s: mn, first_reply_max_s: mx })}
            />

            <RangeSlider
              label="Delay entre bolhas"
              unit="s"
              min={1} max={6}
              minValue={cfg.timing?.between_bubbles_min_s ?? 1}
              maxValue={cfg.timing?.between_bubbles_max_s ?? 4}
              onChange={(mn, mx) => setTiming({ between_bubbles_min_s: mn, between_bubbles_max_s: mx })}
            />

            <ToggleRow
              label='Mostrar "digitando..." real no WhatsApp'
              hint="Dispara o status real (Evolution Go) no celular do cliente. Teste em Admin → WhatsApp → Instâncias → Testar presença."
              checked={cfg.timing?.typing_indicator !== false}
              onCheckedChange={(v) => setTiming({ typing_indicator: v })}
            />
            <ToggleRow
              label="Variar por horário"
              hint="Fora do horário comercial (8h-18h) os delays aumentam ~50% (antes dobravam)"
              checked={cfg.timing?.vary_by_hours === true}
              onCheckedChange={(v) => setTiming({ vary_by_hours: v })}
            />
            <ToggleRow
              label="Não responder de madrugada"
              hint="Mensagens recebidas entre 0h e 6h são respondidas a partir das 8h"
              checked={!!cfg.timing?.no_reply_dawn}
              onCheckedChange={(v) => setTiming({ no_reply_dawn: v })}
            />
            <ToggleRow
              label="Variar por canal"
              hint="Chat de site responde mais rápido (50% dos delays); Instagram/Facebook mais lento (120%)"
              checked={cfg.timing?.vary_by_channel !== false}
              onCheckedChange={(v) => setTiming({ vary_by_channel: v })}
            />
          </CardContent>
        </Card>

        {/* SECTION 3: Splitting */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Scissors className="h-4 w-4 text-primary" /> Quebra de Mensagens
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ToggleRow
              label="Quebrar mensagens automaticamente"
              checked={cfg.splitting?.enabled !== false}
              onCheckedChange={(v) => setSplit({ enabled: v })}
            />
            <SingleSlider
              label="Agressividade da quebra"
              min={1} max={5} step={1}
              value={cfg.splitting?.aggressiveness ?? 3}
              onChange={(v) => setSplit({ aggressiveness: v })}
              hintMap={{
                1: '1 — Nunca quebra',
                2: '2 — Só mensagens longas',
                3: '3 — Equilibrado (2-3 bolhas)',
                4: '4 — Quebra muito (3-4 bolhas)',
                5: '5 — Cada frase = uma bolha',
              }}
            />
            <div className="grid grid-cols-2 gap-4">
              <NumberField
                label="Mínimo de bolhas"
                min={1} max={10}
                value={cfg.splitting?.min_bubbles ?? 1}
                onChange={(v) => setSplit({ min_bubbles: v })}
              />
              <NumberField
                label="Máximo de bolhas"
                min={1} max={10}
                value={cfg.splitting?.max_bubbles ?? 4}
                onChange={(v) => setSplit({ max_bubbles: v })}
              />
            </div>
          </CardContent>
        </Card>

        {/* SECTION 4: Style */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Type className="h-4 w-4 text-primary" /> Estilo de Escrita
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <PercentSlider
              label="Probabilidade de minúscula no início"
              value={cfg.style?.lowercase_prob ?? 0.6}
              onChange={(v) => setStyle({ lowercase_prob: v })}
            />
            <PercentSlider
              label="Probabilidade de pontuação relaxada"
              value={cfg.style?.relaxed_punct_prob ?? 0.4}
              onChange={(v) => setStyle({ relaxed_punct_prob: v })}
            />
            <PercentSlider
              label="Probabilidade de abreviação"
              value={cfg.style?.abbrev_prob ?? 0.5}
              onChange={(v) => setStyle({ abbrev_prob: v })}
            />
            <div className="space-y-2">
              <Label className="text-xs">Lista de abreviações (uma por linha, formato: original=abreviado)</Label>
              <Textarea
                rows={5}
                className="font-mono text-xs"
                value={cfg.style?.abbreviations ?? ''}
                onChange={(e) => setStyle({ abbreviations: e.target.value })}
                placeholder="você=vc&#10;também=tbm&#10;porque=pq"
              />
            </div>
            <PercentSlider
              label="Erro proposital + correção"
              value={cfg.style?.typo_correction_prob ?? 0.05}
              onChange={(v) => setStyle({ typo_correction_prob: v })}
            />
            <div className="grid grid-cols-2 gap-4">
              <PercentSlider
                label='Uso de "kkk"/"rs"/"haha"'
                value={cfg.style?.laughter_prob ?? 0.3}
                onChange={(v) => setStyle({ laughter_prob: v })}
              />
              <div className="space-y-2">
                <Label className="text-xs">Estilo preferido</Label>
                <Select
                  value={cfg.style?.laughter_style ?? 'auto'}
                  onValueChange={(v) => setStyle({ laughter_style: v as any })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-misturado</SelectItem>
                    <SelectItem value="kkk">kkk</SelectItem>
                    <SelectItem value="kk">kk</SelectItem>
                    <SelectItem value="rs">rs</SelectItem>
                    <SelectItem value="haha">haha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Densidade de emojis</Label>
              <Select
                value={cfg.style?.emoji_density ?? 'low'}
                onValueChange={(v) => setStyle({ emoji_density: v as any })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  <SelectItem value="low">Pouco</SelectItem>
                  <SelectItem value="medium">Médio</SelectItem>
                  <SelectItem value="high">Muito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 5: Tiques & Gírias */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" /> Tiques & Gírias
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Região linguística</Label>
              <Select
                value={cfg.tics?.region ?? 'neutral'}
                onValueChange={(v) => setTics({ region: v as LinguisticRegion })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutral">Neutro nacional</SelectItem>
                  <SelectItem value="paulista">Paulista (mano, tipo, então)</SelectItem>
                  <SelectItem value="carioca">Carioca (cara, véi, mermão)</SelectItem>
                  <SelectItem value="nordestino">Nordestino (oxe, vixe, massa)</SelectItem>
                  <SelectItem value="sulista">Sulista (tchê, bah, guri)</SelectItem>
                  <SelectItem value="mineiro">Mineiro (uai, sô, trem)</SelectItem>
                  <SelectItem value="custom">Customizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TagsInput
              label="Gírias específicas (até 20)"
              max={20}
              items={cfg.tics?.slang ?? []}
              onChange={(items) => setTics({ slang: items })}
              placeholder="ex: show, massa, top, dahora"
            />
            <TagsInput
              label="Interjeições de abertura"
              items={cfg.tics?.openers ?? []}
              onChange={(items) => setTics({ openers: items })}
              placeholder="ex: opa, então, ó, eita, hmm"
            />
            <TagsInput
              label="Conectivos casuais"
              items={cfg.tics?.connectors ?? []}
              onChange={(items) => setTics({ connectors: items })}
              placeholder="ex: tipo, sabe, né, daí, aí"
            />
            <TagsInput
              label="Frases de muleta (até 10)"
              max={10}
              items={cfg.tics?.fillers ?? []}
              onChange={(items) => setTics({ fillers: items })}
              placeholder="ex: deixa eu ver aqui, calma que vou te falar"
            />
          </CardContent>
        </Card>

        {/* SECTION 6: Reações Contextuais */}
        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Reações Contextuais
              </CardTitle>
              <div className="flex items-center gap-2">
                <Switch
                  checked={cfg.reactions?.enabled !== false}
                  onCheckedChange={(v) => setReactions({ enabled: v })}
                />
                <Button type="button" size="sm" variant="outline" onClick={addRule}>
                  <Plus className="h-4 w-4 mr-1" /> Nova regra
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Detectadas ANTES da IA responder. Em "Reply direto", o agente envia o texto fixo (sem chamar IA). Em "Injetar contexto", a IA recebe a instrução e responde do jeito certo.
            </p>
          </CardHeader>
          <CardContent className={cn('space-y-3', cfg.reactions?.enabled === false && 'opacity-50 pointer-events-none')}>
            {(cfg.reactions?.rules ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-md">
                Nenhuma regra. Clique em "Nova regra" para começar.
              </div>
            )}
            {(cfg.reactions?.rules ?? []).map((rule, idx) => (
              <ReactionRuleCard
                key={rule.id}
                rule={rule}
                onChange={(p) => updateRule(idx, p)}
                onRemove={() => removeRule(idx)}
              />
            ))}
          </CardContent>
        </Card>

        {/* PREVIEW */}
        <PreviewCard cfg={cfg} />
      </div>
    </div>
  );
}

// ─── TagsInput ───────────────────────────────────────────────────────

function TagsInput({
  label, items, onChange, placeholder, max,
}: { label: string; items: string[]; onChange: (next: string[]) => void; placeholder?: string; max?: number }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (max && items.length >= max) return;
    if (items.includes(v)) { setInput(''); return; }
    onChange([...items, v]);
    setInput('');
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}{max ? ` · ${items.length}/${max}` : ''}</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
        />
        <Button type="button" size="icon" variant="outline" onClick={add} disabled={!!max && items.length >= max}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((it, i) => (
            <Badge key={`${it}-${i}`} variant="secondary" className="gap-1">
              {it}
              <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── StoriesInput ────────────────────────────────────────────────────

function StoriesInput({
  items, onChange,
}: { items: PersonaStory[]; onChange: (next: PersonaStory[]) => void }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const max = 5;
  const add = () => {
    const t = title.trim(); const d = desc.trim();
    if (!t || !d || items.length >= max) return;
    onChange([...items, { title: t, description: d }]);
    setTitle(''); setDesc('');
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs">Histórias pessoais reutilizáveis · {items.length}/{max}</Label>
      <div className="space-y-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da história" />
        <div className="flex gap-2">
          <Textarea
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Descrição curta — quando usar e o que mencionar"
          />
          <Button type="button" size="icon" variant="outline" onClick={add} disabled={items.length >= max}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {items.length > 0 && (
        <div className="space-y-1">
          {items.map((s, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex-1">
                <div className="font-medium">{s.title}</div>
                <div className="text-muted-foreground">{s.description}</div>
              </div>
              <button type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── helper subcomponents ─────────────────────────────────────────────

function ToggleRow({
  label, hint, checked, onCheckedChange,
}: { label: string; hint?: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function RangeSlider({
  label, unit, min, max, minValue, maxValue, onChange,
}: { label: string; unit: string; min: number; max: number; minValue: number; maxValue: number; onChange: (mn: number, mx: number) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground">{minValue}{unit} – {maxValue}{unit}</span>
      </div>
      <Slider
        min={min} max={max} step={1}
        value={[minValue, maxValue]}
        onValueChange={([a, b]) => onChange(Math.min(a, b), Math.max(a, b))}
      />
    </div>
  );
}

function SingleSlider({
  label, min, max, step, value, onChange, hintMap,
}: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; hintMap?: Record<number, string> }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground">{hintMap?.[value] ?? value}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function PercentSlider({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <Slider min={0} max={100} step={5} value={[pct]} onValueChange={([v]) => onChange(v / 100)} />
    </div>
  );
}

function NumberField({
  label, min, max, value, onChange,
}: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
      />
    </div>
  );
}

// ─── Live preview ─────────────────────────────────────────────────────

function PreviewCard({ cfg }: { cfg: HumanizationConfig }) {
  const [input, setInput] = useState(
    'Boa pergunta! Nossa plataforma funciona como white label. Você consegue revender pros seus clientes. Quer que eu te explique como funciona o modelo de receita?'
  );
  const [bubbles, setBubbles] = useState<string[]>([]);
  const [delays, setDelays] = useState<{ first: number; between: number[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [revealed, setRevealed] = useState(0);

  const simulate = async () => {
    const r = previewHumanize(input, cfg);
    setBubbles(r.bubbles);
    setDelays({ first: r.firstMs, between: r.betweenMs });
    setRunning(true);
    setRevealed(0);
    await wait(r.firstMs);
    for (let i = 0; i < r.bubbles.length; i++) {
      setRevealed(i + 1);
      if (i < r.bubbles.length - 1) await wait(r.betweenMs[i]);
    }
    setRunning(false);
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" /> Preview ao vivo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={3} value={input} onChange={(e) => setInput(e.target.value)} />
        <Button onClick={simulate} disabled={running} size="sm">
          {running ? 'Simulando...' : 'Simular'}
        </Button>
        {delays && (
          <div className="text-xs text-muted-foreground">
            Espera inicial: {(delays.first / 1000).toFixed(1)}s · Entre bolhas: {delays.between.map((b) => (b / 1000).toFixed(1) + 's').join(' · ') || '—'}
          </div>
        )}
        {bubbles.length > 0 && (
          <div className="space-y-2 bg-muted/40 rounded-lg p-3">
            {bubbles.slice(0, revealed).map((b, i) => (
              <div key={i} className="bg-primary/10 rounded-lg px-3 py-2 text-sm max-w-[85%]">
                {b}
              </div>
            ))}
            {running && revealed < bubbles.length && (
              <div className="text-xs text-muted-foreground italic">digitando…</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Lightweight preview impl mirroring backend humanizer (no typo pair, simpler).
function previewHumanize(text: string, cfg: HumanizationConfig) {
  const styled = applyStylePreview(text, cfg.style ?? {});
  const bubbles = splitBubblesPreview(styled, cfg.splitting ?? {});
  const t = cfg.timing ?? {};
  const enabled = cfg.enabled !== false && t.enabled !== false;
  const rand = (a: number, b: number) => Math.round((a + Math.random() * (b - a)) * 1000);
  const firstMs = enabled ? rand(t.first_reply_min_s ?? 8, t.first_reply_max_s ?? 30) : 0;
  const betweenMs = bubbles.slice(1).map(() => enabled ? rand(t.between_bubbles_min_s ?? 3, t.between_bubbles_max_s ?? 12) : 0);
  return { bubbles, firstMs, betweenMs };
}

function applyStylePreview(text: string, style: NonNullable<HumanizationConfig['style']>): string {
  let t = text.trim();
  const abbrevs = parseAbbrevs(style.abbreviations);
  const chance = (p: number) => Math.random() < (p ?? 0);
  if ((style.abbrev_prob ?? 0) > 0) {
    const keys = Object.keys(abbrevs).sort((a, b) => b.length - a.length);
    for (const k of keys) {
      const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      t = t.replace(re, (m) => chance(style.abbrev_prob!) ? abbrevs[k] : m);
    }
  }
  if ((style.lowercase_prob ?? 0) > 0) {
    t = t.replace(/(^|[.!?]\s+)([A-ZÁÉÍÓÚ])/g, (_m, s, c) => chance(style.lowercase_prob!) ? s + c.toLowerCase() : s + c);
  }
  if ((style.relaxed_punct_prob ?? 0) > 0 && chance(style.relaxed_punct_prob!)) {
    t = t.replace(/\.$/g, '');
  }
  return t;
}

function splitBubblesPreview(t: string, cfg: NonNullable<HumanizationConfig['splitting']>): string[] {
  if (cfg.enabled === false) return [t];
  const aggr = Math.max(1, Math.min(5, cfg.aggressiveness ?? 3));
  if (aggr === 1) return [t];
  if (aggr === 2 && t.length <= 200) return [t];
  const sentences = t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1) return [t];
  let desired: number;
  if (aggr === 2) desired = Math.ceil(sentences.length / 3);
  else if (aggr === 3) desired = Math.ceil(sentences.length / 2);
  else if (aggr === 4) desired = Math.max(2, Math.ceil((sentences.length * 3) / 4));
  else desired = sentences.length;
  desired = Math.max(cfg.min_bubbles ?? 1, Math.min(cfg.max_bubbles ?? 4, Math.min(desired, sentences.length)));
  const per = Math.ceil(sentences.length / desired);
  const bubbles: string[] = [];
  for (let i = 0; i < sentences.length; i += per) bubbles.push(sentences.slice(i, i + per).join(' '));
  while (bubbles.length > (cfg.max_bubbles ?? 4)) {
    const last = bubbles.pop()!;
    bubbles[bubbles.length - 1] += ' ' + last;
  }
  return bubbles;
}

function parseAbbrevs(raw?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (raw ?? '').split(/\n+/)) {
    const [a, b] = line.split('=').map((s) => s?.trim());
    if (a && b) out[a.toLowerCase()] = b;
  }
  return out;
}

// ─── ReactionRuleCard ────────────────────────────────────────────────

function ReactionRuleCard({
  rule, onChange, onRemove,
}: { rule: ReactionRule; onChange: (p: Partial<ReactionRule>) => void; onRemove: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Switch
          checked={rule.enabled !== false}
          onCheckedChange={(v) => onChange({ enabled: v })}
        />
        <Input
          className="h-8 text-sm font-medium"
          value={rule.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Nome da regra"
        />
        <Button type="button" size="icon" variant="ghost" onClick={onRemove} title="Remover">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Gatilho</Label>
          <Select value={rule.type} onValueChange={(v) => onChange({ type: v as ReactionTriggerType })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="keyword">Palavra-chave</SelectItem>
              <SelectItem value="message_type">Tipo de mensagem</SelectItem>
              <SelectItem value="inactive_hours">Tempo inativo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ação</Label>
          <Select value={rule.action} onValueChange={(v) => onChange({ action: v as ReactionAction })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reply">Reply direto (sem IA)</SelectItem>
              <SelectItem value="context">Injetar contexto na IA</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {rule.type === 'keyword' && (
        <div className="space-y-2">
          <TagsInput
            label="Palavras-chave (case-insensitive)"
            items={rule.keywords ?? []}
            onChange={(items) => onChange({ keywords: items })}
            placeholder="ex: ocupado, robô, depois falo"
          />
          <div className="flex items-center gap-2">
            <Label className="text-xs">Modo:</Label>
            <Select value={rule.match ?? 'any'} onValueChange={(v) => onChange({ match: v as 'any' | 'all' })}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer (OR)</SelectItem>
                <SelectItem value="all">Todas (AND)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {rule.type === 'message_type' && (
        <div className="space-y-1">
          <Label className="text-xs">Tipo de mensagem</Label>
          <Select
            value={rule.message_type ?? 'audio'}
            onValueChange={(v) => onChange({ message_type: v as ReactionMessageType })}
          >
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="audio">Áudio</SelectItem>
              <SelectItem value="sticker">Figurinha / Sticker</SelectItem>
              <SelectItem value="emoji_only">Apenas emoji</SelectItem>
              <SelectItem value="image">Imagem</SelectItem>
              <SelectItem value="video">Vídeo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {rule.type === 'inactive_hours' && (
        <div className="space-y-1">
          <Label className="text-xs">Inativo há (horas)</Label>
          <Input
            type="number" min={1} max={168}
            value={rule.hours ?? 24}
            onChange={(e) => onChange({ hours: Math.max(1, Number(e.target.value) || 1) })}
            className="h-8 w-32"
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">
          {rule.action === 'reply' ? 'Resposta enviada (texto exato)' : 'Instrução injetada na IA'}
        </Label>
        <Textarea
          rows={2}
          value={rule.action === 'reply' ? (rule.reply ?? '') : (rule.context ?? '')}
          onChange={(e) =>
            rule.action === 'reply'
              ? onChange({ reply: e.target.value })
              : onChange({ context: e.target.value })
          }
          placeholder={
            rule.action === 'reply'
              ? 'ex: tranquilo! qual o melhor horário pra te chamar?'
              : 'ex: O lead está desconfiado. Responda de forma humana, sem confirmar nem negar.'
          }
        />
      </div>
    </div>
  );
}
