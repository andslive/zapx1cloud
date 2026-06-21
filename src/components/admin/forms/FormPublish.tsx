import { Form } from '@/types/forms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link2, Code, MessageSquare, Copy, ExternalLink, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface FormPublishProps {
  form: Form;
}

export function FormPublish({ form }: FormPublishProps) {
  const [copied, setCopied] = useState<string | null>(null);
  
  const baseUrl = window.location.origin;
  const publicUrl = `${baseUrl}/f/${form.slug}`;
  const embedUrl = `${baseUrl}/embed/form/${form.id}`;
  
  const iframeCode = `<iframe 
  src="${embedUrl}" 
  width="100%" 
  height="600" 
  frameborder="0"
  style="border: none; border-radius: 8px;">
</iframe>`;

  const widgetCode = `<script src="${baseUrl}/form-widget.js"></script>
<script>
  FormWidget.init({
    formId: '${form.id}',
    container: '#meu-formulario',
    theme: 'auto'
  });
</script>
<div id="meu-formulario"></div>`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    toast.success('Copiado!');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Status do Formulário</CardTitle>
              <CardDescription>Estado atual e informações de publicação</CardDescription>
            </div>
            <Badge variant={form.status === 'active' ? 'default' : 'secondary'} className="text-sm">
              {form.status === 'active' ? '🟢 Publicado' : 
               form.status === 'draft' ? '📝 Rascunho' :
               form.status === 'paused' ? '⏸️ Pausado' : '📦 Arquivado'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{form.views_count || 0}</p>
              <p className="text-sm text-muted-foreground">Visualizações</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{form.submissions_count || 0}</p>
              <p className="text-sm text-muted-foreground">Respostas</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-2xl font-bold">
                {form.views_count && form.views_count > 0 
                  ? `${((form.submissions_count || 0) / form.views_count * 100).toFixed(1)}%` 
                  : '0%'}
              </p>
              <p className="text-sm text-muted-foreground">Conversão</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Share Options */}
      <Card>
        <CardHeader>
          <CardTitle>Compartilhar Formulário</CardTitle>
          <CardDescription>Escolha como deseja disponibilizar seu formulário</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="link" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="link" className="gap-2">
                <Link2 className="h-4 w-4" />
                Link Direto
              </TabsTrigger>
              <TabsTrigger value="embed" className="gap-2">
                <Code className="h-4 w-4" />
                Embed (iframe)
              </TabsTrigger>
              <TabsTrigger value="widget" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Widget JS
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="link" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>URL Pública</Label>
                <div className="flex gap-2">
                  <Input value={publicUrl} readOnly className="font-mono text-sm" />
                  <Button 
                    variant="outline" 
                    onClick={() => copyToClipboard(publicUrl, 'link')}
                  >
                    {copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  💡 <strong>Dica:</strong> Use este link em campanhas de email, posts em redes sociais ou compartilhe diretamente com seus leads.
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="embed" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>Código HTML</Label>
                <div className="relative">
                  <pre className="p-4 bg-muted rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                    {iframeCode}
                  </pre>
                  <Button 
                    variant="secondary" 
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(iframeCode, 'embed')}
                  >
                    {copied === 'embed' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  💡 <strong>Dica:</strong> Cole este código em qualquer página HTML para incorporar o formulário. Ajuste a altura conforme necessário.
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="widget" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>Script JavaScript</Label>
                <div className="relative">
                  <pre className="p-4 bg-muted rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap">
                    {widgetCode}
                  </pre>
                  <Button 
                    variant="secondary" 
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(widgetCode, 'widget')}
                  >
                    {copied === 'widget' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  💡 <strong>Dica:</strong> O widget JavaScript oferece mais controle e flexibilidade. Você pode customizar o container e o tema.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* QR Code */}
      <Card>
        <CardHeader>
          <CardTitle>QR Code</CardTitle>
          <CardDescription>Compartilhe o formulário em materiais impressos</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <div className="w-32 h-32 bg-muted rounded-lg flex items-center justify-center">
            <p className="text-xs text-muted-foreground text-center p-2">
              QR Code será gerado após publicação
            </p>
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-4">
              Baixe o QR Code para usar em materiais impressos, cartões de visita ou apresentações.
            </p>
            <Button variant="outline" disabled={form.status !== 'active'}>
              Baixar QR Code
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
