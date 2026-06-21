import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface GeneratePackageParams {
  product_id: string;
  product_label: string;
}

/**
 * Cria um "pacote" pré-configurado de etiquetas + automações para um produto:
 *   - PIX Gerado · {Produto}            (transitória, removida ao comprar)
 *   - Boleto Gerado · {Produto}         (transitória)
 *   - Aguardando Pagamento · {Produto}  (transitória, dispara em PIX e Boleto)
 *   - Checkout Abandonado · {Produto}   (transitória)
 *   - Cliente · {Produto}               (PERMANENTE — histórico)
 *   - Reembolso · {Produto}             (PERMANENTE — histórico)
 *
 * Idempotente: rodar duas vezes para o mesmo produto não duplica nada.
 */
export function useGenerateTagPackage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const orgId = profile?.organization_id;

  return useMutation({
    mutationFn: async ({ product_id, product_label }: GeneratePackageParams) => {
      if (!orgId) throw new Error('Organização não encontrada');
      const { data, error } = await supabase.rpc('create_product_tag_package', {
        p_organization_id: orgId,
        p_product_id: product_id,
        p_product_label: product_label,
      });
      if (error) throw error;
      return data as { ok: boolean; tags: { tag_id: string; name: string }[] };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['lead-tags'] });
      qc.invalidateQueries({ queryKey: ['tag-automations'] });
      const count = data?.tags?.length ?? 0;
      toast.success(`Pacote gerado: ${count} etiquetas + ${count} automações ativas.`);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Falha ao gerar pacote de etiquetas.');
    },
  });
}
