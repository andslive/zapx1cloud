import { useState } from 'react';
import { 
  Globe, Loader2, ExternalLink, Check, Trash2, 
  Link2, Layers, RefreshCw, ChevronDown, ChevronUp,
  AlertCircle, FileText, Search
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useCreateKnowledgeSource, useKnowledgeSourcesByType, useDeleteKnowledgeSource } from '@/hooks/useKnowledgeSources';
import { firecrawlApi, ScrapeResult } from '@/lib/api/firecrawl';

interface WebsiteCrawlerProps {
  productId: string;
}

interface DiscoveredLink {
  url: string;
  selected: boolean;
  status: 'pending' | 'scraping' | 'completed' | 'error';
  content?: string;
  title?: string;
  size?: number;
  error?: string;
}

export function WebsiteCrawler({ productId }: WebsiteCrawlerProps) {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'single' | 'crawl'>('single');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFetchingLinks, setIsFetchingLinks] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageLimit, setPageLimit] = useState(50);
  const [excludePaths, setExcludePaths] = useState('');
  const [includePaths, setIncludePaths] = useState('');
  
  // Single page preview
  const [preview, setPreview] = useState<ScrapeResult | null>(null);
  
  // Multi-page crawl
  const [discoveredLinks, setDiscoveredLinks] = useState<DiscoveredLink[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<DiscoveredLink | null>(null);
  
  const { data: websites, isLoading } = useKnowledgeSourcesByType(productId, 'website');
  const createSource = useCreateKnowledgeSource();
  const deleteSource = useDeleteKnowledgeSource();

  const formatUrl = (inputUrl: string) => {
    let formattedUrl = inputUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }
    return formattedUrl;
  };

  const handleSingleScrape = async () => {
    if (!url.trim()) {
      toast({ title: 'Digite uma URL', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    setPreview(null);

    try {
      const result = await firecrawlApi.scrape(formatUrl(url));
      
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Falha ao extrair conteúdo');
      }

      setPreview(result.data);
      toast({ title: 'Conteúdo extraído com sucesso!' });
    } catch (error) {
      console.error('Error scraping:', error);
      toast({
        title: 'Erro ao processar website',
        description: error instanceof Error ? error.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFetchLinks = async () => {
    if (!url.trim()) {
      toast({ title: 'Digite uma URL', variant: 'destructive' });
      return;
    }

    setIsFetchingLinks(true);
    setDiscoveredLinks([]);

    try {
      const result = await firecrawlApi.map(formatUrl(url), {
        limit: pageLimit,
        includeSubdomains: false,
      });

      if (!result.success || !result.links) {
        throw new Error(result.error || 'Falha ao descobrir links');
      }

      const links: DiscoveredLink[] = result.links.map((link: string) => ({
        url: link,
        selected: true,
        status: 'pending' as const,
      }));

      setDiscoveredLinks(links);
      toast({ 
        title: `${links.length} páginas encontradas!`,
        description: 'Selecione as páginas que deseja extrair.',
      });
    } catch (error) {
      console.error('Error fetching links:', error);
      toast({
        title: 'Erro ao descobrir links',
        description: error instanceof Error ? error.message : 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsFetchingLinks(false);
    }
  };

  const handleScrapeSelected = async () => {
    const selectedLinks = discoveredLinks.filter(l => l.selected);
    if (selectedLinks.length === 0) {
      toast({ title: 'Selecione pelo menos uma página', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);

    // Process links sequentially to avoid rate limits
    for (let i = 0; i < selectedLinks.length; i++) {
      const link = selectedLinks[i];
      
      setDiscoveredLinks(prev => 
        prev.map(l => l.url === link.url ? { ...l, status: 'scraping' as const } : l)
      );

      try {
        const result = await firecrawlApi.scrape(link.url);
        
        if (result.success && result.data) {
          const markdown = result.data.markdown || '';
          const title = result.data.metadata?.title || new URL(link.url).pathname;
          
          setDiscoveredLinks(prev => 
            prev.map(l => l.url === link.url ? { 
              ...l, 
              status: 'completed' as const,
              content: markdown,
              title,
              size: markdown.length,
            } : l)
          );

          // Save to database
          await createSource.mutateAsync({
            product_id: productId,
            source_type: 'website',
            title,
            description: result.data.metadata?.description || '',
            source_url: link.url,
            extracted_content: markdown,
            processing_status: 'completed',
          });
        } else {
          throw new Error(result.error || 'Falha na extração');
        }
      } catch (error) {
        console.error('Error scraping link:', link.url, error);
        setDiscoveredLinks(prev => 
          prev.map(l => l.url === link.url ? { 
            ...l, 
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          } : l)
        );
      }

      // Small delay between requests
      if (i < selectedLinks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setIsProcessing(false);
    toast({ title: 'Extração concluída!' });
  };

  const handleSaveSingle = async () => {
    if (!preview) return;

    try {
      await createSource.mutateAsync({
        product_id: productId,
        source_type: 'website',
        title: preview.metadata?.title || 'Website',
        description: preview.metadata?.description || '',
        source_url: formatUrl(url),
        extracted_content: preview.markdown || '',
        processing_status: 'completed',
      });

      toast({ title: 'Website adicionado ao cérebro!' });
      setUrl('');
      setPreview(null);
    } catch (error) {
      console.error('Error saving website:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSource.mutateAsync({ id, productId });
      toast({ title: 'Website removido' });
    } catch (error) {
      toast({ title: 'Erro ao remover', variant: 'destructive' });
    }
  };

  const toggleLinkSelection = (url: string) => {
    setDiscoveredLinks(prev => 
      prev.map(l => l.url === url ? { ...l, selected: !l.selected } : l)
    );
  };

  const toggleAllLinks = (selected: boolean) => {
    setDiscoveredLinks(prev => prev.map(l => ({ ...l, selected })));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const selectedCount = discoveredLinks.filter(l => l.selected).length;
  const completedCount = discoveredLinks.filter(l => l.status === 'completed').length;

  return (
    <div className="space-y-6">
      {/* Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-green-500" />
            Adicionar Website
          </CardTitle>
          <CardDescription>
            Extraia conteúdo de páginas web para treinar a IA com informações atualizadas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'crawl')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single" className="gap-2">
                <Link2 className="h-4 w-4" />
                Link Individual
              </TabsTrigger>
              <TabsTrigger value="crawl" className="gap-2">
                <Layers className="h-4 w-4" />
                Crawl Completo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-4 mt-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="https://exemplo.com/pagina"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isProcessing}
                  />
                </div>
                <Button onClick={handleSingleScrape} disabled={isProcessing || !url.trim()}>
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    'Extrair Conteúdo'
                  )}
                </Button>
              </div>

              {/* Single Page Preview */}
              {preview && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{preview.metadata?.title || 'Página'}</CardTitle>
                        <CardDescription>{preview.metadata?.description}</CardDescription>
                      </div>
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <Check className="h-3 w-3 mr-1" />
                        Extraído
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Conteúdo Extraído</Label>
                      <ScrollArea className="h-64 rounded-md border p-4 bg-background">
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                            {preview.markdown?.substring(0, 5000)}
                            {(preview.markdown?.length || 0) > 5000 && (
                              <span className="text-muted-foreground italic">
                                {'\n\n'}... e mais {((preview.markdown?.length || 0) - 5000).toLocaleString()} caracteres
                              </span>
                            )}
                          </div>
                        </div>
                      </ScrollArea>
                      <p className="text-xs text-muted-foreground">
                        {(preview.markdown?.length || 0).toLocaleString()} caracteres extraídos
                      </p>
                    </div>

                    <div className="flex justify-end gap-3">
                      <Button variant="outline" onClick={() => setPreview(null)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveSingle} disabled={createSource.isPending}>
                        {createSource.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-2" />
                        )}
                        Adicionar ao Cérebro
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="crawl" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="https://exemplo.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      disabled={isFetchingLinks || isProcessing}
                    />
                  </div>
                  <Button 
                    onClick={handleFetchLinks} 
                    disabled={isFetchingLinks || isProcessing || !url.trim()}
                    variant="secondary"
                  >
                    {isFetchingLinks ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Buscando...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Descobrir Páginas
                      </>
                    )}
                  </Button>
                </div>

                {/* Advanced Options */}
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2">
                      {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      Opções Avançadas
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Limite de páginas</Label>
                        <Input
                          type="number"
                          value={pageLimit}
                          onChange={(e) => setPageLimit(Number(e.target.value))}
                          min={1}
                          max={500}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Incluir caminhos (ex: /blog/*)</Label>
                        <Input
                          placeholder="/blog/*, /docs/*"
                          value={includePaths}
                          onChange={(e) => setIncludePaths(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Excluir caminhos (ex: /admin/*)</Label>
                        <Input
                          placeholder="/admin/*, /api/*"
                          value={excludePaths}
                          onChange={(e) => setExcludePaths(e.target.value)}
                        />
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Discovered Links */}
              {discoveredLinks.length > 0 && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {discoveredLinks.length} páginas encontradas
                        </CardTitle>
                        <CardDescription>
                          {selectedCount} selecionadas • {completedCount} extraídas
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => toggleAllLinks(selectedCount < discoveredLinks.length)}
                        >
                          {selectedCount === discoveredLinks.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
                        </Button>
                        <Button 
                          size="sm"
                          onClick={handleScrapeSelected}
                          disabled={isProcessing || selectedCount === 0}
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Extraindo...
                            </>
                          ) : (
                            <>
                              <FileText className="h-4 w-4 mr-2" />
                              Extrair Selecionadas
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <div className="space-y-2">
                        {discoveredLinks.map((link) => (
                          <div
                            key={link.url}
                            className={`flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer ${
                              selectedPreview?.url === link.url ? 'bg-accent border-primary' : 'hover:bg-accent/50'
                            }`}
                            onClick={() => link.status === 'completed' && setSelectedPreview(link)}
                          >
                            <Checkbox
                              checked={link.selected}
                              onCheckedChange={() => toggleLinkSelection(link.url)}
                              disabled={link.status === 'completed' || link.status === 'scraping'}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate font-mono">
                                {link.title || link.url}
                              </p>
                              {link.title && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {link.url}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {link.size && (
                                <span className="text-xs text-muted-foreground">
                                  {formatSize(link.size)}
                                </span>
                              )}
                              {link.status === 'pending' && (
                                <Badge variant="secondary" className="text-xs">Pendente</Badge>
                              )}
                              {link.status === 'scraping' && (
                                <Badge variant="outline" className="text-xs">
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Extraindo
                                </Badge>
                              )}
                              {link.status === 'completed' && (
                                <Badge variant="default" className="text-xs bg-green-600">
                                  <Check className="h-3 w-3 mr-1" />
                                  OK
                                </Badge>
                              )}
                              {link.status === 'error' && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Erro
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}

              {/* Selected Link Preview */}
              {selectedPreview && selectedPreview.content && (
                <Card className="border-primary/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{selectedPreview.title}</CardTitle>
                        <CardDescription className="truncate">{selectedPreview.url}</CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedPreview(null)}>
                        Fechar
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-48 rounded-md border p-3 bg-muted/30">
                      <pre className="text-sm whitespace-pre-wrap font-mono">
                        {selectedPreview.content.substring(0, 3000)}
                        {selectedPreview.content.length > 3000 && '...'}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Saved Websites */}
      {websites && websites.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Websites Salvos</CardTitle>
                <CardDescription>
                  {websites.length} {websites.length === 1 ? 'página' : 'páginas'} no cérebro
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {websites.map((website) => (
                  <div
                    key={website.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                        <Globe className="h-5 w-5 text-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{website.title}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {website.source_url}
                        </p>
                        {website.extracted_content && (
                          <p className="text-xs text-muted-foreground">
                            {website.extracted_content.length.toLocaleString()} caracteres
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={website.processing_status === 'completed' ? 'default' : 'secondary'}
                        className={website.processing_status === 'completed' ? 'bg-green-600' : ''}
                      >
                        {website.processing_status === 'completed' ? 'Processado' : website.processing_status}
                      </Badge>
                      {website.source_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(website.source_url!, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(website.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && (!websites || websites.length === 0) && !preview && discoveredLinks.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Globe className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">Nenhum website adicionado</h3>
            <p className="text-sm text-muted-foreground">
              Adicione URLs de páginas ou faça crawl de sites inteiros para treinar a IA.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
