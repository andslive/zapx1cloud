import { useState, useEffect } from 'react';
import { Save, ExternalLink, Palette, Type, Layout, Globe, Image as ImageIcon, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePlatformSettings, useUpdatePlatformSettings, useCreateAuditLog } from '@/hooks/useSuperAdmin';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { PlatformLogoUpload } from './PlatformLogoUpload';
import { ColorPickerField } from './branding/ColorPickerField';
import { GradientPicker } from './branding/GradientPicker';
import { BrandingPreview } from './branding/BrandingPreview';
import type { GradientStyle } from '@/lib/colors';

const FONT_OPTIONS = ['Inter', 'Poppins', 'Roboto', 'Manrope', 'DM Sans', 'Plus Jakarta Sans'];

export function PlatformSettings() {
  const { data: settings, isLoading } = usePlatformSettings();
  const updateSettings = useUpdatePlatformSettings();
  const createAuditLog = useCreateAuditLog();

  const [formData, setFormData] = useState<any>({
    // brand
    platform_name: '',
    support_email: '',
    footer_text: '',
    terms_url: '',
    privacy_url: '',
    logo_url: '',
    logo_dark_url: '',
    favicon_url: '',
    // colors
    primary_color: '#84CC16',
    accent_color: '#84CC16',
    gradient_style: 'vendus' as GradientStyle,
    gradient_custom: null as { start: string; mid: string; end: string } | null,
    border_radius: 12,
    default_theme: 'dark',
    // typography
    font_family: 'Inter',
    font_url: '',
    base_font_size: 16,
    // login
    login_headline: '',
    login_subheadline: '',
    login_stats_enabled: true,
    login_bg_image_url: '',
    login_bg_layout: 'split-left',
    login_logo_position: 'left',
    // widgets
    powered_by_text: '',
    hide_widget_branding: false,
    widget_accent_color: '',
    // seo
    browser_title: '',
    meta_description: '',
    og_image_url: '',
    twitter_handle: '',
    default_language: 'pt-BR',
  });

  useEffect(() => {
    if (settings) {
      const s: any = settings;
      setFormData({
        platform_name: s.platform_name || '',
        support_email: s.support_email || '',
        footer_text: s.footer_text || '',
        terms_url: s.terms_url || '',
        privacy_url: s.privacy_url || '',
        logo_url: s.logo_url || '',
        logo_dark_url: s.logo_dark_url || '',
        favicon_url: s.favicon_url || '',
        primary_color: s.primary_color || '#84CC16',
        accent_color: s.accent_color || s.primary_color || '#84CC16',
        gradient_style: s.gradient_style || 'vendus',
        gradient_custom: s.gradient_custom || null,
        border_radius: s.border_radius ?? 12,
        default_theme: s.default_theme || 'dark',
        font_family: s.font_family || 'Inter',
        font_url: s.font_url || '',
        base_font_size: s.base_font_size ?? 16,
        login_headline: s.login_headline || '',
        login_subheadline: s.login_subheadline || '',
        login_stats_enabled: s.login_stats_enabled ?? true,
        login_bg_image_url: s.login_bg_image_url || '',
        login_bg_layout: s.login_bg_layout || 'split-left',
        login_logo_position: s.login_logo_position || 'left',
        powered_by_text: s.powered_by_text || '',
        hide_widget_branding: s.hide_widget_branding || false,
        widget_accent_color: s.widget_accent_color || '',
        browser_title: s.browser_title || '',
        meta_description: s.meta_description || '',
        og_image_url: s.og_image_url || '',
        twitter_handle: s.twitter_handle || '',
        default_language: s.default_language || 'pt-BR',
      });
    }
  }, [settings]);

  const update = (patch: Partial<typeof formData>) => setFormData((p: any) => ({ ...p, ...patch }));

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync(formData);
      await createAuditLog.mutateAsync({
        action: 'Configurações da plataforma atualizadas',
        entity_type: 'platform_settings',
      });
      toast.success('Configurações salvas com sucesso');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + (error?.message || 'desconhecido'));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md py-2 -mx-2 px-2 rounded-lg">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Identidade Visual</h1>
          <p className="text-muted-foreground">Personalize toda a aparência da plataforma</p>
        </div>
        <Button onClick={handleSave} disabled={updateSettings.isPending} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {updateSettings.isPending ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>

      <Tabs defaultValue="brand" className="space-y-6">
        <TabsList className="grid grid-cols-3 lg:grid-cols-6 h-auto">
          <TabsTrigger value="brand" className="gap-1.5"><ImageIcon className="h-4 w-4" />Marca</TabsTrigger>
          <TabsTrigger value="colors" className="gap-1.5"><Palette className="h-4 w-4" />Cores</TabsTrigger>
          <TabsTrigger value="typography" className="gap-1.5"><Type className="h-4 w-4" />Tipografia</TabsTrigger>
          <TabsTrigger value="login" className="gap-1.5"><Layout className="h-4 w-4" />Login</TabsTrigger>
          <TabsTrigger value="widgets" className="gap-1.5"><Sparkles className="h-4 w-4" />Widgets</TabsTrigger>
          <TabsTrigger value="seo" className="gap-1.5"><Globe className="h-4 w-4" />SEO</TabsTrigger>
        </TabsList>

        {/* ==================== ABA: MARCA ==================== */}
        <TabsContent value="brand" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Logos</CardTitle>
                <CardDescription>Logos usados em toda a plataforma</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <PlatformLogoUpload
                  currentUrl={formData.logo_url}
                  onUpload={(url) => update({ logo_url: url })}
                  onRemove={() => update({ logo_url: '' })}
                  type="logo"
                  label="Logo Principal (Light)"
                  description="Usado em fundos claros. PNG, JPG, SVG ou WEBP. Máx 2MB."
                  previewBg="light"
                  aspectRatio="wide"
                />
                <PlatformLogoUpload
                  currentUrl={formData.logo_dark_url}
                  onUpload={(url) => update({ logo_dark_url: url })}
                  onRemove={() => update({ logo_dark_url: '' })}
                  type="logo_dark"
                  label="Logo Dark Mode"
                  description="Usado em fundos escuros."
                  previewBg="dark"
                  aspectRatio="wide"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Favicon / Ícone do App</CardTitle>
                <CardDescription>Favicon do navegador e ícone do PWA</CardDescription>
              </CardHeader>
              <CardContent>
                <PlatformLogoUpload
                  currentUrl={formData.favicon_url}
                  onUpload={(url) => update({ favicon_url: url })}
                  onRemove={() => update({ favicon_url: '' })}
                  type="favicon"
                  label="Ícone da Aplicação"
                  description="Recomendado: 512x512px, PNG."
                  previewBg="light"
                  aspectRatio="square"
                />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Informações Gerais</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Plataforma</Label>
                  <Input
                    value={formData.platform_name}
                    onChange={(e) => update({ platform_name: e.target.value })}
                    placeholder="Ex: X1ZAP"
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail de Suporte</Label>
                  <Input
                    type="email"
                    value={formData.support_email}
                    onChange={(e) => update({ support_email: e.target.value })}
                    placeholder="suporte@seudominio.com"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Texto do Rodapé</Label>
                  <Textarea
                    value={formData.footer_text}
                    onChange={(e) => update({ footer_text: e.target.value })}
                    placeholder="© 2026 Sua Empresa. Todos os direitos reservados."
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Links Legais</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Termos de Uso</Label>
                  <div className="flex gap-2">
                    <Input
                      value={formData.terms_url}
                      onChange={(e) => update({ terms_url: e.target.value })}
                      placeholder="https://..."
                    />
                    {formData.terms_url && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={formData.terms_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Política de Privacidade</Label>
                  <div className="flex gap-2">
                    <Input
                      value={formData.privacy_url}
                      onChange={(e) => update({ privacy_url: e.target.value })}
                      placeholder="https://..."
                    />
                    {formData.privacy_url && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={formData.privacy_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== ABA: CORES ==================== */}
        <TabsContent value="colors" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Paleta da Plataforma</CardTitle>
                <CardDescription>
                  A cor primária alimenta automaticamente a sidebar, botões, anel de foco, e-mails e gradientes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ColorPickerField
                    label="Cor Primária"
                    value={formData.primary_color}
                    onChange={(v) => update({ primary_color: v })}
                    description="Cor principal — botões, links, ícones ativos"
                    defaultValue="#84CC16"
                  />
                  <ColorPickerField
                    label="Cor de Destaque"
                    value={formData.accent_color}
                    onChange={(v) => update({ accent_color: v })}
                    description="Realces e badges (pode ser igual à primária)"
                    defaultValue="#84CC16"
                  />
                </div>

                <GradientPicker
                  primaryColor={formData.primary_color}
                  style={formData.gradient_style}
                  custom={formData.gradient_custom}
                  onStyleChange={(style) => update({ gradient_style: style })}
                  onCustomChange={(custom) => update({ gradient_custom: custom })}
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Raio de Borda Padrão</Label>
                    <span className="text-sm font-mono text-muted-foreground">
                      {formData.border_radius}px
                    </span>
                  </div>
                  <Slider
                    value={[formData.border_radius]}
                    min={0}
                    max={24}
                    step={1}
                    onValueChange={(v) => update({ border_radius: v[0] })}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = quadrado, 12 = padrão, 24 = bem arredondado
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Tema Padrão para Novos Usuários</Label>
                  <Select
                    value={formData.default_theme}
                    onValueChange={(v) => update({ default_theme: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Claro</SelectItem>
                      <SelectItem value="dark">Escuro</SelectItem>
                      <SelectItem value="auto">Automático (sistema)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-24">
                <BrandingPreview
                  primaryColor={formData.primary_color}
                  accentColor={formData.accent_color}
                  gradientStyle={formData.gradient_style}
                  gradientCustom={formData.gradient_custom}
                  borderRadius={formData.border_radius}
                  fontFamily={formData.font_family}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ==================== ABA: TIPOGRAFIA ==================== */}
        <TabsContent value="typography" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Fontes</CardTitle>
                <CardDescription>A fonte é carregada do Google Fonts e aplicada globalmente.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Família da Fonte</Label>
                  <Select
                    value={formData.font_family}
                    onValueChange={(v) => update({ font_family: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((font) => (
                        <SelectItem key={font} value={font} style={{ fontFamily: font }}>
                          {font}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>URL de Fonte Customizada (opcional)</Label>
                  <Input
                    value={formData.font_url}
                    onChange={(e) => update({ font_url: e.target.value })}
                    placeholder="https://fonts.googleapis.com/css2?family=..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Sobrescreve a fonte selecionada acima
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Tamanho Base da Fonte</Label>
                    <span className="text-sm font-mono text-muted-foreground">
                      {formData.base_font_size}px
                    </span>
                  </div>
                  <Slider
                    value={[formData.base_font_size]}
                    min={14}
                    max={18}
                    step={1}
                    onValueChange={(v) => update({ base_font_size: v[0] })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Pré-visualização</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="space-y-3 p-4 rounded-lg bg-muted/30"
                  style={{ fontFamily: `${formData.font_family}, system-ui, sans-serif` }}
                >
                  <h1 className="text-3xl font-bold">Heading 1</h1>
                  <h2 className="text-xl font-semibold">Heading 2</h2>
                  <p className="text-base">
                    O rato roeu a roupa do rei de Roma. Esta é a aparência do corpo do texto na fonte
                    selecionada.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Texto secundário com estilo menor.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== ABA: LOGIN ==================== */}
        <TabsContent value="login" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Conteúdo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Título Principal</Label>
                  <Input
                    value={formData.login_headline}
                    onChange={(e) => update({ login_headline: e.target.value })}
                    placeholder="Transforme leads em rotina de vendas"
                  />
                  <p className="text-xs text-muted-foreground">Use \n para quebra de linha</p>
                </div>
                <div className="space-y-2">
                  <Label>Subtítulo</Label>
                  <Textarea
                    value={formData.login_subheadline}
                    onChange={(e) => update({ login_subheadline: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div>
                    <Label>Mostrar Estatísticas</Label>
                    <p className="text-xs text-muted-foreground">Cards de métricas no login</p>
                  </div>
                  <Switch
                    checked={formData.login_stats_enabled}
                    onCheckedChange={(checked) => update({ login_stats_enabled: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Posição do Bloco do Logo</Label>
                  <Select
                    value={formData.login_logo_position}
                    onValueChange={(v) => update({ login_logo_position: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Esquerda</SelectItem>
                      <SelectItem value="right">Direita</SelectItem>
                      <SelectItem value="top">Topo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Imagem de Fundo</CardTitle>
                <CardDescription>
                  Substitui o gradiente da lateral do login por uma imagem.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <PlatformLogoUpload
                  currentUrl={formData.login_bg_image_url}
                  onUpload={(url) => update({ login_bg_image_url: url })}
                  onRemove={() => update({ login_bg_image_url: '' })}
                  type="login_bg"
                  label="Imagem de Fundo do Login"
                  description="Recomendado: 1920x1080px, JPG. Deixe vazio para usar o gradiente."
                  aspectRatio="wide"
                />

                <div className="space-y-2">
                  <Label>Posicionamento da Imagem</Label>
                  <Select
                    value={formData.login_bg_layout}
                    onValueChange={(v) => update({ login_bg_layout: v })}
                    disabled={!formData.login_bg_image_url}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="split-left">Lado esquerdo (formulário à direita)</SelectItem>
                      <SelectItem value="split-right">Lado direito (formulário à esquerda)</SelectItem>
                      <SelectItem value="fullscreen">Tela inteira (atrás do formulário)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Define onde a imagem aparece na tela de login.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ==================== ABA: WIDGETS ==================== */}
        <TabsContent value="widgets" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Branding em Widgets Públicos</CardTitle>
              <CardDescription>
                Como o branding aparece em formulários, chat e widgets externos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 max-w-2xl">
              <div className="space-y-2">
                <Label>Texto "Powered by"</Label>
                <Input
                  value={formData.powered_by_text}
                  onChange={(e) => update({ powered_by_text: e.target.value })}
                  placeholder="Powered by X1ZAP"
                />
                <p className="text-xs text-muted-foreground">
                  Deixe vazio para ocultar completamente
                </p>
              </div>

              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div>
                  <Label>Ocultar branding em widgets</Label>
                  <p className="text-xs text-muted-foreground">
                    Remove "Powered by" e marca em todos os widgets externos (premium)
                  </p>
                </div>
                <Switch
                  checked={formData.hide_widget_branding}
                  onCheckedChange={(checked) => update({ hide_widget_branding: checked })}
                />
              </div>

              <ColorPickerField
                label="Cor de Destaque dos Widgets"
                value={formData.widget_accent_color || formData.primary_color}
                onChange={(v) => update({ widget_accent_color: v })}
                description="Pode diferir da cor da plataforma interna. Útil quando os widgets ficam em sites de terceiros."
                defaultValue={formData.primary_color}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== ABA: SEO ==================== */}
        <TabsContent value="seo" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Meta Tags</CardTitle>
                <CardDescription>
                  Como a plataforma aparece em buscadores e pré-visualizações
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Título da Aba do Navegador</Label>
                  <Input
                    value={formData.browser_title}
                    onChange={(e) => update({ browser_title: e.target.value })}
                    placeholder="X1ZAP — Plataforma de vendas"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se vazio, usa o nome da plataforma
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Meta Descrição</Label>
                  <Textarea
                    value={formData.meta_description}
                    onChange={(e) => update({ meta_description: e.target.value })}
                    placeholder="Plataforma completa para gestão de vendas e leads"
                    rows={3}
                    maxLength={160}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.meta_description.length}/160 caracteres
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Twitter Handle</Label>
                  <Input
                    value={formData.twitter_handle}
                    onChange={(e) => update({ twitter_handle: e.target.value })}
                    placeholder="@x1zap"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Idioma Padrão</Label>
                  <Select
                    value={formData.default_language}
                    onValueChange={(v) => update({ default_language: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>OG Image</CardTitle>
                <CardDescription>
                  Imagem mostrada quando o link é compartilhado no WhatsApp, LinkedIn, etc.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PlatformLogoUpload
                  currentUrl={formData.og_image_url}
                  onUpload={(url) => update({ og_image_url: url })}
                  onRemove={() => update({ og_image_url: '' })}
                  type="logo"
                  label="Imagem de Compartilhamento"
                  description="Recomendado: 1200x630px, JPG/PNG. Se vazio, usa o logo principal."
                  aspectRatio="wide"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
