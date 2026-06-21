import { supabase } from '@/integrations/supabase/client';

export const generateBookingSlug = (fullName: string): string => {
  return fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

/**
 * Garante que o profile tenha um booking_slug.
 * Se já existir, retorna; senão gera a partir do full_name (ou fallback)
 * checa unicidade e salva em profiles.
 */
export async function ensureBookingSlug(params: {
  userId: string;
  fullName?: string | null;
  currentSlug?: string | null;
}): Promise<string | null> {
  const { userId, fullName, currentSlug } = params;
  if (currentSlug) return currentSlug;

  const base =
    (fullName && generateBookingSlug(fullName)) || `user-${userId.slice(0, 8)}`;

  // verifica colisão
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('booking_slug', base)
    .neq('id', userId)
    .maybeSingle();

  const finalSlug = existing ? `${base}-${Date.now().toString(36)}` : base;

  const { error } = await supabase
    .from('profiles')
    .update({ booking_slug: finalSlug })
    .eq('id', userId);

  if (error) {
    console.error('[ensureBookingSlug] erro ao salvar slug', error);
    return null;
  }
  return finalSlug;
}
