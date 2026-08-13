#!/usr/bin/env bash
set -uo pipefail
# (não usa 'set -e': o script precisa rodar todas as checagens e reportar o
# conjunto antes de decidir bloquear, não abortar na primeira checagem.)

# check-environment.sh <worktree_dir>
#
# Checagem de pré-voo obrigatória ANTES de qualquer Passo 0 (criação de
# worktree) ou chamada a review-plan.sh/implement-plan.sh. Nasceu do
# incidente de 2026-08-12 (ver docs/PRODUCTION-RUNBOOK.md, seção "Casos de
# aprendizado"): outra sessão de agente, rodando com permissão automática e
# cwd diretamente no repositório principal, escreveu 7 migrations não
# rastreadas ali, sem passar por nenhum worktree isolado. Nada nesta skill
# impedia isso, porque a skill só valida o worktree que ELA MESMA usa — não
# o ambiente ao redor.
#
# Este script SEMPRE bloqueia (exit != 0) se:
#   1. O worktree_dir informado (ou o cwd atual do shell) resolver para o
#      diretório do repositório principal.
#   2. Existir outro processo `claude`/`codex` com cwd real (via /proc/<pid>/cwd)
#      dentro do repositório principal e rodando em modo de aprovação
#      automática (--permission-mode auto, --yolo, --dangerously-*, etc.).
#
# Não mata processo nenhum, não altera nada — só lê e reporta.

usage() {
  echo "Uso: $0 <worktree_dir>" >&2
  exit 1
}

WORKTREE_DIR="${1:-}"
[ -n "$WORKTREE_DIR" ] || usage

MAIN_REPO_DIR="${MAIN_REPO_DIR:-/opt/x1zap/zapx1cloud}"
MAIN_REPO_REAL="$(cd "$MAIN_REPO_DIR" 2>/dev/null && pwd || echo "$MAIN_REPO_DIR")"

BLOCKED=0

echo "== 1. worktree_dir/$WORKTREE_DIR não pode ser o repositório principal =="
if [ -d "$WORKTREE_DIR" ]; then
  WORKTREE_REAL="$(cd "$WORKTREE_DIR" && pwd)"
  if [ "$WORKTREE_REAL" = "$MAIN_REPO_REAL" ]; then
    echo "BLOQUEADO: worktree_dir aponta para o repositório principal ($MAIN_REPO_DIR)." >&2
    BLOCKED=1
  else
    echo "OK: $WORKTREE_REAL != $MAIN_REPO_REAL"
  fi
else
  echo "AVISO: worktree_dir ainda não existe (ok se for antes do Passo 0 — só é criado depois)."
fi

echo ""
echo "== 2. cwd atual do shell não pode ser o repositório principal =="
CWD_REAL="$(pwd)"
if [ "$CWD_REAL" = "$MAIN_REPO_REAL" ]; then
  echo "BLOQUEADO: o shell atual está com cwd no repositório principal ($MAIN_REPO_DIR). Todo comando de escrita desta skill deve rodar com cwd dentro de /tmp/crm-agent-runs/<nome>." >&2
  BLOCKED=1
else
  echo "OK: cwd atual = $CWD_REAL"
fi

echo ""
echo "== 3. outras sessões Claude/Codex ativas, e se alguma tem cwd no repo principal em modo automático =="
FOUND_CONCURRENT=0
# Definição de padrão (mesma convenção *_PATTERN= usada nos demais scripts desta
# skill) para reconhecer modo de aprovação automática em um cmdline de terceiros.
# Isso é DETECÇÃO de uso alheio, nunca invocação real por este script.
AUTO_MODE_PATTERN='(--permission-mode[[:space:]]+auto|--yolo|--dangerously-[a-z-]*|danger-full-access)'
# Lista PIDs de processos cujo cmdline comece com "claude" ou "codex".
for pid in $(pgrep -f '^(claude|codex)( |$)' 2>/dev/null); do
  [ -d "/proc/$pid" ] || continue
  CMD="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  [ -n "$CMD" ] || continue
  PROC_CWD="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || echo "?")"
  START="$(ps -o lstart= -p "$pid" 2>/dev/null | xargs || echo "?")"
  IS_MAIN_REPO="não"
  IS_AUTO="não"
  [ "$PROC_CWD" = "$MAIN_REPO_REAL" ] && IS_MAIN_REPO="sim"
  echo "$CMD" | grep -Eiq "$AUTO_MODE_PATTERN" && IS_AUTO="sim"
  echo "  PID $pid | cwd=$PROC_CWD | repo_principal=$IS_MAIN_REPO | modo_automatico=$IS_AUTO | inicio=$START | cmd=$CMD"
  if [ "$IS_MAIN_REPO" = "sim" ] && [ "$IS_AUTO" = "sim" ]; then
    FOUND_CONCURRENT=1
  fi
done
if [ "$FOUND_CONCURRENT" -eq 1 ]; then
  echo "BLOQUEADO: há pelo menos um agente ativo, em modo automático, com cwd no repositório principal. Não prossiga sem confirmar coordenação com essa sessão (ver docs/PRODUCTION-RUNBOOK.md, seção 'Casos de aprendizado')." >&2
  BLOCKED=1
else
  echo "OK: nenhum agente concorrente em modo automático com cwd no repositório principal."
fi

echo ""
if [ "$BLOCKED" -ne 0 ]; then
  echo "RESULTADO: BLOQUEADO — resolva os itens acima antes de criar worktree ou chamar review-plan.sh/implement-plan.sh." >&2
  exit 1
fi
echo "RESULTADO: ambiente OK para prosseguir com o Passo 0 (criação de worktree isolado)."
exit 0
