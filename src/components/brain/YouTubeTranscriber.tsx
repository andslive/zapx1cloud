import { useState } from 'react';
import { Youtube, Loader2, Play, Check, Trash2, Edit2, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useCreateKnowledgeSource, useKnowledgeSourcesByType, useDeleteKnowledgeSource, useUpdateKnowledgeSource } from '@/hooks/useKnowledgeSources';
import { supabase } from '@/integrations/supabase/client';

interface YouTubeTranscriberProps {
  productId: string;
}

export function YouTubeTranscriber({ productId }: YouTubeTranscriberProps) {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [preview, setPreview] = useState<{
    title: string;
    content: string;
    description: string;
    videoId: string;
    thumbnail: string;
    author: string;
  } | null>(null);
  
  const { data: videos, isLoading } = useKnowledgeSourcesByType(productId, 'youtube');
  const createSource = useCreateKnowledgeSource();
  const deleteSource = useDeleteKnowledgeSource();
  const updateSource = useUpdateKnowledgeSource();

  const handleProcess = async () => {
    if (!url.trim()) {
      toast({ title: 'Cole um link do YouTube', variant: 'destructive' });
      return;
    }

    setIsProcessing(true);
    setPreview(null);

    try {
      const { data, error } = await supabase.functions.invoke('process-knowledge-source', {
        body: { sourceType: 'youtube', url: url.trim(), productId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      setPreview(data.data);
      toast({ title: 'Vídeo processado!' });
    } catch (error) {
      console.error('Error processing YouTube video:', error);
      toast({
        title: 'Erro ao processar vídeo',
        description: error instanceof Error ? error.message : 'Verifique se o link está correto',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;

    try {
      await createSource.mutateAsync({
        product_id: productId,
        source_type: 'youtube',
        title: preview.title,
        description: preview.description,
        source_url: url.trim(),
        video_id: preview.videoId,
        transcript: preview.content,
        extracted_content: preview.content,
        processing_status: 'completed',
      });

      toast({ title: 'Vídeo adicionado ao cérebro!' });
      setUrl('');
      setPreview(null);
    } catch (error) {
      console.error('Error saving video:', error);
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
      toast({ title: 'Vídeo removido' });
    } catch (error) {
      toast({ title: 'Erro ao remover', variant: 'destructive' });
    }
  };

  const handleEdit = (video: any) => {
    setEditingId(video.id);
    setEditContent(video.transcript || video.extracted_content || '');
  };

  const handleSaveEdit = async (videoId: string) => {
    try {
      await updateSource.mutateAsync({
        id: videoId,
        transcript: editContent,
        extracted_content: editContent,
      });
      toast({ title: 'Transcrição atualizada!' });
      setEditingId(null);
      setEditContent('');
    } catch (error) {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    }
  };

  const getYouTubeThumbnail = (videoId: string) => {
    return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  };

  return (
    <div className="space-y-6">
      {/* Add YouTube Video */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-500" />
            Adicionar Vídeo do YouTube
          </CardTitle>
          <CardDescription>
            Cole o link de um vídeo para extrair informações e criar um resumo estruturado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <Button onClick={handleProcess} disabled={isProcessing || !url.trim()}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Processar Vídeo
                </>
              )}
            </Button>
          </div>

          {/* Preview */}
          {preview && (
            <Card className="border-primary/50 bg-primary/5">
              <CardContent className="p-4 space-y-4">
                <div className="flex gap-4">
                  {preview.thumbnail && (
                    <img
                      src={preview.thumbnail}
                      alt={preview.title}
                      className="w-40 h-24 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold">{preview.title}</h3>
                    <p className="text-sm text-muted-foreground">{preview.author}</p>
                    <Badge variant="outline" className="mt-2 text-green-600 border-green-600">
                      <Check className="h-3 w-3 mr-1" />
                      Processado
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Resumo / Transcrição</Label>
                  <Textarea
                    value={preview.content}
                    onChange={(e) => setPreview({ ...preview, content: e.target.value })}
                    rows={10}
                    className="font-mono text-sm"
                    placeholder="Edite o conteúdo extraído..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Você pode editar o conteúdo antes de salvar para adicionar informações específicas.
                  </p>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setPreview(null)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={createSource.isPending}>
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
        </CardContent>
      </Card>

      {/* Saved Videos */}
      {videos && videos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Vídeos Salvos</CardTitle>
            <CardDescription>
              {videos.length} {videos.length === 1 ? 'vídeo' : 'vídeos'} no cérebro
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {videos.map((video) => (
                <div
                  key={video.id}
                  className="rounded-lg border bg-card overflow-hidden"
                >
                  <div className="flex items-start gap-4 p-4">
                    {video.video_id && (
                      <img
                        src={getYouTubeThumbnail(video.video_id)}
                        alt={video.title}
                        className="w-32 h-20 rounded-md object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium line-clamp-2">{video.title}</p>
                          <p className="text-sm text-muted-foreground">{video.description}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(video)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => video.source_url && window.open(video.source_url, '_blank')}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(video.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Edit Mode */}
                  {editingId === video.id && (
                    <div className="border-t p-4 bg-muted/30">
                      <Label className="text-sm mb-2 block">Editar Transcrição</Label>
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={8}
                        className="font-mono text-sm mb-3"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingId(null);
                            setEditContent('');
                          }}
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(video.id)}
                          disabled={updateSource.isPending}
                        >
                          {updateSource.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Salvar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && (!videos || videos.length === 0) && !preview && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Youtube className="h-10 w-10 mx-auto text-red-500/50 mb-4" />
            <h3 className="font-medium mb-2">Nenhum vídeo adicionado</h3>
            <p className="text-sm text-muted-foreground">
              Adicione vídeos do YouTube para extrair conhecimento e treinar a IA.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}