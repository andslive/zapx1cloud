import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, X } from 'lucide-react';
import { useCatalogItemMutations, type CatalogItem } from '@/hooks/useCatalogItems';
import { useAuth } from '@/hooks/useAuth';
import { CatalogMediaUploader, type CatalogDocument } from './CatalogMediaUploader';

interface Props {
  productId: string;
  item?: CatalogItem | null;
  open: boolean;
  onClose: () => void;
}

export function CatalogItemEditor({ productId, item, open, onClose }: Props) {
  const { profile } = useAuth();
  const orgId = profile?.organization_id;
  const { create, update } = useCatalogItemMutations(productId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [documents, setDocuments] = useState<CatalogDocument[]>([]);
  const [tagsInput, setTagsInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [attrPairs, setAttrPairs] = useState<{ key: string; value: string }[]>([{ key: '', value: '' }]);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description || '');
      setPrice(item.price?.toString() || '');
      setUrl(item.url || '');
      setThumbnailUrl(item.thumbnail_url || '');
      setImages(item.images || []);
      setVideos(item.videos || []);
      setDocuments(item.documents || []);
      setTags(item.tags || []);
      const pairs = Object.entries(item.attributes || {}).map(([k, v]) => ({ key: k, value: String(v) }));
      setAttrPairs(pairs.length ? pairs : [{ key: '', value: '' }]);
      setIsActive(item.is_active);
    } else {
      setTitle('');
      setDescription('');
      setPrice('');
      setUrl('');
      setThumbnailUrl('');
      setImages([]);
      setVideos([]);
      setDocuments([]);
      setTags([]);
      setAttrPairs([{ key: '', value: '' }]);
      setIsActive(true);
    }
  }, [item, open]);

  const addTag = () => {
    const t = tagsInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagsInput('');
  };

  const handleSave = async () => {
    if (!title.trim() || !orgId) return;
    const attributes: Record<string, any> = {};
    attrPairs.forEach((p) => {
      if (p.key.trim()) {
        const num = Number(p.value);
        attributes[p.key.trim()] = !isNaN(num) && p.value.trim() !== '' ? num : p.value;
      }
    });
    const finalThumb = thumbnailUrl.trim() || images[0] || null;

    const payload: any = {
      title: title.trim(),
      description: description.trim() || null,
      price: price ? Number(price) : null,
      url: url.trim() || null,
      thumbnail_url: finalThumb,
      images,
      videos,
      documents,
      tags,
      attributes,
      is_active: isActive,
      organization_id: orgId,
      product_id: productId,
    };

    if (item) {
      await update.mutateAsync({ id: item.id, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Editar item' : 'Novo item do catálogo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Apartamento 2Q Batel" />
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Sacada, 1 vaga, 65m²..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Preço (BRL)</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="580000" />
            </div>
            <div>
              <Label>Link público</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>

          <div className="space-y-2">
            <Label>📦 Mídia do item (fotos, vídeos, documentos)</Label>
            {orgId && (
              <CatalogMediaUploader
                organizationId={orgId}
                productId={productId}
                images={images}
                videos={videos}
                documents={documents}
                thumbnailUrl={thumbnailUrl}
                onChange={(patch) => {
                  if (patch.images !== undefined) setImages(patch.images);
                  if (patch.videos !== undefined) setVideos(patch.videos);
                  if (patch.documents !== undefined) setDocuments(patch.documents);
                  if (patch.thumbnailUrl !== undefined) setThumbnailUrl(patch.thumbnailUrl);
                }}
              />
            )}
            <div className="pt-2">
              <Label className="text-xs text-muted-foreground">Ou cole URL da capa manualmente</Label>
              <Input
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://...jpg"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <Label>Etiquetas</Label>
            <div className="flex gap-2">
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="destaque, novo, promoção"
              />
              <Button type="button" variant="outline" onClick={addTag}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button onClick={() => setTags(tags.filter((x) => x !== t))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Atributos (filtro de busca)</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setAttrPairs([...attrPairs, { key: '', value: '' }])}
              >
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
            </div>
            <div className="space-y-2">
              {attrPairs.map((pair, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder="bairro"
                    value={pair.key}
                    onChange={(e) => {
                      const a = [...attrPairs]; a[i] = { ...a[i], key: e.target.value }; setAttrPairs(a);
                    }}
                  />
                  <Input
                    placeholder="Batel"
                    value={pair.value}
                    onChange={(e) => {
                      const a = [...attrPairs]; a[i] = { ...a[i], value: e.target.value }; setAttrPairs(a);
                    }}
                  />
                  <Button
                    type="button" size="icon" variant="ghost"
                    onClick={() => setAttrPairs(attrPairs.filter((_, x) => x !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Ex: bairro=Batel · cidade=Curitiba · quartos=2 · area=65
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label>Ativo (visível para a IA)</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!title.trim() || create.isPending || update.isPending}>
            {item ? 'Salvar' : 'Criar item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
