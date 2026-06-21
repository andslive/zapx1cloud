import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Code, ExternalLink, Info } from 'lucide-react';
import { toast } from 'sonner';

interface SnippetCardProps {
  widgetId: string;
  productId: string;
}

export function SnippetCard({ widgetId, productId }: SnippetCardProps) {
  const [copied, setCopied] = useState(false);

  // Get the current domain for the snippet
  const currentDomain = window.location.origin;

  const snippet = `<!-- WebChat Widget -->
<script 
  src="${currentDomain}/webchat-widget.js" 
  data-widget-id="${widgetId}"
  data-product-id="${productId}"
  async>
</script>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success('Código copiado para a área de transferência!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Erro ao copiar código');
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Snippet Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Código de Instalação
              </CardTitle>
              <CardDescription>
                Copie e cole este código antes do fechamento da tag &lt;/body&gt; no seu site
              </CardDescription>
            </div>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              Pronto para usar
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono">
              <code>{snippet}</code>
            </pre>
            <Button
              variant="secondary"
              size="sm"
              className="absolute top-2 right-2"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copiar
                </>
              )}
            </Button>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">IDs do Widget</p>
              <p className="text-blue-600 mt-1">
                Widget ID: <code className="bg-blue-100 px-1 rounded">{widgetId}</code>
              </p>
              <p className="text-blue-600">
                Product ID: <code className="bg-blue-100 px-1 rounded">{productId}</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📋 Instruções de Instalação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal list-inside space-y-3 text-sm">
            <li className="text-muted-foreground">
              <span className="text-foreground font-medium">Copie o código acima</span>
              <p className="ml-5 mt-1">Clique no botão "Copiar" para copiar o snippet</p>
            </li>
            <li className="text-muted-foreground">
              <span className="text-foreground font-medium">Abra o HTML do seu site</span>
              <p className="ml-5 mt-1">Localize o arquivo HTML principal ou o template do seu site</p>
            </li>
            <li className="text-muted-foreground">
              <span className="text-foreground font-medium">Cole antes do &lt;/body&gt;</span>
              <p className="ml-5 mt-1">Insira o código logo antes da tag de fechamento do body</p>
            </li>
            <li className="text-muted-foreground">
              <span className="text-foreground font-medium">Salve e publique</span>
              <p className="ml-5 mt-1">O widget aparecerá automaticamente no canto da tela</p>
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Platform-specific instructions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">WordPress</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Use um plugin como "Insert Headers and Footers" ou adicione diretamente no arquivo footer.php do seu tema.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Shopify</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Vá em Online Store → Themes → Edit Code e adicione no arquivo theme.liquid antes do &lt;/body&gt;.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Wix</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Use o recurso "Custom Code" nas configurações do site para adicionar o snippet.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">HTML/Landing Pages</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Cole o código diretamente no HTML antes do fechamento da tag &lt;/body&gt;.</p>
          </CardContent>
        </Card>
      </div>

      {/* Help */}
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <ExternalLink className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Precisa de ajuda?</p>
              <p className="text-xs text-muted-foreground">Consulte nossa documentação ou entre em contato</p>
            </div>
          </div>
          <Button variant="outline" size="sm">
            Ver Documentação
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
