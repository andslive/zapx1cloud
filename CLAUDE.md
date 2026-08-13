# CLAUDE.md — X1Zap CRM Migration

## Missão urgente

Migrar o CRM X1Zap para funcionar fora da Lovable Cloud o mais rápido possível, usando:

- GitHub como fonte oficial do código
- Vercel para frontend
- Supabase próprio para Auth/DB/Storage/Edge Functions
- VPS2 para edge-mini, webhooks, Redis, BullMQ, workers, OCR/IA e PM2
- UazAPI para WhatsApp

Prioridade absoluta: reduzir dependência/custo da Lovable Cloud sem quebrar vendas reais.

## Estratégia aprovada

Usar a VPS2 atual. NÃO apagar a VPS2.

Subir uma produção limpa, migrando apenas estrutura essencial:

- schema
- RLS
- triggers
- functions
- Edge Functions essenciais
- usuários/admin
- organização
- produtos
- funis
- blocos de funil
- integrações UazAPI
- Pixel/CAPI
- IA/OCR/reconhecer comprovante

Não migrar agora:

- leads antigos
- conversas antigas
- mensagens antigas
- logs antigos
- sessões antigas de WhatsApp
- storage antigo
- estados de funis em andamento
- histórico de purchase_audit/pixel_event_logs antigo

## Regras obrigatórias

1. Nunca apagar dados de produção.
2. Nunca rodar migration destrutiva sem autorização explícita.
3. Nunca alterar secrets, .env, tokens ou service_role sem autorização.
4. Nunca expor secrets em logs, commits ou respostas.
5. Nunca fazer deploy em produção sem aprovação.
6. Antes de alterar arquivos, explicar o plano.
7. Trabalhar por fases pequenas.
8. Após alterar, mostrar diff.
9. Sempre rodar build/testes quando aplicável.
10. Se houver risco de duplicar mensagens, funis, purchases ou pixel, parar e explicar.
11. Não refatorar por estética agora. Foco é migração rápida.
12. Não tentar tornar SaaS vendável completo nesta fase. Isso fica para depois.

## Papéis

- Anderson: dono do projeto e aprovador final.
- ChatGPT: arquiteto/revisor estratégico.
- Claude Code: engenheiro executor no terminal.
- Codex CLI: segundo agente executor/revisor, usado via a skill `crm-dual-agent` (ver `.claude/skills/crm-dual-agent/SKILL.md`).

## Foco técnico atual

Priorizar:

1. Inventário da VPS2.
2. Estado do repositório.
3. Estado do edge-mini.
4. Estado do Supabase novo.
5. Estado do Vercel.
6. Estado dos webhooks UazAPI.
7. Um chip canário funcionando ponta a ponta.
8. Só depois escalar.

## Módulos sensíveis

Cuidado especial com:

- supabase/functions/uazapi-webhook
- supabase/functions/funnel-resume-cron
- ai_receipt / reconhecer comprovante
- OCR de imagem/PDF
- Pixel/CAPI Purchase
- purchase_audit
- vps_receipt_results
- ai_receipt_audits
- resume_path / provider_message_id
- Redis/BullMQ workers
- PM2 edge-api
- Nginx/webhooks

Ver também `docs/CRM-INVARIANTS.md` para os invariantes de negócio que qualquer agente (Claude ou Codex) deve preservar.

## Comandos seguros de leitura

Pode rodar sem autorização adicional:

- pwd
- ls -la
- git status
- git log --oneline -10
- pm2 status
- systemctl status nginx --no-pager
- curl -s http://127.0.0.1:3002/health
- node -v
- npm -v
- pnpm -v
- find . -maxdepth 3 -type f | sort | head -300

## Comandos que exigem aprovação

- git commit
- git push
- vercel --prod
- supabase db push
- supabase functions deploy
- pm2 reload
- systemctl restart
- qualquer comando rm
- qualquer migration
- qualquer alteração em .env/secrets

## Como trabalhar

Sempre responder com:

1. O que foi encontrado.
2. O risco.
3. O plano.
4. O que será alterado.
5. Como validar.
6. Como reverter.

## Fluxo dual-agent (Claude + Codex)

Para qualquer tarefa que valha a pena rodar com os dois agentes (investigar → planejar →
implementar → revisar → testar), use a skill `crm-dual-agent`
(`.claude/skills/crm-dual-agent/SKILL.md`). Regras inegociáveis desse fluxo:

- Nunca usar `--yolo`, `--dangerously-bypass-approvals-and-sandbox` ou qualquer bypass de sandbox.
- Nunca deploy automático — produção sempre exige aprovação humana explícita, vinculada ao
  commit/hash exatamente revisado.
- Um único agente escreve por etapa; o outro só revisa, em sandbox read-only.
- Toda implementação acontece em worktree isolado, nunca no diretório principal. Nenhum agente
  em modo de aprovação automática deve operar com `cwd` diretamente em `/opt/x1zap/zapx1cloud` —
  `check-environment.sh` bloqueia isso antes de qualquer worktree ser criado (caso de
  aprendizado: incidente de 2026-08-12, ver `docs/PRODUCTION-RUNBOOK.md`).
- Ver `.claude/skills/crm-dual-agent/references/risk-policy.md` para a política de risco completa.
