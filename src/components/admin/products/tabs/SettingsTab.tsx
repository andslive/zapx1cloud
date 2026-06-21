import { useState, useEffect } from 'react';
import { useProduct, useUpdateProduct } from '@/hooks/useProducts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Upload, Link, FileText, Sparkles, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AIOptimizeButton } from '@/components/product/AIOptimizeButton';
import { useOptimizeField } from '@/hooks/useOptimizeField';
import { ImageUpload } from '@/components/ui/image-upload';
import { PricingPlansSection, type ProductPlan } from './PricingPlansSection';

interface SettingsTabProps {
  productId: string;
}

const statusOptions = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'review', label: 'Em Revisão' },
  { value: 'published', label: 'Publicado' },
];

export function SettingsTab({ productId }: SettingsTabProps) {
  const { data: product, isLoading } = useProduct(productId);
  const updateProduct = useUpdateProduct();
  const { isOptimizing, optimize } = useOptimizeField();
  const [isFormReady, setIsFormReady] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    short_description: '',
    description: '',
    category: '',
    status: 'draft' as 'draft' | 'review' | 'published',
    logo_url: '',
    banner_url: '',
    product_image_url: '',
    external_links: {} as Record<string, string>,
    pitch_15s: '',
    pitch_30s: '',
    pitch_2min: '',
    icp: '',
    differentials: '',
    pricing: [] as ProductPlan[],
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        short_description: product.short_description || '',
        description: product.description || '',
        category: product.category || '',
        status: (product.status as 'draft' | 'review' | 'published') || 'draft',
        logo_url: product.logo_url || '',
        banner_url: product.banner_url || '',
        product_image_url: product.product_image_url || '',
        external_links: (product.external_links as Record<string, string>) || {},
        pitch_15s: product.pitch_15s || '',
        pitch_30s: product.pitch_30s || '',
        pitch_2min: product.pitch_2min || '',
        icp: product.icp || '',
        differentials: (product.differentials || []).join('\n'),
        pricing: (product.pricing as unknown as ProductPlan[]) || [],
      });
      setIsFormReady(true);
    }
  }, [product]);

  const handleSave = async () => {
    if (!isFormReady) {
      toast.error('Aguarde os dados carregarem');
      return;
    }
    
    if (!formData.name.trim()) {
      toast.error('Nome do produto é obrigatório');
      return;
    }
    
    try {
      await updateProduct.mutateAsync({
        id: productId,
        name: formData.name,
        short_description: formData.short_description || null,
        description: formData.description || null,
        category: formData.category || null,
        status: formData.status,
        logo_url: formData.logo_url || null,
        banner_url: formData.banner_url || null,
        product_image_url: formData.product_image_url || null,
        external_links: formData.external_links,
        pricing: formData.pricing as any,
        pitch_15s: formData.pitch_15s || null,
        pitch_30s: formData.pitch_30s || null,
        pitch_2min: formData.pitch_2min || null,
        icp: formData.icp || null,
        differentials: formData.differentials.split('\n').filter(d => d.trim()),
      });
      toast.success('Produto atualizado!');
    } catch (error) {
      toast.error('Erro ao salvar produto');
    }
  };

  const handleOptimizeField = async (field: string) => {
    const value = formData[field as keyof typeof formData];
    if (typeof value !== 'string' || !value.trim()) return;
    
    const result = await optimize(field, value, formData);
    if (result?.optimized) {
      setFormData(prev => ({ ...prev, [field]: result.optimized }));
      toast.success('Campo otimizado com IA!');
    }
  };

  const updateExternalLink = (key: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      external_links: { ...prev.external_links, [key]: value }
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateProduct.isPending || !isFormReady}>
          {updateProduct.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Salvar Alterações
        </Button>
      </div>

      {/* Basic Info */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Informações Básicas
          </CardTitle>
          <CardDescription>Dados principais do produto</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Produto *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: 'draft' | 'review' | 'published') => 
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Ex: SaaS, Consultoria, E-commerce"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="short_description">Descrição Curta</Label>
              <Input
                id="short_description"
                value={formData.short_description}
                onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                placeholder="Uma linha sobre o produto"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Descrição Completa</Label>
              <AIOptimizeButton
                onOptimize={() => handleOptimizeField('description')}
                isOptimizing={isOptimizing}
                disabled={!formData.description.trim()}
              />
            </div>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Images */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Imagens
          </CardTitle>
          <CardDescription>Arraste as imagens ou clique para fazer upload</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-3">
            <ImageUpload
              value={formData.logo_url}
              onChange={(url) => setFormData(prev => ({ ...prev, logo_url: url }))}
              bucket="product-documents"
              folder={`products/${productId}/logo`}
              label="Logo"
              description="Formato quadrado recomendado"
              aspectRatio="square"
              maxSizeMB={2}
            />
            <ImageUpload
              value={formData.banner_url}
              onChange={(url) => setFormData(prev => ({ ...prev, banner_url: url }))}
              bucket="product-documents"
              folder={`products/${productId}/banner`}
              label="Banner"
              description="Proporção 16:9 recomendada"
              aspectRatio="banner"
              maxSizeMB={5}
            />
            <ImageUpload
              value={formData.product_image_url}
              onChange={(url) => setFormData(prev => ({ ...prev, product_image_url: url }))}
              bucket="product-documents"
              folder={`products/${productId}/image`}
              label="Imagem do Produto"
              description="Imagem principal para exibição"
              aspectRatio="square"
              maxSizeMB={5}
            />
          </div>
        </CardContent>
      </Card>

      {/* External Links */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link className="h-4 w-4" />
            Links Externos
          </CardTitle>
          <CardDescription>Site, demo, checkout e outros links</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Site</Label>
              <Input
                value={formData.external_links.site || ''}
                onChange={(e) => updateExternalLink('site', e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Demo</Label>
              <Input
                value={formData.external_links.demo || ''}
                onChange={(e) => updateExternalLink('demo', e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Checkout</Label>
              <Input
                value={formData.external_links.checkout || ''}
                onChange={(e) => updateExternalLink('checkout', e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Documentação</Label>
              <Input
                value={formData.external_links.docs || ''}
                onChange={(e) => updateExternalLink('docs', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Plans */}
      <PricingPlansSection
        plans={formData.pricing}
        onChange={(plans) => setFormData(prev => ({ ...prev, pricing: plans }))}
      />

      {/* Pitches */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Pitches
          </CardTitle>
          <CardDescription>Apresentações do produto em diferentes durações</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="pitch_15s">Pitch 15 segundos</Label>
              <AIOptimizeButton
                onOptimize={() => handleOptimizeField('pitch_15s')}
                isOptimizing={isOptimizing}
                disabled={!formData.pitch_15s.trim()}
              />
            </div>
            <Textarea
              id="pitch_15s"
              value={formData.pitch_15s}
              onChange={(e) => setFormData({ ...formData, pitch_15s: e.target.value })}
              rows={2}
              placeholder="Elevator pitch curto..."
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="pitch_30s">Pitch 30 segundos</Label>
              <AIOptimizeButton
                onOptimize={() => handleOptimizeField('pitch_30s')}
                isOptimizing={isOptimizing}
                disabled={!formData.pitch_30s.trim()}
              />
            </div>
            <Textarea
              id="pitch_30s"
              value={formData.pitch_30s}
              onChange={(e) => setFormData({ ...formData, pitch_30s: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="pitch_2min">Pitch 2 minutos</Label>
              <AIOptimizeButton
                onOptimize={() => handleOptimizeField('pitch_2min')}
                isOptimizing={isOptimizing}
                disabled={!formData.pitch_2min.trim()}
              />
            </div>
            <Textarea
              id="pitch_2min"
              value={formData.pitch_2min}
              onChange={(e) => setFormData({ ...formData, pitch_2min: e.target.value })}
              rows={4}
            />
          </div>
        </CardContent>
      </Card>

      {/* ICP & Differentials */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle className="text-base">ICP e Diferenciais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="icp">ICP (Perfil de Cliente Ideal)</Label>
              <AIOptimizeButton
                onOptimize={() => handleOptimizeField('icp')}
                isOptimizing={isOptimizing}
                disabled={!formData.icp.trim()}
              />
            </div>
            <Textarea
              id="icp"
              value={formData.icp}
              onChange={(e) => setFormData({ ...formData, icp: e.target.value })}
              rows={3}
              placeholder="Descreva o cliente ideal..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="differentials">Diferenciais (um por linha)</Label>
            <Textarea
              id="differentials"
              value={formData.differentials}
              onChange={(e) => setFormData({ ...formData, differentials: e.target.value })}
              rows={4}
              placeholder="Diferencial 1&#10;Diferencial 2&#10;Diferencial 3"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
