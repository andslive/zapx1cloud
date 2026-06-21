import { SellerInbox } from '@/components/seller/SellerInbox';

/**
 * WebChatInbox (Admin)
 *
 * Wrapper fino que reaproveita a Central de Atendimento unificada (`SellerInbox`)
 * com `mode="admin"`, expondo:
 *  - Visão global de todas as conversas da organização
 *  - Filtros por usuário (vendedor) e por fila/squad
 *  - Ação "Encerrar Todos Tickets Abertos"
 *  - Acesso ao corretor de respostas da IA (admin-only)
 *
 * Toda a lógica vive em `SellerInbox` para evitar divergência entre admin/vendedor.
 */
export function WebChatInbox() {
  return <SellerInbox mode="admin" />;
}
