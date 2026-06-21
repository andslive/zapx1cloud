import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCreateEmailTemplate, useUpdateEmailTemplate, EmailTemplate } from '@/hooks/useEmailTemplates';
import { Loader2, Save, Code, Eye } from 'lucide-react';

interface TemplateEditorDialogProps {
  template: EmailTemplate | null;
  open: boolean;
  onClose: () => void;
}

export function TemplateEditorDialog({ template, open, onClose }: TemplateEditorDialogProps) {
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();
  
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    subject: '',
    html_content: '',
    variables: [] as Array<{ name: string; description: string }>,
    is_system: false,
    is_active: true
  });

  const [newVariable, setNewVariable] = useState({ name: '', description: '' });

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        slug: template.slug,
        subject: template.subject,
        html_content: template.html_content,
        variables: template.variables,
        is_system: template.is_system,
        is_active: template.is_active
      });
    } else {
      setFormData({
        name: '',
        slug: '',
        subject: '',
        html_content: defaultHtmlTemplate,
        variables: [],
        is_system: false,
        is_active: true
      });
    }
  }, [template]);

  const handleSave = async () => {
    if (template) {
      await updateTemplate.mutateAsync({
        id: template.id,
        ...formData
      });
    } else {
      await createTemplate.mutateAsync(formData);
    }
    onClose();
  };

  const addVariable = () => {
    if (newVariable.name) {
      setFormData(prev => ({
        ...prev,
        variables: [...prev.variables, newVariable]
      }));
      setNewVariable({ name: '', description: '' });
    }
  };

  const removeVariable = (name: string) => {
    setFormData(prev => ({
      ...prev,
      variables: prev.variables.filter(v => v.name !== name)
    }));
  };

  const renderPreview = () => {
    let html = formData.html_content;
    formData.variables.forEach(v => {
      const regex = new RegExp(`{{${v.name}}}`, 'g');
      html = html.replace(regex, `<span style="background:#fef3c7;padding:0 4px;border-radius:2px;">[${v.name}]</span>`);
    });
    return html;
  };

  const isLoading = createTemplate.isPending || updateTemplate.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {template ? 'Editar Template' : 'Novo Template'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Template</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Boas-vindas"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug (identificador)</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                placeholder="Ex: welcome_email"
                disabled={template?.is_system}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Assunto do Email</Label>
            <Input
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
              placeholder="Ex: Bem-vindo(a) ao time, {{userName}}!"
            />
          </div>

          <div className="space-y-2">
            <Label>Variáveis</Label>
            <div className="flex flex-wrap gap-2">
              {formData.variables.map((v) => (
                <Badge 
                  key={v.name} 
                  variant="secondary" 
                  className="cursor-pointer"
                  onClick={() => !template?.is_system && removeVariable(v.name)}
                >
                  {`{{${v.name}}}`}
                  {!template?.is_system && <span className="ml-1">×</span>}
                </Badge>
              ))}
            </div>
            {!template?.is_system && (
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Nome da variável"
                  value={newVariable.name}
                  onChange={(e) => setNewVariable(prev => ({ ...prev, name: e.target.value }))}
                  className="flex-1"
                />
                <Input
                  placeholder="Descrição"
                  value={newVariable.description}
                  onChange={(e) => setNewVariable(prev => ({ ...prev, description: e.target.value }))}
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={addVariable}>
                  Adicionar
                </Button>
              </div>
            )}
          </div>

          <Tabs defaultValue="code" className="flex-1">
            <TabsList>
              <TabsTrigger value="code" className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                HTML
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview
              </TabsTrigger>
            </TabsList>
            <TabsContent value="code" className="mt-4">
              <Textarea
                value={formData.html_content}
                onChange={(e) => setFormData(prev => ({ ...prev, html_content: e.target.value }))}
                className="font-mono text-sm min-h-[300px]"
                placeholder="Cole o HTML do seu template aqui..."
              />
            </TabsContent>
            <TabsContent value="preview" className="mt-4">
              <div 
                className="border rounded-lg p-4 min-h-[300px] bg-white"
                dangerouslySetInnerHTML={{ __html: renderPreview() }}
              />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !formData.name || !formData.slug}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const defaultHtmlTemplate = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .header h1 { color: white; margin: 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Título</h1>
    </div>
    <div class="content">
      <p>Olá,</p>
      <p>Seu conteúdo aqui...</p>
    </div>
    <div class="footer">
      <p>Sua Empresa</p>
    </div>
  </div>
</body>
</html>`;
