import { useState } from 'react';
import { Plus, Search, Package, Pencil, Trash2, ExternalLink, Image as ImageIcon, Globe, Upload, Sparkles, Video, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCatalogItems, useCatalogItemMutations } from '@/hooks/useCatalogItems';
import { CatalogItemEditor } from './CatalogItemEditor';
import { CatalogImporter } from './CatalogImporter';
import { CatalogSync } from './CatalogSync';
import type { CatalogItem } from '@/hooks/useCatalogItems';

interface CatalogManagerProps {
  productId: string;
}

export function CatalogManager({ productId }: CatalogManagerProps) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const { data: items, isLoading } = useCatalogItems(productId, search);
  const { remove } = useCatalogItemMutations(productId);

  const handleDelete = (id: string, title: string) => {
    if (confirm(`Remover "${title}" do catálogo?`)) remove.mutate(id);
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">
            <Package className="h-4 w-4 mr-2" />
            Itens ({items?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="import">
            <Upload className="h-4 w-4 mr-2" />
            Importar planilha
          </TabsTrigger>
          <TabsTrigger value="sync">
            <Globe className="h-4 w-4 mr-2" />
            Sincronizar site
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, atributos, etiquetas..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button onClick={() => setCreatingNew(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo item
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando...</div>
          ) : items && items.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <div className="flex">
                    {item.thumbnail_url ? (
                      <img
                        src={item.thumbnail_url}
                        alt={item.title}
                        className="w-24 h-24 object-cover flex-shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-24 h-24 bg-muted flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <CardContent className="p-3 flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-medium text-sm truncate">{item.title}</h4>
                          {item.price != null && (
                            <p className="text-sm font-semibold text-primary mt-0.5">
                              {item.currency} {Number(item.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(item.attributes || {}).slice(0, 3).map(([k, v]) => (
                              <Badge key={k} variant="secondary" className="text-[10px]">
                                {k}: {String(v)}
                              </Badge>
                            ))}
                            {(item.images?.length ?? 0) > 0 && (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <ImageIcon className="h-2.5 w-2.5" />
                                {item.images.length}
                              </Badge>
                            )}
                            {(item.videos?.length ?? 0) > 0 && (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <Video className="h-2.5 w-2.5" />
                                {item.videos.length}
                              </Badge>
                            )}
                            {(item.documents?.length ?? 0) > 0 && (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <FileText className="h-2.5 w-2.5" />
                                {item.documents.length}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDelete(item.id, item.title)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-1 hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver original
                        </a>
                      )}
                    </CardContent>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">Catálogo vazio</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Adicione itens manualmente, importe planilha ou sincronize com um site.
                </p>
                <Button onClick={() => setCreatingNew(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar primeiro item
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="import" className="mt-4">
          <CatalogImporter productId={productId} />
        </TabsContent>

        <TabsContent value="sync" className="mt-4">
          <CatalogSync productId={productId} />
        </TabsContent>
      </Tabs>

      {(editing || creatingNew) && (
        <CatalogItemEditor
          productId={productId}
          item={editing}
          open={!!editing || creatingNew}
          onClose={() => {
            setEditing(null);
            setCreatingNew(false);
          }}
        />
      )}
    </div>
  );
}
