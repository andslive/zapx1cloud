import { useState } from 'react';
import {
  Mail,
  Send,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Pencil,
  KeyRound,
  CreditCard,
  Bell,
  Megaphone,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { usePlatformEmailSettings, useUpdatePlatformEmailSettings, useCreateAuditLog } from '@/hooks/useSuperAdmin';
import { usePlatformTemplates, type PlatformEmailTemplate } from '@/hooks/usePlatformTemplates';
import { PlatformTemplateEditor } from './PlatformTemplateEditor';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<any>; color: string }> = {
  acesso: { label: 'Acesso & Convites', icon: KeyRound, color: 'text-blue-500' },
  cobranca: { label: 'Cobrança', icon: CreditCard, color: 'text-amber-500' },
  sistema: { label: 'Sistema', icon: Bell, color: 'text-primary' },
  mala_direta: { label: 'Mala Direta', icon: Megaphone, color: 'text-purple-500' },
};

export function EmailSettings() {
  const { data: settings, isLoading } = usePlatformEmailSettings();
  const { data: templates, isLoading: loadingTemplates } = usePlatformTemplates();
  const updateSettings = useUpdatePlatformEmailSettings();
  const createAuditLog = useCreateAuditLog();

  const [editing, setEditing] = useState<PlatformEmailTemplate | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  const automation = {
    reminder_days_before: settings?.reminder_days_before ?? 3,
    reminder_on_due_date: settings?.reminder_on_due_date ?? true,
    alert_days_after: settings?.alert_days_after ?? 3,
    suspend_days_after: settings?.suspend_days_after ?? 15,
  };

  const saveAutomation = async (patch: Partial<typeof automation>) => {
    try {
      await updateSettings.mutateAsync({ ...automation, ...patch });
      await createAuditLog.mutateAsync({
        action: 'Automação de e-mail atualizada',
        entity_type: 'platform_email_settings',
      });
      toast.success('Automação salva');
    } catch {
      toast.error('Erro ao salvar');
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      toast.error('Informe um e-mail válido');
      return;
    }
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke('test-integration', {
        body: { type: 'email', email: testEmail },
      });
      if (error) throw error;
      toast.success(`E-mail de teste enviado para ${testEmail}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao enviar e-mail de teste');
    } finally {
      setTesting(false);
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

  const templatesByCategory = (templates ?? []).reduce<Record<string, PlatformEmailTemplate[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Configurações de E-mail</h1>
          <p className="text-muted-foreground">Provedor, templates e automações de e-mail da plataforma</p>
        </div>
      </div>

      <Tabs defaultValue="provider" className="space-y-6">
        <TabsList>
          <TabsTrigger value="provider">Provedor</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="automation">Automações</TabsTrigger>
        </TabsList>

        {/* Provider */}
        <TabsContent value="provider">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Lovable Emails
              </CardTitle>
              <CardDescription>
                Envio nativo de e-mails com domínio próprio, sem custo adicional
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium text-sm">Sistema ativo</p>
                  <p className="text-sm text-muted-foreground">
                    Todos os e-mails da plataforma são enviados via Lovable Emails através do domínio configurado.
                    Inclui DKIM, SPF, fila com retry automático e descadastro one-click.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Recursos inclusos</p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Domínio verificado automaticamente</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Fila com retry e dead-letter</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Lista de supressão (bounces/complaints)</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Descadastro automático em conformidade</li>
                </ul>
              </div>

              <div className="border-t border-border pt-6 space-y-2">
                <p className="text-sm font-medium">Enviar e-mail de teste</p>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="seu@email.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                  <Button onClick={handleTestEmail} disabled={testing}>
                    <Send className="h-4 w-4 mr-2" />
                    {testing ? 'Enviando...' : 'Enviar teste'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates */}
        <TabsContent value="templates" className="space-y-4">
          {loadingTemplates ? (
            <Skeleton className="h-[400px] w-full" />
          ) : (
            Object.entries(CATEGORY_META).map(([cat, meta]) => {
              const items = templatesByCategory[cat] ?? [];
              if (items.length === 0) return null;
              const Icon = meta.icon;
              return (
                <Card key={cat}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className={`h-5 w-5 ${meta.color}`} />
                      {meta.label}
                      <Badge variant="outline" className="ml-2">{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {items.map((tpl) => (
                        <div
                          key={tpl.id}
                          className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm truncate">{tpl.name}</p>
                                {!tpl.is_active && (
                                  <Badge variant="secondary" className="text-xs">Inativo</Badge>
                                )}
                                {tpl.is_system && (
                                  <Badge variant="outline" className="text-xs">Sistema</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {tpl.description ?? tpl.subject}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(tpl)}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-2" />
                            Editar
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* Automation */}
        <TabsContent value="automation">
          <Card>
            <CardHeader>
              <CardTitle>Automações de Cobrança</CardTitle>
              <CardDescription>Quando os e-mails automáticos serão disparados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium">Lembrete antes do vencimento</p>
                    <p className="text-sm text-muted-foreground">
                      Enviar lembrete {automation.reminder_days_before} dias antes
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    defaultValue={automation.reminder_days_before}
                    onBlur={(e) => saveAutomation({ reminder_days_before: parseInt(e.target.value) })}
                    className="w-20"
                    min={1}
                    max={30}
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Cobrança no dia do vencimento</p>
                    <p className="text-sm text-muted-foreground">Enviar e-mail no dia D</p>
                  </div>
                </div>
                <Switch
                  checked={automation.reminder_on_due_date}
                  onCheckedChange={(c) => saveAutomation({ reminder_on_due_date: c })}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="font-medium">Alerta de atraso</p>
                    <p className="text-sm text-muted-foreground">
                      Após {automation.alert_days_after} dias de atraso
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    defaultValue={automation.alert_days_after}
                    onBlur={(e) => saveAutomation({ alert_days_after: parseInt(e.target.value) })}
                    className="w-20"
                    min={1}
                    max={30}
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium">Suspensão automática</p>
                    <p className="text-sm text-muted-foreground">
                      Suspender após {automation.suspend_days_after} dias de atraso
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    defaultValue={automation.suspend_days_after}
                    onBlur={(e) => saveAutomation({ suspend_days_after: parseInt(e.target.value) })}
                    className="w-20"
                    min={1}
                    max={90}
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PlatformTemplateEditor
        template={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </div>
  );
}
