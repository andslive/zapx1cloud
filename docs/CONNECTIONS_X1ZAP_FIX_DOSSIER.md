# Dossiê Técnico — Correção do servidor `api.x1zap.cloud`

Documento para a equipe que mantém o backend de Conexões WhatsApp (UazAPI + VPS Chromium + PM2).
Escopo: **fora deste repositório Lovable**. O CRM apenas consome a API.

---

## 1. Endpoints atuais consumidos pelo frontend

Base: `https://api.x1zap.cloud/connections` (`src/config/connectionsApi.ts`).
Hook: `src/hooks/useConnections.ts`. Painel: `src/components/admin/integrations/ConnectionsManager.tsx`.

| Ação UI | Método | Path | Hook |
|---|---|---|---|
| Listar Chromium | GET | `/instances` | `useConnections` |
| Status individual (polling 5s) | GET | `/status/:id` | `useConnectionStatus` |
| Sincronizar | POST | `/sync` | `useSyncConnections` |
| Criar conexão | POST | `/instances/create` | `useCreateConnection` |
| Obter QR | GET | `/qr/:id` | `useGetConnectionQr` |
| Iniciar sessão | POST | `/start/:id` | `useStartConnection` |
| Parar sessão | POST | `/stop/:id` | `useStopConnection` |
| Excluir | DELETE | `/:id` | `useDeleteConnection` |

A coluna UazAPI (paralela) vem de `useWhatsAppInstances` → edge function `instances-api` deste projeto → tabela `evolution_instances`. Esse fluxo **funciona** e não está em discussão.

---

## 2. Payloads reais

### 2.1 `POST /instances/create`
**Enviado pelo front:**
```json
{ "name": "canal21" }
```
**Esperado (mas hoje incompleto) — deve retornar:**
```json
{
  "id": "uuid-no-banco-vps",
  "name": "canal21",
  "instance_id": "inst-1780112571624",
  "pm2_name": "wa-canal21",
  "session_path": "/var/lib/wajs/canal21",
  "uazapi_instance_id": "r6af853ae80fb66",
  "status": "created",
  "qr_available": true
}
```

### 2.2 `GET /instances` (resposta atual conhecida)
Schema observado na tipagem `Connection` (`useConnections.ts`):
```ts
{
  id, name, channel, provider, status,
  uazapiStatus?, uazapiLinked?,
  chromium?, chromium_instance_id?, chromium_status?,
  chromium_number?, chromium_pushname?, chromium_qr?,
  platform?, phone_number?, number?, pushname?,
  instance_id?, qr_code?, created_at
}
```
**Problema observado:** retorna registros antigos (`chip221`, `chip32`, `CHIP26-GF`) misturados com os novos (`canal21`, `canal32`, `canal26`) sem nenhum flag de soft-delete e sem deduplicar por `number`.

### 2.3 `DELETE /:id`
Front trata 404 como sucesso (silenciamento perigoso — `useConnections.ts:153-160`). Hoje o backend aparentemente devolve 200 mas não:
- para o PM2,
- desconecta a instância UazAPI,
- apaga LocalAuth,
- marca soft-delete.

Resultado: o registro reaparece no próximo `GET /instances` ou `POST /sync`.

### 2.4 `POST /sync`
Front aceita resposta como array (substitui cache) ou objeto (apenas invalida query). Hoje devolve a união ingênua de:
- registros do banco do VPS,
- instâncias listadas pela UazAPI (`/instance/all`),
- processos PM2 ativos,

sem deduplicar e sem respeitar soft-delete.

---

## 3. Causas-raiz

### 3.1 Duplicidades por número
Não existe `UNIQUE(number)` nem `UNIQUE(uazapi_instance_id)` no banco do VPS. Quando o operador cria um "canal21" para o mesmo chip que já tinha um "chip221" antigo, ambos sobrevivem.

### 3.2 DELETE não funciona
O handler do `DELETE /:id` provavelmente faz apenas `DELETE FROM connections WHERE id=$1` (ou nem isso). Faltam, **nesta ordem**:
1. soft-delete (`is_active=false`, `deleted_at=now()`),
2. `POST {UAZAPI}/instance/disconnect` + `DELETE {UAZAPI}/instance/:name`,
3. `pm2 delete wa-<name>`,
4. `rm -rf /var/lib/wajs/<name>` (LocalAuth),
5. limpar arquivos de status/cache (`/var/lib/wajs/status/<name>.json`).

### 3.3 Sync recria/retorna lixo
`POST /sync` reativa registros porque:
- não filtra `is_active=false` ao mergear com UazAPI/PM2,
- ao ver uma instância na UazAPI sem registro local correspondente, **insere** sem checar `number` já existente,
- usa `name` como chave em vez de `number` normalizado.

### 3.4 UazAPI Online + Chromium Ghost/Offline
Acontece quando:
- a instância UazAPI continua respondendo (o número pareou um dia),
- mas o processo PM2 correspondente caiu (OOM, crash, deploy) **sem** atualização do status no banco do VPS,
- ou o LocalAuth foi corrompido e a sessão whatsapp-web.js não inicializa.

A API hoje devolve `chromium_status` baseado em cache obsoleto, não em `pm2 jlist` em tempo real.

---

## 4. Plano de correção no `api.x1zap.cloud`

### 4.1 Migration no banco do VPS
```sql
ALTER TABLE connections
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS pm2_name text,
  ADD COLUMN IF NOT EXISTS session_path text,
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz;

-- Não usar UNIQUE rígido (precisamos preservar histórico), usar índice parcial:
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_number
  ON connections(number) WHERE is_active = true AND number IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_active_listing
  ON connections(is_active, updated_at DESC);
```

### 4.2 `DELETE /:id` — ordem segura

```text
[DELETE_START] id=<id>
  ↓ 1. SELECT connection
[DELETE_DB_SOFT] UPDATE connections SET is_active=false, deleted_at=now() WHERE id=$1
  ↓ 2. UazAPI
[DELETE_UAZ_TRY] POST {UAZAPI}/instance/disconnect  body={instance: name}
[DELETE_UAZ_TRY] DELETE {UAZAPI}/instance/<name>
   (ignorar 404 — log warn, prosseguir)
  ↓ 3. PM2
[DELETE_PM2_TRY] pm2 delete wa-<name>           (ignorar "process not found")
  ↓ 4. LocalAuth
[DELETE_FS_TRY]  rm -rf /var/lib/wajs/<name>
  ↓ 5. Cache/status
[DELETE_FS_TRY]  rm -f /var/lib/wajs/status/<name>.json
[DELETE_OK] id=<id>
```
Regra: **falha de etapa 2-5 não reverte etapa 1**. Logar warn, prosseguir, devolver 200 com `{soft_deleted:true, warnings:[...]}`. O painel não pode mais ver o registro.

### 4.3 `POST /sync` — reconciliação correta

```text
[SYNC_START]
1. uazList  = GET {UAZAPI}/instance/all
2. pm2List  = pm2 jlist | filter name~/^wa-/
3. dbList   = SELECT * FROM connections WHERE is_active = true
[SYNC_FETCH] uaz=N pm2=M db=K

4. Para cada item em uazList:
   - achar em dbList por (uazapi_instance_id) OU (name)
   - se NÃO achar → NÃO inserir automaticamente. Marcar como
     "orphan_uazapi" em /sync/report.
[SYNC_ORPHAN_UAZ] name=<x>

5. Para cada item em pm2List:
   - achar em dbList por pm2_name
   - se NÃO achar → "orphan_pm2".

6. Para cada conn em dbList:
   - uaz_status = uazList[conn.name]?.state || 'offline'
   - pm2_proc   = pm2List[conn.pm2_name]
   - chromium_status = pm2_proc?.pm2_env?.status === 'online'
                       && fs.exists(session_path + '/Default/Cookies')
                         ? 'online'
                         : pm2_proc ? 'partial' : 'offline'
   - UPDATE connections SET uazapi_status, chromium_status,
       last_health_check_at = now() WHERE id=conn.id

7. Detectar duplicatas por number:
   SELECT number, array_agg(id ORDER BY updated_at DESC) ids
   FROM connections WHERE is_active=true AND number IS NOT NULL
   GROUP BY number HAVING count(*) > 1;
   → NÃO desativar automaticamente. Devolver em /sync response como
     "duplicates":[{number, ids:[...]}] para o painel alertar.
[SYNC_DUPLICATE_PHONE_DETECTED] number=<x> ids=<a,b>
[SYNC_OK]
```

### 4.4 `POST /instances/create` — fluxo completo
```text
[CREATE_START] name=<x>
1. Validar nome único entre ativos.
2. INSERT connections (name, is_active=true)  → id
3. POST {UAZAPI}/instance/init  body={instance:name, token: <tok>}
   ↳ salva uazapi_instance_id
4. pm2 start wajs.js --name wa-<name> -- --session=/var/lib/wajs/<name>
   ↳ salva pm2_name, session_path
5. Aguardar QR (poll arquivo qr.png ou stdout) até 30s
6. UPDATE connections SET uazapi_*, pm2_name, session_path, chromium_qr
[CREATE_OK] id=<id>
```
Resposta DEVE incluir `id`, `pm2_name`, `session_path`, `qr_available`.

### 4.5 `GET /qr/:id`
Sempre buscar QR **do PM2/whatsapp-web.js** (arquivo da sessão ou IPC), nunca apenas o que veio uma vez da UazAPI. Se PM2 não estiver `online`, reiniciar antes de devolver QR.

---

## 5. Comandos PM2 esperados

```bash
# inventário
pm2 jlist | jq '.[] | {name, status:.pm2_env.status, uptime:.pm2_env.pm_uptime}'

# saúde de uma instância
pm2 describe wa-canal21

# restart seguro (mantém LocalAuth)
pm2 restart wa-canal21 --update-env

# kill + limpar sessão (último recurso)
pm2 delete wa-canal21
rm -rf /var/lib/wajs/canal21
```

---

## 6. Reconciliação dos casos atuais (SQL no banco do VPS)

> Roda no banco do `api.x1zap.cloud`, **não** no Lovable Cloud.
> Mantém histórico (sem DELETE, só `is_active=false`).

```sql
BEGIN;

-- Regra de decisão: manter a conexão mais recente OU a que tem chromium_status='online' agora.
-- Os números abaixo precisam ser confirmados antes do UPDATE.

-- 1) chip221 (antigo) vs canal21 (novo)  num=558796507198
UPDATE connections SET is_active=false, deleted_at=now(),
       deactivation_reason='dedup:keep canal21'
 WHERE name='chip221' AND number='558796507198';

-- 2) chip32 (antigo) vs canal32 (novo)   num=558796511160
UPDATE connections SET is_active=false, deleted_at=now(),
       deactivation_reason='dedup:keep canal32'
 WHERE name='chip32' AND number='558796511160';

-- 3) CHIP26-GF vs canal26                num=558796507398
-- decidir manual pelo critério: mais recente E pm2 online E uazapi online
UPDATE connections SET is_active=false, deleted_at=now(),
       deactivation_reason='dedup:keep canal26'
 WHERE name='CHIP26-GF' AND number='558796507398';

-- 4) canal32 duplicado (dois registros com mesmo name+number)
-- manter o de updated_at mais recente
WITH dups AS (
  SELECT id, row_number() OVER (PARTITION BY name, number ORDER BY updated_at DESC) rn
    FROM connections WHERE name='canal32' AND is_active=true
)
UPDATE connections SET is_active=false, deleted_at=now(),
       deactivation_reason='dedup:duplicate row'
 WHERE id IN (SELECT id FROM dups WHERE rn > 1);

-- 5) APÓS confirmar visualmente no painel, rodar PM2 + LocalAuth dos desativados:
--    pm2 delete wa-chip221 wa-chip32 wa-CHIP26-GF
--    rm -rf /var/lib/wajs/{chip221,chip32,CHIP26-GF}
--    POST {UAZAPI}/instance/disconnect para cada um.

COMMIT;
```

**Importante:** este SQL roda só no banco do VPS. **Não toca**:
- `leads` (no Lovable Cloud) — preservadas,
- `webchat_conversations` (no Lovable Cloud) — preservadas,
- vínculos `evolution_instance_id` nas conversas — se algum lead estiver vinculado a `chip221`, ele continua acessível por histórico; mensagens novas chegarão por `canal21` (mesmo número, novo `instance_id`). O webhook `evolution-webhook` deste projeto já reaproveita conversa de outra instância pelo número do contato (memória `WA History Preservation`).

---

## 7. Regra de deduplicação por número (server-side)

Aplicar **server**, não no front:
```text
ORDEM DE PRIORIDADE para manter ativo entre múltiplos com mesmo `number`:
1. registro com is_active=true e chromium_status='online' E uazapi_status='online'
2. registro mais recente (max updated_at)
3. registro com pm2_name não nulo
4. tie-break: menor id
```
Os demais → `is_active=false`, `deactivation_reason='dedup'`. **Nunca DELETE físico** enquanto houver mensagens/leads ligados.

---

## 8. Preservação de histórico

- Soft-delete em `connections` (`is_active=false`).
- Nunca apagar mensagens da UazAPI; só desconectar o socket.
- LocalAuth pode ser apagado (é só sessão, não é histórico).
- No Lovable Cloud, `webchat_conversations.evolution_instance_id` continua apontando para o antigo — o webhook reaproveita conversas pelo telefone (memória existente).

---

## 9. Testes obrigatórios pós-correção (no servidor)

| # | Cenário | Esperado |
|---|---|---|
| T1 | `POST /instances/create {name:"canal_teste_001"}` | DB inserido, UazAPI init OK, PM2 online, QR retornado em <30s |
| T2 | `DELETE /:id` do T1 | `is_active=false`, `pm2 list` sem o processo, `ls /var/lib/wajs/canal_teste_001` falha, UazAPI 404 no `/instance/<name>` |
| T3 | `POST /sync` após T2 | resposta NÃO inclui `canal_teste_001`. Nenhum INSERT silencioso para órfãos |
| T4 | `GET /instances` retorna duplicidade fabricada | resposta inclui `duplicates:[...]`, painel mostra aviso |
| T5 | Kill manual de `wa-canal21` (`pm2 stop`) | em <60s, `chromium_status` vira `offline`/`partial`, UazAPI continua `online`, painel mostra **Parcial** |
| T6 | Restart full do VPS | painel reflete realidade em <5min, nenhum registro órfão criado |

---

## 10. Como validar

**DevTools** (no painel Conexões): filtrar console por `[SYNC_` / `[DELETE_` / `[CREATE_` / `[QR_`.
**Network**: cada ação dispara 1 chamada — verificar status HTTP e shape do JSON contra seção 2.
**PM2 (na VPS)**: `pm2 jlist | jq` antes/depois de cada teste.
**Banco do VPS**: `SELECT name, number, is_active, chromium_status, uazapi_status, deleted_at FROM connections ORDER BY updated_at DESC;`
**Lovable Cloud (este projeto)**: nenhuma migration roda aqui. Tabela `public.connections` deste projeto tem 4 linhas-espelho não usadas pelo painel — podemos deixar como está.
