ALTER TABLE public.auto_notification_settings
  ADD COLUMN IF NOT EXISTS monitored_product_ids uuid[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS summary_kpis text[] DEFAULT ARRAY['leads_created','conversions','pipeline_total','meetings','overdue_tasks','top_sellers']::text[],
  ADD COLUMN IF NOT EXISTS weekly_include_comparison boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS alert_product_volume_spike boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_product_volume_spike_pct integer DEFAULT 50,
  ADD COLUMN IF NOT EXISTS alert_critical_product_idle_hours integer DEFAULT 24;