# 上架到 GitHub 与 dshmarket / Listing on GitHub and dshmarket

前面 [PUBLISHING.md](PUBLISHING.md) 讲的是「怎么发布一个包」。这份讲的是**你这次要做的两件具体事**：推到自己 GitHub 账号，然后让它出现在 dshmarket 里。

---

## 一、先搞清 dshmarket 的收录机制（关键）

dshmarket 里能搜到的插件来自 **目录（catalog）**，不是它自己抓 GitHub。目录有三种来源：

| 方式 | 谁能改 | 生效速度 | 适合 |
| --- | --- | --- | --- |
| **公开目录**（Public catalog） | 提 PR 到 `awesome-dsh-plugin` 仓库 | 通常 1 天内 | 面向所有人上架 |
| **用户自建目录**（User catalog） | 你本人在市场设置里加 | 立即 | 只有自己/团队用 |
| **策略目录**（Policy catalog） | 管理员在 `policy.json` 里写 | 立即 | 企业统一分发 |

你这次两条都做：**先自建目录立刻见效**，再提 PR 进公开目录。

---

## 二、推到你自己的 GitHub

仓库已经初始化并提交好了（分支 `main`，含 14 个文件）。你只需：

```powershell
cd E:\wyb\Aother\Eagle\aiwork\DeepSeekHarness\harness-plugin\dsh-protect-files

# 在 GitHub 上先建一个空仓库 dsh-protect-files（不要勾 README），然后：
git remote add origin https://github.com/0sparrow0/dsh-protect-files.git
git push -u origin main
git tag v0.1.1
git push origin v0.1.1
```

推送前请确认两件事：

1. `package.json` 里的 `homepage` / `repository` 用的是你真实的 GitHub 地址（当前写的是 `sparrow`）。
2. **要走 npm 就删掉 `"private": true`**；只走 git 安装可以保留。

> 仓库推送后，`market/index.json` 里的 `commit` 需要换成真实 SHA。
> 当前写的 `14bb6358ae46a82e305ccec04c24a3953bfdde71` 是**本地首次提交**的 SHA；如果你在推送前又改了文件，必须重新提交并更新这个值。

拿真实 SHA：

```powershell
git rev-parse HEAD
```

---

## 三、路线 A：自建目录，立即在 dshmarket 里搜到（推荐先做）

`market/index.json` 已经写好并通过校验（`INDEX VALID`）。两种用法：

### A1. 本地文件源（不依赖网络，最快验证）

dshmarket 的目录源支持 `file` 而不是只能是 `url`。在市场的 **设置 → 插件配置 → dshmarket → 目录源** 里添加一条，指向本地文件：

```
E:\wyb\Aother\Eagle\aiwork\DeepSeekHarness\harness-plugin\dsh-protect-files\market\index.json
```

如果你的 dshmarket 版本只接受 URL，用下面的命令行把本地目录挂上去也行：

```powershell
# 任意静态服务器都行，例如 Python 自带的
python -m http.server 8899 --directory "E:\wyb\Aother\Eagle\aiwork\DeepSeekHarness\harness-plugin\dsh-protect-files\market"
# 然后目录源填 http://127.0.0.1:8899/index.json
```

### A2. 托管到 GitHub Pages（推完仓库就能用）

仓库设置 → Pages → Source 选 `main` 分支的 `/` 根目录，保存。之后目录地址是：

```
https://0sparrow0.github.io/dsh-protect-files/market/index.json
```

注意：Pages 地址要等首次构建完成（约 1 分钟）才可用。

### 挂上之后

市场里应能看到卡片「受保护路径 / Protected paths」，带本插件图标，可搜索、可安装。安装来源就是你 `index.json` 里写的那条 `source`。

---

## 四、路线 B：进公开目录，让所有人都能搜到

**dshmarket 仓库本身不收插件条目。** 公开目录来自精选列表仓库 `awesome-dsh-plugin`，做法是去那边提 PR，在列表里加一条：

```
https://github.com/awesome-dsh-plugin/awesome-dsh-plugin
```

这条列表会被 CI 每日抓取，生成 `plugins.json` / `index.json`（站点与市场都读它）。所以：

- PR 只需要加**一条**插件记录（通常是一个 Markdown 列表项或对应 JSON 条目，按仓库当时的 CONTRIBUTING/模板填）；
- 一条记录里必须给到**可安装的来源**：要么 npm 包名，要么 GitHub 仓库地址（+ 可选子目录 / commit）；
- 通常 1 天内生效；被合并后市场与站点自动收录。

> 提 PR 前建议先把它做成 npm 包（`npm publish`），公开目录对 npm 包的解析最稳，且安装最快、更新检测最准。纯 git 来源也能收录，但要求仓库结构规范、能被 pnpm 直接装。

**PR 描述模板（可直接用）**：

```
### Plugin: dsh-protect-files

- Repository: https://github.com/0sparrow0/dsh-protect-files
- Version: 0.1.1 (tag v0.1.1)
- Category: security
- Languages: zh, en
- Description (zh): 按分组保护生产配置路径，拒绝 agent 读取与搜索；父目录仍可用且受保护条目自动剔除。策略级防护，非操作系统隔离。
- Description (en): Group-based protection for production config paths; parent directories stay searchable with protected entries removed. Policy-level, not OS isolation.
- Install: `npm i dsh-protect-files` 或 `git+https://github.com/0sparrow0/dsh-protect-files.git#v0.1.1`
- License: MIT
- Notes: 插件自带可回归的测试探针（test/*.probe.mjs），无原生依赖、无构建步骤。
```

---

## 五、你现在就能验证的东西

我已在本地把能验的都验了：

- `market/index.json` 结构校验：**INDEX VALID**（format、name/version 对齐 package.json、git commit 为 40 位 SHA、category 已在 metadata 声明、icon 存在）
- 三个测试探针：guard / client / icon **全绿**
- git 仓库：分支 `main`，14 个文件已提交，SHA `14bb6358ae46a82e305ccec04c24a3953bfdde71`

**我没能验证的**：dshmarket 里实际搜索与安装的结果，以及 GitHub 推送与 Pages 生效——这些需要你的账号和网络。按上面 A1 做完后告诉我结果，我再调整 `index.json`。

---

## 六、顺序建议

1. GitHub 建空仓库 → `git push` → `git tag v0.1.1 && git push --tags`
2. `git rev-parse HEAD` 取真实 SHA → 更新 `market/index.json` 的 `commit` → 再提交推送
3. 市场里加本地文件目录（A1）→ **确认能搜到、能装、装上后能打开配置页**
4. 一切正常后，再决定要不要 `npm publish` 并去 `awesome-dsh-plugin` 提 PR
