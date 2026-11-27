# 提交到 awesome-dsh-plugin（公开目录）

这份文件是**给 `awesome-dsh-plugin` 提 PR 用的材料**，可直接粘贴。

> 目标仓库：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
> **不要去 `dsh-market/dsh-market` 提**——它自己的 README 写明「这个仓库是市场应用本身，不是插件目录」。

---

## 前置条件（必须已完成）

- [x] 包已发布到 npm：`dsh-protect-files@0.1.1`（`latest` 已指向它）
- [x] GitHub 仓库公开可访问：https://github.com/0sparrow0/dsh-protect-files
- [x] 仓库里 `market/index.json` 的 `source` 是 `{"type": "npm"}`

公开目录现有 **7076 个条目，全部是 npm 源**。git 源不会被收录。

## 已验证的发布事实

| 项目 | 值 |
| --- | --- |
| npm 包名 | `dsh-protect-files` |
| 当前版本 | `0.1.1`（`dist-tags.latest`） |
| 发布时间 | `2026-11-27T09:44:23.659Z` |
| Unix 时间戳 | `1795772663` |
| tarball | `https://registry.npmjs.org/dsh-protect-files/-/dsh-protect-files-0.1.1.tgz` |
| tarball 大小 | 39.8 kB（解包 110.8 kB，12 个文件） |
| 维护者 | `0sparrow0` |
| 许可证 | MIT |
| 国内镜像同步 | npmmirror ✅ / 腾讯云 ✅（均已是 0.1.1） |
| DSH 实际安装验证 | `pnpm add dsh-protect-files` → `application: applied`，1.2 秒 |

## 条目（供维护者/CI 使用）

```json
{
  "name": "dsh-protect-files",
  "title": "0sparrow0/dsh-protect-files",
  "description": {
    "zh": "把生产配置挡在 agent 工具之外：按分组登记目录与文件，点名/解析到/写入的调用在执行前被拒绝；父目录仍可列目录、glob、grep，受保护条目自动从结果里剔除。策略级防护，不是操作系统隔离。",
    "en": "Keeps production configuration out of agent tool calls: register directories and files per group; calls that name, resolve to, or write one are denied before they run, while parent directories stay searchable with protected entries removed. Policy-level protection, not OS isolation."
  },
  "homepage": "https://github.com/0sparrow0/dsh-protect-files",
  "repository": { "url": "https://github.com/0sparrow0/dsh-protect-files" },
  "metadata": {
    "category": "security",
    "keywords": ["security", "protect-files", "secret-guard", "production-config"],
    "labels": [],
    "sortKeys": {}
  },
  "versions": [
    {
      "version": "0.1.1",
      "publishTimestamp": 1795772663,
      "source": { "type": "npm" },
      "engines": {}
    }
  ]
}
```

`engines` 留空对象：真实目录里 7076 个条目全部是 `{}`，写死范围反而可能被判不兼容。

---

## PR 标题

```
Add dsh-protect-files: group-based protection for production config paths
```

## PR 正文（可直接复制）

```markdown
### Plugin

- **npm**: `dsh-protect-files`
- **Version**: 0.1.1
- **Repository**: https://github.com/0sparrow0/dsh-protect-files
- **Category**: security
- **License**: MIT
- **Languages**: zh, en

### What it does

Group-based protection for production configuration paths. You register directories
and files in named groups; any tool call that names, resolves to, or writes one of
those paths is denied before the tool runs. Parent directories stay usable — listing,
glob and grep still work, with protected entries removed from the results.

Protection is installed in three layers:

1. a global `ctx.tools.guard()` denial (monotonic: other plugins, registration order
   and the model cannot override it),
2. structured removal from `grep.matches` / `glob.paths` before rendering,
3. in-place text redaction for tools without a structured result (shell, MCP).

The profile's `cordis.patch.yml` is protected by default, so a tool call cannot
rewrite the composition to switch the protection off.

### Configuration

A dedicated page under Settings (and on the plugin's own page) with group editing,
path-by-path add/remove, per-group toggles and a master switch. All fields are
`volatile`, so saving applies immediately without a restart.

### Scope and limitations (stated in the plugin's own description)

This is **policy-level** protection, not operating-system isolation. Shell commands
that assemble a path from variables, symlink or 8.3 short-path spellings, and access
through MCP, browser automation or processes outside DSH are not covered. A listing
of a parent directory can still show the protected directory's name; its contents
are never returned. The plugin never changes file permissions or encryption.

The plugin carries a full disclaimer and a "risks and limitations" section in its
package description and README, in both Chinese and English.

### Verification

- No native dependencies, no build step, no install scripts.
- Ships three regression probes (`test/guard.probe.mjs`, `test/client.probe.mjs`,
  `test/icon.probe.mjs`) covering host-side guards, client registration and icon
  self-containment; all pass.
- Package contents verified with `npm pack --dry-run`.
- Icon is original artwork (shield + folder), self-contained SVG, 842 bytes.
- Installed and exercised locally through the DSH plugin manager from
  `git+https://github.com/0sparrow0/dsh-protect-files.git#v0.1.1`.
```

---

## 提交后

CI 每日重新抓取并生成 `plugins.json`，发布到：
- `https://awesome-dsh-plugin.com/plugins.json`
- npm 包 `dsh-plugin-catalog`

通常 1 天内生效。生效后任何人的 dshmarket 都能搜到并安装。

## 在生效前，只有自己能用

在你自己的市场里加「用户自建目录」：

```
设置 → 插件 → 插件配置 → dshmarket → 目录源
https://raw.githubusercontent.com/0sparrow0/dsh-protect-files/main/market/index.json
```

这条只对你生效——别人看不到你的自建目录。
