import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Sparkles, ThumbsUp, AlertTriangle, Lightbulb, RefreshCw } from 'lucide-react';

interface AISummaryTabProps {
  conversationId: string;
}

interface AnalysisResult {
  score: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  metrics?: {
    avgResponseTime?: string;
    tone?: string;
    salesTechniques?: string[];
    objectionsHandled?: number;
  };
}

export function AISummaryTab({ conversationId }: AISummaryTabProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['conversation-analysis', conversationId, refreshKey],
    queryFn: async (): Promise<AnalysisResult> => {
      const { data, error } = await supabase.functions.invoke('analyze-conversation', {
        body: { conversationId },
      });
      if (error) throw error;
      return data as AnalysisResult;
    },
    enabled: !!conversationId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2 py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">A IA está analisando esta conversa…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-6 space-y-3">
        <p className="text-xs text-muted-foreground">
          Não foi possível gerar o resumo agora.
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  const score = Math.max(0, Math.min(10, data.score ?? 0));
  const scoreColor =
    score >= 8 ? 'text-emerald-500' : score >= 5 ? 'text-yellow-500' : 'text-destructive';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resumo da IA
          </h5>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Score */}
      <div className="p-3 bg-muted/40 rounded-lg space-y-2">
        <div className="flex items-end justify-between">
          <span className="text-xs text-muted-foreground">Nota geral</span>
          <span className={`text-2xl font-bold ${scoreColor}`}>
            {score.toFixed(1)}
            <span className="text-xs text-muted-foreground font-normal">/10</span>
          </span>
        </div>
        <Progress value={score * 10} className="h-1.5" />
      </div>

      {/* Metrics */}
      {data.metrics && (
        <div className="flex flex-wrap gap-1.5">
          {data.metrics.tone && (
            <Badge variant="outline" className="text-[10px]">
              Tom: {data.metrics.tone}
            </Badge>
          )}
          {data.metrics.objectionsHandled !== undefined && (
            <Badge variant="outline" className="text-[10px]">
              Objeções tratadas: {data.metrics.objectionsHandled}
            </Badge>
          )}
          {data.metrics.avgResponseTime && (
            <Badge variant="outline" className="text-[10px]">
              Tempo médio: {data.metrics.avgResponseTime}
            </Badge>
          )}
        </div>
      )}

      {/* Strengths */}
      {data.strengths?.length > 0 && (
        <Section
          icon={<ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />}
          title="Pontos fortes"
          items={data.strengths}
        />
      )}

      {/* Weaknesses */}
      {data.weaknesses?.length > 0 && (
        <Section
          icon={<AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />}
          title="A melhorar"
          items={data.weaknesses}
        />
      )}

      {/* Suggestions */}
      {data.suggestions?.length > 0 && (
        <Section
          icon={<Lightbulb className="h-3.5 w-3.5 text-blue-500" />}
          title="Próximas ações sugeridas"
          items={data.suggestions}
        />
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      <ul className="text-xs space-y-1 pl-1">
        {items.map((it, i) => (
          <li key={i} className="leading-relaxed">
            • {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
