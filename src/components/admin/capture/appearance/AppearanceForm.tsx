import { useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Palette, Type, LayoutGrid, User, Image as ImageIcon, Sliders, Code } from 'lucide-react';
import type { ChannelAppearance, ChannelKey, ChatChannelOptions, FormChannelOptions, WidgetChannelOptions, QuizChannelOptions } from '@/types/funnel';
import { ColorPickerField } from '@/components/superadmin/branding/ColorPickerField';
import { ImageUploadField } from './ImageUploadField';
import { FONT_OPTIONS, ensureFontLoaded } from '@/lib/funnelAppearance';

interface Props {
  channel: ChannelKey;
  appearance: ChannelAppearance;
  onChange: (next: ChannelAppearance) => void;
}

export function AppearanceForm({ channel, appearance, onChange }: Props) {
  const set = <K extends keyof ChannelAppearance>(k: K, v: ChannelAppearance[K]) =>
    onChange({ ...appearance, [k]: v });
  const setOpt = (patch: Record<string, any>) =>
    onChange({ ...appearance, channel_options: { ...appearance.channel_options, ...patch } as any });

  useEffect(() => { ensureFontLoaded(appearance.font_family); }, [appearance.font_family]);

  return (
    <Accordion type="multiple" defaultValue={['colors', 'typography', 'layout']} className="space-y-2">
      {/* CORES */}
      <AccordionItem value="colors" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2"><Palette className="h-4 w-4" /> Cores</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pt-2">
          <ColorPickerField label="Cor primária" value={appearance.primary_color} onChange={(v) => set('primary_color', v)} />
          <ColorPickerField label="Cor secundária" value={appearance.secondary_color} onChange={(v) => set('secondary_color', v)} />
          <ColorPickerField label="Cor de fundo" value={appearance.background_color} onChange={(v) => set('background_color', v)} />
          <ColorPickerField label="Cor do texto" value={appearance.text_color} onChange={(v) => set('text_color', v)} />
        </AccordionContent>
      </AccordionItem>

      {/* TIPOGRAFIA */}
      <AccordionItem value="typography" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2"><Type className="h-4 w-4" /> Tipografia</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label>Fonte</Label>
            <Select value={appearance.font_family} onValueChange={(v) => set('font_family', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map(f => <SelectItem key={f} value={f} style={{ fontFamily: f }}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tamanho base ({appearance.font_size_base}px)</Label>
            <Slider min={12} max={20} step={1} value={[appearance.font_size_base]} onValueChange={([v]) => set('font_size_base', v)} />
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* LAYOUT & ESPAÇAMENTO */}
      <AccordionItem value="layout" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Layout & Espaçamento</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label>Densidade</Label>
            <Select value={appearance.density} onValueChange={(v) => set('density', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="compact">Compacto</SelectItem>
                <SelectItem value="cozy">Confortável</SelectItem>
                <SelectItem value="spacious">Espaçoso</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cantos arredondados ({appearance.border_radius}px)</Label>
            <Slider min={0} max={32} step={2} value={[appearance.border_radius]} onValueChange={([v]) => set('border_radius', v)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sombra</Label>
            <Select value={appearance.shadow} onValueChange={(v) => set('shadow', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                <SelectItem value="soft">Suave</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="strong">Forte</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Animações</Label>
            <Select value={appearance.animations} onValueChange={(v) => set('animations', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Desligadas</SelectItem>
                <SelectItem value="subtle">Sutis</SelectItem>
                <SelectItem value="full">Completas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* MARCA & AVATAR */}
      <AccordionItem value="branding" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2"><User className="h-4 w-4" /> Marca & Avatar</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pt-2">
          <ImageUploadField
            label="Logo"
            value={appearance.logo_url}
            onChange={(url) => set('logo_url', url)}
            folder="logos"
          />
          <div className="space-y-1.5">
            <Label>Posição do logo</Label>
            <Select value={appearance.logo_position || 'left'} onValueChange={(v) => set('logo_position', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Esquerda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <Label className="flex flex-col gap-0.5">
              <span>Mostrar avatar do bot</span>
              <span className="text-xs text-muted-foreground font-normal">Exibir foto + nome no header</span>
            </Label>
            <Switch checked={appearance.avatar_enabled} onCheckedChange={(v) => set('avatar_enabled', v)} />
          </div>

          {appearance.avatar_enabled && (
            <>
              <ImageUploadField
                label="Foto do avatar"
                value={appearance.avatar_url}
                onChange={(url) => set('avatar_url', url)}
                folder="avatars"
              />
              <div className="space-y-1.5">
                <Label>Formato do avatar</Label>
                <Select value={appearance.avatar_shape} onValueChange={(v) => set('avatar_shape', v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="circle">Círculo</SelectItem>
                    <SelectItem value="square">Quadrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Nome exibido</Label>
                <Input value={appearance.bot_name} onChange={(e) => set('bot_name', e.target.value)} placeholder="Assistente" />
              </div>
              <div className="flex items-center justify-between">
                <Label>Mostrar status "online"</Label>
                <Switch checked={appearance.show_online_status} onCheckedChange={(v) => set('show_online_status', v)} />
              </div>
            </>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* FUNDO (imagem) */}
      <AccordionItem value="background" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Imagem de fundo</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pt-2">
          <ImageUploadField
            label="Imagem de fundo"
            value={appearance.background_image_url}
            onChange={(url) => set('background_image_url', url)}
            folder="backgrounds"
          />
          {appearance.background_image_url && (
            <>
              <div className="space-y-1.5">
                <Label>Modo</Label>
                <Select value={appearance.background_image_mode || 'cover'} onValueChange={(v) => set('background_image_mode', v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">Preencher (cover)</SelectItem>
                    <SelectItem value="contain">Encaixar (contain)</SelectItem>
                    <SelectItem value="repeat">Repetir</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Opacidade ({Math.round((appearance.background_image_opacity ?? 0.15) * 100)}%)</Label>
                <Slider min={0} max={100} step={5} value={[(appearance.background_image_opacity ?? 0.15) * 100]} onValueChange={([v]) => set('background_image_opacity', v / 100)} />
              </div>
            </>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* ESPECÍFICO DO CANAL */}
      <AccordionItem value="channel" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2"><Sliders className="h-4 w-4" /> Opções do canal — {channel}</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pt-2">
          {channel === 'chat' && <ChatOptionsFields opts={appearance.channel_options as ChatChannelOptions} setOpt={setOpt} />}
          {channel === 'form' && <FormOptionsFields opts={appearance.channel_options as FormChannelOptions} setOpt={setOpt} />}
          {channel === 'widget' && <WidgetOptionsFields opts={appearance.channel_options as WidgetChannelOptions} setOpt={setOpt} />}
          {channel === 'quiz' && <QuizOptionsFields opts={appearance.channel_options as QuizChannelOptions} setOpt={setOpt} />}
        </AccordionContent>
      </AccordionItem>

      {/* CSS CUSTOM */}
      <AccordionItem value="css" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2"><Code className="h-4 w-4" /> CSS personalizado</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-2 pt-2">
          <Textarea
            value={appearance.custom_css || ''}
            onChange={(e) => set('custom_css', e.target.value)}
            rows={6}
            placeholder=".meu-bloco { color: red; }"
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">Aplicado apenas neste canal. Use com cuidado.</p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// ============ Campos específicos por canal ============

function ChatOptionsFields({ opts, setOpt }: { opts: ChatChannelOptions; setOpt: (p: any) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Estilo da bolha</Label>
        <Select value={opts.bubble_style} onValueChange={(v) => setOpt({ bubble_style: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="rounded">Arredondada</SelectItem>
            <SelectItem value="squared">Quadrada</SelectItem>
            <SelectItem value="bubble">Bolha</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ColorPickerField label="Cor da bolha do bot" value={opts.bot_bubble_color} onChange={(v) => setOpt({ bot_bubble_color: v })} />
      <ColorPickerField label="Cor da bolha do usuário" value={opts.user_bubble_color} onChange={(v) => setOpt({ user_bubble_color: v })} />
      <div className="space-y-1.5">
        <Label>Placeholder do campo</Label>
        <Input value={opts.input_placeholder} onChange={(e) => setOpt({ input_placeholder: e.target.value })} />
      </div>
      <div className="flex items-center justify-between"><Label>Gradiente no header</Label><Switch checked={opts.header_gradient} onCheckedChange={(v) => setOpt({ header_gradient: v })} /></div>
      <div className="flex items-center justify-between"><Label>Mostrar "digitando…"</Label><Switch checked={opts.show_typing} onCheckedChange={(v) => setOpt({ show_typing: v })} /></div>
      <div className="flex items-center justify-between"><Label>Som de notificação</Label><Switch checked={opts.notification_sound} onCheckedChange={(v) => setOpt({ notification_sound: v })} /></div>
    </>
  );
}

function FormOptionsFields({ opts, setOpt }: { opts: FormChannelOptions; setOpt: (p: any) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Layout</Label>
        <Select value={opts.layout} onValueChange={(v) => setOpt({ layout: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Página única</SelectItem>
            <SelectItem value="step">Passo a passo</SelectItem>
            <SelectItem value="conversational">Conversacional</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Largura máxima ({opts.max_width}px)</Label>
        <Slider min={400} max={1024} step={20} value={[opts.max_width]} onValueChange={([v]) => setOpt({ max_width: v })} />
      </div>
      <div className="space-y-1.5">
        <Label>Alinhamento</Label>
        <Select value={opts.alignment} onValueChange={(v) => setOpt({ alignment: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="left">Esquerda</SelectItem>
            <SelectItem value="center">Centro</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Estilo dos inputs</Label>
        <Select value={opts.input_style} onValueChange={(v) => setOpt({ input_style: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="filled">Preenchido</SelectItem>
            <SelectItem value="outlined">Contornado</SelectItem>
            <SelectItem value="underline">Sublinhado</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Estilo dos botões</Label>
        <Select value={opts.button_style} onValueChange={(v) => setOpt({ button_style: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="filled">Preenchido</SelectItem>
            <SelectItem value="outlined">Contornado</SelectItem>
            <SelectItem value="ghost">Ghost</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between"><Label>Mostrar barra de progresso</Label><Switch checked={opts.show_progress} onCheckedChange={(v) => setOpt({ show_progress: v })} /></div>
      <ImageUploadField label="Imagem lateral (split-screen)" value={opts.side_image_url} onChange={(url) => setOpt({ side_image_url: url })} folder="form-side" />
    </>
  );
}

function WidgetOptionsFields({ opts, setOpt }: { opts: WidgetChannelOptions; setOpt: (p: any) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Posição na tela</Label>
        <Select value={opts.position} onValueChange={(v) => setOpt({ position: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="bottom-right">Inferior direito</SelectItem>
            <SelectItem value="bottom-left">Inferior esquerdo</SelectItem>
            <SelectItem value="top-right">Superior direito</SelectItem>
            <SelectItem value="top-left">Superior esquerdo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Tamanho do botão flutuante</Label>
        <Select value={opts.fab_size} onValueChange={(v) => setOpt({ fab_size: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">Pequeno</SelectItem>
            <SelectItem value="md">Médio</SelectItem>
            <SelectItem value="lg">Grande</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Texto do balão de chamada</Label>
        <Input value={opts.callout_text} onChange={(e) => setOpt({ callout_text: e.target.value })} placeholder="Posso ajudar?" />
      </div>
      <div className="space-y-1.5">
        <Label>Abrir automaticamente após ({opts.auto_open_delay}s)</Label>
        <Slider min={0} max={60} step={1} value={[opts.auto_open_delay]} onValueChange={([v]) => setOpt({ auto_open_delay: v })} />
        <p className="text-xs text-muted-foreground">0 = nunca abrir sozinho.</p>
      </div>
      <div className="flex items-center justify-between"><Label>Badge de notificação</Label><Switch checked={opts.show_notification_badge} onCheckedChange={(v) => setOpt({ show_notification_badge: v })} /></div>
      <div className="flex items-center justify-between"><Label>Esconder em mobile</Label><Switch checked={opts.hide_on_mobile} onCheckedChange={(v) => setOpt({ hide_on_mobile: v })} /></div>
    </>
  );
}

function QuizOptionsFields({ opts, setOpt }: { opts: QuizChannelOptions; setOpt: (p: any) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Layout das opções</Label>
        <Select value={opts.layout} onValueChange={(v) => setOpt({ layout: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cards">Cards</SelectItem>
            <SelectItem value="list">Lista</SelectItem>
            <SelectItem value="carousel">Carrossel</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Colunas das opções</Label>
        <Select value={String(opts.option_columns)} onValueChange={(v) => setOpt({ option_columns: Number(v) })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 coluna</SelectItem>
            <SelectItem value="2">2 colunas</SelectItem>
            <SelectItem value="3">3 colunas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Transição entre perguntas</Label>
        <Select value={opts.transition} onValueChange={(v) => setOpt({ transition: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem animação</SelectItem>
            <SelectItem value="fade">Fade</SelectItem>
            <SelectItem value="slide">Slide</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between"><Label>Mostrar "X de Y"</Label><Switch checked={opts.show_counter} onCheckedChange={(v) => setOpt({ show_counter: v })} /></div>
      <ImageUploadField label="Imagem da tela de resultado" value={opts.result_image_url} onChange={(url) => setOpt({ result_image_url: url })} folder="quiz-result" />
      <div className="space-y-1.5">
        <Label>Mensagem final</Label>
        <Input value={opts.result_message} onChange={(e) => setOpt({ result_message: e.target.value })} />
      </div>
    </>
  );
}
