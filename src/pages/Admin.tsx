import { useState, Suspense, useEffect, useRef, useTransition, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { MobileAdminLayout } from '@/components/admin/MobileAdminLayout';
import { ComingSoonSection } from '@/components/admin/ComingSoonSection';
import { SectionErrorBoundary } from '@/components/admin/SectionErrorBoundary';
import { lazyWithRetry, prefetch, onIdle } from '@/lib/lazyWithRetry';
import { allMenuItems } from '@/config/adminMenu';
import { OnboardingBanner } from '@/components/onboarding/OnboardingBanner';

// Factories nomeadas para podermos reutilizá-las no prefetch on-hover.
const f = {
  AdminDashboard: () => import('@/components/admin/CommercialDashboard').then(m => ({ default: m.CommercialDashboard })),
  TeamManager: () => import('@/components/admin/TeamManager').then(m => ({ default: m.TeamManager })),
  FinancialDashboard: () => import('@/components/admin/FinancialDashboard').then(m => ({ default: m.FinancialDashboard })),
  CalendarManager: () => import('@/components/admin/CalendarManager').then(m => ({ default: m.CalendarManager })),
  IntegrationsManager: () => import('@/components/admin/integrations/IntegrationsManager').then(m => ({ default: m.IntegrationsManager })),
  NotificationManager: () => import('@/components/admin/NotificationManager').then(m => ({ default: m.NotificationManager })),
  ProductListPage: () => import('@/components/admin/products/ProductListPage').then(m => ({ default: m.ProductListPage })),
  ProductDetailPage: () => import('@/components/admin/products/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })),
  LeadsManager: () => import('@/components/admin/leads/LeadsManager').then(m => ({ default: m.LeadsManager })),
  KanbanBoard: () => import('@/components/admin/kanban/KanbanBoard').then(m => ({ default: m.KanbanBoard })),
  InboxManager: () => import('@/components/admin/InboxManager').then(m => ({ default: m.InboxManager })),
  ReportsManager: () => import('@/components/admin/reports/ReportsManager').then(m => ({ default: m.ReportsManager })),
  CaptureManager: () => import('@/components/admin/capture/CaptureManager').then(m => ({ default: m.CaptureManager })),
  WebhooksManager: () => import('@/components/admin/webhooks/WebhooksManager').then(m => ({ default: m.WebhooksManager })),
  CustomFieldsManager: () => import('@/components/admin/CustomFieldsManager').then(m => ({ default: m.CustomFieldsManager })),
  AgentsManager: () => import('@/components/admin/agents/AgentsManager').then(m => ({ default: m.AgentsManager })),
  SectorsManager: () => import('@/components/admin/sectors/SectorsManager').then(m => ({ default: m.SectorsManager })),
  PlanSelector: () => import('@/components/admin/plan/PlanSelector').then(m => ({ default: m.PlanSelector })),
  CaktoAdminPanel: () => import('@/components/admin/payments/CaktoAdminPanel').then(m => ({ default: m.CaktoAdminPanel })),
  ConnectionsManager: () => import('@/components/admin/integrations/ConnectionsManager'),
  TagsManager: () => import('@/components/admin/tags/TagsManager').then(m => ({ default: m.TagsManager })),
  BusinessHoursManager: () => import('@/components/admin/schedules/BusinessHoursManager').then(m => ({ default: m.BusinessHoursManager })),
  CompanySettings: () => import('@/components/admin/company/CompanySettings').then(m => ({ default: m.CompanySettings })),
  SupportTickets: () => import('@/components/admin/support/SupportTickets').then(m => ({ default: m.SupportTickets })),
  QuickRepliesManager: () => import('@/components/admin/QuickRepliesManager').then(m => ({ default: m.QuickRepliesManager })),
  AttributionTest: () => import('./admin/AttributionTest'),
};


// Lazy components (com retry + cache compartilhado para prefetch).
const AdminDashboard = lazyWithRetry(f.AdminDashboard);
const TeamManager = lazyWithRetry(f.TeamManager);
const FinancialDashboard = lazyWithRetry(f.FinancialDashboard);
const CalendarManager = lazyWithRetry(f.CalendarManager);
const IntegrationsManager = lazyWithRetry(f.IntegrationsManager);
const NotificationManager = lazyWithRetry(f.NotificationManager);
const ProductListPage = lazyWithRetry(f.ProductListPage);
const ProductDetailPage = lazyWithRetry(f.ProductDetailPage);
const LeadsManager = lazyWithRetry(f.LeadsManager);
const KanbanBoard = lazyWithRetry(f.KanbanBoard);
const InboxManager = lazyWithRetry(f.InboxManager);
const ReportsManager = lazyWithRetry(f.ReportsManager);
const CaptureManager = lazyWithRetry(f.CaptureManager);
const WebhooksManager = lazyWithRetry(f.WebhooksManager);
const CustomFieldsManager = lazyWithRetry(f.CustomFieldsManager);
const AgentsManager = lazyWithRetry(f.AgentsManager);
const SectorsManager = lazyWithRetry(f.SectorsManager);
const PlanSelector = lazyWithRetry(f.PlanSelector);
const CaktoAdminPanel = lazyWithRetry(f.CaktoAdminPanel);
const ConnectionsManager = lazyWithRetry(f.ConnectionsManager);
const TagsManager = lazyWithRetry(f.TagsManager);
const BusinessHoursManager = lazyWithRetry(f.BusinessHoursManager);
const CompanySettings = lazyWithRetry(f.CompanySettings);
const SupportTickets = lazyWithRetry(f.SupportTickets);
const QuickRepliesManager = lazyWithRetry(f.QuickRepliesManager);
const AttributionTest = lazyWithRetry(f.AttributionTest);


/**
 * Mapa: id da seção → factory de import. Usado pelo prefetch on-hover
 * (AdminSidebar/MobileAdminLayout chamam `prefetchSection(id)`).
 */
const sectionFactories: Record<string, () => Promise<unknown>> = {
  dashboard: f.AdminDashboard,
  leads: f.LeadsManager,
  pipeline: f.KanbanBoard,
  calendar: f.CalendarManager,
  inbox: f.InboxManager,
  agents: f.AgentsManager,
  capture: f.CaptureManager,
  team: f.TeamManager,
  products: f.ProductListPage,
  reports: f.ReportsManager,
  financial: f.FinancialDashboard,
  notifications: f.NotificationManager,
  webhooks: f.WebhooksManager,
  'custom-fields': f.CustomFieldsManager,
  integrations: f.IntegrationsManager,
  sectors: f.SectorsManager,
  plan: f.PlanSelector,
  payments: f.CaktoAdminPanel,
  connections: f.ConnectionsManager,
  tags: f.TagsManager,
  schedules: f.BusinessHoursManager,
  company: f.CompanySettings,
  support: f.SupportTickets,
  'quick-replies': f.QuickRepliesManager,
  'attribution-test': f.AttributionTest,
};


export function prefetchAdminSection(id: string) {
  const factory = sectionFactories[id];
  if (factory) prefetch(factory);
}

export default function Admin() {
  const { isAdmin, isManager } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'capture';
  const [activeSection, setActiveSection] = useState(initialTab);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Cache de seções já visitadas — mantemos elas montadas (apenas escondidas)
  // para que a 2ª visita seja instantânea.
  const visitedRef = useRef<Set<string>>(new Set([activeSection]));
  visitedRef.current.add(activeSection);

  // Sincroniza tab da URL → estado (permite navegação programática via ?tab=plan)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeSection) {
      setActiveSection(tab);
      visitedRef.current.add(tab);
    }
  }, [searchParams, activeSection]);

  // Prefetch agressivo: assim que o app carrega, baixamos no idle todas as
  // seções principais. O usuário sente "clicou, abriu".
  useEffect(() => {
    onIdle(() => {
      Object.values(f).forEach((factory) => prefetch(factory));
    }, 2500);
  }, []);

  if (!isAdmin() && !isManager()) {
    return <Navigate to="/" replace />;
  }

  const handleSectionChange = useCallback((id: string) => {
    // Garante que o chunk começa a baixar antes da transição (caso ainda
    // não tenha sido prefechado).
    prefetchAdminSection(id);
    // Remove ?tab da URL para que o efeito de sincronização não force
    // o usuário de volta à aba do deep-link (ex.: ?tab=plan vindo de upgrade).
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    // Adicionamos um timestamp para forçar a atualização do componente e resetar estados internos
    next.set('t', Date.now().toString());
    setSearchParams(next, { replace: true });

    startTransition(() => setActiveSection(id));
  }, [searchParams, setSearchParams]);

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
  };

  const handleBackToProducts = () => {
    setSelectedProductId(null);
  };

  // Renderiza o conteúdo de UMA seção específica.
  const renderSection = (sectionId: string) => {
    if (sectionId === 'products' && selectedProductId) {
      return (
        <ProductDetailPage
          productId={selectedProductId}
          onBack={handleBackToProducts}
        />
      );
    }

    const menuItem = allMenuItems.find((i) => i.id === sectionId);
    if (menuItem?.comingSoon) {
      return <ComingSoonSection title={menuItem.label} />;
    }

    switch (sectionId) {
      case 'dashboard': return <AdminDashboard />;
      case 'leads': return <LeadsManager />;
      case 'pipeline': return <KanbanBoard />;
      case 'calendar': return <CalendarManager />;
      case 'inbox': return <InboxManager />;
      case 'agents': return <AgentsManager />;
      case 'capture': return <CaptureManager />;
      case 'team': return <TeamManager />;
      case 'products': return <ProductListPage onProductSelect={handleProductSelect} />;
      case 'reports': return <ReportsManager />;
      case 'financial': return <FinancialDashboard />;
      case 'notifications': return <NotificationManager />;
      case 'webhooks': return <WebhooksManager />;
      case 'custom-fields': return <CustomFieldsManager />;
      case 'integrations': return <IntegrationsManager />;
      case 'sectors': return <SectorsManager />;
      case 'plan': return <PlanSelector />;
      case 'payments': return <CaktoAdminPanel />;
      case 'connections': return <ConnectionsManager />;
      case 'tags': return <TagsManager />;
      case 'schedules': return <BusinessHoursManager />;
      case 'company': return <CompanySettings />;
      case 'support': return <SupportTickets scope="admin" />;
      case 'quick-replies': return <QuickRepliesManager />;
      case 'attribution-test': return <AttributionTest />;
      default: return <AdminDashboard />;

    }
  };

  // Renderiza TODAS as seções já visitadas, escondendo as inativas.
  // Resultado: revisitar uma seção é instantâneo (componente segue montado).
  const renderContent = () => (
    <>
      {Array.from(visitedRef.current).map((sectionId) => {
        const isActive = sectionId === activeSection;
        const isCRMSection = ['leads', 'pipeline', 'inbox', 'calendar', 'reports', 'financial', 'team', 'products', 'webhooks', 'custom-fields', 'tags', 'schedules'].includes(sectionId);

        return (
          <div
            key={sectionId}
            // `hidden` remove do fluxo visual mas mantém o componente montado.
            hidden={!isActive}
            // Aria para acessibilidade quando a seção está oculta.
            aria-hidden={!isActive}
            style={!isActive ? { display: 'none' } : undefined}
            className={cn("w-full h-full", isCRMSection && "crm-compact")}
          >
            <SectionErrorBoundary sectionName={sectionId}>
              {/* fallback={null} = nunca mostra spinner; useTransition mantém
                  a tela anterior visível enquanto o chunk novo baixa. */}
              <Suspense fallback={null}>{renderSection(sectionId)}</Suspense>
            </SectionErrorBoundary>
          </div>
        );
      })}
    </>
  );

  if (isMobile) {
    return (
      <MobileAdminLayout
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      >
        <OnboardingBanner />
        {renderContent()}
      </MobileAdminLayout>
    );
  }

  return (
    <div className="min-h-screen bg-background flex w-full">
      <AdminSidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
      <main className="flex-1 overflow-auto">
        <OnboardingBanner />
        <div className="p-6">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
