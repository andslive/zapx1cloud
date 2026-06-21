import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProductAgent } from '@/types/agents';
import {
  GitBranch,
  Tag,
  User,
  Mail,
  FileText,
  Bell,
  ListTodo,
  Calendar,
  Repeat,
  Workflow,
  ArrowRightLeft,
  UserCheck,
  StickyNote,
  Target,
  Thermometer,
} from 'lucide-react';

interface AgentToolsTabProps {
  formData: Partial<ProductAgent>;
  onChange: (updates: Partial<ProductAgent>) => void;
}

interface ToolToggleProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}

function ToolToggle({ icon, label, description, checked, onCheckedChange }: ToolToggleProps) {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function AgentToolsTab({ formData, onChange }: AgentToolsTabProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure quais ações o agente pode executar autonomamente durante as conversas.
      </p>

      {/* Pipeline & Qualificação */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-blue-500" />
            Pipeline & Qualificação
          </CardTitle>
          <CardDescription className="text-xs">Movimentação e qualificação de leads</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-1">
          <ToolToggle
            icon={<GitBranch className="h-4 w-4 text-blue-500" />}
            label="Mover lead no pipeline"
            description="Avançar ou retroceder o lead entre estágios"
            checked={formData.can_update_pipeline ?? false}
            onCheckedChange={(v) => onChange({ can_update_pipeline: v })}
          />
          <ToolToggle
            icon={<Target className="h-4 w-4 text-blue-500" />}
            label="Qualificar lead (BANT)"
            description="Registrar qualificação baseada em orçamento, autoridade, necessidade e prazo"
            checked={formData.can_qualify ?? false}
            onCheckedChange={(v) => onChange({ can_qualify: v })}
          />
          <ToolToggle
            icon={<Thermometer className="h-4 w-4 text-blue-500" />}
            label="Alterar temperatura"
            description="Classificar lead como frio, morno ou quente"
            checked={formData.can_update_lead ?? false}
            onCheckedChange={(v) => onChange({ can_update_lead: v })}
          />
        </CardContent>
      </Card>

      {/* Gestão do Lead */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-green-500" />
            Gestão do Lead
          </CardTitle>
          <CardDescription className="text-xs">Atualizar informações e categorizar leads</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-1">
          <ToolToggle
            icon={<Tag className="h-4 w-4 text-green-500" />}
            label="Aplicar / remover tags"
            description="Categorizar leads com etiquetas automaticamente"
            checked={formData.can_apply_tags ?? false}
            onCheckedChange={(v) => onChange({ can_apply_tags: v })}
          />
          <ToolToggle
            icon={<StickyNote className="h-4 w-4 text-green-500" />}
            label="Adicionar notas internas"
            description="Registrar observações no perfil do lead"
            checked={formData.can_add_notes ?? false}
            onCheckedChange={(v) => onChange({ can_add_notes: v })}
          />
        </CardContent>
      </Card>

      {/* Comunicação */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Mail className="h-4 w-4 text-purple-500" />
            Comunicação
          </CardTitle>
          <CardDescription className="text-xs">Envio de emails, materiais e alertas</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-1">
          <ToolToggle
            icon={<Mail className="h-4 w-4 text-purple-500" />}
            label="Enviar emails"
            description="Disparar emails automáticos para o lead"
            checked={formData.can_send_emails ?? false}
            onCheckedChange={(v) => onChange({ can_send_emails: v })}
          />
          <ToolToggle
            icon={<FileText className="h-4 w-4 text-purple-500" />}
            label="Enviar materiais"
            description="Compartilhar documentos e materiais de apoio"
            checked={formData.can_send_materials ?? false}
            onCheckedChange={(v) => onChange({ can_send_materials: v })}
          />
          <ToolToggle
            icon={<Bell className="h-4 w-4 text-purple-500" />}
            label="Notificar equipe"
            description="Enviar alertas internos para vendedores"
            checked={formData.can_notify ?? false}
            onCheckedChange={(v) => onChange({ can_notify: v })}
          />
        </CardContent>
      </Card>

      {/* Automação */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Workflow className="h-4 w-4 text-orange-500" />
            Automação
          </CardTitle>
          <CardDescription className="text-xs">Tarefas, reuniões, cadências e fluxos</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-1">
          <ToolToggle
            icon={<ListTodo className="h-4 w-4 text-orange-500" />}
            label="Criar tarefas"
            description="Criar atividades vinculadas ao lead"
            checked={formData.can_create_tasks ?? false}
            onCheckedChange={(v) => onChange({ can_create_tasks: v })}
          />
          <ToolToggle
            icon={<Calendar className="h-4 w-4 text-orange-500" />}
            label="Agendar reuniões"
            description="Marcar demonstrações e calls no calendário"
            checked={formData.can_schedule_meetings ?? false}
            onCheckedChange={(v) => onChange({ can_schedule_meetings: v })}
          />
          <ToolToggle
            icon={<Repeat className="h-4 w-4 text-orange-500" />}
            label="Iniciar cadência de follow-up"
            description="Disparar sequência automática de acompanhamento"
            checked={formData.can_start_cadence ?? false}
            onCheckedChange={(v) => onChange({ can_start_cadence: v })}
          />
          <ToolToggle
            icon={<Workflow className="h-4 w-4 text-orange-500" />}
            label="Disparar fluxos"
            description="Iniciar chat flows automaticamente"
            checked={formData.can_trigger_flows ?? false}
            onCheckedChange={(v) => onChange({ can_trigger_flows: v })}
          />
        </CardContent>
      </Card>

      {/* Gestão de Atendimento */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-red-500" />
            Gestão de Atendimento
          </CardTitle>
          <CardDescription className="text-xs">Transferência e escalação de conversas</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-1">
          <ToolToggle
            icon={<ArrowRightLeft className="h-4 w-4 text-red-500" />}
            label="Transferir para outro agente"
            description="Redirecionar conversa para agente IA especializado"
            checked={formData.can_transfer ?? false}
            onCheckedChange={(v) => onChange({ can_transfer: v })}
          />
          <ToolToggle
            icon={<UserCheck className="h-4 w-4 text-red-500" />}
            label="Transferir para humano"
            description="Escalar para fila de atendimento humano"
            checked={formData.can_transfer ?? false}
            onCheckedChange={(v) => onChange({ can_transfer: v })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
