import { useState } from 'react';
import { useProduct } from '@/hooks/useProducts';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Package, Settings, MessageSquare, Calendar, BookOpen, FileText, Brain, Zap } from 'lucide-react';

// Tab Components
import { SettingsTab } from './tabs/SettingsTab';
import { BrainTab } from './tabs/BrainTab';
import { ObjectionsTab } from './tabs/ObjectionsTab';
import { CadenceTab } from './tabs/CadenceTab';
import { PlaybookTab } from './tabs/PlaybookTab';
import { MaterialsTab } from './tabs/MaterialsTab';
import { PostSaleTab } from './tabs/PostSaleTab';


interface ProductDetailPageProps {
  productId: string;
  onBack: () => void;
}

const statusOptions = [
  { value: 'draft', label: 'Rascunho', color: 'bg-muted text-muted-foreground' },
  { value: 'review', label: 'Em Revisão', color: 'bg-warning/10 text-warning' },
  { value: 'published', label: 'Publicado', color: 'bg-success/10 text-success' },
];

const productTabs = [
  { id: 'settings', label: 'Configurações', icon: Settings },
  { id: 'brain', label: 'Cérebro', icon: Brain },
  
  { id: 'objections', label: 'Objeções', icon: MessageSquare },
  { id: 'cadence', label: 'Cadência', icon: Calendar },
  { id: 'postsale', label: 'Pós-venda', icon: Zap },
  { id: 'playbook', label: 'Playbook', icon: BookOpen },
  { id: 'materials', label: 'Materiais', icon: FileText },
];

export function ProductDetailPage({ productId, onBack }: ProductDetailPageProps) {
  const { data: product, isLoading } = useProduct(productId);
  const [activeTab, setActiveTab] = useState('settings');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-1">Produto não encontrado</h3>
        <Button variant="outline" onClick={onBack} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    );
  }

  const status = statusOptions.find(s => s.value === product.status) || statusOptions[0];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'settings':
        return <SettingsTab productId={productId} />;
      case 'brain':
        return <BrainTab productId={productId} />;
      case 'objections':
        return <ObjectionsTab productId={productId} />;
      case 'cadence':
        return <CadenceTab productId={productId} />;
      case 'postsale':
        return <PostSaleTab productId={productId} />;
      case 'playbook':
        return <PlaybookTab productId={productId} />;
      case 'materials':
        return <MaterialsTab productId={productId} />;
      default:
        return <SettingsTab productId={productId} />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              {product.logo_url ? (
                <img 
                  src={product.logo_url} 
                  alt={product.name} 
                  className="h-8 w-8 rounded-lg object-cover"
                />
              ) : (
                <Package className="h-6 w-6 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">{product.name}</h1>
                <Badge variant="outline" className={status.color}>
                  {status.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {product.short_description || product.description?.slice(0, 60) || 'Sem descrição'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto hide-scrollbar h-auto p-1 bg-muted/50 flex-wrap sm:flex-nowrap">
          {productTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger 
                key={tab.id} 
                value={tab.id}
                className="flex items-center gap-2 data-[state=active]:bg-background whitespace-nowrap"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Content */}
        <div className="mt-6">
          {renderTabContent()}
        </div>
      </Tabs>
    </div>
  );
}
