import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  FileJson, 
  Copy,
  Check,
  Trash2,
  Info
} from 'lucide-react';
import { useDeleteSample } from '@/hooks/useWebhooks';
import { toast } from 'sonner';
import type { WebhookSampleRequest } from '@/types/webhook';

interface WebhookRequestsPanelProps {
  webhookId: string;
  samples: WebhookSampleRequest[];
}

export function WebhookRequestsPanel({ webhookId, samples }: WebhookRequestsPanelProps) {
  const [selectedSampleId, setSelectedSampleId] = useState<string>(samples[0]?.id || '');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const deleteSample = useDeleteSample();

  const selectedSample = samples.find(s => s.id === selectedSampleId);
  const fields = selectedSample?.extracted_fields || {};

  const copyField = (fieldPath: string) => {
    navigator.clipboard.writeText(fieldPath);
    setCopiedField(fieldPath);
    toast.success(`Campo "${fieldPath}" copiado!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDeleteSample = async (sampleId: string) => {
    await deleteSample.mutateAsync(sampleId);
    if (selectedSampleId === sampleId && samples.length > 1) {
      setSelectedSampleId(samples.find(s => s.id !== sampleId)?.id || '');
    }
  };

  const renderFieldValue = (value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const flattenObject = (obj: any, prefix = ''): Record<string, any> => {
    const result: Record<string, any> = {};
    
    for (const key in obj) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenObject(value, fullPath));
      } else {
        result[fullPath] = value;
      }
    }
    
    return result;
  };

  const flatFields = flattenObject(fields);

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Requisições de Exemplo</CardTitle>
          {samples.length > 0 && (
            <Badge variant="secondary">
              {samples.length} {samples.length === 1 ? 'amostra' : 'amostras'}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Campos disponíveis para mapeamento nas ações
        </p>
      </CardHeader>
      <CardContent>
        {samples.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed rounded-lg">
            <FileJson className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              Nenhuma requisição recebida ainda
            </p>
            <p className="text-xs text-muted-foreground">
              Envie uma requisição de teste para o webhook e os campos aparecerão aqui
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Sample Selector */}
            <div className="flex items-center gap-2">
              <Select value={selectedSampleId} onValueChange={setSelectedSampleId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecionar amostra" />
                </SelectTrigger>
                <SelectContent>
                  {samples.map((sample) => (
                    <SelectItem key={sample.id} value={sample.id}>
                      {sample.name || 'Requisição'} - {new Date(sample.created_at).toLocaleString('pt-BR')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSample && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDeleteSample(selectedSample.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Fields List */}
            <div className="rounded-lg border bg-muted/30">
              <div className="p-3 border-b bg-muted/50 flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Clique em um campo para copiar o caminho
                </span>
              </div>
              <ScrollArea className="h-[400px]">
                <div className="p-2 space-y-1">
                  {Object.entries(flatFields).map(([path, value]) => (
                    <button
                      key={path}
                      onClick={() => copyField(path)}
                      className="w-full flex items-center justify-between p-2 rounded hover:bg-muted text-left transition-colors group"
                    >
                      <div className="flex-1 min-w-0 mr-2">
                        <code className="text-xs font-mono text-primary">{path}</code>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {renderFieldValue(value)}
                        </p>
                      </div>
                      {copiedField === path ? (
                        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <Copy className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Raw JSON Toggle */}
            <details className="group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Ver JSON completo
              </summary>
              <pre className="mt-2 p-3 rounded-lg bg-muted text-xs overflow-auto max-h-48">
                {JSON.stringify(selectedSample?.request_body, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
