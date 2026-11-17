#!/usr/bin/env bash
# 一条命令完成：提交 + 同步官方 + 推送到自己的 fork。
# 用法：git save "提交说明"
#
# 顺序刻意是「先提交、再 rebase、最后推」而不是「先拉再提交」：
# rebase 要求工作区干净，未提交的改动会让它直接拒绝执行。
# 先落一个本地 commit，rebase 就能把你的改动搬到最新官方基线上，效果等价。
set -uo pipefail

BRANCH="local/patch"
GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; DIM=$'\033[2m'; NC=$'\033[0m'

info() { printf '%s\n' "$*"; }
ok()   { printf '%s%s%s\n' "$GREEN" "$*" "$NC"; }
warn() { printf '%s%s%s\n' "$YELLOW" "$*" "$NC"; }
err()  { printf '%s%s%s\n' "$RED" "$*" "$NC" >&2; }

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { err "当前目录不是 git 仓库。"; exit 1; }

if [ $# -lt 1 ] || [ -z "${1// }" ]; then
  err "缺少提交说明。"
  info "用法：git save \"local: 改了什么\""
  exit 1
fi
msg="$1"

current=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
if [ "$current" != "$BRANCH" ]; then
  err "当前在 ${current:-detached HEAD}，不是 $BRANCH。"
  info "先执行：git switch $BRANCH"
  exit 1
fi

# ── 1. 提交 ──────────────────────────────────────────────
git add -A
if git diff --cached --quiet; then
  warn "没有可提交的改动，跳过提交，只做同步。"
  committed=0
else
  info "将提交以下改动："
  git diff --cached --name-status | sed 's/^/  /'
  info ""
  if ! git commit -m "$msg"; then
    err "提交失败（可能被 git hook 拒绝），已中止。"
    exit 1
  fi
  committed=1
  ok "已提交。"
fi

# ── 2. 同步官方 ──────────────────────────────────────────
info ""
info "── 同步官方 ──"
if ! bash "$ROOT/scripts/local/git-sync-official.sh"; then
  err "同步失败，改动仍在本地 commit 里，未推送。"
  info "处理完冲突后再执行：git save \"$msg\"  或  git push --force-with-lease origin $BRANCH"
  exit 1
fi

# ── 3. 推送 ──────────────────────────────────────────────
info ""
info "── 推送到 fork ──"
if git push --force-with-lease origin "$BRANCH"; then
  ok "已推送到 origin/$BRANCH。"
  info "${DIM}https://github.com/hy134300/AI-Novel-Writing-Assistant/tree/$BRANCH${NC}"
else
  err "推送失败。若是 --force-with-lease 拒绝，说明远端有别人的新提交，先 git fetch origin 看一眼。"
  exit 1
fi

info ""
if [ "$committed" = "1" ]; then
  ok "完成：已提交、已同步官方、已推送。"
else
  ok "完成：无新改动，已同步官方。"
fi
