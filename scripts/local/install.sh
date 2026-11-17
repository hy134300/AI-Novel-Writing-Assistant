#!/usr/bin/env bash
# 安装本地工作流命令。新机器 clone 后执行一次即可。
# 用法：bash scripts/local/install.sh
set -uo pipefail

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "当前目录不是 git 仓库。" >&2
  exit 1
fi

git config alias.sync '!f(){ test -f scripts/local/git-sync-official.sh || { echo "只在 local/patch 分支可用，先执行 git switch local/patch"; exit 1; }; bash scripts/local/git-sync-official.sh; }; f'
git config alias.save '!f(){ test -f scripts/local/git-save.sh || { echo "只在 local/patch 分支可用，先执行 git switch local/patch"; exit 1; }; bash scripts/local/git-save.sh "$@"; }; f'
git config alias.syncmain '!f(){ cur=$(git branch --show-current); git fetch upstream --prune --tags || return 1; git switch main || return 1; git merge --ff-only upstream/main || return 1; git push origin main; [ "$cur" != "main" ] && git switch "$cur"; return 0; }; f'

echo "已安装：git save / git sync / git syncmain"
echo "常驻补丁分支：git switch local/patch"
