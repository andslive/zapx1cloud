-- ═══════════════════════════════════════════════════════════════════════
-- Disparo manual (botão "Disparar manual" por lead) -- Seção 4 do
-- requisito. Reusa o MESMO caminho seguro do automático
-- (manual_charge_evaluate + claim_charge_for_send da Fase A), nunca
-- chama o provider diretamente, e herda por construção a mesma barreira
-- de exclusividade que protege contra corrida manual-vs-automático e
-- duplo-clique -- ver comentário de claim_charge_for_send na Fase A:
-- pg_advisory_xact_lock por dispatch_id + UPDATE condicional WHERE
-- status IN ('eligible','reconciled_not_sent') garante que só UM
-- chamador (manual OU automático, não importa qual) consegue transicionar
-- eligible->sending para um dado dispatch_id. Não foi necessário nenhum
-- mecanismo NOVO de exclusividade -- só reaproveitar o existente.
--
-- Dedup entre DOIS dispatches diferentes para a mesma pessoa/obrigação já
-- é garantido pela UNIQUE(organization_id, phone_normalized,
-- campaign_key) da Fase A (provado empiricamente na fase anterior).
--
-- BLOQUEIO DE ATIVAÇÃO (Seção 7): esta function nasce sob DUAS barreiras
-- independentes, além do gate já existente em claim_charge_for_send
-- (manual_charge_dispatch_claim_enabled, já false): (1)
-- manual_charge_manual_trigger_enabled (nasce false — sem esta flag,
-- bloqueia mesmo que o Gate 1 automático seja ligado primeiro,
-- permitindo liberar automático e manual em momentos independentes); (2)
-- piso de data mínima 29/09/2026 09h America/Recife (Seção 7 -- abre a
-- janela, não ativa nada sozinho).
--
-- LIMITAÇÃO REAL DECLARADA, NÃO RESOLVIDA NESTA MIGRATION:
-- manual_charge_dispatches ainda não tem colunas de agendamento
-- persistido (planned_send_at, janela local, conexão/instância
-- vinculada -- Seção 3/9 do requisito). Esta function portanto NÃO
-- valida ainda "data futura acordada ainda não chegou" nem "fora da
-- janela local do lead" nem "conexão pausada/indisponível" -- ela
-- valida tudo que manual_charge_evaluate + claim_charge_for_send já
-- cobrem (integridade, compra reconhecida, supressão, atendimento
-- humano, payment claim, comprovante, flags de ativação, piso de data
-- global) e mais nada. Implementar o agendamento persistido é trabalho
-- pendente separado, reportado como tal.
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO public.recovery_feature_flags (key, enabled)
VALUES ('manual_charge_manual_trigger_enabled', false)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- Auditoria INSERT-only do disparo manual: operador, motivo, horário,
-- resultado -- exigência explícita do requisito. Nunca a fonte de
-- verdade do estado do dispatch (isso continua sendo
-- manual_charge_dispatches.status via claim_charge_for_send) -- só o
-- rastro de quem pediu o quê e por quê.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE public.manual_charge_manual_trigger_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  dispatch_id uuid NOT NULL,
  actor uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason <> ''),
  requested_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN (
    'claimed', 'already_sending', 'not_eligible', 'not_found',
    'trigger_disabled', 'claim_disabled', 'blocked_min_date', 'blocked_pause',
    'unauthorized'
  )),
  disposition_reason text,
  claim_token uuid,

  FOREIGN KEY (organization_id, dispatch_id)
    REFERENCES public.manual_charge_dispatches (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX manual_charge_manual_trigger_events_dispatch_idx
  ON public.manual_charge_manual_trigger_events (organization_id, dispatch_id, requested_at DESC);

COMMENT ON TABLE public.manual_charge_manual_trigger_events IS
  'Auditoria INSERT-only de toda tentativa de disparo manual (operador, motivo, horário, resultado), vencedora ou não. Nunca UPDATE/DELETE. O estado real do dispatch continua em manual_charge_dispatches, transicionado exclusivamente por claim_charge_for_send (Fase A).';

CREATE OR REPLACE FUNCTION public.manual_charge_manual_trigger_events_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'manual_charge_manual_trigger_events é append-only -- UPDATE/DELETE nunca permitido' USING ERRCODE = 'P0030';
END;
$$;

REVOKE ALL ON FUNCTION public.manual_charge_manual_trigger_events_forbid_mutation() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER manual_charge_manual_trigger_events_forbid_update
  BEFORE UPDATE ON public.manual_charge_manual_trigger_events
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_manual_trigger_events_forbid_mutation();

CREATE TRIGGER manual_charge_manual_trigger_events_forbid_delete
  BEFORE DELETE ON public.manual_charge_manual_trigger_events
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_manual_trigger_events_forbid_mutation();

ALTER TABLE public.manual_charge_manual_trigger_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_charge_manual_trigger_events_org_read" ON public.manual_charge_manual_trigger_events
  FOR SELECT TO authenticated
  USING (public.manual_charge_actor_authorized(organization_id));

REVOKE ALL ON public.manual_charge_manual_trigger_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.manual_charge_manual_trigger_events TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- manual_charge_trigger_manual_send -- única via de disparo manual.
-- SECURITY DEFINER porque precisa chamar claim_charge_for_send (que por
-- sua vez é SECURITY DEFINER e restrita a service_role) -- o ator
-- autenticado nunca ganha EXECUTE direto em claim_charge_for_send, só
-- nesta function, que audita e reautoriza antes de delegar.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_trigger_manual_send(
  p_dispatch_id uuid,
  p_reason text
) RETURNS TABLE(outcome text, disposition_reason text, claim_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org uuid;
  v_outcome text;
  v_disposition_reason text;
  v_claim_token uuid;
  v_trigger_enabled boolean;
  v_min_date_floor timestamptz := '2026-09-29 09:00:00-03'::timestamptz; -- America/Recife (UTC-3, sem DST)
  v_current_status text;
  v_claim_status text;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0010';
  END IF;

  SELECT organization_id INTO v_org
  FROM public.manual_charge_dispatches
  WHERE id = p_dispatch_id;

  -- Autorização SEMPRE checada antes de revelar not_found (mesmo padrão
  -- das RPCs humanas da Fase A) -- v_org NULL só passa para super_admin.
  IF public.manual_charge_actor_authorized(v_org) IS NOT TRUE THEN
    -- Não grava auditoria com organization_id NULL (violaria NOT NULL) --
    -- uma tentativa não autorizada contra um dispatch inexistente/de outra
    -- organização não deixa rastro nesta tabela, só a negação da RPC.
    RAISE EXCEPTION 'unauthorized_actor' USING ERRCODE = '42501';
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'dispatch_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- ── Piso global de data (Seção 7) ──
  IF now() < v_min_date_floor THEN
    v_outcome := 'blocked_min_date';
    INSERT INTO public.manual_charge_manual_trigger_events
      (organization_id, dispatch_id, actor, reason, outcome, disposition_reason)
    VALUES (v_org, p_dispatch_id, v_actor, p_reason, v_outcome, 'before_min_date_floor');
    RETURN QUERY SELECT v_outcome, 'before_min_date_floor'::text, NULL::uuid;
    RETURN;
  END IF;

  -- ── Flag dedicada do botão manual (independente do Gate 1 automático) ──
  SELECT enabled INTO v_trigger_enabled
  FROM public.recovery_feature_flags WHERE key = 'manual_charge_manual_trigger_enabled';

  IF COALESCE(v_trigger_enabled, false) IS NOT TRUE THEN
    v_outcome := 'trigger_disabled';
    INSERT INTO public.manual_charge_manual_trigger_events
      (organization_id, dispatch_id, actor, reason, outcome, disposition_reason)
    VALUES (v_org, p_dispatch_id, v_actor, p_reason, v_outcome, 'manual_trigger_flag_off');
    RETURN QUERY SELECT v_outcome, 'manual_trigger_flag_off'::text, NULL::uuid;
    RETURN;
  END IF;

  -- ── Revalidação imediata antes do envio (pagamento, novas mensagens,
  --    recusa, atendimento humano, integridade) -- mesmo cálculo usado
  --    pelo caminho automático, nunca uma cópia paralela das regras. ──
  PERFORM public.manual_charge_evaluate(p_dispatch_id);

  SELECT status INTO v_current_status
  FROM public.manual_charge_dispatches WHERE id = p_dispatch_id;

  IF v_current_status NOT IN ('eligible', 'reconciled_not_sent') THEN
    v_outcome := 'not_eligible';
    INSERT INTO public.manual_charge_manual_trigger_events
      (organization_id, dispatch_id, actor, reason, outcome, disposition_reason)
    VALUES (v_org, p_dispatch_id, v_actor, p_reason, v_outcome, v_current_status);
    RETURN QUERY SELECT v_outcome, v_current_status, NULL::uuid;
    RETURN;
  END IF;

  -- ── Delega ao MESMO caminho atômico do automático. actor prefixado
  --    'manual:' para diferenciar na auditoria de claimed_by, sem
  --    precisar de coluna nova em manual_charge_dispatches. ──
  SELECT c.status, c.claim_token INTO v_claim_status, v_claim_token
  FROM public.claim_charge_for_send(p_dispatch_id, 'manual:' || v_actor::text) c;

  v_outcome := CASE
    WHEN v_claim_status = 'sending' THEN 'claimed'
    WHEN v_claim_status = 'already_sending' THEN 'already_sending'
    WHEN v_claim_status = 'claim_disabled' THEN 'claim_disabled'
    WHEN v_claim_status = 'not_found' THEN 'not_found'
    ELSE 'not_eligible'
  END;

  INSERT INTO public.manual_charge_manual_trigger_events
    (organization_id, dispatch_id, actor, reason, outcome, disposition_reason, claim_token)
  VALUES (v_org, p_dispatch_id, v_actor, p_reason, v_outcome, v_claim_status, v_claim_token);

  RETURN QUERY SELECT v_outcome, v_claim_status, v_claim_token;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_trigger_manual_send IS
  'Única via de disparo manual. Nunca chama provider (isso é responsabilidade do worker, Fase B, fora do escopo desta migration). Revalida via manual_charge_evaluate e delega a exclusividade a claim_charge_for_send -- o mesmo caminho do automático. Bloqueada por 3 barreiras independentes: piso de data 29/09/2026 09h America/Recife, flag manual_charge_manual_trigger_enabled (false), e o Gate 1 de claim_charge_for_send (manual_charge_dispatch_claim_enabled, também false).';

REVOKE ALL ON FUNCTION public.manual_charge_trigger_manual_send(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_charge_trigger_manual_send(uuid, text) TO authenticated;
