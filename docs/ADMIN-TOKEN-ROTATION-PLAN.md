# Rotação do token admin da UazAPI — plano (NÃO executado)

**Nada aqui foi executado.** Nenhum valor de token aparece neste arquivo. Comparações foram feitas por hash (md5) sem exibir valores.

## Fatos verificados (2026-11-24)
- O token admin **vivo** está em `platform_settings.uazapi_admin_token`.
- Esse valor **é o mesmo literal escrito no repositório** na migration `20260610204759_09a9c358-deeb-4649-bee4-e638c8655cc7.sql` (comando do cron antigo) e em `audit_uazapi.js` e `audit_detailed.js` (raiz, rastreados no git desde `18439a6`). Há cópias nas worktrees locais de outras sessões.
- A migration `20260522203949_3cd929f6-c30c-4779-b253-dcefcba0fc5f.sql` tem **outro** literal de token, que **não** é o vivo (não bate com `platform_settings` nem com o cron).
- O cron **atual** `uazapi-heartbeat-cron` já não usa token literal: autentica pelo vault (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`).
- O `edge-mini` na VPS (`/opt/x1zap/edge-mini/.env`, variável `UAZAPI_ADMIN_TOKEN`) tem o **mesmo valor vivo**, e **6 backups `.env.bak.*`** também.

## Consumidores a atualizar (e verificar) numa rotação
| Consumidor | Onde | Observação |
|---|---|---|
| `platform_settings.uazapi_admin_token` | banco | fonte lida por `uazapi-heartbeat` (fallback quando a instância não tem token), `uazapi-send`, `whatsapp-proxy` |
| `edge-mini` | `/opt/x1zap/edge-mini/.env` + restart do serviço | `UAZAPI_ADMIN_TOKEN` (download de mídia) |
| Painel superadmin | `WhatsAppManager` | grava/lê o mesmo campo |
| Provedor UazAPI | painel/servidor UazAPI | emitir o novo token admin e invalidar o antigo |
| Tokens por instância (`instance_token`) | `evolution_instances` | **não** são o token admin; não mudam |

## Plano (cada passo com autorização própria)
1. **Janela e pré-verificação** (leitura): confirmar quais fluxos usam o token admin como fallback (instâncias sem `instance_token`) e que `edge-mini` está saudável.
2. **Emitir** o novo token admin na UazAPI (mantendo o antigo válido, se o provedor permitir sobreposição).
3. **Atualizar** `platform_settings.uazapi_admin_token` (UPDATE pontual, autorizado) e `edge-mini/.env` (restart controlado).
4. **Verificar**: heartbeat (`succeeded`), envio de teste administrativo **sem WhatsApp real** (probe `/instance/status` apenas), mídia pelo edge-mini.
5. **Revogar** o token antigo no provedor.
6. **Limpar o repositório**: remover os literais das migrations antigas (substituir por referência ao vault), apagar `audit_uazapi.js`/`audit_detailed.js`, e tratar o **histórico git** (o valor antigo continua nele; por isso a revogação no passo 5 é o que fecha o risco).
7. **Limpar a VPS**: remover os `.env.bak.*` com o valor antigo (ou reescrevê-los), em janela autorizada.
8. **Prevenção**: varredura de segredos no CI para bloquear novos literais.
