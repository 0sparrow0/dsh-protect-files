# dsh-protect-files 配置备份（重装前）

采集时间：2026-11-27
来源：`C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml`（`id: dsh-protect-files` 行）

卸载插件或切换安装来源后，这份配置可能丢失。重装后按下面对应方式恢复即可。

## 原配置（原样）

```yaml
- id: dsh-protect-files
  name: dsh-protect-files
  config:
    enabled: true
    groups:
      - name: test
        enabled: true
        entries:
          - path: E:\wyb\Aother\temp\codeTemp\temp\hgxt
            kind: dir
          - path: E:\wyb\Aother\temp\codeTemp\temp\helpYj.jsp
            kind: file
      - name: dygz
        enabled: true
        entries:
          - path: E:\wyb\eagle_antismugglin\Sources\wzhg\dygz\src\main\resources\wenzhouhg
            kind: dir
  disabled: true
```

## 内容摘要

| 分组 | 状态 | 受保护路径 | 类型 |
| --- | --- | --- | --- |
| test | 启用 | `E:\wyb\Aother\temp\codeTemp\temp\hgxt` | 目录 |
| test | 启用 | `E:\wyb\Aother\temp\codeTemp\temp\helpYj.jsp` | 文件 |
| dygz | 启用 | `E:\wyb\eagle_antismugglin\Sources\wzhg\dygz\src\main\resources\wenzhouhg` | 目录 |

总开关：`enabled: true`（保护开启）。该行本身 `disabled: true` 是当时为读取配置临时停用的状态。

## 恢复方式一：在界面里重新登记（推荐）

插件页 → 受保护路径 → 新建两个分组 `test`、`dygz`，按上表逐条添加路径 → 保存。

## 恢复方式二：写回 profile 补丁

编辑 `C:\Users\Administrator\.dsh\profiles\desktop\cordis.patch.yml`，把上面的 YAML 块替换到对应位置（注意把 `disabled: true` 改回 `disabled: false` 或整行删掉，否则插件仍处于停用状态）。
