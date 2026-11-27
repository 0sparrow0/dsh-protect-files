# dsh-protect-files

> 初代版本，接口与配置结构可能在小版本内调整。 · Early release: interfaces and config shape may change within minor versions.

[中文](#中文) · [English](#english)

![icon](icon.svg)

---

## 中文

把「生产级配置」挡在 agent 的工具之外：按分组登记不允许被读取、搜索或写入的目录与文件，DeepSeek Harness 会在工具真正执行之前拒绝任何触碰它们的调用。

### 怎么用

配置有三个入口，任选一个（都指向同一份配置）：

1. **设置 → 受保护路径**（设置面板左侧导航，位于「插件」之后，带本插件图标）。最直接。
2. **插件 → dsh-protect-files 卡片 → 详情页**：编辑器显示在描述下方、行列表上方。
3. **插件 → 详情页 → 行 `dsh-protect-files` 标题（带 » 箭头）**：打开该行的配置页。

界面跟随应用语言：中文环境显示中文，英文环境显示英文（目前提供中/英两套文案，其他语言回落到中文）。

打开后：**新建分组** → 起名（如 `shop-prod`）→ **添加路径**（手填绝对路径或点「浏览」选目录；`目录` 保护整棵子树，`文件` 保护单个文件）→ **保存**。字段是 live 字段，保存即时生效，无需重启。

> 保存走 profile 的插件配置（与「账户」「插件」页相同的 settings 通道）。分组内空白路径会被自动丢弃。

于是一个 Harness 可并存多项目：`dev` 配置随便看，`prod` 配置登记进保护组即可。

### 拦在哪一层

| 层 | 机制 | 覆盖 |
| --- | --- | --- |
| 1. 执行前拒绝 | 全局 `ctx.tools.guard()` | 路径参数解析后落在受保护路径内即拒绝（`read`、`read_image`、`write`、`edit`、`apply_patch`、`grep`/`glob`、MCP 工具、终端命令…）。相对写法（`../prod/.env`、`hgxt\kb.jsp`）按会话工作目录解析后同样命中。 |
| 2. 结构化剔除 | `tools/post-execute` | **父目录照常可用**。`grep.matches`、`glob.paths` 按真实路径剔除受保护子树后再由工具渲染，受保护文件既不出现在结果里也不带出内容。 |
| 3. 文本清理 | 同上 | 无结构化结果的工具（终端、MCP）：命中的**路径片段就地替换**为 `[受保护路径]`，同行其它内容保留；相对清单按段落隐藏子项。 |
| 4. 提前告知 | 系统提示段落 | 告知模型保护存在、拒绝不可协商、分析周边项目请改用父目录。段落不列具体路径。 |

profile 的 `cordis.patch.yml` 默认也在保护范围内，因此工具调用无法改写组合关掉这层保护（可在配置页关闭该项）。

### 拒绝时长什么样

```
Blocked by dsh-protect-files: tool "read" may not read, search, or write the protected path
"D:\projects\shop\config\prod" (group "shop-prod", matched "config/prod")...
```

每次拒绝、每次清理追加一行到 `%DSH_HOME%\dsh-protect-files\audit.jsonl`（默认 `C:\Users\<you>\.dsh\dsh-protect-files\audit.jsonl`），超过 1 MiB 轮转为 `audit.jsonl.1`。

### 能力范围（会做什么）

- 按**分组**登记目录或文件，可随时启停、增删，保存即生效（volatile 字段，不重挂插件）。
- **路径参数**解析后落在受保护路径内 → 执行前拒绝；参数**文本**出现受保护路径/最后两段路径/目录名 → 同样拒绝。拒绝是**单调**的：其他插件、注册顺序、模型都无法推翻。
- **父目录照常可用**：`pwsh` 列目录、`glob`、`grep` 都能工作，受保护条目在渲染前被剔除。
- 无结构化结果的工具走文本兜底（就地替换路径片段；相对清单分段隐藏）。
- 默认保护 profile 的 `cordis.patch.yml`。
- 每次拒绝/剔除写入审计文件（超 1 MiB 轮转）。
- **不修改**任何文件的权限、所有权或加密状态，也不改动其他插件配置。

### 风险与局限（不做什么）

**这是策略级防护，不是操作系统隔离。**

1. **终端命令按文本判定**：用变量拼接/编码/文件句柄绕过的命令不在覆盖范围。
2. **名字可能仍可见**：列父目录时可能看到受保护目录的名字（内容不会出现）。
3. **等价拼写不归一**：符号链接、8.3 短路径不会被解析成同一目标（Windows 下已大小写不敏感）。
4. **结构化剔除只覆盖已知形状**：精确处理 `grep.matches` 与 `glob.paths`；其他工具（含第三方 MCP）回落文本清理，自定义格式不保证完全过滤。
5. **外部访问不覆盖**：MCP 服务、浏览器自动化、DSH 之外进程读文件都不经过本插件。
6. **关掉即失效**：总开关或分组开关关闭后路径立刻恢复可见；审计文件含路径名。
7. **只防护"读/写路径"这一个维度**：已进入历史会话/日志/截图的内容无法回收。
8. **依赖宿主机制**：依赖 `tools.guard` / `tools/post-execute`；若其他插件以更高优先级移除工具或替换执行器，行为可能变化。
9. **会话开在受保护路径内时通配符仍可能读到内容**：`type *.env` 这类展开不以具体路径参数出现。**建议把会话开在受保护路径之外**。
10. **相对路径已拦截但非万能**：`$d='hg'+'xt'` 这类变量拼接在文本层已看不到目录名。

要把这层做成「物理隔离」，还应配合：`dsh-sandbox` 文件沙箱（生产目录置于工作区只读边界之外）；操作系统 ACL（运行 Harness 的账户本身无读权限，这是唯一无法被工具层绕过的手段）。

### 免责声明

1. **性质**：本插件是 DSH 的**辅助性策略插件**，通过工具守卫与结果清理降低误读生产配置的概率。它**不是**安全产品、**不是**访问控制系统、**不是** DLP 方案，也**不能**替代操作系统权限管理、磁盘加密或网络隔离。
2. **无担保**：按「现状」（AS-IS）提供，不附带任何明示或默示担保，包括但不限于适销性、特定用途适用性、以及**不侵权的担保**。不保证拦截全部访问方式，也不保证不误伤正常调用。
3. **风险自负**：生产环境使用的一切风险由使用者承担。因使用或无法使用本插件导致的任何直接、间接、偶然、特殊、惩戒性或后果性损失（含配置泄漏、数据损坏、构建中断、业务停机、合规责任、第三方索赔），作者与贡献者**不承担责任**。
4. **已知局限不构成隐瞒**：上文逐条列明**明确不覆盖**的场景，属设计边界而非缺陷。
5. **配置责任**：保护哪些路径、如何启停、是否关闭总开关，由使用者决定并负责。
6. **审计含路径名**：`audit.jsonl` 记录被拒**路径字符串**（不含文件内容），请自行评估存放位置与访问权限。
7. **第三方与商标**：独立实现，与 DeepSeek 官方无隶属或背书关系；图标为本项目原创，MIT 随包分发。
8. **许可**：**MIT License**，保留版权与许可声明即可自由使用、修改、再分发。

若不同意上述任一条款，请**不要安装或启用**，并立即移除。

### 实现要点

- **Host**（`index.js`）：`Config` 可编辑字段均为 schemastery `.volatile()`，保存时 loader 把新值换进运行中插件的引用，不重挂。裸 import 解析不到 dsh 的包（本地目录是链接安装），故 schema 库用 `createRequire` 从 profile / 安装目录 / `~/.dsh/profiles` 依次解析。
- **Client**（`client.js`）：同一编辑器挂三处——`settings.section`（自读命名空间）、`plugins.bundle.config`（键为包名）、`plugins.row.config`（页面主人给表单）。**侧栏图标是独立槽 `settings.section.icon`**，`id` 必须与 section 的 `id` 相同，否则外壳画默认字形。
- **控件配色**：开关轨道与主按钮用固定强调色 `#2f6fdb`，不依赖品牌色 token（某些主题下品牌色接近白色会把开关刷成全白、吞掉主按钮文字）。
- **匹配算法**：路径归一为 `/` 分隔、去重、去尾、Windows 转小写；命中为「相等或以 `受保护路径 + /` 开头」；文本兜底用最后两段路径，按完整 token 边界匹配（`/prod` 不命中 `/production`，`.env` 不命中 `.env.example`）。相对清单用段落状态机隐藏子项。

### 排查

| 诊断文本 | 含义 | 处理 |
| --- | --- | --- |
| `configForms 服务缺失` | 客户端设置服务未挂到本插件作用域 | 报告给作者 |
| `设置镜像里没有本插件的命名空间` | 宿主没把本插件配置作为 settings 命名空间 serve 出来 | 确认「插件」页本行启用，刷新页面 |
| `命名空间 … 没有提供给当前客户端` | 命名空间存在但客户端读不到 | 刷新 / 重新登录 |

### 回归测试

```powershell
ELECTRON_RUN_AS_NODE=1 "<DSH_NODE_EXECUTABLE>" test/guard.probe.mjs   # 宿主侧拦截
ELECTRON_RUN_AS_NODE=1 "<DSH_NODE_EXECUTABLE>" test/client.probe.mjs  # 客户端注册/取数/配色/语言
ELECTRON_RUN_AS_NODE=1 "<DSH_NODE_EXECUTABLE>" test/icon.probe.mjs    # 图标自包含与可读性
```

---

## English

Keeps production configuration out of agent tool calls: register directories and files, grouped, that no tool may read, search, or write. DeepSeek Harness refuses any call that touches them **before** the tool runs.

### Usage

Three entry points, all editing the same configuration:

1. **Settings → Protected paths** (settings sidebar, after Plugins, with this plugin's icon). Most direct.
2. **Plugins → dsh-protect-files card → its page**: the editor renders under the description.
3. **Plugins → page → row `dsh-protect-files` title (with the » arrow)**: opens that row's configuration page.

The UI follows the app language: Chinese in a Chinese app, English in an English one (two locales ship today; anything else falls back to Chinese).

Then: **Add group** → name it (e.g. `shop-prod`) → **Add path** (type an absolute path or use **Browse**; `Directory` protects the whole subtree, `File` one file) → **Save**. Fields are live: saving applies immediately, no restart.

> Saving goes through the profile's plugin configuration (the same settings channel as Account and Plugins). Blank paths inside a group are dropped.

One Harness can host many projects: leave `dev` readable, register `prod` in a protection group.

### Where it blocks

| Layer | Mechanism | Coverage |
| --- | --- | --- |
| 1. Deny before execution | global `ctx.tools.guard()` | Any call whose path argument resolves inside a protected path (`read`, `read_image`, `write`, `edit`, `apply_patch`, `grep`/`glob`, MCP tools, shell commands…). Relative spellings (`../prod/.env`, `hgxt\kb.jsp`) resolve against the session directory and match too. |
| 2. Structured removal | `tools/post-execute` | **Parent directories stay usable.** `grep.matches` and `glob.paths` lose protected subtrees before the tool renders, so protected files neither appear nor leak content. |
| 3. Text redaction | same | Tools without a structured result (shell, MCP): the matched **path fragment is replaced in place** with `[受保护路径]` while the rest of the line survives; relative listings hide their child rows. |
| 4. Advance notice | system-prompt section | Tells the model the protection exists, that denial is not negotiable, and to use a parent directory instead. The section lists no paths. |

The profile's `cordis.patch.yml` is protected by default too, so a tool call cannot rewrite the composition to switch the protection off (toggleable in the configuration page).

### What a denial looks like

```
Blocked by dsh-protect-files: tool "read" may not read, search, or write the protected path
"D:\projects\shop\config\prod" (group "shop-prod", matched "config/prod")...
```

Every denial and redaction appends one line to `%DSH_HOME%\dsh-protect-files\audit.jsonl` (default `C:\Users\<you>\.dsh\dsh-protect-files\audit.jsonl`), rotated to `audit.jsonl.1` past 1 MiB.

### Scope (what it does)

- Register directories or files per **group**; start, stop, add, remove at any time, applied on save (volatile fields, no remount).
- A **path argument** that resolves inside a protected path is denied; so is an argument whose **text** carries a protected path, its last two segments, or its directory name. Denial is **monotonic**: other plugins, registration order, and the model cannot override it.
- **Parent directories stay usable**: `pwsh` listing, `glob`, and `grep` all work; protected entries are removed before rendering.
- Tools without a structured result fall back to text redaction (in-place path replacement; section-aware hiding for relative listings).
- Protects the profile's `cordis.patch.yml` by default.
- Writes every denial/redaction to the audit file (rotated past 1 MiB).
- **Never** changes file permissions, ownership, or encryption, and never edits another plugin's configuration.

### Risk and limitations (what it does not do)

**Policy-level protection, not operating-system isolation.**

1. **Shell commands are judged by text**: a command that assembles a path from variables, encoding, or file handles is out of scope.
2. **Names may still be visible**: listing a parent directory can show the protected directory name (never its content).
3. **Equivalent spellings are not normalized**: symlinks and 8.3 short paths are not resolved to the same target (case-insensitive comparison on Windows).
4. **Structured removal covers known shapes only**: `grep.matches` and `glob.paths` are handled exactly; other tools (including third-party MCP) fall back to text redaction, whose custom formats are not guaranteed to be fully filtered.
5. **External access is not covered**: MCP servers, browser automation, and processes outside DSH.
6. **Turning it off ends the protection**: path visibility returns immediately, and the audit file records path names.
7. **One dimension only**: content already pulled into history, logs, screenshots, or copied fragments cannot be recalled.
8. **Depends on host mechanisms**: `tools.guard` / `tools/post-execute`; if another plugin removes tools at higher priority or replaces the executor, behaviour may change.
9. **Wildcards can still read content when the session sits inside a protected path** (`type *.env` expands without naming a path). **Keep the session outside protected paths.**
10. **Relative paths are caught but not universally**: `$d='hg'+'xt'` leaves no directory name in the text.

For physical isolation, pair it with the `dsh-sandbox` filesystem sandbox (keep production directories outside the writable workspace) and OS ACLs (the account running Harness has no read rights at all — the only layer tools cannot bypass).

### Disclaimer

1. **Nature**: an **auxiliary policy plugin** for DSH that reduces the chance of reading production configuration by guarding tool calls and redacting results. It is **not** a security product, **not** an access-control system, **not** a DLP solution, and **cannot** replace OS permissions, disk encryption, or network isolation.
2. **No warranty**: provided **AS-IS**, without any express or implied warranty, including but not limited to merchantability, fitness for a particular purpose, and **non-infringement**. It does not guarantee that every access path is blocked, nor that legitimate calls are never blocked.
3. **Assumption of risk**: all risk of use in real or production environments rests with the user. The author and contributors **accept no liability** for any direct, indirect, incidental, special, exemplary, or consequential loss (including exposed configuration, data damage, failed builds, downtime, compliance obligations, third-party claims) arising from use or inability to use this plugin.
4. **Known limits are disclosed**: the list above enumerates what is **explicitly not covered**. These are design boundaries, not defects.
5. **Configuration responsibility**: which paths are protected, how groups are toggled, and whether the master switch is on are the user's decisions and responsibility.
6. **The audit file contains path names**: `audit.jsonl` records rejected **path strings** (never file contents); evaluate its location and access permissions yourself.
7. **Third parties and trademarks**: an independent implementation with no affiliation or endorsement by DeepSeek; the icon is original artwork for this project, distributed under MIT.
8. **License**: **MIT**. Use, modify, and redistribute freely while retaining the copyright and license notice.

If you disagree with any clause, **do not install or enable** this plugin, and remove it.

### Implementation notes

- **Host** (`index.js`): every editable `Config` field is schemastery `.volatile()`, so a save swaps the value into the running plugin's reference without a remount. A bare import cannot resolve dsh packages (a local directory install is linked), so the schema library is resolved with `createRequire` from the profile, the installation, then `~/.dsh/profiles`.
- **Client** (`client.js`): one editor mounted in three places — `settings.section` (reads its own namespace), `plugins.bundle.config` (keyed by package name), `plugins.row.config` (the page owner supplies the form). **The sidebar glyph is a separate slot, `settings.section.icon`**, whose `id` must equal the section's `id`; otherwise the shell draws its default glyph.
- **Control colors**: the switch track and primary button use a fixed accent `#2f6fdb` rather than the brand token, which resolves near-white in some themes and painted the switch into a blank pill and hid the button label.
- **Matching**: paths normalize to `/`, duplicates and trailing separators removed, lowercased on Windows; a hit is "equal to, or starts with `protected + /`"; the text fallback uses the last two segments with whole-token boundaries (`/prod` does not hit `/production`, `.env` does not hit `.env.example`). Relative listings use a section state machine to hide child rows.

### Troubleshooting

| Diagnostic text | Meaning | Action |
| --- | --- | --- |
| `configForms 服务缺失` | the client settings service is not mounted in this plugin's scope | report to the author |
| `设置镜像里没有本插件的命名空间` | the host does not serve this plugin's config as a settings namespace | confirm the row is enabled under Plugins, then reload the page |
| `命名空间 … 没有提供给当前客户端` | the namespace exists but this client cannot read it | reload / sign in again |

### Regression tests

```powershell
ELECTRON_RUN_AS_NODE=1 "<DSH_NODE_EXECUTABLE>" test/guard.probe.mjs   # host-side guards
ELECTRON_RUN_AS_NODE=1 "<DSH_NODE_EXECUTABLE>" test/client.probe.mjs  # client registration/reads/colors/locales
ELECTRON_RUN_AS_NODE=1 "<DSH_NODE_EXECUTABLE>" test/icon.probe.mjs    # icon self-containment and legibility
```
