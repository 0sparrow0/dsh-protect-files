# 发布到 GitHub 并进入 DSH 插件市场 / Publish to GitHub and reach the DSH plugin market

本文是操作手册，不含一键脚本。
This is a runbook, not a one-shot script.

> 前提 / Prerequisite：本插件是 **bundle**（`package.json` 里有 `dsh.bundle.patch`），安装方式永远是「一个 npm 包名或一个 git 地址」，市场只负责给出那个地址。
> This plugin is a **bundle** (`dsh.bundle.patch` in `package.json`). Installation is always a package name or a git spec; the market only supplies that address.

---

## 一、准备发布物 / Prepare the deliverable

```
dsh-protect-files/
├── package.json          # name / version / exports / files / dsh
├── index.js              # Host half
├── client.js             # Client half (dsh.client points here)
├── cordis.patch.yml      # inserts the plugin row
├── locale/en.json        # card title + description (scope, risk, disclaimer)
├── locale/zh.json
├── icon.svg              # original artwork, < 256 KiB
├── README.md             # bilingual
├── PUBLISHING.md         # this file
├── LICENSE               # MIT
└── test/                 # regression probes (not runtime)
```

`package.json` 三项必须先对 / three fields must be correct:

| 字段 / Field | 要求 / Requirement |
| --- | --- |
| `version` | 每次改动递增，遵循语义化版本 / bump every change, follow SemVer |
| `files` | 必须含 `index.js`、`client.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、`docs`、`README.md`、`LICENSE`；漏了装完跑不起来 / omitting any breaks the installed plugin |
| `dsh.bundle.patch` / `dsh.client` | 指向正确文件；客户端插件需 `platform: "web"` |

自检 / self-check：

```powershell
node --check index.js
node --check client.js
node test/guard.probe.mjs
node test/client.probe.mjs
node test/icon.probe.mjs
npm pack --dry-run     # 最易发现漏文件 / catches missing files
```

> **发布前删掉 `"private": true`**，否则 npm 拒发。仅用 git 安装时可保留。
> **Remove `"private": true` before publishing**; npm refuses it otherwise. Keep it when installing from git only.

---

## 二、推到 GitHub / Push to GitHub

```powershell
cd dsh-protect-files

git init
git add .
git commit -m "guard production paths from agent tool access"

git remote add origin https://github.com/0sparrow0/dsh-protect-files.git
git branch -M main
git push -u origin main

git tag v<version>
git push origin v<version>
```

建议：仓库描述写清「非官方插件 / 策略级防护 / 见免责声明」，并保留 `LICENSE`。
Suggested: state "unofficial plugin / policy-level protection / see disclaimer" in the repository description and keep `LICENSE`.

---

## 三、让它可被安装 / Make it installable

### 路 A：npm（最省事 / simplest）

```powershell
npm login          # first time
npm publish --access public
```

装 / install: `npm i dsh-protect-files`。包名必须全局唯一；被占用就改 scoped `@your-scope/dsh-protect-files`。
The name must be globally unique; use a scoped name if taken.

### 路 B：只发 GitHub / GitHub only

装 / install spec：

```
git+https://github.com/0sparrow0/dsh-protect-files.git#v<version>
```

优点：无需 npm；缺点：安装需能访问 GitHub，版本靠 tag。
Pro: no npm account. Con: needs GitHub access, versioning by tag.

---

## 四、进入插件市场可搜索 / Reach the market

关键认知：**市场不会自动抓 GitHub，它读取一份索引 JSON。**
Key point: **the market does not crawl GitHub — it reads one index JSON.**

### 1. 写 index（format 1）/ write the index

放在仓库（如 `market/index.json`）或 GitHub Pages，让 https URL 可取。
Host it in the repo or on GitHub Pages so an https URL serves it.

```json
{
  "format": 1,
  "title": { "zh": "我的 DSH 插件", "en": "My DSH plugins" },
  "description": { "zh": "自用插件索引", "en": "Personal plugin index" },
  "metadata": {
    "categories": {
      "security": { "title": { "zh": "安全", "en": "Security" } }
    },
    "labels": {},
    "sortKeys": {}
  },
  "plugins": [
    {
      "name": "dsh-protect-files",
      "title": { "zh": "受保护路径", "en": "Protected paths" },
      "description": {
        "zh": "按分组保护生产配置路径，拒绝 agent 读取与搜索。策略级防护，非操作系统隔离。",
        "en": "Group-based protection for production config paths. Policy-level, not OS isolation."
      },
      "icon": "icon.svg",
      "author": "sparrow",
      "homepage": "https://github.com/0sparrow0/dsh-protect-files",
      "repository": { "url": "https://github.com/0sparrow0/dsh-protect-files" },
      "metadata": {
        "category": "security",
        "keywords": ["security", "protect-files", "secret-guard"],
        "labels": [],
        "sortKeys": {}
      },
      "versions": [
        {
          "version": "<version>",
          "publishTimestamp": 1735689600,
          "source": { "type": "npm" },
          "engines": { "dsh": ">=0.2.0" }
        }
      ]
    }
  ]
}
```

要点 / rules:

- `versions` 必须按 SemVer **从高到低**，版本号与真实发布完全一致。
  `versions` must be ordered **highest-first** and match what is actually published.
- `source` 二选一：`{ "type": "npm" }`（可带 `registry`）或 `{ "type": "git", "url": "...", "commit": "<40-hex SHA>", "path": "子目录" }`。**git 型必须写完整 commit SHA，不能写 tag。**
  `source` is either npm, or git with a **full 40-hex commit SHA** (tags are rejected).
- `icon` 可为绝对 URL、`data:` URL，或**相对索引 URL** 的路径。
  `icon` may be an absolute URL, a `data:` URL, or a path relative to the index URL.
- `metadata.category` 必须先在 `metadata.categories` 声明，否则被丢弃。
  `metadata.category` must be declared first or it is dropped.
- `engines.dsh` 写错会被判不兼容而不给装。
  A wrong `engines.dsh` makes the version incompatible and uninstallable.

### 2. 把索引地址告诉 DSH / register the index

在 DSH 插件市场（`plugin-market` 的 Discover 页或索引设置）添加该 https URL。之后该 index 的插件出现在列表，搜索按 `name`/`title`/`description`/`keywords` 匹配。
Add that https URL in the DSH plugin market (Discover tab or index settings). Its plugins then list, searchable by name/title/description/keywords.

> 不想自建索引：在 README 给出安装 spec，让用户手动「添加插件」即可，无需市场。
> Or skip the market: publish the install spec in the README and let users add the plugin manually.

---

## 五、版本更新节奏 / Release cadence

1. 改代码 → 跑三个探针 → `npm version patch`（自动增版本并打 tag）。
2. `git push --follow-tags`，`npm publish`。
3. **更新 index 的 `versions`**：新版本插到数组最前面，`publishTimestamp` 用真实时间戳。忘了这步市场只看得到旧版。
   **Update the index**: prepend the new version; otherwise the market still shows only the old one.
4. git 型 source 需把 `commit` 换成新提交的完整 SHA。

---

## 六、发布前清单 / Pre-flight checklist

- [ ] `version` = git tag = index 里的版本，三者一致 / version, tag, and index agree
- [ ] `private` 已移除（走 npm 时）/ `private` removed for npm
- [ ] `files` 覆盖全部运行时文件，`npm pack --dry-run` 已核对 / verified by pack
- [ ] 图标为自有作品、`< 256 KiB`、可解码 / original artwork, decodable
- [ ] `locale/*.json` 的 title/description 与实际功能一致，且**包含风险与免责声明** / includes risk + disclaimer
- [ ] `LICENSE` 存在且与 `package.json` 的 `license` 一致 / matches manifest
- [ ] README 中英双语，写清策略级防护、已知局限、免责声明 / bilingual, states limits and disclaimer
- [ ] 三个探针全绿 / all three probes green
