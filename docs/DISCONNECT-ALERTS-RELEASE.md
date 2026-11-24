# Alerta de desconexão confirmada — plano de publicação e rollback

Estado: **P1 (migration), P2 (heartbeat v230) e P3 (webhook v269) publicados a partir de `fe4e84d` em 2026-11-24.**
Projeto Supabase: `ydunpoqdhijhnrarohiz`. Leituras de 2026-11-24 (somente leitura).

## 1. O que a produção tem hoje (verificado)

| Item | Estado real |
|---|---|
| Cron | `uazapi-heartbeat-cron`, `* * * * *`, ativo, sucesso nas últimas execuções. Autentica pelo **vault** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); não há token literal no comando. |
| Trigger SQL | `trigger_instance_status_change` **existe e está habilitado** em `evolution_instances` (AFTER UPDATE → `on_instance_status_change_notify_admin()`, SECURITY DEFINER, owner `postgres`, sem `proconfig`). Insere `admin_status_alerts` `pending` a cada mudança de `status`/`is_ghost`. Definição real salva em `/opt/x1zap/backups/heartbeat-alerts-20261124/`. |
| Alertas `pending` | **4.631** linhas (4.488 `disconnected`, 143 `close`), todas de instâncias `provider=uazapi`, desde 02/07 até hoje. **Não existe consumidor publicado**: o `whatsapp-proxy` v229 não implementa `process_pending_alerts`, nenhum cron SQL as lê. São inertes. |
| Origem do ruído | O caminho do **heartbeat**: `admin_notification_logs` registra 13–83 envios/dia (últimos 8 dias), incluindo `CONNECTED` (reconexão), `UNKNOWN` e `WARMING_UP`. |
| Funções publicadas | `uazapi-webhook` v268 (== `main` `69484ce`), `uazapi-send` v233 (== main), `whatsapp-proxy` v229 (== main), **`uazapi-heartbeat` v229 (≠ main)**. |
| Heartbeat publicado | É o commit `5bed688` da branch `agent/uazapi-presence-policy-heartbeat-20260827` (**fora da `main`**): tem reconciliação de *presence* e logs sem token. Não tem o filtro de arquivadas (FASE 20H) da `main`. |
| Instâncias | 52, todas `provider=uazapi` (44 ativas). Nenhuma de outro provedor em `evolution_instances`. |
| RLS `profiles` | Ligado. Policy "Users can view their own profile" (`auth.uid() = id`) — a mesma que a policy de episódios usa na subconsulta. |

## 2. Fontes do que será publicado

- `uazapi-webhook`: `main` `69484ce` (idêntico ao publicado) **+ só** a mudança em `handleAdminStatusAlert`. Diff contra o publicado: 9 linhas inseridas / 69 removidas, todas nessa função. Pagamentos, SPEI e funis ficam idênticos.
- `uazapi-heartbeat`: **versão publicada (`5bed688`) + minha mudança** (merge de 3 vias; sem filtro 20H). Preserva presence e logs sem token. Traz `_shared/uazapi-presence-policy.ts` e `uazapi-safe-log.ts` (já em produção; hash igual ao publicado) e seus testes.
  - O filtro de arquivadas (FASE 20H) **não** faz parte desta entrega, por decisão do aprovador: o cron continua selecionando as instâncias como o heartbeat publicado. (O processador de episódios, novo, já ignora/encerra conexões arquivadas.)
  - Atenção ao integrar na `main`: a linhagem `agent/uazapi-presence-policy-heartbeat-20260827` ainda não está na `main`. Esta branch carrega os dois módulos `_shared` dela.

## 3. Alertas `pending` antigos — como impedir que disparem

1. Hoje já são inertes (sem consumidor publicado).
2. A migration remove o trigger: **não nascem novos**. O webhook novo para de inserir e de chamar `process_pending_alerts`.
3. O código novo **nunca lê** `admin_status_alerts` com `status='pending'`.
4. **Nada é apagado ou alterado**: sem `DELETE`, sem `UPDATE` automático. Linhas de qualquer outro provedor/caminho continuam como estão.
5. Opcional, só com autorização separada (higiene; não é necessário para a segurança): marcar em lote como `superseded` as linhas `pending` anteriores à data da migration **de instâncias `provider='uazapi'`** — jamais por `DELETE`.

## 4. Ordem de publicação (cada passo só com autorização; verificar antes de seguir)

**P0 — pré-voo (leitura):** versões e hashes publicados == backup `…/pre/SHA256SUMS-pre.txt`; cron ativo; trigger == `trigger_instance_status_change.definition.sql`; tabela `connection_disconnect_episodes` **ausente**.

**P1 — migration `20261124120000` por SQL direcionado (sem `db push`).** Verificar: tabela, índice único parcial `…_one_active`, `relrowsecurity`, grants (`authenticated` só SELECT; `service_role` SELECT/INSERT/UPDATE; `anon` nada), policy, **trigger removido e função preservada**; reaplicação idempotente. Enquanto só P1 estiver aplicado, as funções antigas continuam como hoje (sem trigger, sem novas linhas `pending`).

**P2 — `uazapi-heartbeat`** (`verify_jwt` **permanece `true`**; o cron autentica pelo vault). Verificar: versão nova, hash do código publicado == repo; próxima(s) execução(ões) do cron `succeeded`; resposta do heartbeat (`net._http_response`, conteúdo com `disconnect_episodes`) com `ok:true`; logs sem `operational_error`; nenhum WhatsApp de "reconexão".

**P3 — `uazapi-webhook`** (`--no-verify-jwt`, como hoje). Verificar: hash == repo; mensagens e pagamentos seguem sendo processados (eventos novos em `webchat_messages`/`payment_gateway_events` após o deploy); nenhum novo `admin_status_alerts` `pending`.

**P4 — observação:** episódios abertos só em quedas reais; `operational_error` ausente; contagem de WhatsApp administrativos cai a ~0 sem queda confirmada.

Se a migration **não** estiver aplicada, as funções novas **não falham em silêncio**: o heartbeat devolve `disconnect_episodes.ok=false` com `error_code=episodes_table_missing` e loga `[DISCONNECT_ALERT] operational_error`. A ordem acima evita isso; o aviso existe para detectar desvio.

## 5. Rollback completo

Backups: `/opt/x1zap/backups/heartbeat-alerts-20261124/`
(`pre/` fontes publicadas + `SHA256SUMS-pre.txt` + `versions-pre.txt`; `trigger_instance_status_change.definition.sql`; `restore-trigger.sql`; `admin_status_alerts.schema.json`).

Ordem (inversa):
1. **Funções** — redeploy do backup `pre/` (hash conferido): `uazapi-webhook` (`--no-verify-jwt`), depois `uazapi-heartbeat` (`verify_jwt` true). Conferir hash == `SHA256SUMS-pre.txt`.
2. **Trigger** — só se for desejado voltar ao comportamento antigo: `restore-trigger.sql` (por SQL direcionado). Idempotente. **Redeployar as funções NÃO restaura o trigger**; este passo é obrigatório para a restauração completa. Testado em Postgres descartável: baseline (1 pendente) → migration (0) → restauração (1) → reaplicações idempotentes.
3. **Tabela** — pode ficar (aditiva, sem efeito sem as funções novas). Episódios ativos ficam parados; ao republicar, são reprocessados com consultas novas (alerta exige 2 consultas válidas), sem envio automático por estado antigo.
4. Verificar: versões/hash, trigger existente, cron `succeeded`.

## 6. Isolamento e permissões da tabela

Testado contra Postgres + PostgREST reais com JWTs `authenticated` e RLS de `profiles` equivalente ao de produção: usuário da org A vê só A (nunca B, nem por id/org/conexão); B simétrico; sem perfil e `anon`: nada; nenhum `authenticated` escreve.

**Limites — não há garantia de histórico imutável:**
- Em produção o `service_role` tem `DELETE` e `TRUNCATE` (e demais privilégios) na tabela — ACL padrão do Supabase aplicada pelo schema; a migration não os revoga. Qualquer código ou operador com a service key pode apagar episódios.
- As FKs (`organization_id`, `connection_id`) são `ON DELETE CASCADE`: apagar uma organização ou uma conexão apaga seus episódios.
- Portanto a tabela é um **registro operacional**, não uma trilha de auditoria imutável. Se for necessária imutabilidade, será outra mudança (revogar privilégios, trocar CASCADE), fora desta entrega.
- Observação existente (fora do escopo): a policy atual de `admin_status_alerts` é `ALL` para membros da organização.
