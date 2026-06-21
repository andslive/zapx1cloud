import { useState, useEffect, useCallback, useMemo, useRef, useTransition, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePlatformName } from '@/hooks/usePlatformName';
import { useProducts, useAssignedProducts } from '@/hooks/useProducts';
import { useCadence } from '@/hooks/useCadence';
import { useObjections } from '@/hooks/useObjections';
import { useMaterials } from '@/hooks/useMaterials';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { EmptyState } from '@/components/product/EmptyState';
import { TaskAlerts } from '@/components/tasks/TaskAlerts';
import { Loader2 } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { onIdle, prefetch } from '@/lib/lazyWithRetry';
import { GuidedOnboarding } from '@/components/onboarding/GuidedOnboarding';
import { useGuidedOnboarding } from '@/hooks/useGuidedOnboarding';
import { useSuperAdminFirstAccess } from '@/hooks/useSuperAdminFirstAccess';

import { indexTabFactories, prefetchIndexTab } from '@/lib/prefetch';

const CadenceView = lazy(() => import('@/components/cadence/CadenceView').then(m => ({ default: m.CadenceView })));
const PlaybookView = lazy(() => import('@/components/playbook/PlaybookView').then(m => ({ default: m.PlaybookView })));
const ObjectionsView = lazy(() => import('@/components/objections/ObjectionsView').then(m => ({ default: m.ObjectionsView })));
const MaterialsView = lazy(() => import('@/components/materials/MaterialsView').then(m => ({ default: m.MaterialsView })));
const AIChat = lazy(() => import('@/components/ai/AIChat').then(m => ({ default: m.AIChat })));
const LeadsKanban = lazy(() => import('@/components/seller/LeadsKanban').then(m => ({ default: m.LeadsKanban })));
const TaskCenter = lazy(() => import('@/components/seller/TaskCenter').then(m => ({ default: m.TaskCenter })));
const FinancialPanel = lazy(() => import('@/components/seller/FinancialPanel').then(m => ({ default: m.FinancialPanel })));
const SellerInbox = lazy(() => import('@/components/seller/SellerInbox').then(m => ({ default: m.SellerInbox })));
const SellerBookings = lazy(() => import('@/components/seller/SellerBookings').then(m => ({ default: m.SellerBookings })));
const ProductDashboard = lazy(() => import('@/components/product/ProductDashboard').then(m => ({ default: m.ProductDashboard })));
const MobileProductDashboard = lazy(() => import('@/components/mobile/MobileProductDashboard').then(m => ({ default: m.MobileProductDashboard })));
const MobileKanban = lazy(() => import('@/components/mobile/MobileKanban').then(m => ({ default: m.MobileKanban })));
const MobileTaskList = lazy(() => import('@/components/mobile/MobileTaskList').then(m => ({ default: m.MobileTaskList })));
const MobileGoalsView = lazy(() => import('@/components/mobile/MobileGoalsView').then(m => ({ default: m.MobileGoalsView })));


type DBProduct = Tables<'products'>;

const SectionLoader = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const TabSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="h-24 rounded-xl bg-muted/40" />
    <div className="h-24 rounded-xl bg-muted/30" />
    <div className="h-24 rounded-xl bg-muted/20" />
  </div>
);

// Initial app loading: shows spinner immediately, but after 6s offers a
// "still loading" message + reload button so the user is never stuck staring
// at a blank spinner forever (slow networks, PWA cold starts, etc.).
function InitialLoadingScreen() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        {stuck ? 'Demorando mais que o esperado…' : 'Carregando seus produtos…'}
      </p>
      {stuck && (
        <button
          onClick={() => window.location.reload()}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

const Index = () => {
  const { user, profile, isAdmin, isManager, isSuperAdmin } = useAuth();
  const { platformName } = usePlatformName();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedProduct, setSelectedProduct] = useState<DBProduct | null>(null);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [, startTransition] = useTransition();
  const { toast } = useToast();
  const { shouldShow: showGuided, markCompleted, markSkipped } = useGuidedOnboarding();
  const { shouldForceSetup } = useSuperAdminFirstAccess();

  const productsQuery = useProducts();
  const assignedQuery = useAssignedProducts(user?.id || '');
  const allProducts = productsQuery.data;
  const assignedProducts = assignedQuery.data;

  // Fetch data based on selected product
  const { data: cadence = [], isLoading: loadingCadence } = useCadence(selectedProduct?.id);
  const { data: objections = [], isLoading: loadingObjections } = useObjections(selectedProduct?.id);
  const { data: materials = [], isLoading: loadingMaterials } = useMaterials(selectedProduct?.id);

  // As queries usam `placeholderData: []`, o que zera `isLoading` imediatamente
  // mesmo durante o primeiro fetch. Sem considerar `isFetching && !isFetched`,
  // o EmptyState ("Aguardando liberação") piscava no refresh antes dos dados
  // reais chegarem. Aqui mantemos a tela de loading até o primeiro fetch concluir.
  const isLoading =
    productsQuery.isLoading ||
    assignedQuery.isLoading;

  const isAdminOrManager = isAdmin() || isManager();

  const products = useMemo(() => {
    const assignedList = (assignedProducts?.map(ap => ap.products).filter(Boolean) as DBProduct[]) || [];
    // Admin/Manager/Super Admin → vê todos os produtos da organização.
    // Vendedor → vê só os produtos atribuídos.
    if (isAdminOrManager) return (allProducts || []);
    return assignedList;
  }, [assignedProducts, allProducts, isAdminOrManager]);

  // Cache de tabs já visitadas — mantemos montadas para revisita instantânea.
  const visitedRef = useRef<Set<string>>(new Set([activeTab]));
  visitedRef.current.add(activeTab);

  useEffect(() => {
    onIdle(() => {
      const factories = Object.values(indexTabFactories);
      if (isMobile) {
        // No mobile, prefetch apenas as essenciais para economizar banda
        indexTabFactories['product-dashboard'].forEach(prefetch);
        indexTabFactories['leads'].forEach(prefetch);
        indexTabFactories['inbox'].forEach(prefetch);
        indexTabFactories['tasks'].forEach(prefetch);
      } else {
        factories.forEach(list => list.forEach(prefetch));
      }
    }, 2500);
  }, [isMobile]);

  // Auto-seleção: sempre seleciona o primeiro produto se nenhum estiver selecionado.
  useEffect(() => {
    if (products.length > 0 && !selectedProduct) {
      setSelectedProduct(products[0]);
      setActiveTab('product-dashboard');
    }
  }, [products, selectedProduct]);

  const handleSelectProduct = useCallback((product: DBProduct) => {
    setSelectedProduct(product);
    setActiveTab('product-dashboard');
  }, []);

  const handleBackToProducts = useCallback(() => {
    setSelectedProduct(null);
    setActiveTab('products');
  }, []);

  const handleNavigate = useCallback((tab: string) => {
    prefetchIndexTab(tab);
    startTransition(() => setActiveTab(tab));
  }, []);

  const handleWhatsApp = useCallback(async (phone: string, leadId: string, leadName: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('start-whatsapp-conversation', {
        body: { phone, lead_id: leadId, lead_name: leadName },
      });
      if (error) throw error;
      setPendingConversationId(data.conversation_id);
      setActiveTab('inbox');
      toast({
        title: data.is_new ? 'Conversa criada' : 'Conversa encontrada',
        description: 'Abrindo no inbox...',
      });
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    }
  }, [toast]);

  const headerInfo = useMemo(() => {
    if (!selectedProduct) {
      return { title: 'Meus Produtos', subtitle: 'Selecione um produto para começar' };
    }
    const map: Record<string, { title: string; subtitle: string }> = {
      'product-dashboard': { title: 'Visão Geral', subtitle: selectedProduct.name },
      'leads': { title: 'Pipeline de Leads', subtitle: selectedProduct.name },
      'inbox': { title: 'Conversas', subtitle: selectedProduct.name },
      'tasks': { title: 'Minhas Tarefas', subtitle: selectedProduct.name },
      'goals': { title: 'Metas', subtitle: selectedProduct.name },
      'financial': { title: 'Financeiro', subtitle: selectedProduct.name },
      'bookings': { title: 'Agendamentos', subtitle: selectedProduct.name },
      'cadence': { title: 'Cadência', subtitle: selectedProduct.name },
      'playbook': { title: 'Playbook', subtitle: selectedProduct.name },
      'objections': { title: 'Objeções', subtitle: selectedProduct.name },
      'materials': { title: 'Materiais', subtitle: selectedProduct.name },
      'ai': { title: 'IA Copiloto', subtitle: selectedProduct.name },
    };
    return map[activeTab] ?? { title: 'X1ZAP', subtitle: '' };
  }, [activeTab, selectedProduct]);

  if (isLoading) {
    return <InitialLoadingScreen />;
  }

  // Primeiro acesso após remix: super admin vai direto ao painel global
  // para concluir senha + configuração inicial. Após isso, fluxo normal.
  if (isSuperAdmin() && shouldForceSetup) {
    return <Navigate to="/super-admin" replace />;
  }

  // Admin de empresa: por padrão redireciona ao painel administrativo.
  // Exceções (NÃO redireciona, deixa o admin usar o app do vendedor):
  // 1) Onboarding guiado pendente — mostra o modal de boas-vindas aqui.
  // 2) Admin tem produtos atribuídos a ele (atua também como vendedor) —
  //    nesse caso o "Voltar ao App" no painel admin deve funcionar.
  const adminHasAssignedProducts =
    (assignedProducts?.length || 0) > 0;
  if (
    isAdmin() &&
    !isSuperAdmin() &&
    !showGuided &&
    !adminHasAssignedProducts
  ) {
    return <Navigate to="/admin?tab=capture" replace />;
  }

  // Super Admin nunca fica preso no EmptyState: vai direto ao painel global
  // para configurar a plataforma. Independente do estado de platform_settings.
  if (isSuperAdmin() && products.length === 0) {
    return <Navigate to="/super-admin" replace />;
  }

  // Estado vazio - vendedor/manager sem produtos atribuídos
  if (products.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header title={platformName} subtitle="Bem-vindo" />
        <EmptyState />
      </div>
    );
  }

  // Renderiza UMA tab específica.
  const renderTab = (tab: string) => {
    if (!selectedProduct) return null;

    switch (tab) {
      case 'product-dashboard':
        return isMobile ? (
          <MobileProductDashboard product={selectedProduct} onNavigate={handleNavigate} />
        ) : (
          <ProductDashboard product={selectedProduct} onNavigate={handleNavigate} />
        );

      case 'leads':
        return isMobile ? (
          <MobileKanban
            productId={selectedProduct.id}
            productName={selectedProduct.name}
            organizationId={profile?.organization_id || ''}
          />
        ) : (
          <LeadsKanban
            productId={selectedProduct.id}
            productName={selectedProduct.name}
            organizationId={profile?.organization_id || ''}
            onWhatsApp={handleWhatsApp}
          />
        );

      case 'inbox':
        return (
          <SellerInbox
            productId={selectedProduct.id}
            pendingConversationId={pendingConversationId}
            onConversationSelected={() => setPendingConversationId(null)}
          />
        );

      case 'tasks':
        return isMobile ? (
          <MobileTaskList userId={user?.id || ''} productId={selectedProduct.id} />
        ) : (
          <TaskCenter
            userId={user?.id || ''}
            productId={selectedProduct.id}
            productName={selectedProduct.name}
          />
        );

      case 'goals':
        return <MobileGoalsView productId={selectedProduct.id} userId={user?.id || ''} />;

      case 'financial':
        return <FinancialPanel productId={selectedProduct.id} productName={selectedProduct.name} />;

      case 'bookings':
        return <SellerBookings userId={user?.id || ''} productId={selectedProduct.id} />;

      case 'cadence':
        if (loadingCadence) return <SectionLoader />;
        return <CadenceView cadence={cadence} productName={selectedProduct.name} />;

      case 'playbook':
        return (
          <PlaybookView product={{
            id: selectedProduct.id,
            name: selectedProduct.name,
            description: selectedProduct.description || '',
            pitch15s: selectedProduct.pitch_15s || '',
            pitch30s: selectedProduct.pitch_30s || '',
            pitch2min: selectedProduct.pitch_2min || '',
            icp: selectedProduct.icp || '',
            differentials: selectedProduct.differentials || [],
            pricing: (selectedProduct.pricing as any) || [],
            status: (selectedProduct.status as 'draft' | 'review' | 'published') || 'draft',
            createdAt: new Date(selectedProduct.created_at),
            updatedAt: new Date(selectedProduct.updated_at)
          }} />
        );

      case 'objections':
        if (loadingObjections) return <SectionLoader />;
        return (
          <ObjectionsView
            objections={objections}
            productId={selectedProduct.id}
            productName={selectedProduct.name}
          />
        );

      case 'materials':
        if (loadingMaterials) return <SectionLoader />;
        return <MaterialsView materials={materials} />;

      case 'ai':
        return <AIChat productName={selectedProduct.name} productId={selectedProduct.id} />;

      default:
        return null;
    }
  };

  // Renderiza TODAS as tabs já visitadas, escondendo as inativas → revisita instantânea.
  const renderContent = () => {
    if (!selectedProduct) return <SectionLoader />;
    return (
      <>
        {Array.from(visitedRef.current).map((tab) => {
          const isActive = tab === activeTab;
          const isCRMSection = ['leads', 'inbox', 'tasks', 'pipeline', 'cadence', 'bookings', 'financial'].includes(tab);
          
          return (
            <div
              key={tab}
              hidden={!isActive}
              aria-hidden={!isActive}
              style={!isActive ? { display: 'none' } : undefined}
              className={cn(isCRMSection && "crm-compact h-full")}
            >
              {/* fallback={null} = sem spinner; useTransition mantém tela anterior visível */}
              <Suspense fallback={<TabSkeleton />}>{renderTab(tab)}</Suspense>
            </div>
          );
        })}
      </>
    );
  };

  // Modal de onboarding guiado (admin, primeira vez)
  const guidedModal = showGuided ? (
    <GuidedOnboarding
      open={showGuided}
      onClose={markSkipped}
      onComplete={markCompleted}
      onSkipAll={markSkipped}
    />
  ) : null;

  // Mobile Layout
  if (isMobile) {
    return (
      <>
        {guidedModal}
        <MobileLayout
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          activeTab={activeTab}
          onTabChange={handleNavigate}
          hasProduct={!!selectedProduct}
          products={products}
          selectedProduct={selectedProduct}
          onSelectProduct={handleSelectProduct}
        >
          <div className="p-4">{renderContent()}</div>
        </MobileLayout>
      </>
    );
  }

  // Desktop Layout
  return (
    <div className="min-h-screen bg-background">
      {guidedModal}
      <TaskAlerts />

      <Sidebar
        activeTab={activeTab}
        onTabChange={handleNavigate}
        selectedProduct={selectedProduct}
        hasMultipleProducts={products.length > 1}
        onBackToProducts={handleBackToProducts}
        assignedProducts={products}
        onSelectProduct={handleSelectProduct}
        onCollapsedChange={setSidebarCollapsed}
      />

      <main className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <Header
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          assignedProducts={products}
          selectedProduct={selectedProduct}
          onSelectProductObject={handleSelectProduct}
        />

        <div className={cn(activeTab === 'inbox' ? "p-0" : "p-6")}>{renderContent()}</div>
      </main>
    </div>
  );
};

export default Index;
