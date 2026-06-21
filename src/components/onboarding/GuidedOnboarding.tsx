import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Palette,
  Package,
  Users,
  CheckCircle2,
  Loader2,
  Upload,
  Wand2,
  ArrowRight,
  X,
  Rocket,
  Smartphone,
  QrCode,
  Bot,
  FileText,
  Globe,
  PenLine,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  useCompanySettings,
  useUpdateCompanySettings,
  uploadCompanyLogo,
} from '@/hooks/useCompanySettings';
import { useCreateProduct } from '@/hooks/useProducts';
import { useCreateInvitation } from '@/hooks/useTeamInvitations';
import {
  useCreateWhatsAppInstanceSelf,
  useConnectWhatsAppInstance,
} from '@/hooks/useWhatsAppInstances';
import { useCreateAgent } from '@/hooks/useProductAgents';
import { useGenerateAgentAI } from '@/hooks/useGenerateAgentAI';
import {
  useCreateKnowledgeSource,
  useUploadKnowledgeDocument,
} from '@/hooks/useKnowledgeSources';
import { firecrawlApi } from '@/lib/api/firecrawl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DEFAULT_PIPELINE_STAGES } from '@/hooks/usePipelineMutations';
import { AgentType, ToneStyle } from '@/types/agents';

type StepId = 'welcome' | 'identity' | 'product' | 'whatsapp' | 'agent' | 'team' | 'done';

interface GuidedOnboardingProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  onSkipAll: () => void;
}

const STEP_ORDER: StepId[] = ['welcome', 'identity', 'product', 'whatsapp', 'agent', 'team', 'done'];

const PRESET_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
];

// Estado compartilhado entre os passos do onboarding (referências dos recursos criados)
interface OnboardingShared {
  productId: string | null;
  productName: string | null;
  instanceId: string | null;
  instanceName: string | null;
  instancePhone: string | null;
  agentId: string | null;
  agentName: string | null;
}

export function GuidedOnboarding({ open, onClose, onComplete, onSkipAll }: GuidedOnboardingProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const stepId = STEP_ORDER[stepIdx];
  const progress = (stepIdx / (STEP_ORDER.length - 1)) * 100;

  const [shared, setShared] = useState<OnboardingShared>({
    productId: null,
    productName: null,
    instanceId: null,
    instanceName: null,
    instancePhone: null,
    agentId: null,
    agentName: null,
  });

  const update = (patch: Partial<OnboardingShared>) =>
    setShared((s) => ({ ...s, ...patch }));

  const goNext = () => setStepIdx((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  const goPrev = () => setStepIdx((i) => Math.max(i - 1, 0));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Top bar */}
        <div className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Configuração guiada · {stepIdx + 1} de {STEP_ORDER.length}</span>
            </div>
            <button
              onClick={onSkipAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              Pular tudo <X className="h-3 w-3" />
            </button>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Body */}
        <div className="px-6 py-8 min-h-[420px] flex flex-col overflow-y-auto">
          {stepId === 'welcome' && (
            <WelcomeStep onNext={goNext} onSkipAll={onSkipAll} />
          )}
          {stepId === 'identity' && (
            <IdentityStep onNext={goNext} onSkip={goNext} onBack={goPrev} />
          )}
          {stepId === 'product' && (
            <ProductStep
              onNext={goNext}
              onSkip={goNext}
              onBack={goPrev}
              update={update}
            />
          )}
          {stepId === 'whatsapp' && (
            <WhatsAppStep
              onNext={goNext}
              onSkip={goNext}
              onBack={goPrev}
              update={update}
            />
          )}
          {stepId === 'agent' && (
            <AgentStep
              onNext={goNext}
              onSkip={goNext}
              onBack={goPrev}
              shared={shared}
              update={update}
            />
          )}
          {stepId === 'team' && (
            <TeamStep onNext={goNext} onSkip={goNext} onBack={goPrev} />
          )}
          {stepId === 'done' && (
            <DoneStep onFinish={onComplete} shared={shared} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- WELCOME ---------------- */
function WelcomeStep({ onNext, onSkipAll }: { onNext: () => void; onSkipAll: () => void }) {
  const { profile } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] || 'tudo bem';

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="w-20 h-20 rounded-3xl gradient-primary flex items-center justify-center mb-6 shadow-glow">
        <Rocket className="h-10 w-10 text-primary-foreground" strokeWidth={1.5} />
      </div>
      <h2 className="text-2xl font-bold mb-2">Olá, {firstName}!</h2>
      <p className="text-muted-foreground max-w-sm mb-8">
        Em poucos minutos você sai com produto, WhatsApp conectado e um agente treinado pronto para vender.
      </p>
      <div className="flex gap-3 w-full max-w-xs">
        <Button variant="outline" onClick={onSkipAll} className="flex-1">
          Mais tarde
        </Button>
        <Button onClick={onNext} className="flex-1 gap-2">
          Começar <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------- IDENTIDADE ---------------- */
function IdentityStep({ onNext, onSkip, onBack }: { onNext: () => void; onSkip: () => void; onBack: () => void }) {
  const { profile } = useAuth();
  const { data: company } = useCompanySettings();
  const updateCompany = useUpdateCompanySettings();
  const [logoUrl, setLogoUrl] = useState(company?.logo_url || '');
  const [color, setColor] = useState<string>('#3b82f6');
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.organization_id) return;
    setUploading(true);
    try {
      const url = await uploadCompanyLogo(file, profile.organization_id);
      setLogoUrl(url);
      toast.success('Logo enviado');
    } catch (err: any) {
      toast.error('Erro ao enviar logo', { description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!profile?.organization_id) return;
    try {
      if (logoUrl && logoUrl !== company?.logo_url) {
        await updateCompany.mutateAsync({ logo_url: logoUrl });
      }
      const { data: org } = await supabase
        .from('organizations')
        .select('settings')
        .eq('id', profile.organization_id)
        .maybeSingle();
      const newSettings = { ...(org?.settings as any || {}), primary_color: color };
      await supabase
        .from('organizations')
        .update({ settings: newSettings })
        .eq('id', profile.organization_id);
      onNext();
    } catch (err: any) {
      toast.error('Erro ao salvar identidade');
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <StepHeader
        icon={Palette}
        title="Identidade da empresa"
        description="Logo e cor para personalizar a plataforma."
      />

      <div className="space-y-5 flex-1">
        <div>
          <Label className="mb-2 block">Logo</Label>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center overflow-hidden border">
              {logoUrl ? (
                <img src={logoUrl} alt="logo" className="w-full h-full object-contain" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleUpload}
                className="hidden"
                id="logo-upload"
              />
              <Button asChild variant="outline" size="sm" disabled={uploading}>
                <label htmlFor="logo-upload" className="cursor-pointer">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar imagem'}
                </label>
              </Button>
              <p className="text-xs text-muted-foreground mt-1">PNG ou JPG, até 2MB</p>
            </div>
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Cor principal</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  'w-10 h-10 rounded-lg border-2 transition-all',
                  color === c ? 'border-foreground scale-110' : 'border-transparent'
                )}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded-lg cursor-pointer border"
            />
          </div>
        </div>
      </div>

      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        onPrimary={handleSave}
        primaryLabel="Salvar e continuar"
        loading={updateCompany.isPending}
      />
    </div>
  );
}

/* ---------------- PRODUTO + CÉREBRO ---------------- */
function ProductStep({
  onNext,
  onSkip,
  onBack,
  update,
}: {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
  update: (p: Partial<OnboardingShared>) => void;
}) {
  const { profile } = useAuth();
  const createProduct = useCreateProduct();
  const createSource = useCreateKnowledgeSource();
  const uploadDocument = useUploadKnowledgeDocument();

  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icp, setIcp] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  // Fonte de conhecimento inicial
  const [sourceTab, setSourceTab] = useState<'website' | 'file' | 'text'>('website');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceText, setSourceText] = useState('');

  const [saving, setSaving] = useState(false);

  // Quando IA analisa o site, já preenche também a fonte de website
  const analyze = async () => {
    if (!url.trim()) {
      toast.error('Cole a URL do site do seu produto');
      return;
    }
    setAnalyzing(true);
    try {
      const result = await firecrawlApi.scrape(url, {
        formats: ['markdown'],
        onlyMainContent: true,
      });
      if (!result.success || !result.data?.markdown) {
        throw new Error(result.error || 'Não conseguimos ler o site');
      }
      const meta = result.data.metadata;
      const content = result.data.markdown.slice(0, 4000);

      const { data: descData } = await supabase.functions.invoke('optimize-product-field', {
        body: { field: 'description', value: content, productContext: { name: meta?.title || '' } },
      });
      const { data: icpData } = await supabase.functions.invoke('optimize-product-field', {
        body: { field: 'icp', value: content, productContext: { name: meta?.title || '' } },
      });

      setName(meta?.title?.split(/[|·-]/)[0]?.trim() || 'Meu Produto');
      setDescription(descData?.optimized || meta?.description || '');
      setIcp(icpData?.optimized || '');
      // Pré-popular fonte de website
      if (!sourceUrl) setSourceUrl(url);
      toast.success('Site analisado!');
    } catch (err: any) {
      toast.error('Erro ao analisar site', { description: err.message });
    } finally {
      setAnalyzing(false);
    }
  };

  const hasSource = () => {
    if (sourceTab === 'website') return sourceUrl.trim().length > 5;
    if (sourceTab === 'file') return !!sourceFile;
    return sourceText.trim().length > 20;
  };

  const handleSave = async () => {
    if (!profile?.organization_id || !name.trim()) {
      toast.error('Dê um nome ao produto');
      return;
    }
    if (!hasSource()) {
      toast.error('Adicione pelo menos uma fonte de conhecimento para treinar a IA');
      return;
    }
    setSaving(true);
    try {
      // 1. Cria produto
      const product = await createProduct.mutateAsync({
        name,
        description,
        icp,
        status: 'draft',
        organization_id: profile.organization_id,
      } as any);

      if (!product?.id) throw new Error('Falha ao criar produto');

      // 2. Estágios padrão
      const stages = DEFAULT_PIPELINE_STAGES.map((s) => ({ ...s, product_id: product.id }));
      await supabase.from('pipeline_stages').insert(stages);

      // 3. Cria fonte de conhecimento conforme aba selecionada
      try {
        if (sourceTab === 'website') {
          await createSource.mutateAsync({
            product_id: product.id,
            source_type: 'website',
            title: sourceUrl,
            source_url: sourceUrl,
            processing_status: 'pending',
            is_active: true,
          } as any);
        } else if (sourceTab === 'file' && sourceFile) {
          await uploadDocument.mutateAsync({
            file: sourceFile,
            productId: product.id,
            title: sourceFile.name.replace(/\.[^/.]+$/, ''),
          });
        } else if (sourceTab === 'text') {
          await createSource.mutateAsync({
            product_id: product.id,
            source_type: 'training',
            title: 'Treinamento manual',
            raw_content: sourceText,
            extracted_content: sourceText,
            processing_status: 'completed',
            processed_at: new Date().toISOString(),
            is_active: true,
          } as any);
        }
        toast.success('Produto criado e cérebro em treinamento!');
      } catch (err: any) {
        toast.warning('Produto criado, mas a fonte de conhecimento falhou. Você pode adicionar depois no Cérebro do Produto.');
      }

      update({ productId: product.id, productName: product.name });
      onNext();
    } catch (err: any) {
      toast.error('Erro ao criar produto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <StepHeader
        icon={Package}
        title="Seu primeiro produto"
        description="Cole a URL do seu site para a IA preencher tudo, ou preencha manualmente."
      />

      <div className="space-y-4 flex-1">
        <div>
          <Label className="mb-2 block">URL do site (opcional)</Label>
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://seusite.com.br"
              disabled={analyzing}
            />
            <Button
              onClick={analyze}
              disabled={analyzing || !url.trim()}
              variant="secondary"
              className="gap-2 whitespace-nowrap"
            >
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {analyzing ? 'Analisando...' : 'Analisar'}
            </Button>
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Nome do produto *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Meu CRM Pro" />
        </div>
        <div>
          <Label className="mb-2 block">Descrição curta</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="O que seu produto faz em uma frase?"
            rows={2}
          />
        </div>
        <div>
          <Label className="mb-2 block">Cliente ideal (ICP)</Label>
          <Textarea
            value={icp}
            onChange={(e) => setIcp(e.target.value)}
            placeholder="Quem compra de você?"
            rows={2}
          />
        </div>

        {/* Fonte de conhecimento — obrigatória */}
        <div className="border-t pt-4">
          <Label className="mb-2 block flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Treine o cérebro do produto *
          </Label>
          <p className="text-xs text-muted-foreground mb-3">
            Pelo menos uma fonte para a IA aprender sobre seu produto.
          </p>
          <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as any)}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="website" className="gap-1.5"><Globe className="h-3.5 w-3.5" />Site</TabsTrigger>
              <TabsTrigger value="file" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Arquivo</TabsTrigger>
              <TabsTrigger value="text" className="gap-1.5"><PenLine className="h-3.5 w-3.5" />Texto</TabsTrigger>
            </TabsList>
            <TabsContent value="website" className="pt-3">
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://seusite.com.br/produto"
              />
              <p className="text-xs text-muted-foreground mt-1">
                A IA vai ler o site e extrair o conhecimento automaticamente.
              </p>
            </TabsContent>
            <TabsContent value="file" className="pt-3">
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.txt,.ppt,.pptx"
                onChange={(e) => setSourceFile(e.target.files?.[0] || null)}
              />
              {sourceFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  {sourceFile.name} · {(sourceFile.size / 1024).toFixed(0)} KB
                </p>
              )}
            </TabsContent>
            <TabsContent value="text" className="pt-3">
              <Textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Cole aqui qualquer conteúdo: descrição completa, FAQs, scripts de venda, comparações com concorrentes..."
                rows={5}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        onPrimary={handleSave}
        primaryLabel="Criar produto e treinar"
        loading={saving}
        disabled={!name.trim() || !hasSource()}
      />
    </div>
  );
}

/* ---------------- WHATSAPP ---------------- */
function WhatsAppStep({
  onNext,
  onSkip,
  onBack,
  update,
}: {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
  update: (p: Partial<OnboardingShared>) => void;
}) {
  const createInstance = useCreateWhatsAppInstanceSelf();
  const connectInstance = useConnectWhatsAppInstance();
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('disconnected');
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

  const sanitized = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const valid = /^[a-z0-9-]{3,40}$/.test(sanitized);

  // Polling do status
  useEffect(() => {
    if (!instanceId || status === 'connected' || status === 'paired') return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('evolution_instances')
        .select('status, qr_code, phone_number')
        .eq('id', instanceId)
        .maybeSingle();
      if (data) {
        if (data.qr_code && data.qr_code !== qr) setQr(data.qr_code);
        if (data.status !== status) setStatus(data.status);
        if (data.phone_number) setPhoneNumber(data.phone_number);
        if (data.status === 'connected' || data.status === 'paired') {
          toast.success('WhatsApp conectado!');
          // Vincula a conexão ao admin que está fazendo o onboarding
          if (profile?.id) {
            try {
              await supabase
                .from('profiles')
                .update({ default_connection_id: instanceId })
                .eq('id', profile.id);
            } catch (e) { console.warn('Could not set default_connection_id', e); }
          }
          update({
            instanceId,
            instanceName: sanitized,
            instancePhone: data.phone_number,
          });
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [instanceId, status, qr, sanitized, update, profile?.id]);

  const handleCreateAndConnect = async () => {
    if (!valid) return;
    try {
      const created: any = await createInstance.mutateAsync({ name: sanitized });
      const newId = created?.instance?.id || created?.id;
      if (!newId) throw new Error('Falha ao obter ID da instância');
      setInstanceId(newId);
      const result: any = await connectInstance.mutateAsync(newId);
      if (result?.qr_code) setQr(result.qr_code);
      setStatus('qr_pending');
    } catch (err: any) {
      // erros já tostam pelos hooks
    }
  };

  const isQrBase64 = qr?.startsWith('data:image') || qr?.startsWith('iVBOR');
  const isConnected = status === 'connected' || status === 'paired';

  return (
    <div className="flex-1 flex flex-col">
      <StepHeader
        icon={Smartphone}
        title="Conecte o WhatsApp"
        description="Crie a conexão e escaneie o QR Code aqui mesmo."
      />

      <div className="space-y-4 flex-1">
        {!instanceId && (
          <>
            <div>
              <Label className="mb-2 block">Nome da conexão *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: vendas"
                disabled={createInstance.isPending}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Apenas letras minúsculas, números e hífens. Mínimo 3 caracteres.
              </p>
              {name && !valid && (
                <p className="text-xs text-destructive mt-1">
                  Use apenas letras minúsculas, números e hífens (3 a 40 caracteres).
                </p>
              )}
            </div>
            <Button
              onClick={handleCreateAndConnect}
              disabled={!valid || createInstance.isPending}
              className="w-full gap-2"
            >
              {createInstance.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <QrCode className="h-4 w-4" />
              Criar e gerar QR Code
            </Button>
          </>
        )}

        {instanceId && (
          <div className="flex flex-col items-center justify-center py-4 min-h-[280px] gap-3">
            {isConnected ? (
              <>
                <CheckCircle2 className="h-16 w-16 text-green-500" />
                <p className="font-medium">Conectado!</p>
                {phoneNumber && (
                  <p className="text-sm text-muted-foreground">+{phoneNumber}</p>
                )}
              </>
            ) : connectInstance.isPending && !qr ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
              </>
            ) : qr ? (
              <>
                <div className="bg-white p-3 rounded-lg">
                  <img
                    src={
                      isQrBase64
                        ? (qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`)
                        : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qr)}`
                    }
                    alt="QR Code"
                    className="w-56 h-56"
                  />
                </div>
                <p className="text-sm text-center text-muted-foreground max-w-sm">
                  Abra o WhatsApp → <strong>Configurações</strong> → <strong>Aparelhos conectados</strong> → <strong>Conectar aparelho</strong>.
                </p>
                <Badge variant="secondary">Aguardando leitura...</Badge>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Não foi possível gerar o QR Code.</p>
            )}
          </div>
        )}
      </div>

      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        onPrimary={onNext}
        primaryLabel={isConnected ? 'Avançar' : 'Continuar mesmo assim'}
      />
    </div>
  );
}

/* ---------------- AGENTE ---------------- */
const AGENT_TYPES: Array<{ id: AgentType; label: string; desc: string; objective: string }> = [
  { id: 'sdr', label: 'SDR', desc: 'Qualifica e agenda', objective: 'Qualificar leads e agendar reuniões' },
  { id: 'closer', label: 'Closer', desc: 'Fecha vendas', objective: 'Conduzir o lead até o fechamento da venda' },
  { id: 'support', label: 'Atendimento', desc: 'Tira dúvidas', objective: 'Atender, esclarecer dúvidas e encantar o cliente' },
  { id: 'custom', label: 'Personalizado', desc: 'Você define', objective: 'Atender o cliente conforme necessidade' },
];

function AgentStep({
  onNext,
  onSkip,
  onBack,
  shared,
  update,
}: {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
  shared: OnboardingShared;
  update: (p: Partial<OnboardingShared>) => void;
}) {
  const createAgent = useCreateAgent();
  const uploadDocument = useUploadKnowledgeDocument();
  const createSource = useCreateKnowledgeSource();
  const { generateAgent, isGenerating } = useGenerateAgentAI();

  const [type, setType] = useState<AgentType>('sdr');
  const [agentName, setAgentName] = useState('');
  const [tone, setTone] = useState<ToneStyle>('consultive');
  const [objective, setObjective] = useState(AGENT_TYPES[0].objective);

  const [trainTab, setTrainTab] = useState<'prompt' | 'ai' | 'doc'>('ai');
  const [promptExtra, setPromptExtra] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [aiGenerated, setAiGenerated] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  const handleTypeChange = (t: AgentType) => {
    setType(t);
    const def = AGENT_TYPES.find((a) => a.id === t);
    if (def) {
      setObjective(def.objective);
      if (!agentName) setAgentName(def.label);
    }
  };

  const handleGenerate = async () => {
    if (!shared.productId) {
      toast.error('Crie um produto antes para a IA usar o cérebro');
      return;
    }
    const generated = await generateAgent(shared.productId, type, objective);
    if (generated) {
      setAiGenerated(generated.additional_prompt || generated.description || '');
      if (!agentName) setAgentName(generated.name);
      setObjective(generated.primary_objective);
      setTone(generated.tone_style);
    }
  };

  const handleSave = async () => {
    if (!agentName.trim()) {
      toast.error('Dê um nome ao agente');
      return;
    }
    setSaving(true);
    try {
      // Treinamento via documento → fonte adicional
      if (trainTab === 'doc' && docFile && shared.productId) {
        try {
          await uploadDocument.mutateAsync({
            file: docFile,
            productId: shared.productId,
            title: `Treinamento agente: ${agentName}`,
          });
        } catch {
          toast.warning('Falha ao subir o documento — agente será criado mesmo assim');
        }
      }
      // Treinamento via texto livre → adiciona como fonte 'training'
      if (trainTab === 'prompt' && promptExtra.trim().length > 30 && shared.productId) {
        try {
          await createSource.mutateAsync({
            product_id: shared.productId,
            source_type: 'training',
            title: `Prompt do agente ${agentName}`,
            raw_content: promptExtra,
            extracted_content: promptExtra,
            processing_status: 'completed',
            processed_at: new Date().toISOString(),
            is_active: true,
          } as any);
        } catch { /* segue */ }
      }

      const additional = trainTab === 'prompt'
        ? promptExtra
        : trainTab === 'ai'
          ? aiGenerated || ''
          : '';

      const created = await createAgent.mutateAsync({
        name: agentName,
        product_id: shared.productId,
        agent_type: type,
        primary_objective: objective,
        tone_style: tone,
        additional_prompt: additional,
        is_default: true,
        is_active: true,
        evolution_instance_id: shared.instanceId,
      } as any);

      update({ agentId: (created as any).id, agentName: agentName });
      onNext();
    } catch {
      // toast pelo hook
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <StepHeader
        icon={Bot}
        title="Crie seu agente de IA"
        description="Ele vai atender pelo WhatsApp usando o cérebro do produto."
      />

      <div className="space-y-4 flex-1">
        <div>
          <Label className="mb-2 block">Tipo de agente</Label>
          <div className="grid grid-cols-2 gap-2">
            {AGENT_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTypeChange(t.id)}
                className={cn(
                  'p-3 rounded-lg border text-left transition-all',
                  type === t.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <div className="font-medium text-sm">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="mb-2 block">Nome do agente *</Label>
          <Input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="Ex: Ana, Bruno, Atendente Pro..."
          />
        </div>

        <div>
          <Label className="mb-2 block">Objetivo principal</Label>
          <Input value={objective} onChange={(e) => setObjective(e.target.value)} />
        </div>

        <div>
          <Label className="mb-2 block">Tom de voz</Label>
          <div className="flex flex-wrap gap-2">
            {(['formal', 'consultive', 'friendly', 'technical'] as ToneStyle[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs border transition-colors',
                  tone === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'
                )}
              >
                {t === 'formal' && 'Formal'}
                {t === 'consultive' && 'Consultivo'}
                {t === 'friendly' && 'Descontraído'}
                {t === 'technical' && 'Técnico'}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t pt-4">
          <Label className="mb-2 block flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Treinamento adicional
          </Label>
          <Tabs value={trainTab} onValueChange={(v) => setTrainTab(v as any)}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="ai" className="gap-1.5"><Wand2 className="h-3.5 w-3.5" />IA</TabsTrigger>
              <TabsTrigger value="prompt" className="gap-1.5"><PenLine className="h-3.5 w-3.5" />Prompt</TabsTrigger>
              <TabsTrigger value="doc" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Documento</TabsTrigger>
            </TabsList>
            <TabsContent value="ai" className="pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                A IA vai usar o cérebro do produto + tipo + objetivo para gerar o prompt.
              </p>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !shared.productId}
                variant="secondary"
                className="w-full gap-2"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {isGenerating ? 'Gerando...' : aiGenerated ? 'Regenerar com IA' : 'Gerar com IA'}
              </Button>
              {aiGenerated && (
                <Textarea
                  value={aiGenerated}
                  onChange={(e) => setAiGenerated(e.target.value)}
                  rows={5}
                  className="text-xs"
                />
              )}
            </TabsContent>
            <TabsContent value="prompt" className="pt-3">
              <Textarea
                value={promptExtra}
                onChange={(e) => setPromptExtra(e.target.value)}
                placeholder="Instruções adicionais para o agente..."
                rows={5}
              />
            </TabsContent>
            <TabsContent value="doc" className="pt-3">
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => setDocFile(e.target.files?.[0] || null)}
              />
              {docFile && (
                <p className="text-xs text-muted-foreground mt-1">
                  {docFile.name} · {(docFile.size / 1024).toFixed(0)} KB
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                O conteúdo será adicionado ao cérebro do produto e usado pelo agente.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        onPrimary={handleSave}
        primaryLabel="Criar agente"
        loading={saving}
        disabled={!agentName.trim()}
      />
    </div>
  );
}

/* ---------------- EQUIPE ---------------- */
function TeamStep({ onNext, onSkip, onBack }: { onNext: () => void; onSkip: () => void; onBack: () => void }) {
  const createInvite = useCreateInvitation();
  const [emails, setEmails] = useState<string[]>(['', '', '']);
  const [sending, setSending] = useState(false);

  const updateEmail = (idx: number, val: string) => {
    setEmails((arr) => arr.map((e, i) => (i === idx ? val : e)));
  };

  const sendInvites = async () => {
    const valid = emails.filter((e) => e.trim() && /\S+@\S+\.\S+/.test(e.trim()));
    if (valid.length === 0) {
      onSkip();
      return;
    }
    setSending(true);
    let success = 0;
    for (const email of valid) {
      try {
        await createInvite.mutateAsync({ email: email.trim(), role: 'seller' });
        success++;
      } catch { /* ignora */ }
    }
    if (success > 0) {
      toast.success(`${success} convite${success > 1 ? 's' : ''} enviado${success > 1 ? 's' : ''}!`);
    }
    setSending(false);
    onNext();
  };

  return (
    <div className="flex-1 flex flex-col">
      <StepHeader
        icon={Users}
        title="Convide sua equipe"
        description="Adicione e-mails dos vendedores. Eles recebem o convite na hora."
      />
      <div className="space-y-3 flex-1">
        {emails.map((email, idx) => (
          <Input
            key={idx}
            type="email"
            value={email}
            onChange={(e) => updateEmail(idx, e.target.value)}
            placeholder={`vendedor${idx + 1}@email.com`}
          />
        ))}
        <button
          type="button"
          onClick={() => setEmails((arr) => [...arr, ''])}
          className="text-sm text-primary hover:underline"
        >
          + Adicionar mais um
        </button>
      </div>
      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        onPrimary={sendInvites}
        primaryLabel="Enviar convites"
        loading={sending}
      />
    </div>
  );
}

/* ---------------- DONE / TESTE ---------------- */
function DoneStep({ onFinish, shared }: { onFinish: () => void; shared: OnboardingShared }) {
  const phone = shared.instancePhone?.replace(/\D/g, '');
  const waLink = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent('Olá! Quero testar o atendimento.')}`
    : null;

  return (
    <div className="flex-1 flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <CheckCircle2 className="h-12 w-12 text-primary" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Tudo pronto!</h2>
      <p className="text-muted-foreground max-w-sm mb-6">
        Sua empresa está configurada. Faça um teste real agora.
      </p>

      <div className="w-full max-w-sm space-y-2 text-left mb-8 bg-muted/40 rounded-lg p-4">
        {shared.productName && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span>Produto <strong>{shared.productName}</strong> com cérebro treinado</span>
          </div>
        )}
        {shared.instanceName && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span>WhatsApp {shared.instancePhone ? `+${shared.instancePhone}` : shared.instanceName}</span>
          </div>
        )}
        {shared.agentName && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span>Agente <strong>{shared.agentName}</strong> ativo</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 w-full max-w-sm">
        {waLink ? (
          <Button asChild size="lg" className="gap-2">
            <a href={waLink} target="_blank" rel="noopener noreferrer">
              Testar agora no WhatsApp <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        ) : (
          <Button asChild size="lg" variant="outline" className="gap-2">
            <a href="/admin?tab=inbox">Abrir Inbox</a>
          </Button>
        )}
        <Button onClick={onFinish} variant="ghost" size="sm">
          Concluir e ir para a plataforma
        </Button>
      </div>
    </div>
  );
}

/* ---------------- HELPERS ---------------- */
function StepHeader({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <div className="mb-6">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-xl font-bold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StepFooter({
  onBack,
  onSkip,
  onPrimary,
  primaryLabel,
  loading,
  disabled,
}: {
  onBack: () => void;
  onSkip: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-6 mt-6 border-t">
      <Button variant="ghost" onClick={onBack} size="sm">Voltar</Button>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onSkip} size="sm">Pular esta etapa</Button>
        <Button onClick={onPrimary} disabled={loading || disabled} className="gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
