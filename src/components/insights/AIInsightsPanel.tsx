import { useState, useEffect } from 'react';
import { useAIInsights, useDismissInsight, useGenerateInsights } from '@/hooks/useAIInsights';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Sparkles, 
  X, 
  RefreshCw, 
  AlertTriangle, 
  TrendingUp, 
  Lightbulb,
  Target,
  Loader2,
  Brain
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AIInsightsPanelProps {
  productId?: string;
  organizationId?: string;
  compact?: boolean;
  maxHeight?: string;
}

export function AIInsightsPanel({ 
  productId, 
  organizationId,
  compact = false,
  maxHeight = "400px"
}: AIInsightsPanelProps) {
  const { user, profile } = useAuth();
  const { data: insights, isLoading } = useAIInsights(user?.id, productId);
  const dismissInsight = useDismissInsight();
  const generateInsights = useGenerateInsights();
  const [isGenerating, setIsGenerating] = useState(false);

  const orgId = organizationId || profile?.organization_id;

  const handleRefresh = async () => {
    if (!user?.id || !orgId) return;
    
    setIsGenerating(true);
    try {
      await generateInsights.mutateAsync({
        userId: user.id,
        productId,
        organizationId: orgId
      });
      toast.success('Novos insights gerados!');
    } catch (error: any) {
      if (error.message?.includes('429')) {
        toast.error('Limite de requisições. Tente novamente em alguns segundos.');
      } else if (error.message?.includes('402')) {
        toast.error('Créditos de IA esgotados.');
      } else {
        toast.error('Erro ao gerar insights');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await dismissInsight.mutateAsync(id);
    } catch {
      toast.error('Erro ao dispensar insight');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      case 'opportunity': return <TrendingUp className="h-4 w-4" />;
      case 'action': return <Target className="h-4 w-4" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'warning': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'opportunity': return 'bg-success/10 text-success border-success/20';
      case 'action': return 'bg-primary/10 text-primary border-primary/20';
      default: return 'bg-warning/10 text-warning border-warning/20';
    }
  };

  const getPriorityColor = (priority: string | null) => {
    switch (priority) {
      case 'high': return 'bg-destructive text-destructive-foreground';
      case 'medium': return 'bg-warning text-warning-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityLabel = (priority: string | null) => {
    switch (priority) {
      case 'high': return 'Alta';
      case 'medium': return 'Média';
      default: return 'Baixa';
    }
  };

  // Auto-generate insights on first load if empty
  useEffect(() => {
    if (!isLoading && insights?.length === 0 && user?.id && orgId && !isGenerating) {
      handleRefresh();
    }
  }, [isLoading, insights?.length, user?.id, orgId]);

  if (compact) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Insights
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleRefresh}
              disabled={isGenerating}
            >
              <RefreshCw className={cn("h-4 w-4", isGenerating && "animate-spin")} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || isGenerating ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : insights && insights.length > 0 ? (
            <div className="space-y-3">
              {insights.slice(0, 3).map((insight) => (
                <div
                  key={insight.id}
                  className={cn(
                    "p-3 rounded-lg border transition-all",
                    getTypeColor(insight.type)
                  )}
                >
                  <div className="flex items-start gap-2">
                    {getTypeIcon(insight.type)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{insight.title}</p>
                      <p className="text-xs opacity-80 line-clamp-2 mt-1">
                        {insight.insight}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Clique em atualizar para gerar insights
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Insights
        </CardTitle>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isGenerating}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isGenerating && "animate-spin")} />
          {isGenerating ? 'Analisando...' : 'Atualizar'}
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea style={{ maxHeight }}>
          {isLoading || isGenerating ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="relative">
                <Brain className="h-12 w-12 text-primary animate-pulse" />
                <Sparkles className="h-4 w-4 text-warning absolute -top-1 -right-1 animate-bounce" />
              </div>
              <p className="text-muted-foreground mt-4">
                Analisando seu pipeline...
              </p>
            </div>
          ) : insights && insights.length > 0 ? (
            <div className="space-y-4">
              {insights.map((insight, index) => (
                <div
                  key={insight.id}
                  className={cn(
                    "p-4 rounded-xl border transition-all animate-slide-up",
                    getTypeColor(insight.type)
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {getTypeIcon(insight.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-sm">{insight.title}</h4>
                          <Badge className={cn("text-xs", getPriorityColor(insight.priority))}>
                            {getPriorityLabel(insight.priority)}
                          </Badge>
                        </div>
                        <p className="text-sm opacity-90">{insight.insight}</p>
                        <p className="text-xs opacity-60 mt-2">
                          {formatDistanceToNow(new Date(insight.created_at), { 
                            addSuffix: true, 
                            locale: ptBR 
                          })}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8 opacity-60 hover:opacity-100"
                      onClick={() => handleDismiss(insight.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Nenhum insight disponível
              </h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                Clique em "Atualizar" para que a IA analise seu pipeline e gere insights personalizados.
              </p>
              <Button onClick={handleRefresh} disabled={isGenerating}>
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar Insights
              </Button>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
