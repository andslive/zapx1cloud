-- =============================================
-- SUPER ADMIN PANEL - STEP 2: TABLES & POLICIES
-- =============================================

-- 1. Create platform_settings table for global configuration
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logo_url TEXT,
  logo_dark_url TEXT,
  favicon_url TEXT,
  platform_name TEXT DEFAULT 'Bizon Sales',
  support_email TEXT,
  primary_color TEXT DEFAULT '#10b981',
  footer_text TEXT DEFAULT '© 2026 Bizon Sales. Todos os direitos reservados.',
  terms_url TEXT,
  privacy_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert initial platform settings
INSERT INTO public.platform_settings (platform_name) 
VALUES ('Bizon Sales')
ON CONFLICT DO NOTHING;

-- 2. Create subscriptions table for organization billing
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_type TEXT DEFAULT 'trial',
  status TEXT DEFAULT 'active',
  price_monthly NUMERIC(10,2) DEFAULT 0,
  billing_cycle TEXT DEFAULT 'monthly',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  payment_method JSONB,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id)
);

-- 3. Create billing_history table
CREATE TABLE IF NOT EXISTS public.billing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  invoice_url TEXT,
  payment_date TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  description TEXT,
  stripe_invoice_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create platform_audit_logs table
CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Create platform_email_settings table
CREATE TABLE IF NOT EXISTS public.platform_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT DEFAULT 'resend',
  api_key_encrypted TEXT,
  sender_email TEXT DEFAULT 'noreply@bizonsales.com',
  sender_name TEXT DEFAULT 'Bizon Sales',
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_pass_encrypted TEXT,
  reminder_days_before INTEGER DEFAULT 3,
  reminder_on_due_date BOOLEAN DEFAULT true,
  alert_days_after INTEGER DEFAULT 3,
  suspend_days_after INTEGER DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert initial email settings
INSERT INTO public.platform_email_settings (provider) 
VALUES ('resend')
ON CONFLICT DO NOTHING;

-- 6. Add new columns to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS cnpj TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address JSONB,
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS max_products INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}';

-- 7. Create function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- 8. Enable RLS on new tables
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_email_settings ENABLE ROW LEVEL SECURITY;

-- 9. RLS Policies for platform_settings
CREATE POLICY "Super admins can manage platform settings"
ON public.platform_settings FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Anyone can read platform settings"
ON public.platform_settings FOR SELECT
USING (true);

-- 10. RLS Policies for subscriptions
CREATE POLICY "Super admins can manage all subscriptions"
ON public.subscriptions FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Org admins can view own subscription"
ON public.subscriptions FOR SELECT
USING (organization_id = public.get_user_organization(auth.uid()));

-- 11. RLS Policies for billing_history
CREATE POLICY "Super admins can manage all billing history"
ON public.billing_history FOR ALL
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Org admins can view own billing history"
ON public.billing_history FOR SELECT
USING (organization_id = public.get_user_organization(auth.uid()));

-- 12. RLS Policies for platform_audit_logs
CREATE POLICY "Super admins can manage audit logs"
ON public.platform_audit_logs FOR ALL
USING (public.is_super_admin(auth.uid()));

-- 13. RLS Policies for platform_email_settings
CREATE POLICY "Super admins can manage email settings"
ON public.platform_email_settings FOR ALL
USING (public.is_super_admin(auth.uid()));

-- 14. Super admins can view all organizations
CREATE POLICY "Super admins can manage all organizations"
ON public.organizations FOR ALL
USING (public.is_super_admin(auth.uid()));

-- 15. Create trigger for updated_at on new tables
CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_platform_email_settings_updated_at
  BEFORE UPDATE ON public.platform_email_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();