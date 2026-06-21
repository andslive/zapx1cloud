import { Brain, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface BrainHealthScoreProps {
  score: number;
  stats?: {
    file: number;
    website: number;
    youtube: number;
    faq: number;
    data: number;
    training: number;
    total: number;
    completed: number;
    processing: number;
    failed: number;
  } | null;
}

export function BrainHealthScore({ score, stats }: BrainHealthScoreProps) {
  const getScoreColor = () => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreLabel = () => {
    if (score >= 80) return 'Excelente';
    if (score >= 50) return 'Bom';
    if (score >= 20) return 'Em desenvolvimento';
    return 'Precisa de atenção';
  };

  const getRecommendations = () => {
    const recs = [];
    if (!stats) return recs;

    if (stats.faq < 5) {
      recs.push('Adicione mais FAQs para cobrir perguntas comuns');
    }
    if (stats.file < 2) {
      recs.push('Faça upload de documentos sobre o produto');
    }
    if (stats.training < 3) {
      recs.push('Treine a IA com mais informações específicas');
    }
    if (stats.failed > 0) {
      recs.push('Algumas fontes falharam ao processar');
    }

    return recs;
  };

  const recommendations = getRecommendations();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card className="cursor-help hover:border-primary/50 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className={cn(
                    'w-16 h-16 rounded-full border-4 flex items-center justify-center',
                    score >= 80 ? 'border-green-500/30' : score >= 50 ? 'border-yellow-500/30' : 'border-red-500/30'
                  )}>
                    <span className={cn('text-xl font-bold', getScoreColor())}>
                      {score}%
                    </span>
                  </div>
                  <Brain className={cn(
                    'absolute -bottom-1 -right-1 h-5 w-5 p-1 rounded-full',
                    score >= 80 ? 'bg-green-500 text-white' : score >= 50 ? 'bg-yellow-500 text-white' : 'bg-red-500 text-white'
                  )} />
                </div>
                <div>
                  <h4 className="font-medium">Saúde do Cérebro</h4>
                  <p className={cn('text-sm', getScoreColor())}>{getScoreLabel()}</p>
                  {stats && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats.total} fontes · {stats.completed} processadas
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="font-medium">Status do Cérebro</span>
            </div>
            
            {stats && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  <span>{stats.completed} processadas</span>
                </div>
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-blue-500" />
                  <span>{stats.processing} em andamento</span>
                </div>
                {stats.failed > 0 && (
                  <div className="flex items-center gap-1 col-span-2">
                    <AlertCircle className="h-3 w-3 text-red-500" />
                    <span>{stats.failed} falharam</span>
                  </div>
                )}
              </div>
            )}

            {recommendations.length > 0 && (
              <div className="border-t border-border pt-2">
                <p className="text-xs font-medium mb-1">Recomendações:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {recommendations.map((rec, i) => (
                    <li key={i}>• {rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
