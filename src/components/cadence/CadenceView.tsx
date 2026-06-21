import { useState } from 'react';
import { CadenceDay, CadenceBlock } from '@/hooks/useCadence';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  MessageSquare, 
  Mic, 
  FileText, 
  MousePointer,
  Copy,
  Check,
  ChevronRight,
  Zap,
  CalendarX,
  ExternalLink,
  Download,
  Image as ImageIcon,
  Video,
  Link as LinkIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

interface CadenceViewProps {
  cadence: CadenceDay[];
  productName: string;
}

// Helper functions for video embedding
const isEmbeddableVideo = (url: string): boolean => {
  return url.includes('youtube.com') || 
         url.includes('youtu.be') || 
         url.includes('vimeo.com');
};

const getEmbedUrl = (url: string): string => {
  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }
  
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }
  
  return url;
};

export function CadenceView({ cadence, productName }: CadenceViewProps) {
  const [activeDay, setActiveDay] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const currentDay = cadence.find(d => d.day === activeDay);

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    toast.success('Copiado para a área de transferência!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenExternal = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = async (url: string, filename?: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('Download iniciado!');
    } catch (error) {
      // Fallback: abrir em nova aba
      window.open(url, '_blank');
    }
  };

  const getBlockIcon = (type: string) => {
    switch (type) {
      case 'message': return MessageSquare;
      case 'audio': return Mic;
      case 'material': return FileText;
      case 'cta': return MousePointer;
      case 'image': return ImageIcon;
      case 'video': return Video;
      case 'link': return LinkIcon;
      default: return MessageSquare;
    }
  };

  const getBlockLabel = (type: string) => {
    switch (type) {
      case 'message': return 'Mensagem';
      case 'audio': return 'Áudio';
      case 'material': return 'Material';
      case 'cta': return 'CTA';
      case 'image': return 'Imagem';
      case 'video': return 'Vídeo';
      case 'link': return 'Link';
      default: return 'Bloco';
    }
  };

  const getVariantLabel = (variant: string) => {
    switch (variant) {
      case 'short': return 'Curta';
      case 'medium': return 'Média';
      case 'long': return 'Longa';
      default: return variant;
    }
  };

  // Empty state when no cadence
  if (cadence.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className={cn("font-bold text-foreground", isMobile ? "text-xl" : "text-2xl")}>Cadência de Vendas</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Siga o roteiro dia a dia para {productName}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarX size={48} className="text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma cadência configurada</h3>
          <p className="text-sm text-muted-foreground">
            Peça ao administrador para configurar a cadência deste produto
          </p>
        </div>
      </div>
    );
  }

  const totalBlocks = cadence.reduce((acc, day) => acc + day.blocks.length, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className={cn("font-bold text-foreground", isMobile ? "text-xl" : "text-2xl")}>Cadência de Vendas</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Siga o roteiro dia a dia para {productName}
          </p>
        </div>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
          <Zap size={14} className="mr-1" />
          {cadence.length} dias • {totalBlocks} blocos
        </Badge>
      </div>

      {/* Day Selector - Horizontal scroll with snap */}
      <div className={cn(
        "flex gap-2 pb-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory",
        isMobile && "-mx-4 px-4"
      )}>
        {cadence.map((day) => (
          <button
            key={day.day}
            onClick={() => setActiveDay(day.day)}
            className={cn(
              "flex-shrink-0 px-4 py-3 rounded-xl border transition-all duration-200 snap-start",
              isMobile ? "min-w-[70px]" : "min-w-[80px]",
              activeDay === day.day
                ? "bg-primary text-primary-foreground border-primary shadow-glow"
                : "bg-card border-border hover:border-primary/50"
            )}
          >
            <p className="text-xs font-medium opacity-70">Dia</p>
            <p className="text-2xl font-bold">{day.day}</p>
          </button>
        ))}
      </div>

      {/* Current Day Content */}
      {currentDay && (
        <div className="space-y-6">
          {/* Day Header */}
          <div className="p-6 rounded-xl gradient-card border border-border">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold">{currentDay.day}</span>
              </div>
              <div>
                <h3 className={cn("font-semibold text-foreground", isMobile ? "text-base" : "text-lg")}>{currentDay.title}</h3>
                <p className="text-sm text-muted-foreground">{currentDay.trigger}</p>
              </div>
            </div>
          </div>

          {/* Blocks */}
          <div className="space-y-4">
            {currentDay.blocks.map((block, index) => {
              const Icon = getBlockIcon(block.type);
              const isCopied = copiedId === block.id;

              return (
                <div 
                  key={block.id}
                  className={cn(
                    "p-5 rounded-xl border border-border bg-card",
                    "hover:border-primary/30 transition-all duration-200",
                    "animate-slide-up"
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Block Header */}
                  <div className={cn(
                    "flex items-center justify-between mb-4",
                    isMobile && "flex-col items-start gap-3"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon size={16} className="text-primary" />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {getBlockLabel(block.type)}
                        </span>
                        <Badge 
                          variant="outline" 
                          className="text-xs bg-secondary border-border"
                        >
                          {getVariantLabel(block.variant)}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      variant="soft"
                      size="sm"
                      onClick={() => handleCopy(block.content, block.id)}
                      className={cn("gap-2", isMobile && "w-full")}
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

                  {/* Block Content */}
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                      {block.content}
                    </p>
                  </div>

                  {/* Audio Script (if applicable) */}
                  {block.audioScript && (
                    <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <p className="text-xs font-medium text-primary mb-2">Script para áudio:</p>
                      <p className="text-sm text-muted-foreground italic">
                        "{block.audioScript}"
                      </p>
                    </div>
                  )}

                  {/* Image Block - Preview + Actions */}
                  {block.type === 'image' && block.mediaUrl && (
                    <div className="mt-4 space-y-3">
                      <img 
                        src={block.mediaUrl} 
                        alt="Imagem do bloco" 
                        className="max-h-48 rounded-lg object-contain border border-border"
                      />
                      <div className="flex gap-2 flex-wrap">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleOpenExternal(block.mediaUrl!)}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Abrir
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleDownload(block.mediaUrl!, 'imagem.png')}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Baixar
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Video Block - Embed or Link */}
                  {block.type === 'video' && block.mediaUrl && (
                    <div className="mt-4 space-y-3">
                      {isEmbeddableVideo(block.mediaUrl) ? (
                        <div className="aspect-video rounded-lg overflow-hidden bg-black border border-border">
                          <iframe 
                            src={getEmbedUrl(block.mediaUrl)} 
                            className="w-full h-full"
                            allowFullScreen
                            title="Video preview"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary border border-border">
                          <Video className="h-5 w-5 text-primary flex-shrink-0" />
                          <span className="text-sm truncate flex-1">{block.mediaUrl}</span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleOpenExternal(block.mediaUrl!)}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Abrir em Nova Aba
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Audio Block - Player + Download */}
                  {block.type === 'audio' && block.mediaUrl && (
                    <div className="mt-4 space-y-3">
                      <audio controls className="w-full rounded-lg">
                        <source src={block.mediaUrl} />
                        Seu navegador não suporta áudio.
                      </audio>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleDownload(block.mediaUrl!, 'audio.mp3')}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Baixar Áudio
                      </Button>
                    </div>
                  )}

                  {/* Link Block - Clickable Button */}
                  {block.type === 'link' && block.linkUrl && (
                    <div className="mt-4">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleOpenExternal(block.linkUrl!)}
                        className="gap-2"
                      >
                        <LinkIcon className="h-4 w-4" />
                        {block.linkTitle || 'Acessar Link'}
                        <ExternalLink className="h-3 w-3 opacity-70" />
                      </Button>
                    </div>
                  )}

                  {/* Material Block - Open/Download */}
                  {block.type === 'material' && block.mediaUrl && (
                    <div className="mt-4 flex gap-2 flex-wrap">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleOpenExternal(block.mediaUrl!)}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Abrir Material
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleDownload(block.mediaUrl!, 'material')}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Baixar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 gap-2">
            <Button
              variant="outline"
              disabled={activeDay === 1}
              onClick={() => setActiveDay(activeDay - 1)}
              size={isMobile ? "sm" : "default"}
            >
              ← {isMobile ? "Anterior" : "Dia anterior"}
            </Button>
            <Button
              disabled={activeDay === cadence.length}
              onClick={() => setActiveDay(activeDay + 1)}
              size={isMobile ? "sm" : "default"}
            >
              {isMobile ? "Próximo" : "Próximo dia"}
              <ChevronRight size={16} className="ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
