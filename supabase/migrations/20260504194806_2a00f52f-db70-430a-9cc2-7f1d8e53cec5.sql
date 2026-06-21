ALTER TABLE public.post_sale_event_actions
  ADD COLUMN IF NOT EXISTS add_tag_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS remove_tag_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS send_mode text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS flow_id uuid REFERENCES public.chat_flows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inline_message text,
  ADD COLUMN IF NOT EXISTS message_channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS deal_outcome text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS deal_value_source text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS deal_value_manual numeric,
  ADD COLUMN IF NOT EXISTS assign_sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assign_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.post_sale_event_actions
  DROP CONSTRAINT IF EXISTS post_sale_actions_send_mode_check,
  ADD CONSTRAINT post_sale_actions_send_mode_check
    CHECK (send_mode IN ('none','flow','message'));

ALTER TABLE public.post_sale_event_actions
  DROP CONSTRAINT IF EXISTS post_sale_actions_message_channel_check,
  ADD CONSTRAINT post_sale_actions_message_channel_check
    CHECK (message_channel IN ('whatsapp','email'));

ALTER TABLE public.post_sale_event_actions
  DROP CONSTRAINT IF EXISTS post_sale_actions_deal_outcome_check,
  ADD CONSTRAINT post_sale_actions_deal_outcome_check
    CHECK (deal_outcome IN ('none','won','lost'));

ALTER TABLE public.post_sale_event_actions
  DROP CONSTRAINT IF EXISTS post_sale_actions_deal_value_source_check,
  ADD CONSTRAINT post_sale_actions_deal_value_source_check
    CHECK (deal_value_source IN ('none','webhook','manual'));

ALTER TABLE public.post_sale_event_actions
  DROP CONSTRAINT IF EXISTS post_sale_event_actions_event_check,
  ADD CONSTRAINT post_sale_event_actions_event_check CHECK (
    event_type IN (
      'compra_aprovada','pix_gerado','boleto_gerado',
      'carrinho_abandonado','checkout_abandonado',
      'reembolso','chargeback','assinatura_cancelada'
    )
  );