# 本地补丁工作流

这套命令用于长期维护 `local/patch` 分支上的自定义修改，同时跟随官方更新。

## 三个命令

| 命令 | 作用 |
|---|---|
| `git save "说明"` | **日常就用这个**：提交 → 同步官方 → 推送到自己的 fork |
| `git sync` | 只同步官方并 rebase，不提交不推送（想先跑一遍测试时用） |
| `git syncmain` | 把本地 `main` 更新到官方最新，并推到自己的 fork |

## 为什么是「先提交再拉」

`git rebase` 要求工作区干净，未提交的改动会被直接拒绝。所以 `git save` 的顺序是
**先落一个本地 commit → 再 rebase 到最新官方基线 → 最后推送**，效果等价于「提交前先拉」，
但不会因为工作区脏而卡住。

## 日常流程

```bash
git switch local/patch          # 改动永远在这条分支上做
# ……改代码……
git save "local: 改了什么"
```

## 跟官方更新（不动本地改动时）

```bash
git syncmain                    # 更新 main + 推到 fork
git sync                        # 把 local/patch rebase 到最新官方
git push --force-with-lease origin local/patch
```

## 遇到 rebase 冲突

```bash
# 解决冲突文件后
git add <文件>
git rebase --continue

# 或者直接放弃，回到 rebase 之前
git rebase --abort
```

冲突只会出现在你真正改过的文件里（目前是 `server/src/llm/connectivity.ts`）。
解决一次之后 `rerere` 会记住解法，同样的冲突下次自动套用（本仓库已开启）。

## 换机器后恢复这套命令

clone 下来先切到补丁分支，然后执行一次：

```bash
git switch local/patch
bash scripts/local/install.sh
```

## 网络与认证（本机特有，别处可能要改）

- 代理：`127.0.0.1:7897`，已写进本仓库 `http.proxy` / `https.proxy`
- 必须 `http.version=HTTP/1.1`，否则走代理会报 `HTTP2 framing layer` 错误
- SSH 走 `/Users/hy/.ssh/id_ed25519`，`core.sshCommand` 里带 `ProxyCommand` 走 7897

这些都在本仓库的 `.git/config` 里，不污染全局配置。

## 分支结构

```
upstream/main   官方
      │
      ├── main              跟随官方，只做 fast-forward
      │
      └── local/patch       你的所有改动（commit 前缀统一 local:）
```

`origin` 指向自己的 fork，`upstream` 指向官方仓库。
**注意：`git pull` 拉的是自己的 fork，不是官方。跟官方同步必须显式写 `upstream`。**
