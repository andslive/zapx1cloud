-- Seed default platform plans on first install (idempotent)
DO $seed$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_plans) THEN
    INSERT INTO public.platform_plans (
      name, slug, description, is_public, is_active, is_default, display_order,
      price_monthly, price_yearly, trial_days,
      max_users, max_connections, max_sectors, max_products, max_contacts,
      max_messages_month, max_ai_tokens_month,
      feature_whatsapp, feature_facebook, feature_instagram, feature_campaigns,
      feature_ai_agents, feature_capture_funnels, feature_webhooks, feature_integrations
    ) VALUES
    ('Trial', 'trial', 'Avaliação gratuita por 7 dias', false, true, true, 0,
      0, 0, 7,
      3, 1, 2, 3, 500,
      2000, 50000,
      true, false, false, false,
      false, false, false, false),
    ('Starter', 'starter', 'Para times iniciando a operação comercial', true, true, false, 1,
      97, 970, 7,
      5, 1, 3, 5, 2000,
      10000, 200000,
      true, false, false, false,
      false, false, false, false),
    ('Pro', 'pro', 'Para empresas que escalam vendas com IA', true, true, false, 2,
      297, 2970, 7,
      15, 3, 10, 20, 10000,
      50000, 1000000,
      true, true, true, true,
      true, true, true, true),
    ('Enterprise', 'enterprise', 'Volume ilimitado, suporte premium', true, true, false, 3,
      997, 9970, 7,
      999, 10, 50, 100, 100000,
      500000, 10000000,
      true, true, true, true,
      true, true, true, true);
  END IF;
END
$seed$;