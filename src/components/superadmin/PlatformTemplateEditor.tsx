import { useState, useEffect, useMemo } from 'react';
import { Save, Eye, Code, Variable, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUpdatePlatformTemplate, type PlatformEmailTemplate } from '@/hooks/usePlatformTemplates';

interface Props {
  template: PlatformEmailTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SAMPLE_DATA: Record<string, string> = {
  user_name: 'João Silva',
  company_name: 'Empresa Demo',
  organization_name: 'Empresa Demo',
  email: 'joao@exemplo.com',
  amount: 'R$ 297,00',
  due_date: '15/05/2026',
  invite_link: 'https://app.exemplo.com/aceitar-convite?token=abc123',
  billing_link: 'https://app.exemplo.com/configuracoes/cobranca',
  login_link: 'https://app.exemplo.com/login',
  inviter_name: 'Maria Souza',
  role: 'Vendedor',
  reset_link: 'https://app.exemplo.com/reset?token=xyz',
  message: 'Sua mensagem personalizada aqui.',
  subject: 'Assunto do e-mail',
};

function renderTemplate(html: string, data: Record<string, string>) {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => data[key.trim()] ?? `{{${key.trim()}}}`);
}

export function PlatformTemplateEditor({ template, open, onOpenChange }: Props) {
  const update = useUpdatePlatformTemplate();
  const [form, setForm] = useState({
    name: '',
    description: '',
    subject: '',
    html_content: '',
    variables: [] as string[],
    is_active: true,
  });
  const [newVar, setNewVar] = useState('');

  useEffect(() => {
    if (template) {
      setForm({
        name: template.name,
        description: template.description ?? '',
        subject: template.subject,
        html_content: template.html_content,
        variables: Array.isArray(template.variables) ? template.variables : [],
        is_active: template.is_active,
      });
    }
  }, [template]);

  const previewHtml = useMemo(
    () => renderTemplate(form.html_content, SAMPLE_DATA),
    [form.html_content]
  );
  const previewSubject = useMemo(
    () => renderTemplate(form.subject, SAMPLE_DATA),
    [form.subject]
  );

  const handleSave = async () => {
    if (!template) return;
    await update.mutateAsync({ id: template.id, ...form });
    onOpenChange(false);
  };

  const insertVariable = (v: string) => {
    setForm(f => ({ ...f, html_content: f.html_content + `{{${v}}}` }));
  };

  const addVariable = () => {
    const v = newVar.trim().replace(/[^\w.]/g, '');
    if (!v || form.variables.includes(v)) return;
    setForm(f => ({ ...f, variables: [...f.variables, v] }));
    setNewVar('');
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar template: {template.name}
            <Badge variant="outline">{template.slug}</Badge>
          </DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-hidden flex-1">
          {/* Editor */}
          <div className="space-y-4 overflow-y-auto pr-2">
            <div className="space-y-2">
              <Label>Nome interno</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Assunto</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Use {{variavel}} para dados dinâmicos"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Variable className="h-4 w-4" /> Variáveis disponíveis
                </Label>
              </div>
              <div className="flex flex-wrap gap-2 p-2 border border-border rounded-md min-h-[40px]">
                {form.variables.map(v => (
                  <Badge
                    key={v}
                    variant="secondary"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground gap-1"
                    onClick={() => insertVariable(v)}
                  >
                    {`{{${v}}}`}
                    <X
                      className="h-3 w-3 ml-1 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setForm(f => ({ ...f, variables: f.variables.filter(x => x !== v) }));
                      }}
                    />
                  </Badge>
                ))}
                {form.variables.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhuma variável definida</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="nova_variavel"
                  value={newVar}
                  onChange={(e) => setNewVar(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addVariable())}
                />
                <Button type="button" variant="outline" onClick={addVariable}>
                  Adicionar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Clique em uma variável para inserir no HTML. Sugestões comuns: user_name, company_name, amount, due_date, billing_link, invite_link.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Code className="h-4 w-4" /> HTML do e-mail
              </Label>
              <Textarea
                value={form.html_content}
                onChange={(e) => setForm({ ...form, html_content: e.target.value })}
                className="font-mono text-xs min-h-[300px]"
                placeholder="<html>..."
              />
            </div>

            <div className="flex items-center justify-between p-3 border border-border rounded-md">
              <div>
                <p className="font-medium text-sm">Template ativo</p>
                <p className="text-xs text-muted-foreground">Desative para impedir envios</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(c) => setForm({ ...form, is_active: c })}
              />
            </div>
          </div>

          {/* Preview */}
          <div className="overflow-hidden flex flex-col border border-border rounded-md bg-muted/30">
            <Tabs defaultValue="preview" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="m-2">
                <TabsTrigger value="preview" className="gap-2">
                  <Eye className="h-4 w-4" /> Visualizar
                </TabsTrigger>
                <TabsTrigger value="raw" className="gap-2">
                  <Code className="h-4 w-4" /> HTML
                </TabsTrigger>
              </TabsList>
              <div className="px-3 pb-2 text-xs text-muted-foreground">
                <strong>Assunto:</strong> {previewSubject}
              </div>
              <TabsContent value="preview" className="flex-1 overflow-hidden m-0 p-0">
                <iframe
                  title="Preview"
                  className="w-full h-full bg-background border-t border-border"
                  sandbox=""
                  srcDoc={previewHtml}
                />
              </TabsContent>
              <TabsContent value="raw" className="flex-1 overflow-auto m-0 p-3">
                <pre className="text-xs font-mono whitespace-pre-wrap break-all">{previewHtml}</pre>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Salvar template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
