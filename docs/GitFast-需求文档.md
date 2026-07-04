# GitFast 工具需求文档

> 创建日期：2026-06-27
> 最后更新：2026-06-27
> 状态：**P0 已实现**，P1/P2 待迭代（Timer 已移除，定时执行统一由 Script Runner 承担）
> 所属应用：AllInOne（Tauri 2.0 + Vue 3）

---

## 一、背景与痛点

用户在多个 Git 仓库间频繁切换，执行的命令大多是固定的几类（同步、状态查看、分支操作、提交），但：

1. **记不住命令**：每次都要去查，效率低
2. **多仓库切换繁琐**：每个仓库都要手动 `cd`、敲命令
3. **执行过程不可见**：纯按钮触发看不到 git 输出，出错难诊断
4. **批量操作无支持**：N 个仓库要重复 N 次相同动作
5. **清单同步也要 git**：之前计划在清单工具做 Git 按钮，但既然 GitFast 能覆盖所有 git 场景，统一到 GitFast 更合理

## 二、目标

在 AllInOne 应用内提供「GitFast」工具，实现：

- **多仓库管理**：集中管理本地仓库列表，支持分组
- **命令模板**：内置常用动作流模板 + 用户自定义扩展
- **批量执行**：多仓库并行执行同一动作流
- **真实终端**：内嵌 xterm.js 终端，完整可见命令执行过程
- **单条执行**：支持直接输入任意 git 命令独立执行
- **配置文件驱动**：所有功能支持配置文件覆盖，灵活度高
- **统一 Git 入口**：清单仓库的 push/pull 也通过 GitFast 完成，不在清单工具单独做 Git 按钮

## 三、用户确认的需求边界

经与用户确认（2026-06-27）：

| 维度 | 用户选择 |
|---|---|
| 命令类型 | 同步类、状态查看类、分支操作类、提交类（含清单提交） |
| 执行模式 | 两者都要：单条独立执行 + 动作流组合执行 |
| 批量能力 | 支持批量并行执行，上限默认 5 |
| 模板灵活度 | 预设固定模板 + 可自定义扩展 + 配置文件驱动 |
| 仓库分组 | 支持分组 |
| 终端多 tab | 不需要（每仓库固定一个终端） |
| 仓库选择方式 | 仅预配置列表（配置文件驱动），不做临时打开文件夹 |
| 配置文件 | 可选加载，不固定一个，覆盖默认 |
| 配置格式 | YAML（可读性优先，支持注释） |
| 配置回写 | 不需要导出功能，修改配置直接改配置文件 |
| 清单 Git 按钮 | 不做，统一用 GitFast |

## 四、功能需求

### F1. 仓库管理

#### F1.1 预配置仓库列表（配置驱动）

| 编号 | 需求 | 优先级 |
|---|---|---|
| F1.1.1 | 仓库列表来自配置文件（默认配置 + 用户加载的配置覆盖） | P0 |
| F1.1.2 | 仓库字段：id、name、path、groupId | P0 |
| F1.1.3 | 添加仓库：选择文件夹，自动识别 `.git`，填写名称、选择分组 | P0 |
| F1.1.4 | 删除仓库（仅从列表移除，不删实际文件） | P0 |
| F1.1.5 | 仓库列表持久化（localStorage 存运行时修改） | P0 |
| F1.1.6 | 显示仓库当前分支、改动文件数、ahead/behind 数 | P1 |
| F1.1.7 | 仓库重命名（仅列表显示名） | P2 |

#### F1.2 临时打开文件夹（已砍掉）

> 原计划作为双轨制辅助入口，允许用户临时选择文件夹开终端。但既然已有配置文件预设仓库列表，此功能实用性低，**暂不实现**。若未来有需求再补充。

### F2. 仓库分组

| 编号 | 需求 | 优先级 |
|---|---|---|
| F2.1 | 分组来自配置文件（默认 + 用户覆盖） | P0 |
| F2.2 | 仓库列表按分组折叠展示 | P0 |
| F2.3 | 分组可展开/收起，状态持久化 | P1 |
| F2.4 | 添加仓库时可选分组 | P0 |
| F2.5 | 分组支持批量勾选（勾选分组 = 勾选组内所有仓库） | P1 |

### F3. 命令模板

#### F3.1 预设模板（内置默认，可被配置文件覆盖）

| 模板 ID | 名称 | 动作流 | 参数 | 说明 |
|---|---|---|---|---|
| `sync` | 同步 | `git pull` → `git push` | 无 | 拉取并推送 |
| `fetch` | 获取 | `git fetch --all --prune` | 无 | 拉取远程引用不合并 |
| `status` | 状态 | `git status` | 无 | 查看工作区状态 |
| `log` | 日志 | `git log --oneline -20` | 无 | 最近 20 条提交 |
| `branch-list` | 分支列表 | `git branch -a` | 无 | 列出本地+远程分支 |
| `branch-switch` | 切换分支 | `git checkout {branch}` | `{branch}` | 下拉选择分支 |
| `pull-branch` | 拉取分支 | `git pull origin {branch}` | `{branch}` | 下拉选择远程分支 |
| `rebase-branch` | 变基分支 | `git fetch origin {branch}` → `git rebase origin/{branch}` | `{branch}` | 下拉选择目标分支 |
| `stash` | 暂存 | `git stash` | 无 | 暂存当前改动 |
| `commit-checklist` | 提交清单 | `git add -A` → `git commit -m "sync checklist {date}"` → `git push` | `{date}` 自动填当天 | 替代原计划的清单 Git 按钮 |

> 预设模板不可删除，但可被配置文件同名模板覆盖行为。

#### F3.2 参数输入方式

| 参数来源 | 行为 | 适用 |
|---|---|---|
| `branch-list` | 执行前调 `git branch -a` 拿分支列表，渲染下拉框（combobox，可手动输入兜底） | branch-switch、pull-branch、rebase-branch |
| `today` | 自动填入当天日期 `YYYY-MM-DD`，无需用户输入 | commit-checklist |
| `prompt` | 弹窗输入任意文本 | 自定义模板的任意占位符 |
| `none` | 无参数 | sync、fetch、status 等 |

#### F3.3 自定义模板

| 编号 | 需求 | 优先级 |
|---|---|---|
| F3.3.1 | 用户可新建模板：名称 + 命令序列 + 参数定义 | P0 |
| F3.3.2 | 支持占位符 `{branch}`、`{date}`、`{input}` 等 | P1 |
| F3.3.3 | 模板持久化（localStorage + 可导出到配置文件） | P0 |
| F3.3.4 | 编辑、删除自定义模板 | P0 |
| F3.3.5 | 模板导入/导出 JSON | P2 |

### F4. 执行模式

#### F4.1 单条命令执行

| 编号 | 需求 | 优先级 |
|---|---|---|
| F4.1.1 | 终端下方提供命令输入框，回车执行 | P0 |
| F4.1.2 | 执行时自动 `cd` 到当前仓库目录 | P0 |
| F4.1.3 | 命令历史记录（上下键翻阅，持久化） | P1 |
| F4.1.4 | 只允许 git 命令（白名单：`git`/`git-` 开头），防误操作 | P1 |

#### F4.2 动作流执行

| 编号 | 需求 | 优先级 |
|---|---|---|
| F4.2.1 | 点击模板按钮一键执行整条动作流 | P0 |
| F4.2.2 | 动作流在终端中以 `&&` 串联写入，前序失败则停止 | P0 |
| F4.2.3 | 执行中按钮禁用，显示执行状态 | P0 |
| F4.2.4 | 动作流执行前在终端打印分隔线 + 模板名 | P1 |
| F4.2.5 | 带参数模板执行前先弹下拉框选参数 | P0 |

### F5. 批量执行

| 编号 | 需求 | 优先级 |
|---|---|---|
| F5.1 | 仓库列表支持多选（checkbox） | P0 |
| F5.2 | 选中 ≥2 个仓库时，模板按钮变为"批量执行" | P0 |
| F5.3 | 批量执行时每个仓库开一个 PTY 并行运行 | P0 |
| F5.4 | 批量执行结果汇总显示：每个仓库的成功/失败状态 | P0 |
| F5.5 | 批量执行进度条：`3/5 仓库完成` | P1 |
| F5.6 | 批量执行中可取消（已完成的不可撤销） | P1 |
| F5.7 | 最大并行数可配置（默认 5，配置文件 settings.maxParallel） | P0 |
| F5.8 | 超出并行数的仓库排队等待 | P1 |

### F6. 内嵌终端

#### F6.1 技术方案

- **前端**：xterm.js + xterm-addon-fit（自适应尺寸）
- **后端**：portable-pty crate 创建伪终端
- **Shell**：Windows 下调用 Git Bash（`C:\Program Files\Git\bin\bash.exe` 或 PATH 中的 `bash`）
- **通信**：Rust 读 PTY 输出 → Tauri emit → xterm 写入；xterm 输入 → invoke → Rust 写 PTY

#### F6.2 功能需求

| 编号 | 需求 | 优先级 |
|---|---|---|
| F6.2.1 | 终端随窗口缩放自适应（fit addon） | P0 |
| F6.2.2 | 终端区域支持主题色（跟随应用深浅色） | P0 |
| F6.2.3 | 终端输出持久化：切换仓库时保留各自输出 | P1 |
| F6.2.4 | 清屏按钮 | P0 |
| F6.2.5 | 复制选中文本（xterm 默认支持） | P0 |
| F6.2.6 | 粘贴（Ctrl+V） | P1 |
| F6.2.7 | 每仓库固定一个终端（不开多 tab） | P0 |

#### F6.3 体积影响分析

| 项 | 增量 | 说明 |
|---|---|---|
| xterm.js JS 包 | +500KB（gzip 后 ~130KB） | 作为嵌入资源打包进应用，不影响安装包体积 |
| xterm CSS | +50KB | |
| portable-pty Rust crate | +200-500KB 编译后 | 静态链接进二进制 |
| js-yaml JS 包 | +100KB（gzip ~30KB） | YAML 解析 |
| **总体影响** | **安装包 ~0KB 增量**，JS bundle 从 87KB → ~700KB | Tauri 安装包体积主要来自 Rust 二进制 + WebView2 运行时 |

> 结论：体积增量可接受，换取真实终端体验 + YAML 可读配置值得。

### F7. 配置文件系统

#### F7.1 设计原则

- **所有功能可配置**：预设模板、仓库列表、分组、设置项均可在配置文件中定义
- **默认值兜底**：代码内置默认配置，确保开箱即用
- **配置文件可选加载**：不固定一个文件，用户通过系统对话框选择
- **不回写配置文件**：UI 修改存 localStorage，配置文件保持用户手写纯净
- **不需要导出功能**：用户修改配置直接改配置文件，不通过 UI 导出
- **YAML 格式**：可读性优先，支持注释，适合人手维护

#### F7.2 配置格式选型结论

经对比 JSON / JSON5 / YAML / TOML，**选择 YAML**，理由：

| 格式 | 可读性 | 注释 | 多行字符串 | 前端解析 | 结论 |
|---|---|---|---|---|---|
| JSON | 差 | ❌ | ❌ | 原生 | 配置多时维护痛苦 |
| JSON5 | 良 | ✅ | ✅ | 需库 | 仍括号嵌套，仓库多时难读 |
| **YAML** | **优** | **✅** | **✅** | js-yaml | **缩进结构清晰，配置场景事实标准** |
| TOML | 良 | ✅ | ❌ | 需库 | 表结构表达层级略笨拙 |

YAML 的核心优势：
1. 缩进表示层级，无括号噪音，人眼易读
2. `#` 注释可解释每个仓库/模板用途
3. `|` 块标量写 shell 命令无需转义
4. Docker Compose / GitHub Actions / CI 配置都用 YAML，用户熟悉度高

#### F7.3 三层配置覆盖

```
1. 代码内置默认配置（不可变，兜底）
       ↓ 被覆盖
2. 用户加载的配置文件（可选，覆盖默认）
       ↓ 被覆盖
3. localStorage 运行时状态（UI 上的临时修改）
```

合并策略：深合并，配置文件中的同名字段覆盖默认值，localStorage 的运行时修改覆盖配置文件。

**关于运行时修改与配置文件的同步**：

- UI 上的"添加仓库""删除仓库"等操作改的是 localStorage 运行时层
- 用户想永久保存 → 直接编辑配置文件（应用不代劳）
- 应用重启 → 重新加载配置文件 + 应用 localStorage 修改
- 若用户希望 localStorage 修改也进配置文件 → 手动同步（复制 localStorage 数据到 YAML）

> 设计权衡：不做自动回写是为了保持配置文件的"用户权威性"——用户手写的配置不被程序悄悄修改。代价是用户需手动维护配置文件，但对开发者/重度用户而言这是优势。

#### F7.4 配置文件格式（YAML）

```yaml
# GitFast 配置文件
# 说明：修改本文件后重启应用生效

version: 1

# 全局设置
settings:
  maxParallel: 5      # 批量执行最大并行数
  shell: bash         # Shell 类型（预留，目前固定 bash）

# 仓库分组
groups:
  - id: work
    name: 工作
  - id: personal
    name: 个人

# 仓库列表
repositories:
  - id: repo1
    name: 项目A
    path: D:/projects/project-a
    groupId: work          # 归属"工作"分组
  - id: checklist
    name: 清单
    path: D:/Jesse/allinone
    groupId: personal      # 清单仓库放这里，用 commit-checklist 模板提交

# 命令模板
templates:
  # 同步：拉取并推送
  - id: sync
    name: 同步
    commands:
      - git pull
      - git push
    description: 拉取并推送

  # 拉取特定分支（合并到当前分支）
  - id: pull-branch
    name: 拉取分支
    commands:
      - git pull origin {branch}
    description: 拉取指定远程分支
    params:
      - key: branch
        source: branch-list   # 执行时下拉选分支

  # 变基到特定分支
  - id: rebase-branch
    name: 变基分支
    commands:
      - git fetch origin {branch}
      - git rebase origin/{branch}
    description: 变基到指定远程分支
    params:
      - key: branch
        source: branch-list

  # 提交清单（替代原计划的清单 Git 按钮）
  - id: commit-checklist
    name: 提交清单
    commands:
      - git add -A
      - git commit -m "sync checklist {date}"
      - git push
    description: 用默认消息提交并推送清单改动
    params:
      - key: date
        source: today          # 自动填当天日期，无需用户输入
```

#### F7.5 功能需求

| 编号 | 需求 | 优先级 |
|---|---|---|
| F7.5.1 | "加载配置文件"按钮，调用系统文件选择对话框选 YAML | P0 |
| F7.5.2 | 加载后用 js-yaml 解析 + 深合并，UI 刷新 | P0 |
| F7.5.3 | 配置文件路径持久化（localStorage 存"上次加载路径"） | P0 |
| F7.5.4 | 应用启动时自动加载上次的配置文件 | P0 |
| F7.5.5 | "最近使用配置文件"列表（最多 5 个），快速切换 | P1 |
| F7.5.6 | 配置文件格式校验 + 友好错误提示（YAML 语法错标行号） | P0 |
| F7.5.7 | 配置文件版本号校验（version 字段），不兼容时提示 | P1 |
| F7.5.8 | 提供"打开配置文件所在目录"按钮，方便用户用外部编辑器修改 | P1 |

### F8. 工具切换

| 编号 | 需求 | 优先级 |
|---|---|---|
| F8.1 | Toolbar 加工具切换器：清单 / GitFast 两个 tab | P0 |
| F8.2 | 切换时保留各工具状态（清单保留当前文件，GitFast 保留终端） | P0 |
| F8.3 | 当前工具高亮显示 | P0 |
| F8.4 | 工具切换无动画延迟（v-show 而非 v-if） | P1 |

> **F9 Timer 已移除**：定时执行需求统一由独立的 Script Runner 工具承担（见 [ScriptRunner-需求文档.md](./ScriptRunner-需求文档.md)），GitFast 专注于单仓库交互式操作。

## 五、非功能需求

| 项 | 要求 |
|---|---|
| 性能 | 单仓库命令执行响应 < 100ms；批量并行不阻塞 UI |
| 兼容性 | Windows 10/11 优先，需用户预装 Git for Windows |
| 安全性 | 单条命令白名单仅允许 `git` 开头；PTY 模式信任用户输入 |
| 持久化 | 仓库列表、模板、命令历史、配置文件路径均存 localStorage |
| 配置兼容 | 配置文件版本号机制，未来升级向后兼容 |

## 六、技术方案

### 6.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│           Tauri 主窗口 (WebView)                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Toolbar: [📋 清单] [⚡ GitFast]  [📁配置]  🌙│  │
│  ├───────────────────────────────────────────────┤  │
│  │  GitFast 视图:                                │  │
│  │  ┌─────────────┬─────────────────────────┐    │  │
│  │  │ 仓库列表    │  xterm.js 终端           │    │  │
│  │  │ ── 工作 ──  │  Terminal - repo1 (main) │    │  │
│  │  │ ☑ repo1     │  $ git status            │    │  │
│  │  │   main ●3   │  On branch main          │    │  │
│  │  │ ☑ repo2     │  ...                     │    │  │
│  │  │ ── 个人 ──  │                          │    │  │
│  │  │ ☐ 清单      │  $ _                     │    │  │
│  │  │   main ●2   │                          │    │  │
│  │  │             │                          │    │  │
│  │  │ [+ 添加仓库]│                          │    │  │
│  │  ├─────────────┴─────────────────────────┤    │  │
│  │  │ 模板: [↻sync] [⬇fetch] [📋status]      │    │  │
│  │  │ [📜log] [🔀branch] [⬇pull-branch]     │    │  │
│  │  │ [⤴rebase] [📦stash] [📝commit-checklist│    │  │
│  │  │ [+自定义]                              │    │  │
│  │  ├────────────────────────────────────────┤    │  │
│  │  │ > git ___________  [↑历史] [↩执行]     │    │  │
│  │  └────────────────────────────────────────┘    │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                    │ invoke / emit
                    ▼
┌─────────────────────────────────────────────────────┐
│            Rust 后端 (lib.rs)                        │
│  ┌─────────────────────────────────────────────┐    │
│  │  gitfast 模块:                              │    │
│  │  - pty_spawn(repo) → session_id             │    │
│  │  - pty_write(session, data)                 │    │
│  │  - pty_resize(session, cols, rows)          │    │
│  │  - pty_kill(session)                        │    │
│  │  - git_exec(repo, args) → output            │    │  ← 非交互命令（status/log/branch-list）
│  │  - git_branch_list(repo) → Vec<String>      │    │  ← 下拉框数据源
│  │  - git_status_batch(repos) → Vec<Status>    │    │  ← 批量状态查询
│  │  ┌───────────────────────────────┐          │    │
│  │  │  PTY 池                       │          │    │
│  │  │  session1: bash -l            │          │    │
│  │  │  session2: bash -l            │          │    │
│  │  │  (每仓库一个 PTY)             │          │    │
│  │  └───────────────────────────────┘          │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 6.2 关键技术选型

| 层 | 技术 | 版本 | 用途 |
|---|---|---|---|
| 终端前端 | @xterm/xterm | ^5.3.0 | 终端渲染 |
| 终端自适应 | @xterm/addon-fit | ^0.8.0 | 尺寸适配 |
| 终端后端 | portable-pty | ^0.8 | Rust PTY 跨平台 |
| Shell | Git Bash (Windows) | — | bash -l 登录 shell |
| 状态命令 | std::process::Command | std | git status 等非交互命令 |
| 配置文件 | YAML | — | js-yaml 解析，可读性优先 |
| 配置解析 | js-yaml | ^4.1.0 | 前端 YAML 解析 |

### 6.3 PTY 通信协议

**前端 → Rust（invoke）**：
```ts
invoke('gitfast_pty_spawn', { repoPath }) → { sessionId }
invoke('gitfast_pty_write', { sessionId, data })
invoke('gitfast_pty_resize', { sessionId, cols, rows })
invoke('gitfast_pty_kill', { sessionId })
invoke('gitfast_branch_list', { repoPath }) → { branches: string[] }
invoke('gitfast_repo_status', { repoPath }) → { branch, changes, ahead, behind }
```

**Rust → 前端（emit）**：
```ts
listen('gitfast_pty_output', ({ sessionId, data }) => xterm.write(data))
listen('gitfast_pty_exit', ({ sessionId, code }) => ...)
```

### 6.4 配置文件加载流程

```
应用启动
  ↓
1. 加载代码内置默认配置（DEFAULT_CONFIG）
  ↓
2. 读 localStorage "lastConfigPath"
  ├─ 有 → 读取该 YAML 文件 → js-yaml 解析 → 深合并覆盖默认配置
  └─ 无 → 仅用默认配置
  ↓
3. 读 localStorage 运行时修改（用户在 UI 上新增的仓库/模板等）
  ↓
4. 深合并 → 最终生效配置
  ↓
5. 渲染 GitFast 视图
```

**用户点"加载配置文件"**：
```
系统文件对话框 → 选 YAML → js-yaml 解析 + 校验 → 深合并 → 刷新 UI
  → localStorage 存 lastConfigPath
  → 加入"最近使用"列表
```

### 6.5 批量执行流程

```
用户选中 [repo1, repo2, repo3] → 点 [sync] 模板
  ↓
前端检查参数：sync 无参数，直接执行
  ↓
为每个仓库复用各自 PTY
  ↓
对每个 PTY 并行写入: cd <repo> && git pull && git push
  ↓
受 maxParallel 限制，超出部分排队
  ↓
三个 PTY 同时输出 → 汇总面板显示:
  repo1: ✓ sync 完成 (3.2s)
  repo2: ✓ sync 完成 (4.1s)
  repo3: ✗ push 失败: rejected (5.0s)
  ↓
进度条: 3/3 完成
```

**带参数模板的批量执行**（如 pull-branch）：
```
用户选中 [repo1, repo2] → 点 [pull-branch]
  ↓
弹下拉框选分支（combobox，可手动输入）
  ↓
对每个仓库 PTY 写入: cd <repo> && git pull origin <选中的分支>
  ↓
并行执行 + 汇总
```

**`commit-checklist` 模板执行**（替代原清单 Git 按钮）：
```
用户选中"清单"仓库 → 点 [commit-checklist]
  ↓
{date} 参数自动填入当天日期（如 2026-06-27），无需用户输入
  ↓
PTY 写入: cd <清单仓库> && git add -A && git commit -m "sync checklist 2026-06-27" && git push
  ↓
终端可见完整执行过程，失败时可见具体错误
```

## 七、UI 草图

```
┌──────────────────────────────────────────────────────┐
│ [📋 清单] [⚡ GitFast]          [📁配置]  🌙          │
├──────────────────────────────────────────────────────┤
│ ┌─────────────┬──────────────────────────────────┐  │
│ │ 仓库        │ Terminal - repo1 (main)          │  │
│ │ ── 工作 ──  │ ─────────────────────────────────│  │
│ │ ☑ repo1     │ $ git status                     │  │
│ │   main ●3   │ On branch main                   │  │
│ │ ☑ repo2     │ Your branch is up to date.       │  │
│ │   dev  ●0   │                                  │  │
│ │ ── 个人 ──  │ Changes not staged:              │  │
│ │ ☐ 清单      │   modified: 2026-06-27.md        │  │
│ │   main ●2   │                                  │  │
│ │             │ $ _                              │  │
│ │ [+ 添加仓库]│                                  │  │
│ ├─────────────┴──────────────────────────────────┤  │
│ │ 模板: [↻sync] [⬇fetch] [📋status] [📜log]      │  │
│ │ [🔀branch] [⬇pull-branch] [⤴rebase-branch]    │  │
│ │ [📦stash] [📝commit-checklist] [+自定义]       │  │
│ ├────────────────────────────────────────────────┤  │
│ │ > git ___________  [↑历史] [↩执行]            │  │
│ └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## 八、与现有清单工具的关系

### 8.1 职责划分

| 场景 | 用哪个工具 |
|---|---|
| 编辑清单 .md 文件 | 清单工具 |
| 清单改动 commit + push | **GitFast（commit-checklist 模板）** |
| 清单仓库 pull 更新 | **GitFast（sync 或 pull 模板）** |
| 多仓库同步、状态查看、分支切换 | GitFast |
| 拉取特定分支到多个仓库 | GitFast（pull-branch 模板 + 批量） |
| 查看任意仓库 git log/diff | GitFast |
| 自定义复杂命令组合 | GitFast 自定义模板 |

### 8.2 为什么砍掉清单工具的 Git 按钮

| 维度 | 原计划：清单 Git 按钮 | 现在：统一用 GitFast |
|---|---|---|
| 代码量 | +200 行（前端 UI + Rust 命令） | 0（复用 GitFast） |
| 体验 | 仅 toast 结果 | 完整终端可见 |
| 批量 | 不支持 | 支持并行 |
| 默认消息 | `sync checklist YYYY-MM-DD` | `commit-checklist` 模板的 `{date}` 自动填当天 |
| 维护成本 | 两套 Git 逻辑 | 一套 |

**结论**：GitFast 完全覆盖清单 Git 按钮的需求，且体验更好。统一入口减少代码重复和用户心智负担。

### 8.3 清单仓库的配置建议

用户在配置文件中把清单仓库加入列表，归入"个人"分组：

```yaml
repositories:
  - id: checklist
    name: 清单
    path: D:/Jesse/allinone
    groupId: personal
```

之后每次清单有改动，在 GitFast 选中"清单"仓库 → 点"提交清单"模板即可，过程完全可见。

## 九、实现优先级

### P0（MVP 第一版）— ✅ 已全部实现

1. ✅ 工具切换器（Toolbar 改造）
2. ✅ 配置文件加载（系统对话框选 YAML + js-yaml 解析）
3. ✅ 默认配置（内置 10 个模板 + 示例分组）
4. ✅ 仓库列表（配置驱动 + 分组折叠）
5. ✅ 单仓库 xterm.js 终端（spawn bash、双向通信）
6. ✅ 预设模板按钮（无参数的：sync/fetch/status/log/branch-list/stash/commit-checklist）
7. ✅ 带参数模板（branch-switch/pull-branch/rebase-branch，下拉选分支）
8. ✅ 单条命令输入执行
9. ✅ 清屏

> Timer 已移除：定时执行需求统一由 [Script Runner](./ScriptRunner-需求文档.md) 承担。

### P1（体验完善）

10. 仓库状态展示（分支、改动数、ahead/behind）
11. 命令历史记录
12. 批量多选 + 并行执行 + 结果汇总
13. 进度条 + 取消
14. 终端输出持久化（切换仓库保留）
15. "最近使用配置文件"列表
16. 分组批量勾选
17. "打开配置文件所在目录"按钮

### P2（进阶）

18. 自定义模板管理 UI
19. 仓库重命名
20. 配置文件版本号校验

## 十、风险与对策

| 风险 | 对策 |
|---|---|
| Windows 下 bash 路径找不到 | 启动时探测 `where bash`，失败提示安装 Git for Windows |
| PTY 进程泄漏（用户关应用未清理） | Tauri `on_window_event` 关闭时 kill 所有 PTY |
| xterm.js 体积偏大 | 仅按需引入 `@xterm/xterm` 核心 + fit addon，不引 web-links 等附加 |
| 批量并行 PTY 占资源 | 限制最大并行数（配置文件可调，默认 5），超出排队 |
| 用户输入非 git 命令 | 单条执行白名单过滤；PTY 模式下不限制（信任用户） |
| bash 与 PowerShell 路径风格冲突 | 统一用正斜杠，bash 内自动转换 |
| YAML 语法错误 | js-yaml 解析失败时捕获异常，提示行号 + 错误位置 |
| 配置文件路径丢失（U 盘/移动） | 加载失败时回退默认配置 + 提示用户重新选择 |
| 拉取分支时分支名不存在 | git 命令本身会报错，终端可见，用户自行修正 |
| `commit-checklist` 的 `{date}` 时区问题 | 用前端 `new Date()` 取本地日期，格式 `YYYY-MM-DD` |

## 十一、默认配置示例

应用内置的默认配置（用户未加载任何配置文件时生效）：

```yaml
version: 1

settings:
  maxParallel: 5
  shell: bash

groups:
  - id: default
    name: 默认

repositories: []  # 用户自行添加或通过配置文件加载

templates:
  - id: sync
    name: 同步
    commands:
      - git pull
      - git push
    description: 拉取并推送

  - id: fetch
    name: 获取
    commands:
      - git fetch --all --prune
    description: 拉取远程引用不合并

  - id: status
    name: 状态
    commands:
      - git status
    description: 查看工作区状态

  - id: log
    name: 日志
    commands:
      - git log --oneline -20
    description: 最近 20 条提交

  - id: branch-list
    name: 分支列表
    commands:
      - git branch -a
    description: 列出本地+远程分支

  - id: branch-switch
    name: 切换分支
    commands:
      - git checkout {branch}
    description: 切换到指定分支
    params:
      - key: branch
        source: branch-list

  - id: pull-branch
    name: 拉取分支
    commands:
      - git pull origin {branch}
    description: 拉取指定远程分支
    params:
      - key: branch
        source: branch-list

  - id: rebase-branch
    name: 变基分支
    commands:
      - git fetch origin {branch}
      - git rebase origin/{branch}
    description: 变基到指定远程分支
    params:
      - key: branch
        source: branch-list

  - id: stash
    name: 暂存
    commands:
      - git stash
    description: 暂存当前改动

  - id: commit-checklist
    name: 提交清单
    commands:
      - git add -A
      - git commit -m "sync checklist {date}"
      - git push
    description: 用默认消息提交并推送清单改动
    params:
      - key: date
        source: today
```
