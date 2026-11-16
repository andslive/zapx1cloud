-- ═══════════════════════════════════════════════════════════════════════
-- Endurecimento local final da v4 — publicação de outbox monotônica.
--
-- ACHADO REAL DE AUDITORIA (somente leitura, confirmado por execução
-- direta contra Postgres): manual_charge_send_jobs_outbox.published_at
-- não tinha NENHUMA proteção — um UPDATE direto (mesmo sem RPC) podia
-- zerar ou reescrever published_at livremente. Corrigido nesta migration
-- com: (1) duas RPCs novas que encapsulam aquisição de lease e
-- publicação com guardas atômicas (WHERE published_at IS NULL +
-- ROW_COUNT verificado); (2) um trigger de defesa em profundidade que
-- torna published_at/leased_by/leased_until/lease_token imutáveis depois
-- de publicado.
--
-- ACHADO REAL DE REVISÃO CODEX (rodada seguinte, antes de qualquer
-- commit): a versão original desta migration usava `leased_by = texto`
-- como única prova de posse — isso é uma IDENTIDADE, não uma PROVA DE
-- AQUISIÇÃO ESPECÍFICA (problema ABA clássico de locks distribuídos):
-- se a lease de um publisher expira e é reassumida (por ele mesmo em
-- outra execução, ou por outro processo com o mesmo nome), uma execução
-- ANTIGA e esquecida do mesmo publisher ainda conseguiria confirmar a
-- publicação, mesmo não sendo dona da aquisição atual. Corrigido: nova
-- coluna `lease_token uuid`, gerada fresca a cada aquisição bem-sucedida
-- (nunca reaproveitada), e `manual_charge_outbox_mark_published` agora
-- exige o TOKEN exato da aquisição, não apenas o nome do publisher — uma
-- execução antiga nunca tem o token da aquisição atual, mesmo que o nome
-- do publisher seja idêntico.
--
-- (Um segundo achado da mesma rodada de revisão -- "UPDATE direto
-- contorna a RPC" -- foi verificado empiricamente e é FALSO ALARME: o
-- GRANT desta tabela já é só SELECT, para todos os papéis, desde a
-- migration anterior -- confirmado via has_table_privilege('service_role',
-- ..., 'UPDATE') = false. Nenhuma mudança necessária para esse ponto.)
--
-- RODADA FINAL (3 achados residuais, sem crítico/alto):
-- 1) now() -> clock_timestamp() SÓ nas duas comparações que decidem se
--    uma lease está expirada (a decisão precisa refletir o tempo real
--    decorrido dentro da transação, não o instante em que a transação
--    começou). published_at continua usando now(): é um registro
--    histórico do momento da publicação, não uma decisão de expiração,
--    e a regra "nunca alterar timestamps históricos" se aplica a ele.
-- 2) p_publisher agora é validado (NULL ou vazio/só-espaços rejeitado,
--    SQLSTATE P0022 estável) ANTES de qualquer acesso à lease, nas duas
--    RPCs -- nenhuma lease é criada nem modificada quando inválido.
-- 3) "Única via de publicação": NENHUM trigger adicional foi criado.
--    Reconfirmado empiricamente (não apenas por leitura de texto) que
--    anon, authenticated, service_role e PUBLIC não têm INSERT, UPDATE
--    nem DELETE direto em manual_charge_send_jobs_outbox -- a única
--    concessão em toda a tabela é SELECT para service_role (linhas
--    252-253 da migration v4, inalteradas nesta rodada). Prova por
--    tentativa real de UPDATE como service_role (permission denied) e
--    por has_table_privilege nos 4 papéis está no teste sequencial
--    (seção 19). Nenhum grant direto existe para revogar.
--
-- ESCOPO: só banco/RPCs/testes locais. Nenhum consumidor de outbox,
-- BullMQ, Redis ou HTTP real é implementado ou chamado aqui.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.manual_charge_send_jobs_outbox
  ADD COLUMN lease_token uuid;

COMMENT ON COLUMN public.manual_charge_send_jobs_outbox.lease_token IS
  'Token de posse único por aquisição de lease (fencing token) — gerado fresco a cada manual_charge_outbox_acquire_lease bem-sucedida, nunca reaproveitado. manual_charge_outbox_mark_published exige o token exato, não apenas o nome do publisher, para nunca confirmar uma publicação em nome de uma aquisição antiga/esquecida.';

-- ═══════════════════════════════════════════════════════════════════════
-- 1) Trigger de defesa em profundidade: published_at é monotônico.
--    Uma vez definido, nenhum UPDATE (mesmo que algum papel viesse a
--    ganhar acesso de escrita direto no futuro) pode alterá-lo, nem
--    alterar a lease/token associados.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.manual_charge_send_jobs_outbox_enforce_published_monotonic()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF OLD.published_at IS NOT NULL AND NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    RAISE EXCEPTION 'published_at é monotônico -- nunca pode ser alterado depois de definido' USING ERRCODE = 'P0017';
  END IF;
  IF OLD.published_at IS NOT NULL
     AND (NEW.leased_by IS DISTINCT FROM OLD.leased_by
          OR NEW.leased_until IS DISTINCT FROM OLD.leased_until
          OR NEW.lease_token IS DISTINCT FROM OLD.lease_token) THEN
    RAISE EXCEPTION 'lease não pode ser alterada depois de published_at definido' USING ERRCODE = 'P0018';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER manual_charge_send_jobs_outbox_published_monotonic_trg
  BEFORE UPDATE ON public.manual_charge_send_jobs_outbox
  FOR EACH ROW EXECUTE FUNCTION public.manual_charge_send_jobs_outbox_enforce_published_monotonic();

REVOKE ALL ON FUNCTION public.manual_charge_send_jobs_outbox_enforce_published_monotonic() FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 2) manual_charge_outbox_acquire_lease — substitui o UPDATE cru usado
--    até aqui só nos specs. Mesmo advisory lock global. Só afeta linhas
--    com published_at IS NULL (a lease nunca pode ser tocada depois da
--    publicação — reforçado ainda pelo trigger acima). Gera um
--    lease_token fresco a cada aquisição bem-sucedida.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_outbox_acquire_lease(
  p_dispatch_id uuid,
  p_attempt_id uuid,
  p_publisher text,
  p_lease_seconds integer DEFAULT 30
) RETURNS TABLE(status text, lease_token uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_updated_count integer;
  v_current_published_at timestamptz;
  v_new_token uuid;
BEGIN
  -- ACHADO REAL DE REVISÃO CODEX: `p_lease_seconds <= 0` sozinho não
  -- rejeita NULL (em PL/pgSQL, `NULL <= 0` é NULL, que o IF trata como
  -- falso, deixando o valor passar) -- isso geraria `leased_until = NULL`
  -- (make_interval com NULL propaga NULL), tornando a lease
  -- imediatamente elegível para reaquisição por qualquer outro publisher
  -- (a condição `leased_until IS NULL OR leased_until < now()` trata
  -- NULL como "nunca leased"). Corrigido: IS NULL explícito. Também
  -- adicionado um teto operacional (24h) para nunca prender uma linha
  -- indefinidamente por um valor absurdo.
  -- ACHADO RESIDUAL (revisão Codex, rodada de endurecimento final):
  -- p_publisher NULL ou vazio/só-espaços não era rejeitado -- a lease
  -- seria adquirida com uma identidade inutilizável (nenhum publisher
  -- real conseguiria depois casar `leased_by = p_publisher` para
  -- confirmar), prendendo a linha até a expiração sem nunca publicar
  -- indevidamente. Não era uma falha de segurança, mas um estado
  -- silenciosamente inválido. Corrigido: validado ANTES de tocar
  -- qualquer lease (nenhuma linha é criada/modificada), com SQLSTATE e
  -- mensagem estáveis.
  IF p_publisher IS NULL OR btrim(p_publisher) = '' THEN
    RAISE EXCEPTION 'invalid_publisher' USING ERRCODE = 'P0022';
  END IF;

  IF p_lease_seconds IS NULL OR p_lease_seconds <= 0 THEN
    RAISE EXCEPTION 'invalid_lease_seconds' USING ERRCODE = 'P0019';
  END IF;
  IF p_lease_seconds > 86400 THEN
    RAISE EXCEPTION 'lease_seconds_exceeds_maximum_of_86400' USING ERRCODE = 'P0021';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_dispatch_id::text, 0));

  v_new_token := gen_random_uuid();

  -- ACHADO RESIDUAL (revisão Codex): a decisão "esta lease já expirou,
  -- pode ser reassumida?" precisa refletir o tempo REAL decorrido até
  -- este ponto da transação, não o instante em que a transação começou
  -- (now() é fixo por transação). Trocado por clock_timestamp() só
  -- nesta comparação -- published_at continua usando now() (é um
  -- registro histórico do momento da publicação, não uma decisão de
  -- expiração, e não deve ser alterado).
  UPDATE public.manual_charge_send_jobs_outbox AS o
  SET leased_by = p_publisher,
      leased_until = now() + make_interval(secs => p_lease_seconds),
      lease_token = v_new_token
  WHERE o.attempt_id = p_attempt_id
    AND o.dispatch_id = p_dispatch_id
    AND o.published_at IS NULL
    AND (o.leased_until IS NULL OR o.leased_until < clock_timestamp());
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 1 THEN
    RETURN QUERY SELECT 'lease_acquired'::text, v_new_token;
    RETURN;
  END IF;

  IF v_updated_count > 1 THEN
    RAISE EXCEPTION 'acquire_lease_affected_%_rows_expected_at_most_1', v_updated_count USING ERRCODE = 'P0020';
  END IF;

  -- 0 linhas: determina a causa exata, sem adivinhar.
  SELECT o.published_at INTO v_current_published_at
  FROM public.manual_charge_send_jobs_outbox AS o
  WHERE o.attempt_id = p_attempt_id AND o.dispatch_id = p_dispatch_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid; RETURN;
  END IF;

  IF v_current_published_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_published'::text, NULL::uuid; RETURN;
  END IF;

  RETURN QUERY SELECT 'lease_held_by_other'::text, NULL::uuid;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_outbox_acquire_lease IS
  'v4 — aquisição atômica de lease sobre uma linha de outbox. Retorna um lease_token fresco a cada aquisição bem-sucedida (fencing contra reuso de identidade de publisher). Nunca afeta uma linha já publicada. Sem consumidor real associado nesta fase.';

REVOKE ALL ON FUNCTION public.manual_charge_outbox_acquire_lease(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_outbox_acquire_lease(uuid, uuid, text, integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 3) manual_charge_outbox_mark_published — única via de publicação.
--    published_at só avança de NULL para now(); nunca é sobrescrito.
--    Exige o lease_token EXATO da aquisição (fencing) -- não apenas o
--    nome do publisher -- e que a lease ainda não tenha expirado.
--    Duas confirmações concorrentes nunca ambas vencem: o UPDATE
--    serializa via advisory lock + linha, e a condição published_at IS
--    NULL garante que só a primeira a chegar casa.
-- ═══════════════════════════════════════════════════════════════════════

CREATE FUNCTION public.manual_charge_outbox_mark_published(
  p_dispatch_id uuid,
  p_attempt_id uuid,
  p_publisher text,
  p_lease_token uuid
) RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_updated_count integer;
  v_current_published_at timestamptz;
  v_current_leased_by text;
  v_current_lease_token uuid;
BEGIN
  -- Mesma validação de acquire_lease, mesmo SQLSTATE -- nenhuma lease é
  -- criada ou modificada quando p_publisher é inválido.
  IF p_publisher IS NULL OR btrim(p_publisher) = '' THEN
    RAISE EXCEPTION 'invalid_publisher' USING ERRCODE = 'P0022';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_dispatch_id::text, 0));

  -- ACHADO REAL DE REVISÃO CODEX: exigir só `leased_by = p_publisher`
  -- permitia um problema ABA -- uma execução antiga do MESMO publisher
  -- (cuja lease já expirou e foi reassumida, pelo mesmo nome ou por
  -- outro processo) ainda conseguia confirmar a publicação, porque nada
  -- distinguia "esta aquisição" de "uma aquisição anterior com o mesmo
  -- nome". Corrigido: exige lease_token = p_lease_token (identificador
  -- único por aquisição, nunca reaproveitado) E leased_until > now()
  -- (defesa em profundidade -- mesmo com o token certo, uma lease já
  -- expirada não deveria mais ser confirmável).
  UPDATE public.manual_charge_send_jobs_outbox AS o
  SET published_at = now()
  WHERE o.attempt_id = p_attempt_id
    AND o.dispatch_id = p_dispatch_id
    AND o.published_at IS NULL
    AND o.leased_by = p_publisher
    AND o.lease_token = p_lease_token
    AND o.leased_until IS NOT NULL
    AND o.leased_until > clock_timestamp();
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 1 THEN
    RETURN QUERY SELECT 'published'::text;
    RETURN;
  END IF;

  IF v_updated_count > 1 THEN
    -- Nunca deveria ser possível (PRIMARY KEY(attempt_id) garante no
    -- máximo 1 linha por attempt) -- falha fechado em vez de assumir
    -- sucesso silencioso.
    RAISE EXCEPTION 'mark_outbox_published_affected_%_rows_expected_at_most_1', v_updated_count USING ERRCODE = 'P0016';
  END IF;

  -- 0 linhas: resultado idempotente ou conflito de domínio bem definido,
  -- nunca um erro genérico.
  SELECT o.published_at, o.leased_by, o.lease_token
  INTO v_current_published_at, v_current_leased_by, v_current_lease_token
  FROM public.manual_charge_send_jobs_outbox AS o
  WHERE o.attempt_id = p_attempt_id AND o.dispatch_id = p_dispatch_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text; RETURN;
  END IF;

  IF v_current_published_at IS NOT NULL
     AND v_current_leased_by = p_publisher
     AND v_current_lease_token = p_lease_token THEN
    -- Idempotente: a MESMA aquisição confirmando de novo (retry) --
    -- published_at NÃO é tocado de novo, mas não é tratado como erro.
    RETURN QUERY SELECT 'already_published_by_you'::text; RETURN;
  END IF;

  IF v_current_published_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_published_by_other'::text; RETURN;
  END IF;

  -- Não publicado ainda, mas o token não bate (aquisição antiga/errada)
  -- ou a lease expirou -- nunca revela qual dos dois motivos, para não
  -- vazar detalhe de timing a um chamador que já não é dono da aquisição
  -- atual.
  RETURN QUERY SELECT 'lease_not_owned_by_you'::text;
END;
$$;

COMMENT ON FUNCTION public.manual_charge_outbox_mark_published IS
  'v4 — única via de publicação da outbox. published_at só avança de NULL para now(); nunca sobrescrito. Exige o lease_token exato da aquisição (fencing contra reuso de identidade de publisher) e que a lease não tenha expirado. Duas confirmações concorrentes nunca ambas vencem. Sem consumidor real associado nesta fase.';

REVOKE ALL ON FUNCTION public.manual_charge_outbox_mark_published(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manual_charge_outbox_mark_published(uuid, uuid, text, uuid) TO service_role;
