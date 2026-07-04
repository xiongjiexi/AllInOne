# Script Runner 工具需求文档

> 创建日期：2026-06-27
> 最后更新：2026-06-27
> 状态：**P0 已实现**，P1/P2 待迭代
> 所属应用：AllInOne（Tauri 2.0 + Vue 3）

---

## 一、背景与痛点

用户需要定时执行指定路径的脚本（如 .sh / .bat），典型场景：每日自动拉取某个目录下的所有 git 仓库、定时执行构建脚本等。痛点：

1. **Windows 任务计划程序难用**：配置繁琐，跨平台不统一
2. **执行过程不可见**：纯定时跑完只看最终结果，中间输出丢失
3. **历史难追溯**：执行过什么、成功失败多少、具体输出，没有记录
4. **脚本文件散落各处**：bat / sh 脚本没有统一入口管理

## 二、目标

在 AllInOne 应用内提供「Script Runner」工具，实现：

- **配置文件驱动**：YAML 配置文件描述任务（脚本路径、工作目录、定时规则）
- **定时执行**：支持 interval（每 N 分钟）/ daily（每天定时）两种规则
- **脚本文件支持**：自动识别 `.sh` / `.bat` 后缀选择执行器
- **完整日志**：每次执行生成独立日志文件，含 stdout / stderr / 退出码 / 耗时
- **日志可查看**：UI 列出历史日志，可点开查看完整内容
- **独立于 GitFast**：GitFast 专注单仓库交互式操作，Script Runner 专注定时脚本执行

## 三、与现有功能的边界

| 现有功能 | 定位 | Script Runner 定位 |
|---|---|---|
| 清单工具 | 个人待办 | 无交集 |
| GitFast 终端 | 单仓库交互式 PTY 操作 | 定时执行脚本文件，非交互 |

> **GitFast Timer 已移除**：原 GitFast 的 Timer 功能（单仓库定时模板）已被本工具取代。本工具更通用（支持任意脚本，不限 git 命令），且提供完整文件日志。

**为什么独立而不并入 GitFast**：

1. **执行模型不同**：GitFast 用 PTY（交互式），Script Runner 用 `std::process::Command`（一次性）
2. **反馈方式不同**：GitFast 看终端实时输出，Script Runner 看日志文件
3. **配置文件独立**：各自 YAML，职责清晰

## 四、功能需求

### F1. 任务定义（配置驱动）

#### F1.1 数据模型

```yaml
version: 1
logDir: D:/Jesse/allinone/logs       # 日志目录（默认配置文件同目录的 logs/）
tasks:
  - id: daily-pull
    name: 每日拉取
    script: D:/scripts/deploy.sh      # 脚本文件路径
    workdir: D:/Jesse/allinone        # 工作目录（可选，默认脚本所在目录）
    rule:
      type: daily                     # daily=每天定时 / interval=间隔
      time: "09:00"
    enabled: true
    timeout: 60                       # 超时秒数（0=不超时）
```

#### F1.2 功能需求

| 编号 | 需求 | 优先级 | 状态 |
|---|---|---|---|
| F1.2.1 | 任务列表来自配置文件 `tasks` 段 | P0 | ✅ |
| F1.2.2 | 任务字段：id、name、script、workdir、rule、enabled、timeout | P0 | ✅ |
| F1.2.3 | UI 不做增删改，用户直接编辑 YAML | P0 | ✅ |
| F1.2.4 | 空任务列表时展示 YAML 格式示例 | P0 | ✅ |
| F1.2.5 | 配置文件路径持久化（localStorage） | P0 | ✅ |
| F1.2.6 | 应用启动时自动加载上次配置 | P0 | ✅ |

### F2. 定时规则

| 编号 | 需求 | 优先级 | 状态 |
|---|---|---|---|
| F2.1 | 支持 `interval`：每 N 分钟执行一次 | P0 | ✅ |
| F2.2 | 支持 `daily`：每天指定时刻执行（HH:MM） | P0 | ✅ |
| F2.3 | UI 展示下次触发时间 | P0 | ✅ |
| F2.4 | 防重叠：同一任务不会并发执行 | P0 | ✅ |
| F2.5 | 启停仅改内存运行时（不落盘），重启恢复配置 `enabled` | P0 | ✅ |
| F2.6 | 立即执行一次（不受 enabled 限制） | P0 | ✅ |
| F2.7 | cron 表达式（完整灵活规则） | P2 | ❌ |

### F3. 脚本执行

#### F3.1 自动识别规则

| `script` 结尾 | Windows 执行器 | Mac/Linux 执行器 |
|---|---|---|
| `.sh` / `.bash` | Git Bash（`bash.exe <file>`） | 系统 `bash <file>` |
| `.bat` / `.cmd` | `cmd.exe /C <file>` | 不支持（报错） |
| 其他（命令字符串） | `cmd.exe /C <command>` | `sh -c <command>` |

#### F3.2 功能需求

| 编号 | 需求 | 优先级 | 状态 |
|---|---|---|---|
| F3.2.1 | 按 `script` 后缀自动选择执行器 | P0 | ✅ |
| F3.2.2 | Windows 上 bash 路径检测（复用 `detect_bash`） | P0 | ✅ |
| F3.2.3 | 工作目录默认为脚本所在目录（workdir 为空时） | P0 | ✅ |
| F3.2.4 | 超时强制终止（timeout 字段，0=不超时） | P0 | ✅ |
| F3.2.5 | 隐藏 Windows 控制台窗口（creation_flags 0x08000000） | P0 | ✅ |

### F4. 日志系统

#### F4.1 日志文件格式

文件名：`<taskId>_<YYYYMMDD_HHMMSS>.log`

内容结构：

```
========================================
任务：每日拉取
脚本：D:/scripts/deploy.sh
工作目录：D:/Jesse/allinone
触发时间：2026-06-27 09:00:00
触发方式：schedule
========================================

---------- stdout ----------
<脚本 stdout 输出>

---------- stderr ----------
<脚本 stderr 输出>

========================================
退出码：0
耗时：1.2s
状态：成功
========================================
```

#### F4.2 功能需求

| 编号 | 需求 | 优先级 | 状态 |
|---|---|---|---|
| F4.2.1 | 每次执行生成独立日志文件 | P0 | ✅ |
| F4.2.2 | 日志含完整 stdout / stderr / 退出码 / 耗时 | P0 | ✅ |
| F4.2.3 | 日志目录可配置（logDir 字段），默认配置文件同目录 logs/ | P0 | ✅ |
| F4.2.4 | UI 列出某任务的历史日志（最近 50 条，按时间倒序） | P0 | ✅ |
| F4.2.5 | UI 可查看完整日志内容 | P0 | ✅ |
| F4.2.6 | UI 可删除单条日志 | P0 | ✅ |
| F4.2.7 | 不自动清理日志（用户自行管理） | P0 | ✅ |
| F4.2.8 | 任务卡片展示上次执行结果（✓/✗ + 耗时 + stderr 预览） | P0 | ✅ |

### F5. UI 设计

```
┌──────────────────────────────────────────────────────┐
│ [📜 Script]               [📁加载配置]                │
├──────────────────────────────────────────────────────┤
│  ┌── 任务卡片 ──────────────────────────────────┐    │
│  │ ⏰ 每日拉取                          [启用]    │    │
│  │ 📜 D:/scripts/deploy.sh                     │    │
│  │ 📂 D:/Jesse/allinone                        │    │
│  │ 🕒 每天 09:00                                │    │
│  │ 上次：✓ 06-27 09:00 (1.2s)                 │    │
│  │ [▶ 立即执行]  [📋 查看日志]                  │    │
│  └──────────────────────────────────────────────┘    │
│  ┌── 任务卡片 ──────────────────────────────────┐    │
│  │ ⏰ 每30分钟构建                      [停用]    │    │
│  │ ...                                         │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘

点"查看日志"弹层：
┌──────────────────────────────────────┐
│ 📋 每日拉取 的日志              ✕   │
├──────────────────────────────────────┤
│ ✓ 2026-06-27 09:00:00  1.2KB  [查看][删除] │
│ ✓ 2026-06-26 09:00:00  0.8KB  [查看][删除] │
│ ✗ 2026-06-25 09:00:00  0.3KB  [查看][删除] │
└──────────────────────────────────────┘

点"查看"弹层：
┌──────────────────────────────────────┐
│ 📄 daily-pull_20260627_090000.log ✕ │
├──────────────────────────────────────┤
│ ======== 任务：每日拉取 ========     │
│ 脚本：D:/scripts/deploy.sh           │
│ ---------- stdout ----------         │
│ Already up to date.                  │
│ ---------- stderr ----------         │
│                                      │
│ ======== 退出码：0  耗时：1.2s ===== │
└──────────────────────────────────────┘
```

## 五、技术方案

### 5.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│           Tauri 主窗口 (WebView)                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Script Runner 视图 (ScriptTool.vue):         │  │
│  │  - 任务卡片列表（配置 + 上次结果）             │  │
│  │  - 日志列表面板（弹层）                        │  │
│  │  - 日志内容面板（弹层）                        │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                    │ invoke
                    ▼
┌─────────────────────────────────────────────────────┐
│        Rust 后端 (lib.rs)                            │
│  - scripts_run(script, workdir, timeout, log_dir,   │
│                task_id, task_name, trigger)          │
│    └─ build_shell_command 自动识别 .sh/.bat/命令     │
│    └─ std::process::Command 执行（非 PTY）           │
│    └─ write_log_file 写日志文件                      │
│  - scripts_list_logs(log_dir, task_id) → Vec<Entry> │
│  - scripts_read_log(log_dir, file_name) → String    │
│  - scripts_delete_log(log_dir, file_name)           │
└─────────────────────────────────────────────────────┘
```

### 5.2 关键技术选型

| 层 | 技术 | 用途 |
|---|---|---|
| 前端框架 | Vue 3 + Pinia | 状态管理 |
| 配置解析 | js-yaml | YAML 解析（与 GitFast 共用） |
| 文件对话框 | @tauri-apps/plugin-dialog | 选 YAML 配置文件 |
| Rust 命令 | std::process::Command | 一次性执行（非交互） |
| 日志时间戳 | chrono | 日志文件名时间戳格式化 |
| 定时器 | 浏览器 setInterval | 零新依赖 |
| 持久化 | localStorage | 仅存配置文件路径 |

### 5.3 执行流程

```
触发（定时 / 手动"立即执行"）
  ↓
1. store.executeTask(task, trigger)
   ├─ 检查防重叠（runningTaskIds）
   ├─ 调用 Rust: scripts_run(script, workdir, timeout, logDir, taskId, taskName, trigger)
   │   ├─ build_shell_command(script) → (program, args)
   │   ├─ Command::new(program).args(args).current_dir(workdir)
   │   ├─ 超时轮询 try_wait + kill
   │   └─ write_log_file(logDir, taskId, taskName, ...)
   └─ 更新 runtime.lastResult + lastRunAt
  ↓
2. UI 任务卡片实时展示上次结果
  ↓
3. 用户点"查看日志" → scripts_list_logs(logDir, taskId)
  ↓
4. 用户点某条日志"查看" → scripts_read_log(logDir, fileName)
```

### 5.4 定时调度

```
配置加载后
  ↓
startAllSchedulers()
  ├─ 清空旧定时器
  └─ for each task（enabled=true）:
      ├─ interval 类型 → setInterval(executeTask, minutes * 60000)
      └─ daily 类型 → setInterval(检查时刻, 60000) 每分钟检查一次
  ↓
启停（toggleEnabled）
  ├─ 改 runtimeEnabled（内存，不落盘）
  ├─ 启用 → startScheduler(task)
  └─ 停用 → stopScheduler(taskId)
  ↓
重启应用 → runtimeEnabled 清空 → 按配置文件 enabled 重新启动
```

### 5.5 配置文件加载流程

```
应用启动
  ↓
读 localStorage "allinone-scripts-config-path"
  ├─ 有 → 读取该 YAML → js-yaml 解析 → 校验 → 合并默认
  │       ├─ logDir 为空 → 默认配置文件同目录的 logs/
  │       └─ startAllSchedulers()
  └─ 无 → 仅用默认配置（空任务列表）
  ↓
渲染任务卡片
```

## 六、配置文件格式

### 6.1 完整示例

```yaml
version: 1
logDir: D:/Jesse/allinone/logs       # 日志目录（默认配置文件同目录的 logs/）

tasks:
  # 场景1：每天定时执行 sh 脚本
  - id: daily-pull
    name: 每日拉取
    script: D:/scripts/deploy.sh
    workdir: D:/Jesse/allinone
    rule:
      type: daily
      time: "09:00"
    enabled: true
    timeout: 60

  # 场景2：每 30 分钟执行 bat 脚本
  - id: interval-build
    name: 每30分钟构建
    script: D:/scripts/build.bat
    workdir: D:/Jesse/project
    rule:
      type: interval
      minutes: 30
    enabled: false

  # 场景3：单条命令（非脚本文件）
  - id: git-status
    name: 查看 git 状态
    script: git status               # 不以 .sh/.bat 结尾，按命令字符串执行
    workdir: D:/Jesse/allinone
    rule:
      type: daily
      time: "18:00"
    enabled: true
    timeout: 10
```

### 6.2 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `version` | number | ✅ | 配置版本号（当前 1） |
| `logDir` | string | ❌ | 日志目录（默认配置文件同目录 logs/） |
| `tasks[].id` | string | ✅ | 任务唯一 ID |
| `tasks[].name` | string | ✅ | 显示名称 |
| `tasks[].script` | string | ✅ | 脚本文件路径 或 命令字符串 |
| `tasks[].workdir` | string | ❌ | 工作目录（默认脚本所在目录） |
| `tasks[].rule.type` | `daily` \| `interval` | ✅ | 定时规则类型 |
| `tasks[].rule.time` | string | type=daily 时必填 | 执行时刻 HH:MM |
| `tasks[].rule.minutes` | number | type=interval 时必填 | 间隔分钟数（≥1） |
| `tasks[].enabled` | boolean | ✅ | 初始启停状态 |
| `tasks[].timeout` | number | ❌ | 超时秒数（0=不超时，默认 0） |

## 七、实现优先级

### P0（MVP）— ✅ 已全部实现

1. ✅ 工具切换（Toolbar 加 Script tab）
2. ✅ 配置文件加载（系统对话框选 YAML）
3. ✅ 任务卡片列表（配置 + 上次结果）
4. ✅ 定时执行（interval / daily 两种规则）
5. ✅ 启停 + 立即执行一次
6. ✅ 脚本文件支持（.sh / .bat 自动识别）
7. ✅ 超时强制终止
8. ✅ 日志文件（每次执行独立 .log 文件）
9. ✅ 日志列表 + 日志内容查看 + 删除
10. ✅ 配置文件路径持久化 + 自动加载

### P1（体验完善）

11. cron 表达式（完整灵活规则）
12. 执行中可取消
13. 配置文件最近使用列表
14. 打开配置文件所在目录
15. 日志自动清理（按数量或天数）

### P2（进阶）

16. 日志导出（Markdown 报告）
17. 任务分组
18. 执行失败重试
19. 配置文件版本号校验

## 八、风险与对策

| 风险 | 对策 |
|---|---|
| Windows 上 bash 路径找不到 | `detect_bash()` 从 Git Bash 安装路径找，找不到退回 PATH |
| 脚本文件不存在 | bash/cmd 会报 "No such file"，stderr 有清晰提示，success=false |
| 超时后进程未完全清理 | `child.kill()` 后继续 wait_with_output，避免僵尸进程 |
| 命令注入风险 | 信任用户配置（本地工具），不做转义；命令经 shell 执行 |
| 日志文件堆积 | UI 只展示最近 50 条；不自动清理，用户自行管理 |
| 路径格式不兼容 | 配置文件路径用正斜杠 `/`，避免 YAML 转义 |
| 应用关闭后不执行 | 设计取舍：仅应用开启时执行定时任务（非系统级任务计划） |

## 九、与 GitFast 的对比

| 维度 | GitFast | Script Runner |
|---|---|---|
| 执行方式 | PTY（交互式终端） | `std::process::Command`（一次性） |
| 反馈方式 | 实时终端输出 | 日志文件 |
| 执行对象 | git 命令模板 | 任意脚本文件（.sh / .bat） |
| 定时 | ❌（Timer 已移除） | ✅ interval / daily |
| 配置文件 | `gitfast-config.yaml` | `script-runner.yaml` |
| 适用场景 | 需要观察输出、实时交互 | 定时执行固定脚本 |
