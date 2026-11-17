#!/usr/bin/env bash
# 同步官方更新并 rebase 本地补丁分支。
# 用法：git sync
#
# 只做三件事：拉 upstream → 检查工作区 → rebase local/patch。
# 不提交、不推送，便于 rebase 后先跑一遍项目再看结果。
set -uo pipefail

BRANCH="local/patch"
UPSTREAM_REF="upstream/main"

GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; DIM=$'\033[2m'; NC=$'\033[0m'

info() { printf '%s\n' "$*"; }
ok()   { printf '%s%s%s\n' "$GREEN" "$*" "$NC"; }
warn() { printf '%s%s%s\n' "$YELLOW" "$*" "$NC"; }
err()  { printf '%s%s%s\n' "$RED" "$*" "$NC" >&2; }

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  err "当前目录不是 git 仓库。"
  exit 1
fi

current=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
if [ "$current" != "${BRANCH}" ]; then
  err "当前在 ${current:-detached HEAD}，不是 ${BRANCH}。"
  info "先执行：git switch ${BRANCH}"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  err "工作区有未提交改动，rebase 前必须先处理干净。"
  git status --short | head -20
  info ""
  info "要么提交（git save \"说明\"），要么暂存（git stash）。"
  exit 1
fi

info "拉取官方更新…"
if ! git fetch upstream --prune --tags --quiet; then
  err "git fetch upstream 失败，检查网络或代理（本仓库配置的是 127.0.0.1:7897）。"
  exit 1
fi

if git merge-base --is-ancestor "$UPSTREAM_REF" HEAD; then
  ok "已包含最新官方提交，无需 rebase。"
  exit 0
fi

behind=$(git rev-list --count "HEAD..$UPSTREAM_REF")
info "官方新增 $behind 个提交，开始 rebase…"

if git rebase "$UPSTREAM_REF"; then
  ok "rebase 完成。"
  info "${DIM}改动已搬到最新官方基线上，commit hash 变了。${NC}"
  info "${DIM}推送到 fork：git push --force-with-lease origin ${BRANCH}${NC}"
else
  warn "rebase 遇到冲突，需要你手动解决。"
  info ""
  git status --short | head -20
  info ""
  info "解决后：git add <文件> && git rebase --continue"
  info "放弃：  git rebase --abort"
  exit 1
fi
