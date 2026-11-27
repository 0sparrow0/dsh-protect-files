/**
 * dsh-protect-files — Client half.
 *
 * The same editor is mounted on three surfaces so it is reachable no matter
 * which entry point the user picks:
 *
 * 1. Settings → "Protected paths" (`settings.section`), a top-level row in the
 *    settings sidebar that reads and writes the row's configuration through the
 *    settings Remote namespaces itself.
 * 2. Plugins → this bundle's page (`plugins.bundle.config`, keyed by package
 *    name), rendered between the description and the rows.
 * 3. Plugins → the row's own page (`plugins.row.config`), which the page owner
 *    opens by passing that row's live configuration form.
 */

window.__ModuleLoader__.load({
  id: 'dsh-protect-files',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    const NS = 'dsh-protect-files'

    const en = {
      nav: 'Protected paths',
      title: 'Protected paths',
      description: 'Agent tools may not read, search, or write the paths below. Every group applies at once.',
      masterOn: 'Protection is on',
      masterOff: 'Protection is off',
      groups: 'Groups',
      empty: 'No groups yet. Add a group, then add the directories and files the agent must not touch.',
      addGroup: 'Add group',
      groupName: 'Group name',
      groupEnabled: 'Group active',
      removeGroup: 'Remove group',
      entries: 'Protected paths',
      noEntries: 'No paths in this group yet.',
      addEntry: 'Add path',
      addDirectory: 'Add directory',
      pathPlaceholder: 'Absolute path, for example D:\\projects\\shop\\config\\prod',
      kindDir: 'Directory',
      kindFile: 'File',
      toggleKind: 'Click to switch between directory and file',
      browse: 'Browse',
      save: 'Save',
      revert: 'Revert',
      saving: 'Saving',
      saved: 'Saved',
      saveFailed: 'The host refused the change. Check the paths and try again.',
      unsaved: 'Unsaved changes',
      noChanges: 'No unsaved changes',
      readOnly: 'This profile is read-only, so the configuration cannot be changed.',
      unavailable: 'The configuration of this plugin is not registered in the running profile. Enable the bundle under Plugins and reload this page.',
      loading: 'Loading configuration',
      configMissing: 'This page received no configuration form. Open Settings → Protected paths instead.',
      rowFormUnavailable: 'This row\'s configuration form is not registered in the running client. Use Settings → Protected paths instead.',
      unavailableDetail: 'Details',
      pathsCount: 'paths',
      sourceHint: 'Stored in this profile\'s plugin configuration; changes apply immediately.',
      note: 'The protected paths and everything under them may not be read, searched, or written, but their PARENT directories stay usable: listing, glob, and grep still work, and protected entries are removed from those results. A shell listing may still show the protected directory\'s name; its contents never appear.',
      noteInstall: 'The profile patch file is protected too, so a tool call cannot rewrite the composition and switch this protection off.',
      auditHint: 'Denied attempts are appended to dsh-protect-files/audit.jsonl inside your DSH home.',
      scope: 'Scope: tool calls that name, resolve to, or write a protected path are denied; parent directories stay usable for listing, glob and grep (protected entries are removed from results); shell commands that name one are denied too; the profile patch is protected; denials are written to the audit file.',
      risk: 'Risk: policy-level protection, not operating-system isolation. Shell commands that assemble a path from variables, symlink or short-path spellings, wildcard expansion, and access through MCP, browser automation, or processes outside DSH are not covered. A listing can still show the protected directory name; turning protection off makes those paths visible again; the plugin never changes file permissions or encryption.',
      disclaimer: 'Disclaimer: provided AS-IS with no warranty of any kind, including no warranty of non-infringement. It is not a security product, access control system, or DLP solution, and does not replace OS permissions or disk encryption. The author is not liable for over- or under-blocking, configuration choices, or any direct or indirect loss from exposed configuration. Uninstall if you disagree.',
    }
    const zh = {
      nav: '受保护路径',
      title: '受保护路径',
      description: 'Agent 工具不得读取、搜索或写入下列路径。所有分组同时生效。',
      masterOn: '保护已开启',
      masterOff: '保护已关闭',
      groups: '组',
      empty: '还没有分组。先建立一个分组，再把不希望 agent 访问的目录或文件加进去。',
      addGroup: '新建分组',
      groupName: '分组名称',
      groupEnabled: '分组生效',
      removeGroup: '删除分组',
      entries: '受保护路径',
      noEntries: '这个分组还没有路径。',
      addEntry: '添加路径',
      addDirectory: '添加目录',
      pathPlaceholder: '绝对路径，例如 D:\\projects\\shop\\config\\prod',
      kindDir: '目录',
      kindFile: '文件',
      toggleKind: '点击切换「目录 / 文件」',
      browse: '浏览',
      save: '保存',
      revert: '撤销修改',
      saving: '保存中',
      saved: '已保存',
      saveFailed: '宿主拒绝了这次修改。请检查路径后重试。',
      unsaved: '有未保存的修改',
      noChanges: '没有未保存的修改',
      readOnly: '当前 profile 为只读，无法修改配置。',
      unavailable: '读不到本插件的配置。请稍等片刻或刷新页面；如果下面出现了「诊断信息」，请把它发给插件作者。',
      loading: '正在读取配置',
      configMissing: '这个页面没有拿到配置表单，请改用「设置 → 受保护路径」。',
      rowFormUnavailable: '这个行的配置表单没有在当前客户端注册，请改用「设置 → 受保护路径」。',
      unavailableDetail: '诊断信息',
      pathsCount: '条路径',
      sourceHint: '配置保存在当前 profile 的插件设置里，保存后立即生效。',
      note: '受保护路径本身及其子目录的内容都不允许被读取、搜索或写入；但它的**父目录照常可用**：列目录、glob、grep 都能用，受保护的条目会从结果里被剔除。终端输出里可能仍看到受保护目录的**名字**，内容不会出现。',
      noteInstall: 'profile 的 patch 文件同样受保护，因此工具调用无法改写组合来关掉这层保护。',
      auditHint: '被拒绝的尝试会追加到 DSH 主目录下的 dsh-protect-files/audit.jsonl。',
      scope: '能力范围：点名 / 解析到 / 写入受保护路径的工具调用一律拒绝；父目录仍可列目录、glob、grep（受保护条目自动剔除）；命令行点名受保护路径同样拒绝；profile patch 受保护；拒绝记录写审计文件。',
      risk: '风险与局限：这是策略级防护，不是操作系统隔离——用变量拼接路径的终端命令、符号链接/短路径等等价拼写、通配符展开、以及 MCP / 浏览器 / DSH 之外进程的访问都覆盖不到；终端输出里可能仍出现受保护目录的名字；关闭保护后这些路径立刻恢复可见；本插件不修改任何文件的权限或加密状态。',
      disclaimer: '免责声明：本插件按「现状」提供，不附带任何担保（含不侵权担保），使用风险由使用者自负。它不是安全产品、访问控制系统或 DLP 方案，不能替代操作系统权限管理与磁盘加密；对误拦、漏拦、配置过失以及因配置泄漏造成的任何直接或间接损失不承担责任。不同意者可立即停用并卸载。',
    }

    const dictionaries = { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en }

    /**
     * Active UI language. The plugin ships Chinese and English; anything else
     * falls back to Chinese (the primary audience), English being chosen only
     * when the app itself is an English one. Reading it through a module-level
     * value lets non-React callers (nav labels) follow the locale too.
     */
    let activeLocale = 'zh'
    const resolveLocale = (id) => {
      const normalized = typeof id === 'string' ? id.toLowerCase() : ''
      return normalized.startsWith('en') ? 'en' : 'zh'
    }
    const uiText = (key) => {
      const dict = activeLocale === 'en' ? en : zh
      return dict[key] ?? zh[key] ?? en[key] ?? key
    }

    /**
     * Control colors. Interactive fills use a fixed accent because a theme's
     * brand token can resolve to a near-white, which used to paint the switch
     * into a solid white pill and hide the primary button's label. Everything
     * else keeps the theme tokens with an explicit fallback, so a missing token
     * still yields a readable control.
     */
    const COLOR = {
      border: 'var(--dsw-alias-border-l1, #3f444d)',
      strongBorder: 'var(--dsw-alias-border-l2, #5d6470)',
      text: 'inherit',
      muted: 'var(--dsw-alias-label-secondary, #9aa1ad)',
      surface: 'transparent',
      nested: 'transparent',
      accent: '#2f6fdb',
      accentText: '#ffffff',
      success: '#3fb950',
      error: '#e5534b',
    }

    /** Copy a value so drafts never mutate accepted config. */
    function cloneGroups(input) {
      const groups = Array.isArray(input) ? input : []
      return groups.map(group => ({
        name: typeof group?.name === 'string' ? group.name : 'Group',
        enabled: group?.enabled !== false,
        entries: (Array.isArray(group?.entries) ? group.entries : []).map(entry => ({
          path: typeof entry?.path === 'string' ? entry.path : '',
          kind: entry?.kind === 'file' ? 'file' : 'dir',
        })),
      }))
    }

    /** Drop blank paths and normalize what is saved. */
    function cleanGroups(groups) {
      return groups.map((group) => {
        const name = String(group.name ?? '').trim()
        const entries = group.entries
          .map(entry => ({ path: String(entry.path ?? '').trim(), kind: entry.kind === 'file' ? 'file' : 'dir' }))
          .filter(entry => entry.path.length > 0)
        return { name: name.length > 0 ? name : 'Group', enabled: group.enabled !== false, entries }
      })
    }

    const styles = {
      root: { display: 'flex', flexDirection: 'column', gap: '14px', color: COLOR.text, fontSize: '13px', lineHeight: '1.5' },
      header: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
      heading: { margin: 0, fontSize: '14px', fontWeight: 600, color: COLOR.text },
      description: { margin: 0, color: COLOR.muted },
      switchLabel: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: COLOR.muted },
      card: {
        display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px',
        border: `1px solid ${COLOR.border}`, borderRadius: '10px', background: COLOR.surface,
      },
      cardHead: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
      sectionLabel: { margin: 0, fontSize: '12px', color: COLOR.muted, textTransform: 'uppercase', letterSpacing: '0.04em' },
      entryRow: {
        display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '8px',
        background: COLOR.nested, border: `1px solid ${COLOR.border}`,
      },
      addRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
      input: {
        flex: '1 1 220px', minWidth: '160px', padding: '7px 9px', fontSize: '13px',
        color: COLOR.text, background: COLOR.surface, border: `1px solid ${COLOR.border}`, borderRadius: '8px',
        fontFamily: 'inherit',
      },
      codeInput: {
        flex: '1 1 260px', minWidth: '180px', padding: '7px 9px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '12.5px', color: COLOR.text, background: COLOR.surface,
        border: `1px solid ${COLOR.border}`, borderRadius: '8px',
      },
      button: {
        padding: '6px 11px', fontSize: '12.5px', color: COLOR.text, background: COLOR.surface,
        border: `1px solid ${COLOR.strongBorder}`, borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      },
      primary: {
        padding: '6px 14px', fontSize: '12.5px', fontWeight: 600, color: COLOR.accentText, background: COLOR.accent,
        border: `1px solid ${COLOR.accent}`, borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
        minWidth: '76px', whiteSpace: 'nowrap',
      },
      quiet: {
        padding: '4px 8px', fontSize: '12px', color: COLOR.muted, background: 'transparent',
        border: 'none', borderRadius: '6px', cursor: 'pointer', fontFamily: 'inherit',
      },
      badge: { fontSize: '11.5px', color: COLOR.muted, border: `1px solid ${COLOR.border}`, borderRadius: '999px', padding: '1px 7px' },
      footer: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
      status: { fontSize: '12.5px' },
      note: { margin: 0, color: COLOR.muted, fontSize: '12.5px' },
    }

    /** Small self-contained switch: fixed accent track so it never turns into a blank pill. */
    function Switch(props) {
      const checked = props.checked === true
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': props.label,
        disabled: props.disabled,
        onClick: () => {
          if (!props.disabled) props.onChange(!checked)
        },
        style: {
          display: 'inline-flex', alignItems: 'center', flex: '0 0 auto', boxSizing: 'border-box',
          width: '40px', height: '24px', padding: '3px',
          borderRadius: '999px',
          border: `1px solid ${checked ? COLOR.accent : COLOR.strongBorder}`,
          background: checked ? COLOR.accent : 'transparent',
          cursor: props.disabled ? 'not-allowed' : 'pointer',
          opacity: props.disabled ? 0.5 : 1,
          transition: 'background 140ms ease, border-color 140ms ease',
        },
      }, h('span', {
        style: {
          display: 'block', flex: '0 0 auto', width: '16px', height: '16px', borderRadius: '999px',
          background: checked ? COLOR.accentText : COLOR.muted,
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 140ms ease',
        },
      }))
    }

    /**
     * Settings navigation glyph: the same shield-and-folder subject as the
     * package icon, redrawn as vector geometry at the shell's requested size so
     * the sidebar row matches the plugin card instead of the shell fallback.
     * Inherits `currentColor` so it follows the active/inactive row color.
     */
    function SettingsNavIcon(props) {
      const size = typeof props?.size === 'number' && props.size > 0 ? props.size : 16
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 36 36',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block', color: 'currentColor' },
      }, [
        h('path', {
          key: 'shield',
          d: 'M18 3.2 30.6 6.5v9.3c0 7.4-5 13.3-12.6 16.4C10.4 29.1 5.4 23.2 5.4 15.8V6.5Z',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2.6,
          strokeLinejoin: 'round',
        }),
        h('path', {
          key: 'folder',
          d: 'M12.2 15.1h3.2l1.5-1.9h3.1l1.4 1.9h2.4a1.6 1.6 0 0 1 1.6 1.6v6.5a1.6 1.6 0 0 1-1.6 1.6H12.2a1.6 1.6 0 0 1-1.6-1.6v-6.5a1.6 1.6 0 0 1 1.6-1.6Z',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2.3,
          strokeLinejoin: 'round',
          strokeLinecap: 'round',
        }),
      ])
    }

    /** The group editor itself; its only input is the namespace form it edits. */
    function ProtectFilesEditor(props) {
      const t = uiText
      const { view, form, pickDirectory } = props
      const state = form?.state
      const revision = state?.revision
      const accepted = state?.value
      const [draft, setDraft] = React.useState(null)
      const [status, setStatus] = React.useState('idle')
      const [pending, setPending] = React.useState({})

      React.useEffect(() => {
        setDraft(cloneGroups(accepted?.groups))
        setStatus('idle')
      }, [revision])

      if (view !== 'page') return null
      // Never render a blank page: say what is missing instead.
      if (form === undefined || form === null || state === undefined || state === null) {
        return h('p', { style: styles.note }, t('configMissing'))
      }
      if (state.status === 'loading') return h('p', { style: styles.note }, `${t('loading')}…`)
      if (state.status === 'unavailable') return h('p', { style: styles.note }, t('rowFormUnavailable'))

      const groups = draft ?? cloneGroups(accepted?.groups)
      const disabled = state.writable === false
      const dirty = JSON.stringify(groups) !== JSON.stringify(cloneGroups(accepted?.groups))

      const setGroups = (next) => {
        setDraft(next)
        setStatus('dirty')
      }

      const updateGroup = (index, patch) => {
        setGroups(groups.map((group, at) => (at === index ? { ...group, ...patch } : group)))
      }

      const write = async (ops) => {
        setStatus('saving')
        let ok = false
        try {
          ok = await form.mutate(ops)
        } catch {
          ok = false
        }
        setStatus(ok ? 'saved' : 'failed')
      }

      const toggleMaster = () => {
        if (disabled) return
        void write([{ op: 'set', path: ['enabled'], value: accepted?.enabled === false }])
      }

      const pendingOf = (index) => pending[index] ?? { path: '', kind: 'dir' }

      const addEntry = (index, path, kind) => {
        const trimmed = String(path ?? '').trim()
        if (trimmed.length === 0) return
        updateGroup(index, { entries: [...groups[index].entries, { path: trimmed, kind: kind === 'file' ? 'file' : 'dir' }] })
        setPending(current => ({ ...current, [index]: { path: '', kind: 'dir' } }))
      }

      const groupCards = groups.map((group, index) => h('section', { key: `group-${index}`, style: styles.card, 'data-protect-group': group.name }, [
        h('header', { key: 'head', style: styles.cardHead }, [
          h('input', {
            key: 'name',
            style: { ...styles.input, flex: '1 1 180px' },
            value: group.name,
            placeholder: t('groupName'),
            disabled,
            'aria-label': t('groupName'),
            onChange: event => updateGroup(index, { name: event.target.value }),
          }),
          h('label', { key: 'enabled', style: { display: 'flex', alignItems: 'center', gap: '7px', color: COLOR.muted, fontSize: '12.5px' } }, [
            h(Switch, {
              key: 'switch',
              checked: group.enabled !== false,
              disabled,
              label: t('groupEnabled'),
              onChange: value => updateGroup(index, { enabled: value }),
            }),
            h('span', { key: 'text' }, t('groupEnabled')),
          ]),
          h('button', {
            key: 'remove',
            type: 'button',
            style: { ...styles.quiet, color: COLOR.error },
            disabled,
            onClick: () => setGroups(groups.filter((_item, at) => at !== index)),
          }, t('removeGroup')),
        ]),
        h('p', { key: 'label', style: styles.sectionLabel }, `${t('entries')} · ${group.entries.length}`),
        group.entries.length === 0
          ? h('p', { key: 'empty', style: styles.note }, t('noEntries'))
          : h('div', { key: 'entries', style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, group.entries.map((entry, at) => h('div', {
            key: `entry-${at}`,
            style: styles.entryRow,
            'data-protect-entry': entry.path,
          }, [
            h('input', {
              key: 'path',
              style: styles.codeInput,
              value: entry.path,
              placeholder: t('pathPlaceholder'),
              disabled,
              'aria-label': t('entries'),
              onChange: event => updateGroup(index, {
                entries: groups[index].entries.map((item, position) => (position === at ? { ...item, path: event.target.value } : item)),
              }),
            }),
            h('span', { key: 'kind', style: styles.badge }, entry.kind === 'file' ? t('kindFile') : t('kindDir')),
            h('button', {
              key: 'remove',
              type: 'button',
              style: { ...styles.quiet, color: COLOR.error },
              disabled,
              onClick: () => updateGroup(index, { entries: groups[index].entries.filter((_item, position) => position !== at) }),
            }, '×'),
          ]))),
        h('div', { key: 'add', style: styles.addRow }, [
          h('input', {
            key: 'path',
            style: styles.codeInput,
            value: pendingOf(index).path,
            placeholder: t('pathPlaceholder'),
            disabled,
            'aria-label': t('addEntry'),
            onChange: event => setPending(current => ({
              ...current,
              [index]: { ...pendingOf(index), path: event.target.value },
            })),
            onKeyDown: (event) => {
              if (event.key === 'Enter') addEntry(index, pendingOf(index).path, pendingOf(index).kind)
            },
          }),
          h('button', {
            key: 'kind',
            type: 'button',
            style: { ...styles.button, minWidth: '58px' },
            disabled,
            title: t('toggleKind'),
            'aria-label': t('toggleKind'),
            onClick: () => setPending(current => ({
              ...current,
              [index]: {
                ...pendingOf(index),
                kind: pendingOf(index).kind === 'file' ? 'dir' : 'file',
              },
            })),
          }, pendingOf(index).kind === 'file' ? t('kindFile') : t('kindDir')),
          h('button', {
            key: 'add',
            type: 'button',
            style: styles.button,
            disabled,
            onClick: () => addEntry(index, pendingOf(index).path, pendingOf(index).kind),
          }, t('addEntry')),
          typeof pickDirectory === 'function'
            ? h('button', {
              key: 'browse',
              type: 'button',
              style: styles.button,
              disabled,
              onClick: () => {
                void Promise.resolve(pickDirectory()).then((chosen) => {
                  if (typeof chosen === 'string' && chosen.length > 0) addEntry(index, chosen, 'dir')
                })
              },
            }, t('browse'))
            : null,
        ]),
      ]))

      const statusText = status === 'saving'
        ? `${t('saving')}…`
        : status === 'saved'
          ? t('saved')
          : status === 'failed'
            ? t('saveFailed')
            : status === 'dirty'
              ? t('unsaved')
              : ''

      const totalPaths = groups.reduce((sum, group) => sum + group.entries.length, 0)

      return h('div', { style: styles.root }, [
        h('div', { key: 'header', style: styles.header }, [
          h('h3', { key: 'title', style: styles.heading }, t('title')),
          h('span', { key: 'count', style: styles.badge }, `${groups.length} ${t('groups')} · ${totalPaths} ${t('pathsCount')}`),
          h('div', { key: 'master', style: { ...styles.switchLabel, marginLeft: 'auto' } }, [
            h('span', { key: 'text' }, accepted?.enabled === false ? t('masterOff') : t('masterOn')),
            h(Switch, {
              key: 'switch',
              checked: accepted?.enabled !== false,
              disabled,
              label: t('masterOn'),
              onChange: toggleMaster,
            }),
          ]),
        ]),
        h('p', { key: 'description', style: styles.description }, t('description')),
        h('p', { key: 'source', style: styles.note }, t('sourceHint')),
        groups.length === 0
          ? h('p', { key: 'empty', style: styles.note }, t('empty'))
          : h('div', { key: 'groups', style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, groupCards),
        h('div', { key: 'add', style: styles.footer }, [
          h('button', {
            key: 'add-group',
            type: 'button',
            style: styles.button,
            disabled,
            onClick: () => setGroups([...groups, { name: 'Group' + String(groups.length + 1), enabled: true, entries: [] }]),
          }, t('addGroup')),
          h('button', {
            key: 'save',
            type: 'button',
            style: { ...styles.primary, opacity: dirty && !disabled ? 1 : 0.62 },
            disabled: disabled || !dirty || status === 'saving',
            title: dirty || disabled ? undefined : t('noChanges'),
            onClick: () => { void write([{ op: 'set', path: ['groups'], value: cleanGroups(groups) }]) },
          }, status === 'saving' ? `${t('saving')}…` : t('save')),
          h('button', {
            key: 'revert',
            type: 'button',
            style: styles.button,
            disabled: disabled || !dirty,
            onClick: () => {
              setDraft(cloneGroups(accepted?.groups))
              setPending({})
              setStatus('idle')
            },
          }, t('revert')),
          statusText.length > 0
            ? h('span', {
              key: 'status',
              style: { ...styles.status, color: status === 'failed' ? COLOR.error : status === 'saved' ? COLOR.success : COLOR.muted },
            }, statusText)
            : null,
        ]),
        disabled ? h('p', { key: 'readonly', style: styles.note }, t('readOnly')) : null,
        h('p', { key: 'note', style: styles.note }, t('note')),
        accepted?.guardProfile !== false ? h('p', { key: 'note-install', style: styles.note }, t('noteInstall')) : null,
        h('p', { key: 'audit', style: styles.note }, t('auditHint')),
        h('div', {
          key: 'scope',
          style: {
            display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '6px',
            borderTop: `1px solid ${COLOR.border}`,
          },
        }, [
          h('p', { key: 'scope', style: styles.note }, t('scope')),
          h('p', { key: 'risk', style: { ...styles.note, color: COLOR.muted } }, t('risk')),
          h('p', { key: 'disclaimer', style: { ...styles.note, color: COLOR.muted, fontSize: '11.5px' } }, t('disclaimer')),
        ]),
      ])
    }

    /**
     * Settings-section mount: the settings page hands raw props instead of a
     * prepared namespace form, so this wrapper reads the namespace through the
     * settings Remote itself and adapts it to the editor's form contract.
     */
    function SettingsPanel(props) {
      const t = uiText
      // A missing injected face degrades to "unavailable" instead of throwing.
      const api = props.api ?? {
        load: async () => ({ status: 'unavailable' }),
        save: async () => false,
        subscribe: () => () => {},
      }
      const [state, setState] = React.useState({ status: 'loading' })
      const alive = React.useRef(true)

      const reload = React.useCallback(async () => {
        try {
          const next = await api.load()
          if (alive.current) setState(next)
        } catch {
          if (alive.current) setState({ status: 'unavailable' })
        }
      }, [api])

      React.useEffect(() => {
        alive.current = true
        void reload()
        const off = api.subscribe(() => { void reload() })
        return () => {
          alive.current = false
          off()
        }
      }, [api, reload])

      const mutate = React.useCallback(async (ops) => {
        try {
          const ok = await api.save(ops)
          if (ok) void reload()
          return ok
        } catch {
          return false
        }
      }, [api, reload])

      if (state.status === 'unavailable') {
        return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
          h('p', { key: 'msg', style: styles.note }, t('unavailable')),
          typeof state.reason === 'string' && state.reason.length > 0
            ? h('p', {
              key: 'diag',
              style: { ...styles.note, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '11.5px', wordBreak: 'break-word' },
            }, `${t('unavailableDetail')}: ${state.reason}`)
            : null,
        ])
      }

      return h(ProtectFilesEditor, {
        view: 'page',
        form: { state, mutate },
        t,
        pickDirectory: props.pickDirectory,
      })
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = uiText
        ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-protect-files: dictionaries')

        /** Read the active language id from whichever field this build exposes. */
        const readLocale = () => {
          try {
            const snapshot = ctx.locale.getLocale()
            const active = snapshot?.active ?? snapshot?.id ?? snapshot?.locale
            if (typeof active === 'string' && active.length > 0) return active
          } catch {
            // Fall through to the subscribed snapshot.
          }
          try {
            const snapshot = ctx.locale.getSnapshot?.()
            const active = snapshot?.active ?? snapshot?.id
            if (typeof active === 'string' && active.length > 0) return active
          } catch {
            return undefined
          }
          return undefined
        }

        // Seed before anything renders, then keep in step with locale switches.
        activeLocale = resolveLocale(readLocale())
        if (typeof ctx.locale.subscribe === 'function') {
          ctx.effect(() => ctx.locale.subscribe(() => {
            const next = resolveLocale(readLocale())
            if (next === activeLocale) return
            activeLocale = next
            // Nav labels are thunks re-read on projection, and the shell
            // re-renders on its own locale change, so nothing must be
            // re-registered here.
          }), 'dsh-protect-files: locale tracking')
        }

        const pickDirectory = async () => {
          const workspace = ctx.get('uiWorkspace')
          if (workspace === undefined || typeof workspace.pickDirectory !== 'function') return null
          try {
            return await workspace.pickDirectory()
          } catch {
            return null
          }
        }

        // Settings Remote adapter: locate this plugin's own namespace by the
        // entry id suffix, so a relocated row id ("include:…") still matches.
        const isMine = view => typeof view?.ns === 'string' && view.ns.endsWith('dsh-protect-files')

        // Configuration access goes through the settings provider's shared
        // `configForms` service: it already owns the describe mirror and one
        // form per namespace, which is exactly what the Plugins page uses. The
        // row id may have been relocated to "include:<row id>", so the
        // namespace is matched by suffix instead of by an exact id.
        const configForms = () => {
          try {
            const service = ctx.get('configForms')
            if (service !== undefined && service !== null && typeof service.get === 'function') return service
          } catch {
            // Fall through to the property and injected-reference probes.
          }
          try {
            const value = ctx.configForms
            if (value !== undefined && value !== null && typeof value.get === 'function') return value
          } catch {
            // Not a plain property of this context; the injected reference may answer.
          }
          return injectedConfigForms
        }
        // The settings provider exposes `configForms` as a Cordis service; an
        // injected child scope is the documented way to reach one that another
        // plugin owns, and its callback runs as soon as the provider mounts.
        let injectedConfigForms
        ctx.inject(['configForms'], (child) => {
          try {
            injectedConfigForms = child.configForms
          } catch {
            injectedConfigForms = undefined
          }
        })

        /** Resolve (and cache) this plugin's namespace form. */
        let bound
        const bindForm = () => {
          const service = configForms()
          if (service === undefined) {
            return { missing: 'configForms 服务缺失：客户端设置服务没有挂载到本插件作用域' }
          }
          let face
          try {
            face = service.describe()
          } catch {
            return { missing: 'configForms.describe 不可用：读不到设置镜像' }
          }
          const view = face?.getSnapshot?.()?.view
          const namespaces = Array.isArray(view?.namespaces) ? view.namespaces : []
          const found = namespaces.find(isMine)
          if (found === undefined) {
            void face?.ensure?.()
            // The mirror can lag one reload behind; a direct form for either
            // possible entry id still answers once the Host has served it.
            for (const candidate of ['include:dsh-protect-files', 'dsh-protect-files']) {
              try {
                const form = service.get(candidate)
                const snapshot = form?.getSnapshot?.()
                if (snapshot?.status === undefined || snapshot.status === 'unavailable') continue
                bound = { ns: candidate, form, face }
                return bound
              } catch {
                // Try the next spelling before reporting the mirror contents.
              }
            }
            const seen = namespaces.map(row => row?.ns).filter(ns => typeof ns === 'string').slice(0, 10).join(' | ')
            return { face, missing: `设置镜像里没有本插件的命名空间（共 ${namespaces.length} 个：${seen || '无'}）` }
          }
          if (bound === undefined || bound.ns !== found.ns) {
            bound = { ns: found.ns, form: service.get(found.ns), face }
          }
          return bound
        }

        const api = {
          async load() {
            const boundNow = bindForm()
            if (boundNow.missing !== undefined) return { status: 'unavailable', reason: boundNow.missing }
            const snapshot = boundNow.form.getSnapshot()
            if (snapshot.status === 'unavailable') {
              return { status: 'unavailable', reason: `命名空间 ${boundNow.ns} 没有提供给当前客户端` }
            }
            if (snapshot.status !== 'ready') {
              void boundNow.face?.ensure?.()
              return { status: 'loading' }
            }
            const value = snapshot.value !== null && typeof snapshot.value === 'object' ? snapshot.value : {}
            return {
              status: 'ready',
              value,
              revision: snapshot.revision,
              writable: snapshot.writable !== false,
            }
          },
          async save(ops) {
            const boundNow = bindForm()
            if (boundNow.missing !== undefined) return false
            try {
              return await boundNow.form.mutate(ops)
            } catch {
              return false
            }
          },
          subscribe(listener) {
            const disposers = []
            const boundNow = bindForm()
            try {
              if (boundNow.form !== undefined) disposers.push(boundNow.form.subscribe(() => listener()))
            } catch {
              // The mirror subscription below still refreshes this surface.
            }
            try {
              if (boundNow.face !== undefined) disposers.push(boundNow.face.subscribe(() => listener()))
            } catch {
              // Without a describe face, reloads come from reconnect handling.
            }
            try {
              disposers.push(ctx.on('connection/reset', () => listener()))
            } catch {
              // No connection lifecycle in this client; manual reload still works.
            }
            return () => { for (const dispose of disposers) dispose() }
          },
        }

        const injected = { t, pickDirectory, api }

        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key: 'dsh-protect-files#dsh-protect-files',
          locale: NS,
          inject: () => injected,
        }, ProtectFilesEditor))

        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config',
          key: 'dsh-protect-files',
          locale: NS,
          inject: () => injected,
        }, SettingsPanel))

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-protect-files',
          order: 42,
          label: () => t('nav'),
          locale: NS,
          inject: () => injected,
        }, SettingsPanel))

        // The settings sidebar glyph is a SEPARATE slot addressed by the section
        // id; without it the shell draws its own fallback glyph, which is why the
        // row did not match this plugin's card icon.
        ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
          name: 'settings.section.icon',
          id: 'dsh-protect-files',
          order: 42,
          locale: NS,
          inject: () => ({ t }),
        }, SettingsNavIcon))
      },
    }
  },
})
