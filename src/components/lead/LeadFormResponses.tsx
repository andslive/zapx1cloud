import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Target, Tag } from 'lucide-react';

interface LeadFormResponsesProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
}

export function LeadFormResponses({ metadata }: LeadFormResponsesProps) {
  // Type-safe access to form metadata
  const formResponses = metadata?.form_responses as Record<string, unknown> | undefined;
  const formName = metadata?.form_name as string | undefined;
  const formScore = metadata?.form_score as number | undefined;
  const formTags = metadata?.form_tags as string[] | undefined;

  if (!formResponses || Object.keys(formResponses).length === 0) {
    return null;
  }

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const getScoreColor = (score: number): string => {
    if (score >= 70) return 'text-green-500 bg-green-500/10';
    if (score >= 40) return 'text-yellow-500 bg-yellow-500/10';
    return 'text-red-500 bg-red-500/10';
  };

  // Filter out common fields that are shown elsewhere
  const filteredResponses = Object.entries(formResponses).filter(
    ([key]) => !['name', 'nome', 'email', 'phone', 'telefone', 'full_name'].includes(key)
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Respostas do Formulário
          {formName && (
            <Badge variant="outline" className="ml-auto font-normal">
              {formName}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score and Tags */}
        {(formScore !== undefined || (formTags && formTags.length > 0)) && (
          <div className="flex flex-wrap items-center gap-3 pb-3 border-b">
            {formScore !== undefined && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${getScoreColor(formScore)}`}>
                <Target className="h-4 w-4" />
                <span className="font-semibold text-sm">{formScore} pts</span>
              </div>
            )}
            {formTags && formTags.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <div className="flex gap-1">
                  {formTags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Responses */}
        <div className="space-y-3">
          {filteredResponses.map(([key, value]) => (
            <div key={key} className="text-sm">
              <p className="text-muted-foreground text-xs mb-0.5">{key}</p>
              <p className="text-foreground">{formatValue(value)}</p>
            </div>
          ))}
          {filteredResponses.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Nenhuma resposta adicional
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
