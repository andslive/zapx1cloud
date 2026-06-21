import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Lock,
  User,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Layers,
  MessageSquare,
  Mail,
  Building2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  ExternalLink,
  Server,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSuperAdminFirstAccess } from '@/hooks/useSuperAdminFirstAccess';
import {
  usePlatformWhatsAppConfig,
  useUpdatePlatformWhatsAppConfig,
  useTestWhatsAppConnection,
} from '@/hooks/useWhatsAppInstances';
import { toast } from 'sonner';
import { PlanFormBody } from './plans/PlanFormDialog';
import { OrganizationCreateForm } from './OrganizationCreateForm';

type Step = 'password' | 'name' | 'plan' | 'evolution' | 'email' | 'organization' | 'done';

const STEPS: { id: Step; label: string; required: boolean }[] = [
  { id: 'password', label: 'Senha', required: true },
  { id: 'name', label: 'Nome', required: true },
  { id: 'plan', label: 'Plano', required: true },
  { id: 'evolution', label: 'WhatsApp', required: false },
  { id: 'email', label: 'E-mail', required: false },
  { id: 'organization', label: 'Empresa', required: true },
];

const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

export function FirstAccessSuperAdminModal() {
  const { user, profile } = useAuth();
  const { shouldForceSetup, refetch } = useSuperAdminFirstAccess();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>('password');
  const [opened, setOpened] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (shouldForceSetup && !opened) setOpened(true);
  }, [shouldForceSetup, opened]);

  const { data: state } = useQuery({
    queryKey: ['first-access-wizard-state'],
    enabled: opened,
    queryFn: async () => {
      const [settings, plans, orgs] = await Promise.all([
        supabase
          .from('platform_settings')
          .select('default_password_changed, evolution_go_url, support_email, remix_setup_completed')
          .maybeSingle(),
        supabase
          .from('platform_plans')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase.from('organizations').select('id', { count: 'exact', head: true }),
      ]);
      return {
        passwordChanged: !!(settings.data as any)?.default_password_changed,
        nameSet: !!profile?.full_name && profile.full_name !== 'Super Admin',
        hasPlan: (plans.count ?? 0) > 0,
        hasUazAPI: !!(settings.data as any)?.evolution_go_url,
        hasEmail: !!(settings.data as any)?.support_email,
        hasOrg: (orgs.count ?? 0) > 0,
        completed: !!(settings.data as any)?.remix_setup_completed,
      };
    },
  });

  if (!opened || dismissed) return null;

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const goNext = async () => {
    await qc.invalidateQueries({ queryKey: ['first-access-wizard-state'] });
    await qc.invalidateQueries({ queryKey: ['super-admin-setup-checklist'] });
    const next = STEPS[stepIndex + 1];
    setStep(next ? next.id : 'done');
  };

  const finish = async () => {
    const { data: existing } = await supabase
      .from('platform_settings')
      .select('id')
      .maybeSingle();
    if (existing?.id) {
      await supabase
        .from('platform_settings')
        .update({ remix_setup_completed: true } as any)
        .eq('id', existing.id);
    }
    await qc.invalidateQueries({ queryKey: ['super-admin-setup-checklist'] });
    await qc.invalidateQueries({ queryKey: ['platform-settings'] });
    setDismissed(true);
  };

  return (
    <Dialog open onOpenChange={() => { /* bloqueado */ }}>
      <DialogContent
        className="max-w-3xl max-h-[92vh] overflow-y-auto [&>button.absolute]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <DialogTitle>Configuração inicial da plataforma</DialogTitle>
          </div>
          <DialogDescription>
            Vamos preparar sua plataforma em poucos passos.
          </DialogDescription>
        </DialogHeader>

        {step !== 'done' && (
          <div className="flex items-center gap-1 py-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1 flex-1">
                <div
                  className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                    i < stepIndex
                      ? 'bg-primary/20 text-primary'
                      : i === stepIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i < stepIndex ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-px ${i < stepIndex ? 'bg-primary/40' : 'bg-border'}`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {step === 'password' && <StepPassword onDone={goNext} alreadyDone={state?.passwordChanged} refetchAccess={refetch} />}
        {step === 'name' && <StepName userId={user!.id} initial={profile?.full_name && profile.full_name !== 'Super Admin' ? profile.full_name : ''} onDone={goNext} alreadyDone={state?.nameSet} />}
        {step === 'plan' && <StepPlan onDone={goNext} alreadyDone={state?.hasPlan} />}
        {step === 'evolution' && <StepUazAPI onDone={goNext} alreadyDone={state?.hasUazAPI} />}
        {step === 'email' && <StepEmail onDone={goNext} alreadyDone={state?.hasEmail} />}
        {step === 'organization' && <StepOrganization onDone={goNext} alreadyDone={state?.hasOrg} />}

        {step === 'done' && (
          <div className="space-y-4 text-center py-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <p className="font-semibold">Plataforma pronta!</p>
            <p className="text-sm text-muted-foreground">
              Você concluiu a configuração inicial. Bons negócios!
            </p>
            <Button className="w-full" onClick={finish}>
              Ir para o dashboard
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────── Steps ─────────────────────── */

function AlreadyDone({ label, onContinue }: { label: string; onContinue: () => void }) {
  return (
    <div className="space-y-3">
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>{label}</AlertDescription>
      </Alert>
      <Button className="w-full" onClick={onContinue}>
        Avançar
      </Button>
    </div>
  );
}

function StepPassword({ onDone, alreadyDone, refetchAccess }: { onDone: () => void; alreadyDone?: boolean; refetchAccess: () => any }) {
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [loading, setLoading] = useState(false);

  if (alreadyDone) return <AlreadyDone label="Senha já alterada" onContinue={onDone} />;

  const save = async () => {
    if (!PASSWORD_RULE.test(pwd)) {
      toast.error('Senha fraca', { description: 'Mín. 8 caracteres, 1 maiúscula e 1 número.' });
      return;
    }
    if (pwd !== pwd2) return toast.error('As senhas não coincidem.');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) {
      setLoading(false);
      return toast.error('Erro ao atualizar senha', { description: error.message });
    }
    try { await supabase.rpc('mark_super_admin_password_changed' as any); } catch {}
    await refetchAccess();
    setLoading(false);
    toast.success('Senha atualizada!');
    onDone();
  };

  return (
    <div className="space-y-3">
      <Alert>
        <Lock className="h-4 w-4" />
        <AlertDescription>Defina uma nova senha forte. Esse passo é obrigatório.</AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label>Nova senha</Label>
        <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="••••••••" />
        <p className="text-xs text-muted-foreground">Mín. 8 caracteres, 1 maiúscula e 1 número.</p>
      </div>
      <div className="space-y-2">
        <Label>Confirmar nova senha</Label>
        <Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} placeholder="••••••••" />
      </div>
      <Button className="w-full" onClick={save} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
        Salvar e avançar
      </Button>
    </div>
  );
}

function StepName({ userId, initial, onDone, alreadyDone }: { userId: string; initial: string; onDone: () => void; alreadyDone?: boolean }) {
  const [name, setName] = useState(initial);
  const [loading, setLoading] = useState(false);

  if (alreadyDone) return <AlreadyDone label="Nome já configurado" onContinue={onDone} />;

  const save = async () => {
    if (!name.trim()) return toast.error('Informe seu nome completo.');
    setLoading(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', userId);
    setLoading(false);
    if (error) return toast.error('Erro ao salvar nome', { description: error.message });
    toast.success('Nome salvo!');
    onDone();
  };

  return (
    <div className="space-y-3">
      <Alert>
        <User className="h-4 w-4" />
        <AlertDescription>Como devemos te chamar?</AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label>Nome completo</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome completo" />
      </div>
      <Button className="w-full" onClick={save} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
        Salvar e avançar
      </Button>
    </div>
  );
}

function StepPlan({ onDone, alreadyDone }: { onDone: () => void; alreadyDone?: boolean }) {
  if (alreadyDone) return <AlreadyDone label="Plano comercial já cadastrado" onContinue={onDone} />;

  return (
    <div className="space-y-3">
      <Alert>
        <Layers className="h-4 w-4" />
        <AlertDescription>
          Crie pelo menos um plano comercial inicial. Ele será aplicado às empresas que você cadastrar a seguir.
        </AlertDescription>
      </Alert>
      <PlanFormBody
        plan={null}
        submitLabel="Criar plano e avançar"
        showCancel={false}
        onSaved={() => onDone()}
      />
    </div>
  );
}

function StepUazAPI({ onDone, alreadyDone }: { onDone: () => void; alreadyDone?: boolean }) {
  const { data: config, isLoading: cfgLoading } = usePlatformWhatsAppConfig();
  const updateCfg = useUpdatePlatformWhatsAppConfig();
  const testMut = useTestWhatsAppConnection();

  const [url, setUrl] = useState('');
  const [globalApiKey, setGlobalApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (config) {
      setUrl(config.evolution_go_url || '');
      setGlobalApiKey(config.evolution_go_global_api_key || '');
    }
  }, [config]);

  if (alreadyDone) return <AlreadyDone label="Servidor WhatsApp configurado" onContinue={onDone} />;

  const cleanUrl = url.replace(/\/$/, '');

  const handleTest = () => {
    setTestResult(null);
    testMut.mutate(
      { url: cleanUrl, globalApiKey },
      {
        onSuccess: (data: any) =>
          setTestResult({ ok: !!data?.ok, msg: data?.message || 'OK' }),
        onError: (e: any) => setTestResult({ ok: false, msg: e.message }),
      }
    );
  };

  const handleSave = () => {
    updateCfg.mutate(
      { evolution_go_url: cleanUrl, evolution_go_global_api_key: globalApiKey },
      {
        onSuccess: () => {
          toast.success('Servidor WhatsApp configurado!');
          onDone();
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      <Alert>
        <Server className="h-4 w-4" />
        <AlertDescription>
          Opcional — necessário se as empresas usarão WhatsApp via UazAPI.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="evo-url">URL do UazAPI</Label>
        <Input
          id="evo-url"
          placeholder="https://chatwoot-evogo.cftoys.easypanel.host"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={cfgLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="evo-key">Global API Key</Label>
        <div className="relative">
          <Input
            id="evo-key"
            type={showKey ? 'text' : 'password'}
            value={globalApiKey}
            onChange={(e) => setGlobalApiKey(e.target.value)}
            disabled={cfgLoading}
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
            onClick={() => setShowKey((s) => !s)}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {testResult && (
        <div
          className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
            testResult.ok
              ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {testResult.ok ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <span className="break-all">{testResult.msg}</span>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={onDone}>Pular</Button>
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testMut.isPending || !cleanUrl || !globalApiKey}
        >
          {testMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Testar Conexão
        </Button>
        <Button
          className="flex-1"
          onClick={handleSave}
          disabled={updateCfg.isPending || !cleanUrl || !globalApiKey}
        >
          {updateCfg.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Salvar e avançar
        </Button>
      </div>
    </div>
  );
}

function StepEmail({ onDone, alreadyDone }: { onDone: () => void; alreadyDone?: boolean }) {
  if (alreadyDone) return <AlreadyDone label="E-mail transacional configurado" onContinue={onDone} />;
  return (
    <div className="space-y-3">
      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription>
          Opcional — configure o domínio de envio de e-mails na Lovable Cloud.
        </AlertDescription>
      </Alert>
      <Button
        variant="outline"
        className="w-full"
        onClick={() =>
          window.open(
            'https://lovable.dev/projects/f6728bcf-44ef-470a-82a0-e0613d40999f?view=cloud&section=email',
            '_blank'
          )
        }
      >
        <ExternalLink className="h-4 w-4 mr-2" />
        Abrir configuração na Lovable Cloud
      </Button>
      <Button className="w-full" onClick={onDone}>Avançar</Button>
    </div>
  );
}

function StepOrganization({ onDone, alreadyDone }: { onDone: () => void; alreadyDone?: boolean }) {
  if (alreadyDone) return <AlreadyDone label="Empresa já cadastrada" onContinue={onDone} />;
  return (
    <div className="space-y-3">
      <Alert>
        <Building2 className="h-4 w-4" />
        <AlertDescription>Cadastre a primeira empresa cliente.</AlertDescription>
      </Alert>
      <OrganizationCreateForm
        submitLabel="Criar empresa e concluir"
        onCreated={() => onDone()}
      />
    </div>
  );
}
