/**
 * Headless probe for the client half: loads `client.js` into a stubbed module
 * loader, applies it to a fake Cordis context, then exercises the settings
 * adapter the Settings page and the bundle page rely on.
 *
 *   ELECTRON_RUN_AS_NODE=1 <dsh node> test/client.probe.mjs
 *
 * The component itself is never rendered; what is checked is registration and
 * the configuration read/write path, which is where the "not registered in the
 * running profile" failure lived.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail.length > 0 ? ` -> ${detail}` : ''}`)
}

/** Load client.js into the given window/require pair and return its plugin face. */
function loadClient(window, requireFn) {
  // eslint-disable-next-line no-new-func
  const run = new Function('window', 'require', source)
  run(window, requireFn)
  return captured.plugin
}

let captured = {}

function makeWindow() {
  return {
    __ModuleLoader__: {
      load(definition) {
        const plugin = definition.factory(requireFn)
        captured = { plugin, id: definition.id }
      },
    },
  }
}

const requireFn = (name) => {
  if (name !== 'react') throw new Error(`unexpected import ${name}`)
  const React = {
    createElement: (...args) => ({ type: args[0], props: args[1], children: args[2] }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useRef: (initial) => ({ current: initial }),
  }
  return React
}

/** Fake `ctx.configForms` backed by a mutable mirror + one namespace form. */
function makeConfigForms(options) {
  const namespaces = options.namespaces
  const mirror = {
    getSnapshot: () => ({ status: 'ready', view: { namespaces, writable: options.writable !== false, hasDocument: false }, error: null }),
    subscribe: () => () => {},
    ensure: async () => {},
    acceptView: () => {},
  }
  const forms = new Map()
  const service = {
    describe: () => mirror,
    get(entryId) {
      if (!forms.has(entryId)) {
        const view = namespaces.find(row => row.ns === entryId)
        forms.set(entryId, {
          getSnapshot: () => view === undefined
            ? { status: 'unavailable', value: undefined, revision: undefined, writable: false, base: undefined, user: undefined }
            : { status: 'ready', value: view.value, revision: view.revision, writable: options.writable !== false, base: undefined, user: undefined },
          subscribe: () => () => {},
          set: async () => true,
          unset: async () => true,
          mutate: async (ops, revision) => {
            options.mutations.push({ entryId, ops, revision })
            return options.mutateResult !== false
          },
        })
      }
      return forms.get(entryId)
    },
  }
  return service
}

/** Fake plugin context with just what the client half touches. */
function makeCtx(service, localeId = 'zh') {
  const slots = new Map()
  const ctx = {
    locale: {
      bind: (ns) => (key, params) => `${ns}:${key}${params === undefined ? '' : `:${JSON.stringify(params)}`}`,
      register: () => () => {},
      getLocale: () => (localeId === null ? {} : { active: localeId, revision: 1 }),
      getSnapshot: () => (localeId === null ? {} : { active: localeId, revision: 1 }),
    },
    slots: {
      inject(key, callback) {
        callback()
        return () => {}
      },
      register(options, component) {
        slots.set(`${options.name}#${options.key ?? options.id ?? ''}`, { options, component })
        return () => {}
      },
    },
    effect(fn) {
      const disposer = fn()
      return () => { if (typeof disposer === 'function') disposer() }
    },
    on: () => () => {},
    get(name) {
      if (name === 'configForms') return service
      return undefined
    },
    inject: () => ({ dispose() {} }),
  }
  return { ctx, slots }
}

const value = { enabled: true, guardShell: true, guardProfile: true, announce: true, groups: [{ name: 'shop-prod', enabled: true, entries: [{ path: 'D:/shop/config/prod', kind: 'dir' }] }] }

// 1. Serving namespace, relocated entry id.
{
  const mutations = []
  const service = makeConfigForms({
    namespaces: [{ ns: 'include:dsh-protect-files', revision: 7, value }],
    mutations,
  })
  captured = {}
  const plugin = loadClient(makeWindow(), requireFn)
  const { ctx, slots } = makeCtx(service)
  plugin.apply(ctx)

  check('settings.section registers', slots.has('settings.section#dsh-protect-files'))
  check('settings.section.icon registers under the same id', slots.has('settings.section.icon#dsh-protect-files'))
  {
    const icon = slots.get('settings.section.icon#dsh-protect-files')
    const rendered = typeof icon?.component === 'function' ? icon.component({ size: 18 }) : undefined
    const svg = rendered
    const okIcon = svg !== undefined
      && svg.type === 'svg'
      && svg.props.width === 18
      && svg.props.height === 18
      && Array.isArray(svg.children)
      && svg.children.length === 2
      && svg.children.every(child => child.props.stroke === 'currentColor')
    check('nav icon honours the requested size and inherits row color', okIcon)
  }
  check('plugins.bundle.config registers', slots.has('plugins.bundle.config#dsh-protect-files'))
  check('plugins.row.config registers', slots.has('plugins.row.config#dsh-protect-files#dsh-protect-files'))
  check('bundle page uses the self-loading panel', slots.get('plugins.bundle.config#dsh-protect-files')?.component?.name === 'SettingsPanel')
  check('row page uses the owner-provided form', slots.get('plugins.row.config#dsh-protect-files#dsh-protect-files')?.component?.name === 'ProtectFilesEditor')

  const injected = slots.get('settings.section#dsh-protect-files').options.inject()
  const loaded = await injected.api.load()
  check('panel load resolves the namespace', loaded.status === 'ready', loaded.status !== 'ready' ? String(loaded.reason) : `revision ${loaded.revision}`)
  check('panel load returns the stored groups', Array.isArray(loaded.value?.groups) && loaded.value.groups.length === 1, JSON.stringify(loaded.value?.groups?.[0]?.name))
  check('panel load reports writability', loaded.writable === true)

  const saved = await injected.api.save([{ op: 'set', path: ['groups'], value: [{ name: 'g2', enabled: true, entries: [] }] }])
  check('panel save writes through the form', saved === true && mutations.length === 1, JSON.stringify(mutations[0]?.ops?.[0]?.path))

  const disposer = injected.api.subscribe(() => {})
  check('panel subscribe returns a disposer', typeof disposer === 'function')
  disposer()

  // The UI follows the app language: Chinese by default, English for English apps,
  // and anything untranslated falls back to Chinese.
  check('zh locale resolves Chinese labels', injected.t('save') === '保存', injected.t('save'))
  check('zh locale names the settings entry', injected.t('nav') === '受保护路径', injected.t('nav'))
  const enCtx = makeCtx(undefined, 'en-US')
  captured = {}
  loadClient(makeWindow(), requireFn).apply(enCtx.ctx)
  const enInjected = enCtx.slots.get('settings.section#dsh-protect-files').options.inject()
  check('an English app resolves English labels', enInjected.t('save') === 'Save', enInjected.t('save'))
  const frCtx = makeCtx(undefined, 'fr')
  captured = {}
  loadClient(makeWindow(), requireFn).apply(frCtx.ctx)
  const frInjected = frCtx.slots.get('settings.section#dsh-protect-files').options.inject()
  check('an untranslated app falls back to Chinese', frInjected.t('save') === '保存', frInjected.t('save'))
}

// 2. No configForms service at all.
{
  captured = {}
  const plugin = loadClient(makeWindow(), requireFn)
  const { ctx, slots } = makeCtx(undefined)
  plugin.apply(ctx)
  const injected = slots.get('settings.section#dsh-protect-files').options.inject()
  const loaded = await injected.api.load()
  check('missing service reports a reason', loaded.status === 'unavailable' && String(loaded.reason).includes('configForms'), String(loaded.reason))
  check('missing service refuses to save', (await injected.api.save([])) === false)
}

// 3. Mirror without this namespace.
{
  captured = {}
  const plugin = loadClient(makeWindow(), requireFn)
  const service = makeConfigForms({ namespaces: [{ ns: 'llm-deepseek', revision: 1, value: {} }], mutations: [] })
  const { ctx, slots } = makeCtx(service)
  plugin.apply(ctx)
  const injected = slots.get('settings.section#dsh-protect-files').options.inject()
  const loaded = await injected.api.load()
  check('absent namespace reports the mirror contents', loaded.status === 'unavailable' && String(loaded.reason).includes('设置镜像'), String(loaded.reason))
}

// 4. Control painting: the reported bug was a brand token that resolved to white.
{
  const mutations = []
  const service = makeConfigForms({ namespaces: [{ ns: 'dsh-protect-files', revision: 3, value }], mutations })
  captured = {}
  const plugin = loadClient(makeWindow(), requireFn)
  const { ctx, slots } = makeCtx(service)
  plugin.apply(ctx)

  const editor = slots.get('plugins.row.config#dsh-protect-files#dsh-protect-files').component
  const tree = editor({
    view: 'page',
    form: {
      state: { status: 'ready', value, revision: 3, writable: true, base: undefined, user: undefined },
      mutate: async () => true,
    },
  })

  const walk = (node, out = []) => {
    if (node === null || typeof node !== 'object') return out
    if (Array.isArray(node)) {
      for (const child of node) walk(child, out)
      return out
    }
    // Our stub createElement keeps component functions unexpanded; render them.
    if (typeof node.type === 'function') {
      walk([node.type(node.props ?? {})], out)
      return out
    }
    if (node.props !== undefined) out.push(node)
    walk(node.children, out)
    return out
  }
  const nodes = tree === undefined ? [] : walk([tree])

  const switches = nodes.filter(n => n.props.role === 'switch')
  const onSwitch = switches.find(n => n.props['aria-checked'] === 'true')
  check('switch renders with role semantics', switches.length >= 2 && onSwitch !== undefined, `${switches.length} switches`)
  check('switch ON paints the fixed accent, not a theme token',
    onSwitch !== undefined && typeof onSwitch.props.style.background === 'string' && onSwitch.props.style.background.startsWith('#'),
    String(onSwitch?.props?.style?.background))
  const knob = onSwitch === undefined ? undefined : walk([onSwitch.children])[0]
  check('switch knob stays visible on the accent track', knob?.props?.style?.background === '#ffffff', String(knob?.props?.style?.background))

  const buttons = nodes.filter(n => n.props.type === 'button' && n.children !== undefined)
  const labelled = buttons.map((node) => {
    const children = Array.isArray(node.children) ? node.children : [node.children]
    const text = children.filter(child => typeof child === 'string').join('')
    return { text, style: node.props.style ?? {} }
  })
  const save = labelled.find(item => item.text === '保存' || item.text.startsWith('保存中'))
  check('save button exists with a readable label', save !== undefined, save?.text)
  check('save button paints the accent and keeps white text',
    save !== undefined && save.style.background === '#2f6fdb' && save.style.color === '#ffffff',
    `${save?.style?.background} / ${save?.style?.color}`)
  const addGroup = labelled.find(item => item.text === '新建分组')
  check('add-group button sits beside a readable save control', addGroup !== undefined, addGroup?.text)
  const tokenFree = labelled.every(item => !String(item.style.background ?? '').includes('brand-primary'))
  check('no control depends on the brand token', tokenFree)
}

// 5. Loader metadata id.
{
  captured = {}
  loadClient(makeWindow(), requireFn)
  check('client module id matches the package name', captured.id === 'dsh-protect-files', String(captured.id))
}

console.log(`\n${failures === 0 ? 'ALL CLIENT CHECKS PASSED' : `${failures} CLIENT CHECK(S) FAILED`}`)
process.exitCode = failures === 0 ? 0 : 1
