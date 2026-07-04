# Code Review 工具需求文档

> 状态：**P0 已实现**

## 1. 工具定位

第 4 个独立工具，专注于公司内部代码评审请求的创建。通过配置文件管理多个项目，每次执行时选择源/目标分支，调用统一脚本创建评审。

### 与其他工具的边界

| 工具 | 定位 | 触发方式 | 输出 |
|---|---|---|---|
| Script Runner | 通用脚本执行器 | 定时 + 手动 | 文件日志 |
| **Code Review** | 评审创建专用工具 | 仅手动 | 评审 URL + 文件日志 |

## 2. 核心交互流程

```
启动 → 自动加载上次配置文件
  → 显示项目卡片列表
  → 点击卡片展开
  → 加载仓库分支列表
  → 选源分支（搜索下拉，默认当前分支）
  → 选目标分支（搜索下拉，默认配置值）
  → 编辑评审标题（可选，默认自动生成）
  → 点击"创建评审"
  → 调用 git-review.sh（注入环境变量）
  → 显示结果（成功/失败 + 评审 URL）
  → 历史记录可查看
```

## 3. 配置文件设计（YAML）

```yaml
version: 1
logDir: ./logs
platform:
  url: https://devops.tone.tcl.com
  accessToken: <token>
script: D:/Jesse/allinone/scripts/git-review.sh
projects:
  - id: plm-pdm-service
    name: PLM-PDM 服务
    repoPath: D:/code/plm-pdm-service
    repoId: "950381585941725184"
    fullName: rd-plm/plm-pdm-service
    defaultDestBranch: tct-develop-xjx2
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| version | number | 是 | 配置版本号 |
| logDir | string | 否 | 日志目录，默认配置文件同目录 logs/ |
| platform.url | string | 是 | 平台地址 |
| platform.accessToken | string | 是 | 访问令牌 |
| script | string | 是 | 评审脚本路径 |
| projects[].id | string | 是 | 项目唯一 ID |
| projects[].name | string | 是 | 显示名称 |
| projects[].repoPath | string | 是 | 本地仓库路径 |
| projects[].repoId | string | 是 | 仓库 ID（API 路径参数） |
| projects[].fullName | string | 是 | 项目全名 |
| projects[].defaultDestBranch | string | 是 | 默认目标分支 |

## 4. 脚本协议（环境变量注入）

执行脚本时注入以下环境变量：

| 环境变量 | 来源 | 必填 |
|---|---|---|
| REPO_ID | project.repoId | 是 |
| FULL_NAME | project.fullName | 是 |
| SRC_BRANCH | 用户选择 | 是 |
| DEST_BRANCH | 用户选择 | 是 |
| PLATFORM_URL | platform.url | 是 |
| ACCESS_TOKEN | platform.accessToken | 是 |
| REVIEW_SUBJECT | 用户输入 | 否（空则脚本自动生成） |

脚本成功时输出包含 `[OK]` 和评审地址，失败时输出 `[FAIL]`。

## 5. 功能清单

| 编号 | 需求 | 优先级 | 状态 |
|---|---|---|---|
| F1 | YAML 配置文件驱动 | P0 | ✅ |
| F2 | 多项目卡片列表 | P0 | ✅ |
| F3 | 项目展开/收起（手风琴模式） | P0 | ✅ |
| F4 | 分支搜索下拉选择器 | P0 | ✅ |
| F5 | 源分支默认配置值（可选，跳过分支列表加载） | P0 | ✅ |
| F6 | 目标分支默认配置值 | P0 | ✅ |
| F7 | 评审标题可编辑 | P0 | ✅ |
| F8 | 评审创建执行（环境变量注入） | P0 | ✅ |
| F9 | 执行结果显示（stdout/stderr/URL） | P0 | ✅ |
| F10 | 历史记录列表（文件日志） | P0 | ✅ |
| F11 | 历史日志查看/删除 | P0 | ✅ |
| F12 | 配置文件路径持久化（localStorage） | P0 | ✅ |
| F13 | 启动自动加载上次配置 | P0 | ✅ |
| F14 | 评审 URL 一键复制/打开 | P1 | ❌（暂未实现） |
| F15 | 跨平台支持（Windows/Mac/Linux） | P0 | ✅ |

## 6. 后端命令

| 命令 | 说明 |
|---|---|
| `scripts_run`（扩展） | 增加可选 `env` 参数，注入环境变量到子进程 |
| `review_branch_list` | 列出指定仓库的所有分支（本地+远程，去重） |
| `scripts_list_logs` | 复用，列出日志文件 |
| `scripts_read_log` | 复用，读取日志内容 |
| `scripts_delete_log` | 复用，删除日志文件 |

## 7. 前端架构

```
src/features/review/
├── types.ts                    # 数据模型
├── stores/
│   └── review.ts               # Pinia store
├── lib/
│   ├── defaultConfig.ts        # 默认配置
│   ├── config.ts               # 校验+合并
│   ├── configLoader.ts         # YAML 加载
│   └── backend.ts              # Tauri 命令封装
└── components/
    ├── ReviewTool.vue          # 主入口
    ├── ProjectCard.vue         # 单项目展开面板
    └── BranchSelector.vue      # 搜索下拉分支选择器
```

## 8. 日志机制

- 复用 Script Runner 的文件日志系统
- 文件名格式：`<projectId>_<YYYYMMDD_HHMMSS>.log`
- 默认目录：配置文件同目录的 `logs/` 子目录
- 日志内容：任务名、脚本路径、工作目录、触发时间、stdout、stderr、退出码、耗时、状态
- 保留策略：最多展示 50 条，按时间倒序

## 9. 安全设计

- `ACCESS_TOKEN` 存于 YAML 配置文件，不硬编码在脚本中
- 脚本可安全提交到 Git 仓库（不含敏感信息）
- 配置文件路径持久化在 localStorage，token 不进 localStorage

## 10. 已知限制

- 评审 URL 需从 stdout 解析，暂未实现自动提取和一键打开
- 单平台配置，未来如需多平台需扩展配置结构
- 配置了 `defaultSrcBranch` 时跳过分支列表加载，用户仍可在输入框自由输入其他分支名
