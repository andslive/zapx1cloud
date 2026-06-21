import { prefetch } from './lazyWithRetry';

// Factories nomeadas para reaproveitar no prefetch.
export const indexTabFactories: Record<string, Array<() => Promise<unknown>>> = {
  'product-dashboard': [
    () => import('@/components/product/ProductDashboard').then(m => ({ default: m.ProductDashboard })),
    () => import('@/components/mobile/MobileProductDashboard').then(m => ({ default: m.MobileProductDashboard }))
  ],
  leads: [
    () => import('@/components/seller/LeadsKanban').then(m => ({ default: m.LeadsKanban })),
    () => import('@/components/mobile/MobileKanban').then(m => ({ default: m.MobileKanban }))
  ],
  inbox: [
    () => import('@/components/seller/SellerInbox').then(m => ({ default: m.SellerInbox }))
  ],
  tasks: [
    () => import('@/components/seller/TaskCenter').then(m => ({ default: m.TaskCenter })),
    () => import('@/components/mobile/MobileTaskList').then(m => ({ default: m.MobileTaskList }))
  ],
  goals: [
    () => import('@/components/mobile/MobileGoalsView').then(m => ({ default: m.MobileGoalsView }))
  ],
  financial: [
    () => import('@/components/seller/FinancialPanel').then(m => ({ default: m.FinancialPanel }))
  ],
  bookings: [
    () => import('@/components/seller/SellerBookings').then(m => ({ default: m.SellerBookings }))
  ],
  cadence: [
    () => import('@/components/cadence/CadenceView').then(m => ({ default: m.CadenceView }))
  ],
  playbook: [
    () => import('@/components/playbook/PlaybookView').then(m => ({ default: m.PlaybookView }))
  ],
  objections: [
    () => import('@/components/objections/ObjectionsView').then(m => ({ default: m.ObjectionsView }))
  ],
  materials: [
    () => import('@/components/materials/MaterialsView').then(m => ({ default: m.MaterialsView }))
  ],
  ai: [
    () => import('@/components/ai/AIChat').then(m => ({ default: m.AIChat }))
  ],
};

export function prefetchIndexTab(tab: string) {
  const list = indexTabFactories[tab];
  if (list) list.forEach(prefetch);
}
