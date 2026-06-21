-- Create admin_notifications table to track notifications sent by admin
CREATE TABLE public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id),
  
  -- Content
  type public.notification_type DEFAULT 'system',
  title TEXT NOT NULL,
  message TEXT,
  action_url TEXT,
  
  -- Scope
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'product', 'squad', 'custom')),
  scope_filters JSONB DEFAULT '{}',
  
  -- Channels
  send_app BOOLEAN DEFAULT true,
  send_email BOOLEAN DEFAULT false,
  
  -- Statistics
  recipients_count INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_failed INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- Add product_id to notifications table for filtering
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id);

-- Add admin_notification_id to link individual notifications to admin batch
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS admin_notification_id UUID REFERENCES public.admin_notifications(id);

-- Enable RLS
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_notifications
CREATE POLICY "Admins and managers can view admin notifications"
ON public.admin_notifications
FOR SELECT
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id) AND
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Admins and managers can create admin notifications"
ON public.admin_notifications
FOR INSERT
WITH CHECK (
  public.user_belongs_to_organization(auth.uid(), organization_id) AND
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Admins and managers can update admin notifications"
ON public.admin_notifications
FOR UPDATE
USING (
  public.user_belongs_to_organization(auth.uid(), organization_id) AND
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

-- Create index for faster queries
CREATE INDEX idx_admin_notifications_org ON public.admin_notifications(organization_id);
CREATE INDEX idx_admin_notifications_created_at ON public.admin_notifications(created_at DESC);
CREATE INDEX idx_notifications_admin_notification_id ON public.notifications(admin_notification_id);