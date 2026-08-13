# Runbook de produção — X1Zap CRM

Este documento é referência de leitura. Nenhum comando aqui deve ser executado
automaticamente por uma skill/agente — sempre com aprovação humana explícita do Anderson,
vinculada ao commit exato revisado (ver `.claude/skills/crm-dual-agent/references/risk-policy.md`).

## Checklist antes de produção

1. O diff final foi revisado por um segundo agente (ou humano) em modo read-only.
2. Todos os testes/validações disponíveis rodaram e passaram (`verify-build.sh` ou equivalente
   manual).
3. Nenhum dos invariantes em `docs/CRM-INVARIANTS.md` foi afetado sem justificativa explícita.
4. A aprovação humana foi dada depois de ver o diff, e está vinculada ao hash do commit exato
   (qualquer commit novo depois invalida a aprovação).
5. Existe um plano de rollback claro para esta mudança específica (ver seção "Rollback" abaixo).
6. Se a mudança envolve schema/dados: existe backup recente confirmado (ver "Backup").

## Backup (quando houver mudança de banco)

Antes de qualquer migration em produção, confirmar que existe backup recente do Supabase
(`ydunpoqdhijhnrarohiz`). Isso é feito manualmente pelo Anderson ou por comando explícito
aprovado — nunca disparado automaticamente por uma skill.

Comando de referência (não executar automaticamente):

```bash
supabase db dump --db-url "$SUPABASE_DB_URL" -f "backup_$(date +%Y%m%d_%H%M%S).sql"
```

## Comandos de deploy — apenas como referência de leitura

Estes comandos nunca devem ser executados por uma skill/agente automatizado. São documentados
aqui para que o relatório final da skill possa apontar "o próximo passo manual seria X", sem
executar X.

### Frontend (Vercel)

```bash
vercel --prod
```

### Edge Functions (Supabase)

```bash
supabase functions deploy <nome-da-function>
```

### Migrations (Supabase)

```bash
supabase db push
```

### Reinício de serviços (VPS2)

```bash
pm2 reload <nome-do-processo>
systemctl restart nginx
```

> Nota observada durante auditoria: a produção da VPS2 hoje roda a partir de diretórios separados
> (`/opt/x1zap/edge-mini`, `/opt/x1zap/wait-response-shadow`), não deste checkout Git diretamente.
> Antes de assumir que "commitar = produção atualizada", confirmar como o código chega até esses
> diretórios (processo de deploy manual/script/rsync — não confirmado nesta auditoria).

## Verificação pós-deploy

1. `curl -s http://127.0.0.1:3002/health` (ou endpoint equivalente) retorna `ok: true`.
2. `pm2 status` mostra o processo relevante `online`, sem reinícios (`↺`) inesperados logo após o
   deploy.
3. Testar manualmente o caminho afetado com um chip canário (não um lead real de produção), se a
   mudança tocar em WhatsApp/funil/pagamento.
4. Verificar logs (`pm2 logs <processo>` ou equivalente) por alguns minutos após o deploy,
   checando erros novos.

## Rollback

1. Frontend (Vercel): reverter para o deployment anterior pelo painel da Vercel, ou
   `vercel rollback` (comando de referência — confirmar sintaxe exata na CLI instalada antes de
   usar).
2. Edge Functions: re-deploy da versão anterior a partir do commit anterior
   (`supabase functions deploy <nome> ` a partir do checkout do commit anterior).
3. Migration: só reverter com uma migration de rollback específica, escrita e revisada como
   qualquer outra mudança — nunca com `DROP`/`TRUNCATE` improvisado. Ver exemplos de rollback já
   existentes em `scripts/migration/20260806_rollback_duplicate_receipts.sql` como referência de
   formato.
4. Serviço VPS2: `pm2 reload <processo>` apontando para a versão anterior do código, depois de
   restaurar os arquivos (o deploy atual da VPS2 não é versionado por Git — ver nota acima; manter
   uma cópia da versão anterior antes de sobrescrever é responsabilidade de quem aplica o deploy).

## Regra de parada

Se em qualquer ponto do checklist acima algo não puder ser confirmado com segurança (backup não
confirmado, aprovação não vinculada ao commit certo, teste falhando, invariante potencialmente
afetado sem justificativa), **parar e reportar** em vez de prosseguir. Nenhuma automação deve
"decidir sozinha" que está tudo bem para seguir com produção.

## Casos de aprendizado

### 2026-08-12 — Agente concorrente escrevendo diretamente no repositório principal

Durante uma sessão da skill `crm-dual-agent` (trabalhando corretamente, em worktree isolado),
apareceram 7 arquivos de migration SQL não rastreados diretamente em `/opt/x1zap/zapx1cloud` —
não escritos por essa sessão. Investigação em modo somente leitura (timestamps, metadados,
processos ativos) encontrou duas outras sessões `claude --resume --permission-mode auto` ativas
no mesmo servidor, uma delas com `cwd` exatamente no repositório principal. As migrations em si
eram tecnicamente corretas — hardening legítimo de ACL multi-tenant ("Fase 2B.0.6"), depois
revisado linha a linha e testado num Postgres local descartável antes de qualquer aplicação real
— mas apareceram sem worktree isolado, sem revisão prévia visível e sem coordenação explícita.

**O que deu certo:** a regra de parada ("se encontrar estado inesperado, pare e relate") já
existia e foi seguida — nenhuma migration foi aplicada, nenhum arquivo foi editado às pressas,
tudo foi investigado antes de qualquer ação.

**O que faltava:** nenhuma checagem desta skill olhava para o *ambiente ao redor* — só para os
parâmetros recebidos pelos próprios scripts. Um agente totalmente diferente, fora do fluxo desta
skill, podia (e pôde) escrever direto no repositório principal sem que nada aqui detectasse ou
bloqueasse isso a priori.

**Correções feitas:**
- Novo script `scripts/check-environment.sh`, chamado como Passo -1 (antes do Passo 0) — bloqueia
  se o `cwd` atual ou o `worktree_dir` pretendido for o repositório principal, ou se houver outra
  sessão `claude`/`codex` ativa, em modo automático, com `cwd` no repositório principal.
- `review-plan.sh` (que era só leitura, mas não tinha essa checagem) ganhou a mesma proteção que
  `implement-plan.sh` já tinha.
- Regra explícita de limpeza de duplicatas (ver `SKILL.md`, seção "Limpeza de duplicatas"): nunca
  `git clean`, sempre prova byte-idêntica (`sha256sum`) contra o commit/worktree que preserva o
  conteúdo, e lista explícita de caminhos antes de remover qualquer coisa do repositório
  principal.
- `CLAUDE.md`, `AGENTS.md` e `.agents/skills/crm-safety/SKILL.md` atualizados com a mesma regra:
  nenhum agente em modo automático deve operar com `cwd` no repositório principal.

A frente de ACL em si (as 9 migrations, revisão e teste local) ficou registrada separadamente, em
worktree próprio, fora do escopo desta skill.
