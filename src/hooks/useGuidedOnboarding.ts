import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Controla a exibição do onboarding guiado pós-cadastro para admins.
 * Persiste o estado em profiles.guided_onboarding_completed_at / skipped_at
 * para não depender de localStorage (sobrevive a troca de device).
 */
export function useGuidedOnboarding() {
  const { user, isAdmin } = useAuth();
  const [shouldShow, setShouldShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    async function check() {
      if (!user?.id || !isAdmin()) {
        setChecked(true);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('guided_onboarding_completed_at, guided_onboarding_skipped_at')
        .eq('id', user.id)
        .maybeSingle();
      if (!active) return;
      const completed = (data as any)?.guided_onboarding_completed_at;
      const skipped = (data as any)?.guided_onboarding_skipped_at;
      setShouldShow(!completed && !skipped);
      setChecked(true);
    }
    check();
    return () => {
      active = false;
    };
  }, [user?.id, isAdmin]);

  const markCompleted = async () => {
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ guided_onboarding_completed_at: new Date().toISOString() } as any)
      .eq('id', user.id);
    setShouldShow(false);
  };

  const markSkipped = async () => {
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ guided_onboarding_skipped_at: new Date().toISOString() } as any)
      .eq('id', user.id);
    setShouldShow(false);
  };

  return { shouldShow: shouldShow && checked, markCompleted, markSkipped };
}
