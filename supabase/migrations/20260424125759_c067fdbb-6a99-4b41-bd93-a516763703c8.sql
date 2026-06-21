ALTER TABLE public.product_agents
  ADD COLUMN IF NOT EXISTS handoff_outgoing_message text,
  ADD COLUMN IF NOT EXISTS handoff_incoming_message text,
  ADD COLUMN IF NOT EXISTS handoff_delay_seconds integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS message_delay_seconds integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS handoff_include_summary boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.product_agents.handoff_outgoing_message IS
  'Mensagem que o agente envia ao lead ANTES de transferir para outro agente. Variáveis: {{nome}}, {{produto}}, {{proximo_agente}}.';
COMMENT ON COLUMN public.product_agents.handoff_incoming_message IS
  'Saudação que o agente envia automaticamente ao ASSUMIR uma conversa transferida. Variáveis: {{nome}}, {{produto}}, {{agente_anterior}}, {{resumo}}.';
COMMENT ON COLUMN public.product_agents.handoff_delay_seconds IS
  'Segundos de espera entre a mensagem de despedida do agente anterior e a saudação automática deste agente. Disparado mesmo sem resposta do lead.';
COMMENT ON COLUMN public.product_agents.message_delay_seconds IS
  'Atraso padrão (segundos) entre mensagens consecutivas enviadas por este agente, para parecer mais natural.';
COMMENT ON COLUMN public.product_agents.handoff_include_summary IS
  'Quando true, gera automaticamente um breve resumo da conversa anterior e disponibiliza como {{resumo}} na saudação.';
