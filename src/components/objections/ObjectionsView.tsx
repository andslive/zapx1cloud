import { useState } from 'react';
import { Objection } from '@/hooks/useObjections';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { 
  Search, 
  MessageCircle, 
  Brain, 
  Reply, 
  HelpCircle,
  Copy,
  Check,
  DollarSign,
  Clock,
  Shield,
  Users,
  Swords,
  AlertCircle,
  Sparkles,
  PenLine,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { ObjectionAssistant } from './ObjectionAssistant';
import { ObjectionGeneratorModal } from './ObjectionGeneratorModal';
import { ManualObjectionForm } from './ManualObjectionForm';
import { useIsMobile } from '@/hooks/use-mobile';
import { useHandleObjection } from '@/hooks/useObjectionAI';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface ObjectionsViewProps {
  objections: Objection[];
  productId?: string;
  productName?: string;
  showAdminActions?: boolean;
}

const categoryConfig = {
  price: { label: 'Preço', icon: DollarSign, color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
  timing: { label: 'Timing', icon: Clock, color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  trust: { label: 'Confiança', icon: Shield, color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  thinking: { label: 'Vou pensar', icon: Brain, color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  partner: { label: 'Sócio/Diretor', icon: Users, color: 'bg-green-500/10 text-green-500 border-green-500/20' },
  competitor: { label: 'Concorrência', icon: Swords, color: 'bg-red-500/10 text-red-500 border-red-500/20' },
};

export function ObjectionsView({ objections, productId, productName, showAdminActions }: ObjectionsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { handleObjection } = useHandleObjection();
  const queryClient = useQueryClient();

  const filteredObjections = objections.filter(obj => {
    const matchesSearch = searchQuery === '' || 
      obj.whatTheySay.toLowerCase().includes(searchQuery.toLowerCase()) ||
      obj.suggestedResponse.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || obj.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Resposta copiada!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRefineObjection = async (objection: Objection) => {
    if (!productId) return;
    
    setRefiningId(objection.id);
    
    try {
      const response = await handleObjection(objection.whatTheySay, productId);
      
      if (response) {
        const whatTheyMeanMatch = response.match(/\*\*O QUE ELE QUER DIZER:\*\*\s*([\s\S]*?)(?=\*\*RESPOSTA SUGERIDA:\*\*|$)/i);
        const responseMatch = response.match(/\*\*RESPOSTA SUGERIDA:\*\*\s*([\s\S]*?)(?=\*\*PERGUNTA DE RETORNO:\*\*|$)/i);
        const questionMatch = response.match(/\*\*PERGUNTA DE RETORNO:\*\*\s*([\s\S]*?)$/i);

        const updates: Record<string, string> = {};
        if (whatTheyMeanMatch?.[1]) updates.what_they_mean = whatTheyMeanMatch[1].trim();
        if (responseMatch?.[1]) updates.suggested_response = responseMatch[1].trim();
        if (questionMatch?.[1]) updates.follow_up_question = questionMatch[1].trim();

        if (Object.keys(updates).length > 0) {
          const { error } = await supabase
            .from('objections')
            .update(updates)
            .eq('id', objection.id);

          if (error) throw error;
          
          queryClient.invalidateQueries({ queryKey: ['objections'] });
          toast.success('Objeção refinada com IA!');
        }
      }
    } catch (error) {
      toast.error('Erro ao refinar objeção');
    } finally {
      setRefiningId(null);
    }
  };

  const categories = Object.entries(categoryConfig);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className={cn("font-bold text-foreground", isMobile ? "text-xl" : "text-2xl")}>Central de Objeções</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Respostas prontas para as objeções mais comuns
          </p>
        </div>
        {showAdminActions && productId && productName && (
          <Button onClick={() => setGeneratorOpen(true)} className="gap-2" size={isMobile ? "sm" : "default"}>
            <Sparkles className="h-4 w-4" />
            {isMobile ? "Gerar IA" : "Gerar em Lote com IA"}
          </Button>
        )}
      </div>

      {/* Tabs for AI Assistant and Manual Form */}
      {showAdminActions && productId && (
        <Tabs defaultValue="assistant" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="assistant" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Assistente IA
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <PenLine className="h-4 w-4" />
              Adicionar Manual
            </TabsTrigger>
          </TabsList>
          <TabsContent value="assistant" className="mt-4">
            <ObjectionAssistant productId={productId} productName={productName} />
          </TabsContent>
          <TabsContent value="manual" className="mt-4">
            <ManualObjectionForm productId={productId} productName={productName} />
          </TabsContent>
        </Tabs>
      )}

      {/* AI Assistant for non-admin view */}
      {!showAdminActions && productId && (
        <ObjectionAssistant productId={productId} productName={productName} />
      )}

      {/* Empty state when no objections */}
      {objections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle size={48} className="text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma objeção cadastrada</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {showAdminActions 
              ? 'Use a IA para gerar objeções ou adicione manualmente acima'
              : 'Peça ao administrador para cadastrar objeções deste produto'}
          </p>
          {showAdminActions && productId && productName && (
            <Button onClick={() => setGeneratorOpen(true)} className="gap-2">
              <Sparkles className="h-4 w-4" />
              Gerar Objeções com IA
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder={isMobile ? "Buscar objeção..." : "Buscar objeção... ex: 'caro', 'não é o momento', 'vou pensar'"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn("pl-12 text-base bg-card border-border", isMobile ? "h-11" : "h-12")}
            />
          </div>

          {/* Category Filters - Horizontal scroll on mobile */}
          <div className={cn(
            "flex gap-2",
            isMobile ? "overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide snap-x snap-mandatory" : "flex-wrap"
          )}>
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className={cn(isMobile && "flex-shrink-0 snap-start")}
            >
              Todas
            </Button>
            {categories.map(([key, config]) => {
              const Icon = config.icon;
              return (
                <Button
                  key={key}
                  variant={selectedCategory === key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(selectedCategory === key ? null : key)}
                  className={cn("gap-2", isMobile && "flex-shrink-0 snap-start")}
                >
                  <Icon size={14} />
                  {config.label}
                </Button>
              );
            })}
          </div>

          {/* Objections List */}
          <div className="space-y-4">
            {filteredObjections.map((objection, index) => {
              const config = categoryConfig[objection.category];
              const Icon = config.icon;
              const isExpanded = expandedId === objection.id;
              const isCopied = copiedId === objection.id;
              const isRefining = refiningId === objection.id;

              return (
                <div 
                  key={objection.id}
                  className={cn(
                    "rounded-xl border border-border bg-card overflow-hidden transition-all duration-200",
                    "hover:border-primary/30",
                    isExpanded && "border-primary/50"
                  )}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  {/* Header - Always visible */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : objection.id)}
                    className="w-full p-5 flex items-start gap-4 text-left"
                  >
                    <div className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                      config.color.split(' ')[0]
                    )}>
                      <Icon size={20} className={config.color.split(' ')[1]} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={cn("text-xs", config.color)}>
                          {config.label}
                        </Badge>
                      </div>
                      <p className="font-medium text-foreground">
                        <MessageCircle size={14} className="inline mr-2 text-muted-foreground" />
                        "{objection.whatTheySay}"
                      </p>
                    </div>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 space-y-4 animate-fade-in">
                      {/* What they mean */}
                      <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <Brain size={16} className="text-muted-foreground" />
                          <span className="text-sm font-medium text-muted-foreground">
                            O que ele quer dizer:
                          </span>
                        </div>
                        <p className="text-foreground text-sm">{objection.whatTheyMean || 'Não definido'}</p>
                      </div>

                      {/* Suggested Response */}
                      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                        <div className={cn(
                          "flex items-center justify-between mb-2",
                          isMobile && "flex-col items-start gap-2"
                        )}>
                          <div className="flex items-center gap-2">
                            <Reply size={16} className="text-primary" />
                            <span className="text-sm font-medium text-primary">
                              Resposta sugerida:
                            </span>
                          </div>
                          <div className={cn("flex gap-2", isMobile && "w-full")}>
                            {showAdminActions && productId && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRefineObjection(objection);
                                }}
                                disabled={isRefining}
                                className={cn("gap-2", isMobile && "flex-1")}
                              >
                                {isRefining ? (
                                  <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Refinando...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles size={14} />
                                    Refinar com IA
                                  </>
                                )}
                              </Button>
                            )}
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(objection.suggestedResponse, objection.id);
                              }}
                              className={cn("gap-2", isMobile && "flex-1")}
                            >
                              {isCopied ? (
                                <>
                                  <Check size={14} />
                                  Copiado
                                </>
                              ) : (
                                <>
                                  <Copy size={14} />
                                  Copiar
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                        <p className="text-foreground leading-relaxed text-sm">
                          {objection.suggestedResponse}
                        </p>
                      </div>

                      {/* Follow-up Question */}
                      <div className="p-4 rounded-lg bg-success/5 border border-success/20">
                        <div className="flex items-center gap-2 mb-2">
                          <HelpCircle size={16} className="text-success" />
                          <span className="text-sm font-medium text-success">
                            Pergunta de retorno:
                          </span>
                        </div>
                        <p className="text-foreground italic text-sm">
                          {objection.followUpQuestion ? `"${objection.followUpQuestion}"` : 'Não definida'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredObjections.length === 0 && (
              <div className="text-center py-12">
                <Search size={48} className="mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhuma objeção encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tente buscar por outras palavras-chave
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Generator Modal */}
      {productId && productName && (
        <ObjectionGeneratorModal
          open={generatorOpen}
          onOpenChange={setGeneratorOpen}
          productId={productId}
          productName={productName}
        />
      )}
    </div>
  );
}
