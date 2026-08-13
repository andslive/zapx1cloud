#!/usr/bin/env bash
set -uo pipefail
# (não usa 'set -e' aqui de propósito: o script precisa rodar todas as
# verificações e reportar o conjunto, não abortar na primeira falha de lint)

# verify-build.sh <worktree_dir>
#
# Mostra diff e status do worktree, roda as validações seguras disponíveis
# no repo (lint/build/testes, quando existirem), e BLOQUEIA (exit != 0) se
# detectar termos proibidos nos scripts da própria skill, SQL destrutivo nos
# arquivos alterados, ou comandos de deploy/restart automático nos arquivos
# alterados.

usage() {
  echo "Uso: $0 <worktree_dir>" >&2
  exit 1
}

WORKTREE_DIR="${1:-}"
[ -n "$WORKTREE_DIR" ] || usage
[ -d "$WORKTREE_DIR" ] || { echo "ERRO: worktree_dir não existe: $WORKTREE_DIR" >&2; exit 1; }
WORKTREE_DIR="$(cd "$WORKTREE_DIR" && pwd)"

if ! git -C "$WORKTREE_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERRO: $WORKTREE_DIR não é um repositório git." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOCKED=0

echo "== 1. Uso real (invocação) de termos proibidos nos scripts da skill =="
# Não basta procurar a string em qualquer lugar: os próprios scripts contêm
# essas strings de propósito, para DETECTAR e BLOQUEAR o termo em planos
# alheios (definição de FORBIDDEN_PATTERN=... e mensagens de erro). Só é um
# problema real se o termo aparecer sendo passado como argumento de fato a
# um comando (codex/git/etc.), não dentro de uma definição de padrão ou de
# uma mensagem echo.
FORBIDDEN_PATTERN='(--yolo|danger-full-access|--dangerously-bypass-approvals-and-sandbox)'
HITS="$(grep -REn "$FORBIDDEN_PATTERN" "$SCRIPT_DIR" 2>/dev/null \
  | grep -v -E '^\S+:[0-9]+:[[:space:]]*#' \
  | grep -v -E '_PATTERN=' \
  | grep -v -E ':[[:space:]]*echo ')"
if [ -n "$HITS" ]; then
  echo "BLOQUEADO: termo proibido encontrado em uso real (fora de definição de padrão/mensagem) nos scripts da skill:" >&2
  echo "$HITS" >&2
  BLOCKED=1
else
  echo "OK: termos proibidos só aparecem em definições de padrão de detecção e mensagens de erro (uso legítimo), nunca em invocação real."
fi

echo ""
echo "== 2. git status --short ($WORKTREE_DIR) =="
git -C "$WORKTREE_DIR" status --short

# `git diff` sozinho não mostra arquivos NOVOS não rastreados (?? no status) —
# só mudanças em arquivos já rastreados. Como a implementação normalmente cria
# arquivos novos, marcamos "intent to add" (git add -N) antes do diff, para
# que apareçam como adição completa. Isso só mexe no índice do git (metadado
# de rastreamento), nunca no conteúdo dos arquivos, e é o próprio worktree
# isolado da tarefa — não afeta o repositório principal.
git -C "$WORKTREE_DIR" add -N -- . >/dev/null 2>&1 || true

echo ""
echo "== 3. git diff --stat (inclui arquivos novos via intent-to-add) =="
git -C "$WORKTREE_DIR" diff --stat

echo ""
echo "== 4. git diff completo (inclui arquivos novos via intent-to-add) =="
git -C "$WORKTREE_DIR" diff

echo ""
echo "== 5. SQL potencialmente destrutivo em arquivos .sql alterados =="
CHANGED_FILES="$( (git -C "$WORKTREE_DIR" diff --name-only; git -C "$WORKTREE_DIR" diff --cached --name-only) | sort -u )"
DANGEROUS_SQL='(DROP[[:space:]]+TABLE|DROP[[:space:]]+COLUMN|TRUNCATE|DELETE[[:space:]]+FROM)'
for f in $CHANGED_FILES; do
  case "$f" in
    *.sql)
      full="$WORKTREE_DIR/$f"
      [ -f "$full" ] || continue
      if grep -Eiq "$DANGEROUS_SQL" "$full"; then
        echo "BLOQUEADO: SQL potencialmente destrutivo em $f" >&2
        grep -Ein "$DANGEROUS_SQL" "$full" >&2
        BLOCKED=1
      fi
      ;;
  esac
done
if [ "$BLOCKED" -eq 0 ]; then
  echo "OK: nenhum SQL destrutivo óbvio nos arquivos .sql alterados."
fi

echo ""
echo "== 6. Deploy/restart/push/merge automático nos arquivos alterados =="
# Só faz sentido bloquear em arquivos que de fato EXECUTAM comandos (scripts,
# código, YAML de CI) — não em .md, onde citar "vercel --prod" é quase sempre
# documentação/regra proibitiva (ex.: CLAUDE.md, PRODUCTION-RUNBOOK.md, que
# documentam esses comandos como referência de leitura, nunca para rodar
# automaticamente). Para .sh, também ignoramos linhas de definição de padrão
# e mensagens de erro (mesma lógica do item 1), para não se autobloquear.
DEPLOY_PATTERN='(vercel[[:space:]]+--prod|supabase[[:space:]]+db[[:space:]]+push|supabase[[:space:]]+functions[[:space:]]+deploy|pm2[[:space:]]+(reload|restart)|systemctl[[:space:]]+restart)'
FOUND_DEPLOY=0
for f in $CHANGED_FILES; do
  full="$WORKTREE_DIR/$f"
  [ -f "$full" ] || continue
  case "$f" in
    *.md) continue ;;
  esac
  HITS="$(grep -Ein "$DEPLOY_PATTERN" "$full" \
    | grep -v -E '^[0-9]+:[[:space:]]*#' \
    | grep -v -E '_PATTERN=' \
    | grep -v -E ':[[:space:]]*echo ')"
  if [ -n "$HITS" ]; then
    echo "BLOQUEADO: comando de deploy/restart real encontrado em $f" >&2
    echo "$HITS" >&2
    FOUND_DEPLOY=1
    BLOCKED=1
  fi
done
if [ "$FOUND_DEPLOY" -eq 0 ]; then
  echo "OK: nenhum comando de deploy/restart automático nos arquivos alterados (documentação .md não conta como execução)."
fi

echo ""
echo "== 7. Validações seguras disponíveis no repo =="
cd "$WORKTREE_DIR" || exit 1

if [ -f package.json ]; then
  if command -v node >/dev/null 2>&1 && grep -q '"lint"' package.json && command -v npm >/dev/null 2>&1; then
    echo "-- npm run lint --"
    npm run lint || echo "AVISO: lint falhou ou não pôde rodar (não bloqueia por si só)."
  else
    echo "npm/lint não disponível ou script ausente — pulando."
  fi
  if command -v node >/dev/null 2>&1 && grep -q '"build"' package.json && command -v npm >/dev/null 2>&1; then
    echo "-- npm run build --"
    npm run build || echo "AVISO: build falhou ou não pôde rodar (não bloqueia por si só)."
  else
    echo "npm/build não disponível ou script ausente — pulando."
  fi
else
  echo "Sem package.json — pulando lint/build de frontend."
fi

if command -v deno >/dev/null 2>&1 && [ -d supabase/functions/_shared ]; then
  TEST_COUNT="$(find supabase/functions -iname '*.test.ts' 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$TEST_COUNT" -gt 0 ]; then
    echo "-- deno test supabase/functions/_shared (${TEST_COUNT} arquivos de teste encontrados) --"
    deno test supabase/functions/_shared/*.test.ts 2>&1 || echo "AVISO: testes Deno falharam ou não puderam rodar (não bloqueia por si só)."
  else
    echo "Nenhum arquivo *.test.ts encontrado em supabase/functions — pulando testes Deno."
  fi
else
  echo "Deno não disponível ou supabase/functions/_shared ausente — pulando testes Deno."
fi

# Desfaz o "intent to add" do início (item 3/4) para não deixar efeito
# colateral no índice do git além do que este script de diagnóstico deveria
# ter: o status final deve voltar a mostrar "??" para arquivos novos, como
# estava antes de rodar este script.
git -C "$WORKTREE_DIR" reset >/dev/null 2>&1 || true

echo ""
echo "== 8. git status --short final ($WORKTREE_DIR) =="
git -C "$WORKTREE_DIR" status --short

echo ""
if [ "$BLOCKED" -ne 0 ]; then
  echo "RESULTADO: BLOQUEADO — corrija os itens marcados acima antes de prosseguir." >&2
  exit 1
fi
echo "RESULTADO: nenhuma verificação de segurança bloqueou. Lint/build/testes acima podem ter avisos — revise manualmente."
exit 0
