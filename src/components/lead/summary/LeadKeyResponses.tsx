import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, ArrowRight } from 'lucide-react';

interface Props {
  metadata: any;
  onSeeAll?: () => void;
}

const HIDDEN_KEYS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'referrer', 'page', 'user_agent', 'ip',
]);

const PRIORITY_HINTS = ['nome', 'name', 'email', 'whatsapp', 'phone', 'telefone', 'empresa', 'company', 'cargo', 'objetivo', 'orcamento', 'budget', 'comprovante'];

function pickKeyResponses(responses: Record<string, any>): [string, any][] {
  const entries = Object.entries(responses).filter(
    ([k, v]) => v != null && v !== '' && !HIDDEN_KEYS.has(k.toLowerCase())
  );
  // Sort: priority hints first, then preserve original order
  entries.sort(([a], [b]) => {
    const ai = PRIORITY_HINTS.findIndex((h) => a.toLowerCase().includes(h));
    const bi = PRIORITY_HINTS.findIndex((h) => b.toLowerCase().includes(h));
    const aS = ai === -1 ? 999 : ai;
    const bS = bi === -1 ? 999 : bi;
    return aS - bS;
  });
  return entries.slice(0, 10); // Show more items now
}

function formatLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatValue(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function LeadKeyResponses({ metadata, onSeeAll }: Props) {
  const allResponses = {
    ...(metadata?.form_responses || metadata?.responses || {}),
    ...metadata
  } as Record<string, any>;

  // Clean up metadata root to avoid showing technical objects
  const filteredResponses: Record<string, any> = {};
  Object.entries(allResponses).forEach(([k, v]) => {
    if (k === 'form_responses' || k === 'responses' || k === 'last_receipt_at' || k === 'tags' || k === 'id') return;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return;
    filteredResponses[k] = v;
  });

  if (Object.keys(filteredResponses).length === 0) return null;

  const items = pickKeyResponses(filteredResponses);
  if (items.length === 0) return null;

  const total = Object.keys(filteredResponses).length;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Dados e Respostas
        </CardTitle>
        {total > items.length && onSeeAll && (
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={onSeeAll}>
            Ver todos ({total}) <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          {items.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted-foreground truncate">{formatLabel(k)}</dt>
              <dd className="font-medium truncate" title={formatValue(v)}>{formatValue(v)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}