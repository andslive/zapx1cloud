import { 
  FileText, 
  Globe, 
  Youtube, 
  MessageSquare, 
  Database,
  Sparkles,
  MoreVertical,
  Trash2,
  RefreshCw,
  Eye,
  Loader2,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDeleteKnowledgeSource } from '@/hooks/useKnowledgeSources';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Tables } from '@/integrations/supabase/types';

type KnowledgeSource = Tables<'product_knowledge_sources'>;

interface KnowledgeSourceCardProps {
  source: KnowledgeSource;
  onView?: () => void;
}

const SOURCE_ICONS: Record<string, React.ElementType> = {
  file: FileText,
  website: Globe,
  youtube: Youtube,
  faq: MessageSquare,
  data: Database,
  training: Sparkles,
};

const SOURCE_COLORS: Record<string, string> = {
  file: 'text-blue-500 bg-blue-500/10',
  website: 'text-green-500 bg-green-500/10',
  youtube: 'text-red-500 bg-red-500/10',
  faq: 'text-purple-500 bg-purple-500/10',
  data: 'text-orange-500 bg-orange-500/10',
  training: 'text-primary bg-primary/10',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle,
  failed: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'text-yellow-500',
  processing: 'text-blue-500 animate-spin',
  completed: 'text-green-500',
  failed: 'text-red-500',
};

export function KnowledgeSourceCard({ source, onView }: KnowledgeSourceCardProps) {
  const deleteSource = useDeleteKnowledgeSource();
  
  const Icon = SOURCE_ICONS[source.source_type] || FileText;
  const StatusIcon = STATUS_ICONS[source.processing_status || 'pending'] || Clock;
  const iconColor = SOURCE_COLORS[source.source_type] || 'text-muted-foreground bg-muted';
  const statusColor = STATUS_COLORS[source.processing_status || 'pending'] || 'text-muted-foreground';

  const handleDelete = async () => {
    try {
      await deleteSource.mutateAsync({ id: source.id, productId: source.product_id });
      toast.success('Fonte removida com sucesso');
    } catch (error) {
      toast.error('Erro ao remover fonte');
    }
  };

  const getSubtitle = () => {
    if (source.source_type === 'file' && source.file_size) {
      const sizeKB = Math.round(source.file_size / 1024);
      const sizeMB = (source.file_size / (1024 * 1024)).toFixed(1);
      return sizeKB > 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
    }
    if (source.source_type === 'website' && source.source_url) {
      return source.source_url;
    }
    if (source.source_type === 'youtube' && source.video_id) {
      return `youtube.com/watch?v=${source.video_id}`;
    }
    if (source.source_type === 'faq') {
      return source.question?.substring(0, 50) + '...' || 'Pergunta';
    }
    return source.description?.substring(0, 50) || '';
  };

  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={cn('p-2 rounded-lg', iconColor)}>
            <Icon className="h-5 w-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-medium truncate">{source.title}</h4>
                <p className="text-sm text-muted-foreground truncate">
                  {getSubtitle()}
                </p>
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                {/* Status */}
                <div className="flex items-center gap-1">
                  <StatusIcon className={cn('h-4 w-4', statusColor)} />
                  <span className="text-xs text-muted-foreground capitalize">
                    {source.processing_status}
                  </span>
                </div>

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onView && (
                      <DropdownMenuItem onClick={onView}>
                        <Eye className="h-4 w-4 mr-2" />
                        Visualizar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reprocessar
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleDelete}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(source.created_at), { 
                  addSuffix: true, 
                  locale: ptBR 
                })}
              </span>
              {source.extracted_content && (
                <Badge variant="outline" className="text-xs">
                  Conteúdo extraído
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
