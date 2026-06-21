import { useState } from 'react';
import { 
  Brain, 
  FileText, 
  Globe, 
  Youtube, 
  MessageSquare, 
  Database,
  Sparkles,
  ChevronRight,
  Loader2,
  Package
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useKnowledgeSources, useKnowledgeSourceStats } from '@/hooks/useKnowledgeSources';
import { FileUploader } from '@/components/brain/FileUploader';
import { FAQBuilder } from '@/components/brain/FAQBuilder';
import { AITrainingWidget } from '@/components/brain/AITrainingWidget';
import { KnowledgeSourceCard } from '@/components/brain/KnowledgeSourceCard';
import { BrainHealthScore } from '@/components/brain/BrainHealthScore';
import { WebsiteCrawler } from '@/components/brain/WebsiteCrawler';
import { YouTubeTranscriber } from '@/components/brain/YouTubeTranscriber';
import { CatalogManager } from './catalog/CatalogManager';
import { cn } from '@/lib/utils';

interface BrainTabProps {
  productId: string;
}

const SOURCE_TYPES = [
  { 
    id: 'file', 
    label: 'Arquivos', 
    icon: FileText, 
    description: 'PDFs, DOCs, apresentações',
    color: 'text-blue-500'
  },
  { 
    id: 'website', 
    label: 'Websites', 
    icon: Globe, 
    description: 'URLs para crawling',
    color: 'text-green-500'
  },
  { 
    id: 'youtube', 
    label: 'Vídeos', 
    icon: Youtube, 
    description: 'Transcrição automática',
    color: 'text-red-500'
  },
  { 
    id: 'faq', 
    label: 'FAQ', 
    icon: MessageSquare, 
    description: 'Perguntas e respostas',
    color: 'text-purple-500'
  },
  { 
    id: 'data', 
    label: 'Dados', 
    icon: Database, 
    description: 'Tabelas e comparativos',
    color: 'text-orange-500'
  },
  { 
    id: 'training', 
    label: 'Treinamento', 
    icon: Sparkles, 
    description: 'Ensine a IA diretamente',
    color: 'text-primary'
  },
  { 
    id: 'catalog', 
    label: 'Catálogo', 
    icon: Package, 
    description: 'Itens que a IA pode buscar e enviar',
    color: 'text-pink-500'
  },
];

export function BrainTab({ productId }: BrainTabProps) {
  const { data: sources, isLoading: sourcesLoading } = useKnowledgeSources(productId);
  const { data: stats } = useKnowledgeSourceStats(productId);
  const [activeTab, setActiveTab] = useState('overview');
  const [activeSource, setActiveSource] = useState<string | null>(null);

  if (sourcesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const healthScore = stats ? Math.round((stats.completed / Math.max(stats.total, 1)) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header with Health Score */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Cérebro do Produto</h2>
              <p className="text-sm text-muted-foreground">
                Alimente a IA com conhecimento para respostas mais precisas
              </p>
            </div>
          </div>
        </div>
        <BrainHealthScore score={healthScore} stats={stats} />
      </div>

      {/* Description Card */}
      <Card className="bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            Adicione conhecimento através de diferentes fontes. Quanto mais dados, mais inteligente 
            a IA ficará para ajudar com objeções, cadências e respostas contextualizadas.
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="files">Arquivos</TabsTrigger>
          <TabsTrigger value="websites">Websites</TabsTrigger>
          <TabsTrigger value="youtube">YouTube</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="training">Treinamento IA</TabsTrigger>
          <TabsTrigger value="catalog">Catálogo</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Source Type Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {SOURCE_TYPES.map((type) => {
              const Icon = type.icon;
              const count = stats?.[type.id as keyof typeof stats] || 0;
              
              return (
                <Card 
                  key={type.id}
                  className={cn(
                    'cursor-pointer transition-all hover:border-primary/50 hover:shadow-md',
                    activeSource === type.id && 'border-primary ring-1 ring-primary/20'
                  )}
                  onClick={() => {
                    if (type.id === 'file') setActiveTab('files');
                    else if (type.id === 'website') setActiveTab('websites');
                    else if (type.id === 'youtube') setActiveTab('youtube');
                    else if (type.id === 'faq') setActiveTab('faq');
                    else if (type.id === 'training') setActiveTab('training');
                    else if (type.id === 'catalog') setActiveTab('catalog');
                    else setActiveSource(type.id);
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className={cn('p-2 rounded-lg bg-muted', type.color)}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {count} {count === 1 ? 'item' : 'itens'}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <h3 className="font-medium">{type.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground mt-3" />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Recent Sources */}
          {sources && sources.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Fontes Recentes</h3>
              <div className="space-y-3">
                {sources.slice(0, 5).map((source) => (
                  <KnowledgeSourceCard key={source.id} source={source} />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {(!sources || sources.length === 0) && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">Comece a treinar o cérebro</h3>
                <p className="text-muted-foreground mb-4">
                  Adicione arquivos, FAQs ou treine a IA diretamente para melhorar as respostas.
                </p>
                <div className="flex justify-center gap-3">
                  <Button onClick={() => setActiveTab('files')}>
                    <FileText className="h-4 w-4 mr-2" />
                    Adicionar Arquivo
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab('faq')}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Criar FAQ
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <FileUploader productId={productId} />
        </TabsContent>

        <TabsContent value="websites" className="mt-6">
          <WebsiteCrawler productId={productId} />
        </TabsContent>

        <TabsContent value="youtube" className="mt-6">
          <YouTubeTranscriber productId={productId} />
        </TabsContent>

        <TabsContent value="faq" className="mt-6">
          <FAQBuilder productId={productId} />
        </TabsContent>

        <TabsContent value="training" className="mt-6">
          <AITrainingWidget productId={productId} />
        </TabsContent>

        <TabsContent value="catalog" className="mt-6">
          <CatalogManager productId={productId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
