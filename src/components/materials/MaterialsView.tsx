import { useState } from 'react';
import { Material } from '@/hooks/useMaterials';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Search, 
  FileText, 
  Video, 
  Image, 
  Link2, 
  Flag,
  ExternalLink,
  Copy,
  Check,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

interface MaterialsViewProps {
  materials: Material[];
}

const typeConfig = {
  pdf: { icon: FileText, color: 'text-red-400' },
  video: { icon: Video, color: 'text-purple-400' },
  image: { icon: Image, color: 'text-green-400' },
  link: { icon: Link2, color: 'text-blue-400' },
  banner: { icon: Flag, color: 'text-yellow-400' },
};

const tagConfig = {
  proof: { label: 'Prova', color: 'bg-success/10 text-success border-success/20' },
  presentation: { label: 'Apresentação', color: 'bg-primary/10 text-primary border-primary/20' },
  objection: { label: 'Objeção', color: 'bg-warning/10 text-warning border-warning/20' },
  closing: { label: 'Fechamento', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

export function MaterialsView({ materials }: MaterialsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const filteredMaterials = materials.filter(mat => {
    const matchesSearch = searchQuery === '' ||
      mat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mat.objective.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = !selectedTag || mat.tags.includes(selectedTag as any);
    return matchesSearch && matchesTag;
  });

  const handleCopyLink = async (url: string, id: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success('Link copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className={cn("font-bold text-foreground", isMobile ? "text-xl" : "text-2xl")}>Materiais de Venda</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Cases, demos e materiais prontos para enviar
          </p>
        </div>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
          {materials.filter(m => m.status === 'active').length} ativos
        </Badge>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Buscar material..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn("pl-12 text-base bg-card border-border", isMobile ? "h-11" : "h-12")}
        />
      </div>

      {/* Tag Filters - Horizontal scroll on mobile */}
      <div className={cn(
        "flex gap-2",
        isMobile ? "overflow-x-auto -mx-4 px-4 pb-2 scrollbar-hide snap-x snap-mandatory" : "flex-wrap"
      )}>
        <Button
          variant={selectedTag === null ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedTag(null)}
          className={cn("gap-2", isMobile && "flex-shrink-0 snap-start")}
        >
          <Filter size={14} />
          Todos
        </Button>
        {Object.entries(tagConfig).map(([key, config]) => (
          <Button
            key={key}
            variant={selectedTag === key ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTag(selectedTag === key ? null : key)}
            className={cn(isMobile && "flex-shrink-0 snap-start")}
          >
            {config.label}
          </Button>
        ))}
      </div>

      {/* Materials Grid */}
      <div className={cn(
        "grid gap-4",
        isMobile ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"
      )}>
        {filteredMaterials.map((material, index) => {
          const typeConf = typeConfig[material.type];
          const Icon = typeConf.icon;
          const isCopied = copiedId === material.id;

          return (
            <div 
              key={material.id}
              className={cn(
                "p-5 rounded-xl border border-border bg-card",
                "hover:border-primary/30 transition-all duration-200",
                "animate-slide-up",
                material.status === 'expired' && "opacity-50"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  "h-12 w-12 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0",
                  typeConf.color
                )}>
                  <Icon size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-medium text-foreground truncate">{material.name}</h3>
                    {material.status === 'expired' && (
                      <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20">
                        Expirado
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {material.objective}
                  </p>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {material.tags.map(tag => {
                      const tagConf = tagConfig[tag];
                      return (
                        <Badge 
                          key={tag} 
                          variant="outline" 
                          className={cn("text-xs", tagConf.color)}
                        >
                          {tagConf.label}
                        </Badge>
                      );
                    })}
                  </div>
                  <div className={cn("flex gap-2", isMobile && "flex-col")}>
                    <Button
                      variant="soft"
                      size="sm"
                      onClick={() => handleCopyLink(material.url, material.id)}
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
                          Copiar link
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("gap-2", isMobile && "w-full")}
                      onClick={() => window.open(material.url, '_blank')}
                    >
                      <ExternalLink size={14} />
                      Abrir
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredMaterials.length === 0 && (
          <div className={cn("text-center py-12", !isMobile && "col-span-2")}>
            <FileText size={48} className="mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum material encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
