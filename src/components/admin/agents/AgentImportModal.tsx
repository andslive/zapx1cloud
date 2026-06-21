import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Loader2, UploadCloud, FileJson, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { useCreateAgent } from '@/hooks/useProductAgents';
import { useProducts } from '@/hooks/useProducts';
import type { ProductAgent } from '@/types/agents';

interface AgentImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Quando informado, importa já vinculado a este produto (sem mostrar seletor)
  fixedProductId?: string | null;
  // Após gerar a partir de documento, abre o editor com o rascunho
  onDraftReady?: (draft: Partial<ProductAgent>, productId: string | null) => void;
}

const ALLOWED_DOC_EXT = ['.pdf', '.docx', '.txt', '.md'];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.split(',')[1] ?? res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- Mapas de normalização para formatos alternativos (PT-BR aninhado) ---
const AGENT_TYPE_MAP: Record<string, string> = {
  personalizado: 'custom', custom: 'custom',
  closer: 'closer', sdr: 'sdr',
  suporte: 'support', support: 'support',
  financeiro: 'financial', financial: 'financial',
  administrativo: 'admin', admin: 'admin',
  orquestrador: 'orchestrator', orchestrator: 'orchestrator',
};
const TONE_MAP: Record<string, string> = {
  amigável: 'friendly', amigavel: 'friendly', friendly: 'friendly',
  formal: 'formal',
  consultivo: 'consultive', consultive: 'consultive',
  técnico: 'technical', tecnico: 'technical', technical: 'technical',
};
const MSG_SIZE_MAP: Record<string, string> = {
  curtas: 'short', short: 'short',
  equilibradas: 'balanced', balanced: 'balanced',
  detalhadas: 'detailed', detailed: 'detailed',
};

function norm(v: unknown, map: Record<string, string>, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  return map[v.toLowerCase().trim()] ?? fallback;
}

// Detecta formato aninhado (com `agent`, `identity`, `objective`, `tone`...) e converte para o schema flat.
function flattenNestedAgent(raw: Record<string, unknown>): Record<string, unknown> {
  const r = (raw.agent && typeof raw.agent === 'object' ? raw.agent : raw) as Record<string, unknown>;
  const NESTED_KEYS = ['identity', 'objective', 'tone', 'rules', 'tools', 'transfer', 'tags', 'qualification', 'follow_up', 'sales_flow', 'responses', 'closing_examples', 'product', 'offer', 'guarantee'];
  const hasNested = NESTED_KEYS.some((k) => r[k] && typeof r[k] === 'object');
  if (!hasNested && typeof r.name === 'string') return r;

  const identity = (r.identity ?? {}) as Record<string, unknown>;
  const objective = (r.objective ?? {}) as Record<string, unknown>;
  const tone = (r.tone ?? {}) as Record<string, unknown>;
  const rules = (r.rules ?? {}) as Record<string, unknown>;
  const trigger = (rules.automatic_trigger ?? {}) as Record<string, unknown>;
  const tools = (r.tools ?? {}) as Record<string, unknown>;
  const t_pipe = (tools.pipeline_and_qualification ?? {}) as Record<string, unknown>;
  const t_lead = (tools.lead_management ?? {}) as Record<string, unknown>;
  const t_comm = (tools.communication ?? {}) as Record<string, unknown>;
  const t_auto = (tools.automation ?? {}) as Record<string, unknown>;
  const t_att = (tools.attendance_management ?? {}) as Record<string, unknown>;
  const tagsObj = (r.tags ?? {}) as Record<string, unknown>;
  const transfer = (r.transfer ?? {}) as Record<string, unknown>;

  const out: Record<string, unknown> = {};

  out.name = identity.name ?? r.name;
  if (identity.description) out.description = identity.description;
  out.agent_type = norm(identity.type ?? r.agent_type, AGENT_TYPE_MAP, 'custom');

  out.primary_objective = (objective.main as string) ?? r.primary_objective ?? '';

  out.tone_style = norm(tone.style ?? r.tone_style, TONE_MAP, 'friendly');
  out.message_style = norm(tone.message_size ?? r.message_style, MSG_SIZE_MAP, 'balanced');
  if (typeof tone.always_end_with_question === 'boolean') out.always_end_with_question = tone.always_end_with_question;

  if (Array.isArray(rules.mandatory_phrases)) out.required_phrases = rules.mandatory_phrases;
  if (Array.isArray(rules.forbidden_phrases)) out.prohibited_phrases = rules.forbidden_phrases;
  if (Array.isArray(rules.conversation_end_conditions)) out.end_conversation_triggers = rules.conversation_end_conditions;
  if (Array.isArray(trigger.keywords)) out.activation_keywords = trigger.keywords;
  if (Array.isArray(trigger.exact_phrases)) out.activation_phrases = trigger.exact_phrases;
  if (typeof trigger.priority === 'number') out.activation_priority = trigger.priority;
  if (typeof trigger.assume_conversation_after_trigger === 'boolean') out.takeover_on_match = trigger.assume_conversation_after_trigger;

  if (typeof t_pipe.move_lead_in_pipeline === 'boolean') out.can_update_pipeline = t_pipe.move_lead_in_pipeline;
  if (typeof t_pipe.qualify_bant === 'boolean') out.can_qualify = t_pipe.qualify_bant;
  if (typeof t_lead.apply_remove_tags === 'boolean') out.can_apply_tags = t_lead.apply_remove_tags;
  if (typeof t_lead.add_internal_notes === 'boolean') out.can_add_notes = t_lead.add_internal_notes;
  if (typeof t_comm.send_emails === 'boolean') out.can_send_emails = t_comm.send_emails;
  if (typeof t_comm.send_materials === 'boolean') out.can_send_materials = t_comm.send_materials;
  if (typeof t_comm.notify_team === 'boolean') out.can_notify = t_comm.notify_team;
  if (typeof t_auto.create_tasks === 'boolean') out.can_create_tasks = t_auto.create_tasks;
  if (typeof t_auto.schedule_meetings === 'boolean') out.can_schedule_meetings = t_auto.schedule_meetings;
  if (typeof t_auto.start_follow_up_sequence === 'boolean') out.can_start_cadence = t_auto.start_follow_up_sequence;
  if (typeof t_att.transfer_to_human === 'boolean') out.can_transfer = t_att.transfer_to_human;

  if (Array.isArray(tagsObj.apply_when_relevant) && tagsObj.apply_when_relevant.length) {
    out.default_tags = tagsObj.apply_when_relevant;
    out.auto_tag_leads = true;
  }

  if (typeof transfer.message_when_transferring_to_human === 'string') out.handoff_outgoing_message = transfer.message_when_transferring_to_human;
  if (typeof transfer.message_when_assuming === 'string') out.handoff_incoming_message = transfer.message_when_assuming;
  if (typeof transfer.presentation_delay_seconds === 'number') out.handoff_delay_seconds = transfer.presentation_delay_seconds;
  if (typeof transfer.delay_between_messages_seconds === 'number') out.message_delay_seconds = transfer.delay_between_messages_seconds;
  if (typeof transfer.include_previous_conversation_summary === 'boolean') out.handoff_include_summary = transfer.include_previous_conversation_summary;

  // Consolida o conteúdo rico restante no additional_prompt
  const sections: string[] = [];
  if (objective.complementary_prompt) sections.push(`# Missão\n${objective.complementary_prompt}`);

  const product = (r.product ?? {}) as Record<string, unknown>;
  if (Object.keys(product).length) {
    const lines: string[] = ['# Produto'];
    if (product.name) lines.push(`Nome: ${product.name}`);
    if (product.one_sentence_description) lines.push(`Descrição: ${product.one_sentence_description}`);
    if (product.positioning) lines.push(`Posicionamento: ${product.positioning}`);
    if (product.main_angle) lines.push(`Ângulo principal: ${product.main_angle}`);
    if (Array.isArray(product.core_beliefs)) lines.push(`Crenças centrais:\n- ${(product.core_beliefs as string[]).join('\n- ')}`);
    if (Array.isArray(product.target_audience)) lines.push(`Público-alvo:\n- ${(product.target_audience as string[]).join('\n- ')}`);
    if (Array.isArray(product.main_pains)) lines.push(`Principais dores:\n- ${(product.main_pains as string[]).join('\n- ')}`);
    if (Array.isArray(product.desired_transformation)) lines.push(`Transformação desejada:\n- ${(product.desired_transformation as string[]).join('\n- ')}`);
    if (Array.isArray(product.features)) lines.push(`Features:\n- ${(product.features as string[]).join('\n- ')}`);
    if (product.sales_page_url) lines.push(`Página de vendas: ${product.sales_page_url}`);
    if (product.checkout_url) lines.push(`Checkout: ${product.checkout_url}`);
    sections.push(lines.join('\n'));
  }

  const offer = (r.offer ?? {}) as Record<string, unknown>;
  if (Object.keys(offer).length) sections.push(`# Oferta\n${JSON.stringify(offer, null, 2)}`);

  const guarantee = (r.guarantee ?? {}) as Record<string, unknown>;
  if (Object.keys(guarantee).length) sections.push(`# Garantia\n${JSON.stringify(guarantee, null, 2)}`);

  const sales_flow = (r.sales_flow ?? {}) as Record<string, unknown>;
  if (Object.keys(sales_flow).length) {
    const lines = ['# Fluxo de Vendas'];
    for (const [k, v] of Object.entries(sales_flow)) lines.push(`- ${k}: ${v}`);
    sections.push(lines.join('\n'));
  }

  const responses = (r.responses ?? {}) as Record<string, unknown>;
  if (Object.keys(responses).length) {
    const lines = ['# Respostas-modelo'];
    for (const [k, v] of Object.entries(responses)) lines.push(`### ${k}\n${v}`);
    sections.push(lines.join('\n\n'));
  }

  const qualification = (r.qualification ?? {}) as Record<string, unknown>;
  if (Array.isArray(qualification.questions)) {
    sections.push(`# Perguntas de qualificação\n- ${(qualification.questions as string[]).join('\n- ')}`);
  }
  if (qualification.lead_temperature) {
    sections.push(`# Temperatura do lead\n${JSON.stringify(qualification.lead_temperature, null, 2)}`);
  }

  const follow_up = (r.follow_up ?? {}) as Record<string, unknown>;
  if (follow_up.enabled && Array.isArray(follow_up.strategy)) {
    sections.push(`# Follow-up\n${JSON.stringify(follow_up.strategy, null, 2)}`);
  }

  if (Array.isArray(r.closing_examples)) {
    sections.push(`# Exemplos de fechamento\n${JSON.stringify(r.closing_examples, null, 2)}`);
  }

  if (Array.isArray(tone.personality)) sections.push(`Personalidade: ${(tone.personality as string[]).join(', ')}`);
  if (Array.isArray(tone.writing_rules)) sections.push(`# Regras de escrita\n- ${(tone.writing_rules as string[]).join('\n- ')}`);
  if (Array.isArray(tone.allowed_emojis)) sections.push(`Emojis permitidos: ${(tone.allowed_emojis as string[]).join(' ')}`);

  if (sections.length) {
    out.additional_prompt = [r.additional_prompt, ...sections].filter(Boolean).join('\n\n---\n\n');
  } else if (typeof r.additional_prompt === 'string') {
    out.additional_prompt = r.additional_prompt;
  }

  const PASSTHROUGH = ['can_do', 'cannot_do', 'handoff_triggers', 'avatar_url', 'is_active'];
  for (const k of PASSTHROUGH) if (r[k] !== undefined && out[k] === undefined) out[k] = r[k];

  return out;
}

// Sanitiza um JSON externo: remove campos sensíveis, normaliza formato e força tipos seguros.
function sanitizeAgentJson(raw: unknown): Partial<ProductAgent> {
  if (!raw || typeof raw !== 'object') throw new Error('JSON inválido');
  const flat = flattenNestedAgent(raw as Record<string, unknown>);
  const STRIP = new Set([
    'id', 'created_at', 'updated_at', 'organization_id', 'created_by', 'is_default',
    'product', 'agent', 'identity', 'objective', 'tone', 'rules', 'tools', 'tags',
    'transfer', 'qualification', 'follow_up', 'sales_flow', 'responses',
    'closing_examples', 'offer', 'guarantee',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    if (STRIP.has(k)) continue;
    out[k] = v;
  }
  if (typeof out.name !== 'string' || !out.name.trim()) {
    throw new Error('Campo obrigatório: name');
  }
  if (typeof out.primary_objective !== 'string') out.primary_objective = '';
  if (typeof out.agent_type !== 'string') out.agent_type = 'custom';
  return out as Partial<ProductAgent>;
}

export function AgentImportModal({ open, onOpenChange, fixedProductId, onDraftReady }: AgentImportModalProps) {
  const { data: products } = useProducts();
  const createAgent = useCreateAgent();

  const [tab, setTab] = useState<'json' | 'doc'>('json');
  const [productId, setProductId] = useState<string>(fixedProductId ?? '__global__');
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonPreview, setJsonPreview] = useState<Partial<ProductAgent> | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState<string>('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docAgentType, setDocAgentType] = useState<string>('custom');
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setJsonFile(null);
    setJsonPreview(null);
    setJsonError(null);
    setJsonText('');
    setDocFile(null);
    setDocAgentType('custom');
    setBusy(false);
  }, []);

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const parseJsonString = (text: string) => {
    setJsonError(null);
    setJsonPreview(null);
    if (!text.trim()) return;
    try {
      const parsed = JSON.parse(text);
      const sanitized = sanitizeAgentJson(parsed);
      setJsonPreview(sanitized);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Falha ao ler JSON');
    }
  };

  const handleJsonFile = async (file: File) => {
    setJsonFile(file);
    const text = await file.text();
    setJsonText(text);
    parseJsonString(text);
  };

  const handleJsonTextChange = (text: string) => {
    setJsonText(text);
    setJsonFile(null);
    parseJsonString(text);
  };

  const handleImportJson = async () => {
    if (!jsonPreview) return;
    setBusy(true);
    const finalProductId = (fixedProductId ?? null) || (productId === '__global__' ? null : productId);
    createAgent.mutate(
      { ...jsonPreview, product_id: finalProductId, is_default: false } as Partial<ProductAgent>,
      {
        onSuccess: () => {
          toast.success('Agente importado com sucesso!');
          close(false);
        },
        onSettled: () => setBusy(false),
      }
    );
  };

  const handleDocFile = (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_DOC_EXT.includes(ext)) {
      toast.error('Formato não suportado. Use PDF, DOCX, TXT ou Markdown.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo acima de 5 MB.');
      return;
    }
    setDocFile(file);
  };

  const handleImportDoc = async () => {
    if (!docFile) return;
    setBusy(true);
    try {
      const file_base64 = await fileToBase64(docFile);
      const { data, error } = await supabase.functions.invoke('import-agent-from-document', {
        body: {
          filename: docFile.name,
          mime_type: docFile.type,
          file_base64,
          agent_type: docAgentType,
        },
      });
      if (error) throw error;
      if (!data?.agent) throw new Error('Resposta inválida da IA');

      const finalProductId = (fixedProductId ?? null) || (productId === '__global__' ? null : productId);
      const draft: Partial<ProductAgent> = {
        ...data.agent,
        agent_type: docAgentType as ProductAgent['agent_type'],
        product_id: finalProductId,
      };

      if (onDraftReady) {
        onDraftReady(draft, finalProductId);
        toast.success('Rascunho gerado! Revise e salve.');
        close(false);
      } else {
        // Cai direto no insert se ninguém quer revisar
        createAgent.mutate(draft, {
          onSuccess: () => {
            toast.success('Agente importado com sucesso!');
            close(false);
          },
        });
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Falha ao importar documento');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Agente</DialogTitle>
          <DialogDescription>
            Traga um agente pronto via JSON exportado, ou estruture um a partir de um briefing em PDF, Word, TXT ou Markdown.
          </DialogDescription>
        </DialogHeader>

        {!fixedProductId && (
          <div className="space-y-2">
            <Label>Vínculo</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">Global (sem produto)</SelectItem>
                {products?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'json' | 'doc')}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="json"><FileJson className="h-4 w-4 mr-2" /> JSON exportado</TabsTrigger>
            <TabsTrigger value="doc"><FileText className="h-4 w-4 mr-2" /> Documento (PDF/Word/TXT)</TabsTrigger>
          </TabsList>

          <TabsContent value="json" className="space-y-4">
            <Card className="border-dashed p-6 text-center">
              <input
                type="file"
                accept=".json,application/json"
                id="agent-json-input"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleJsonFile(e.target.files[0])}
              />
              <label htmlFor="agent-json-input" className="cursor-pointer flex flex-col items-center gap-2">
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">{jsonFile?.name ?? 'Selecionar arquivo .json'}</span>
                <span className="text-xs text-muted-foreground">Use o "Exportar JSON" de outro agente</span>
              </label>
            </Card>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Ou cole o JSON aqui</Label>
              <textarea
                value={jsonText}
                onChange={(e) => handleJsonTextChange(e.target.value)}
                placeholder='{"name": "Meu Agente", "agent_type": "sdr", ...}'
                spellCheck={false}
                className="w-full min-h-[160px] font-mono text-xs rounded-md border border-input bg-background p-3 focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
            </div>

            {jsonError && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{jsonError}</span>
              </div>
            )}

            {jsonPreview && (
              <Card className="p-4 space-y-1">
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Arquivo válido</span>
                </div>
                <div className="text-sm"><strong>Nome:</strong> {String(jsonPreview.name)}</div>
                <div className="text-sm"><strong>Tipo:</strong> {String(jsonPreview.agent_type)}</div>
                {jsonPreview.description && (
                  <div className="text-xs text-muted-foreground line-clamp-2">{String(jsonPreview.description)}</div>
                )}
                <div className="text-xs text-muted-foreground">
                  {Array.isArray(jsonPreview.can_do) ? `${jsonPreview.can_do.length} capacidades` : '—'}
                  {' · '}
                  {Array.isArray(jsonPreview.cannot_do) ? `${jsonPreview.cannot_do.length} restrições` : '—'}
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="doc" className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo do agente a criar</Label>
              <Select value={docAgentType} onValueChange={setDocAgentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Personalizado</SelectItem>
                  <SelectItem value="sdr">SDR</SelectItem>
                  <SelectItem value="closer">Closer</SelectItem>
                  <SelectItem value="support">Suporte</SelectItem>
                  <SelectItem value="financial">Financeiro</SelectItem>
                  <SelectItem value="admin">Administrativo</SelectItem>
                  <SelectItem value="orchestrator">Orquestrador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card className="border-dashed p-6 text-center">
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                id="agent-doc-input"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleDocFile(e.target.files[0])}
              />
              <label htmlFor="agent-doc-input" className="cursor-pointer flex flex-col items-center gap-2">
                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">{docFile?.name ?? 'Selecionar arquivo'}</span>
                <span className="text-xs text-muted-foreground">PDF, DOCX, TXT ou MD · até 5 MB</span>
              </label>
            </Card>

            <p className="text-xs text-muted-foreground">
              A IA lê o conteúdo e gera um rascunho do agente (nome, missão, regras, tom, gatilhos).
              Você revisa antes de salvar.
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>Cancelar</Button>
          {tab === 'json' ? (
            <Button onClick={handleImportJson} disabled={!jsonPreview || busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar Agente
            </Button>
          ) : (
            <Button onClick={handleImportDoc} disabled={!docFile || busy}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Gerar Rascunho com IA
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
