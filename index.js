/**
 * dsh-protect-files — Host half.
 *
 * Keeps a user-managed set of protected paths (grouped) out of every agent
 * tool call, and out of every tool result the model is allowed to see.
 *
 * Enforcement points, strongest first:
 * 1. A global `ctx.tools.guard()` denial. Guards run after pre-execute policy
 *    and cannot be overridden by other plugins, later registration order, or
 *    the model: a denied call never reaches its tool body.
 * 2. A `tools/post-execute` result filter. Search and listing tools can name
 *    protected files without being given their path (for example a workspace
 *    wide grep), so their model-visible text is scrubbed line by line.
 * 3. A system-prompt notice so the model knows the protection exists and does
 *    not burn steps trying to work around it.
 *
 * The groups live in this plugin's own Config and every editable field is
 * `volatile`, so the Plugins page form writes them live: the loader commits the
 * new value into the running plugin's reference without a remount, and this
 * guard reads that reference on each call.
 *
 * @module dsh-protect-files
 */

import { readdirSync } from 'node:fs'
import { appendFile, mkdir, rename, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'

/**
 * A locally installed (linked) bundle directory has no `node_modules` of its
 * own, so a bare `import '@deepseek-ai/schemastery'` cannot resolve: Node looks
 * beside the plugin file rather than in the profile. Resolve the schema library
 * from whichever authority this installation actually exposes. The Host process
 * does not necessarily carry the `DSH_*` variables a shell has, so the Desktop
 * layout and the profile directory under `~/.dsh` are probed as well; nothing
 * machine-specific is hardcoded.
 */
function loadSchemastery() {
  const candidates = []
  const push = (value) => {
    if (typeof value === 'string' && value.length > 0 && !candidates.includes(value)) candidates.push(value)
  }
  push(process.env.DSH_PROFILE_DIR)
  if (process.env.DSH_HOME) push(join(process.env.DSH_HOME, 'profiles', process.env.DSH_PROFILE ?? 'desktop'))
  push(process.env.DSH_INSTALL_DIR)
  try {
    push(join(dirname(process.execPath), 'resources', 'app.asar', 'dsh'))
  } catch {
    // A process without an executable path still has the profile candidates below.
  }
  const profilesRoot = join(homedir(), '.dsh', 'profiles')
  try {
    for (const entry of readdirSync(profilesRoot)) push(join(profilesRoot, entry))
  } catch {
    // No profile directory: the installation candidate above is the remaining authority.
  }
  push(join(homedir(), '.dsh'))
  push(homedir())

  const failures = []
  for (const base of candidates) {
    try {
      const localRequire = createRequire(join(base, 'package.json'))
      const loaded = localRequire('@deepseek-ai/schemastery')
      const schema = loaded?.default ?? loaded
      if (typeof schema === 'function' && typeof schema.object === 'function') return schema
      failures.push(`${base}: not a schema factory`)
    } catch (error) {
      failures.push(`${base}: ${String(error?.message ?? error).split('\n')[0].slice(0, 120)}`)
    }
  }
  throw new Error(`dsh-protect-files cannot load @deepseek-ai/schemastery.\n${failures.join('\n')}`)
}

const z = loadSchemastery()

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-protect-files'

/** Services this plugin needs; `workingDirectory` is read opportunistically. */
export const inject = ['tools']

/** Shared symbol a schemastery `.volatile()` field uses for its reference. */
const VOLATILE_MARK = Symbol.for('cosmokit.volatile.write')

/** Whether a config value is a volatile reference rather than the value itself. */
function isVolatile(value) {
  return typeof value === 'object' && value !== null && VOLATILE_MARK in value
}

/** Read one config field, unwrapping a volatile reference. */
function live(value) {
  return isVolatile(value) ? value.get() : value
}

/** One protected directory or file inside a group. */
const EntryConfig = z.object({
  path: z.string().description('Absolute directory or file path that tool calls may not touch.'),
  kind: z.string().default('dir').description("'dir' protects the directory tree; 'file' protects one file. Display only: both protect the path and everything below it."),
})

/** One named group of protected paths. */
const GroupConfig = z.object({
  name: z.string().default('Group').description('Group label, shown in the editor and in denial messages.'),
  enabled: z.boolean().default(true).description('Clear to suspend every path in this group without deleting it.'),
  entries: z.array(EntryConfig).default([]).description('Protected directories and files in this group.'),
})

/** Plugin config; every user-edited field is live (`volatile`). */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile().description('Master switch for all groups.'),
  groups: z.array(GroupConfig).default([]).volatile().description('Protected path groups.'),
  guardShell: z.boolean().default(true).volatile().description('Also inspect shell commands (pwsh, bash) and other tools whose arguments merely mention a protected path.'),
  guardProfile: z.boolean().default(true).volatile().description('Also protect this profile\'s own patch file, so a tool call cannot rewrite the composition and disable the protection.'),
  announce: z.boolean().default(true).volatile().description('Add a short system-prompt notice that the protection exists.'),
})

/** Path separators collapse to one form so Windows and POSIX spellings compare. */
function normalizePath(input) {
  let text = String(input).replace(/\\/gu, '/').replace(/\/{2,}/gu, '/')
  while (text.endsWith('/')) text = text.slice(0, -1)
  if (process.platform === 'win32') text = text.toLowerCase()
  return text
}

/** Last `count` path segments of a normalized path, or undefined when too short to be distinctive. */
function tailSegments(normalized, count, minimumLength) {
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length < count) return undefined
  const joined = segments.slice(-count).join('/')
  return joined.length >= minimumLength ? joined : undefined
}

/** Whether a tool-supplied path lies inside (or equals) a protected path. */
function covers(candidate, protectedPath) {
  return candidate === protectedPath || candidate.startsWith(`${protectedPath}/`)
}

/** The rule one workdir-relative path from a search result belongs to. */
function ruleFor(path, rules, cwd) {
  const resolved = absoluteCandidate(path, cwd)
  return rules.find(rule => covers(resolved, rule.absolute))
}

/**
 * Remove protected entries from a structured search result. `grep` returns
 * `{ matches: [{ path, lineNumber, line }] }` and `glob` returns
 * `{ root, paths: [...] }`; both carry workdir-relative paths, so a listing or
 * search of a PARENT directory stays usable while everything under a protected
 * entry disappears before the tool renders its text.
 * @returns the filtered value, or undefined when nothing was removed.
 */
function filterStructuredValue(value, rules, cwd) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  let changed = false
  let next = value
  if (Array.isArray(value.matches)) {
    const kept = value.matches.filter((match) => {
      const path = typeof match?.path === 'string' ? match.path : undefined
      const hit = path === undefined ? undefined : ruleFor(path, rules, cwd)
      if (hit !== undefined) changed = true
      return hit === undefined
    })
    if (changed) next = { ...next, matches: kept }
  }
  if (Array.isArray(value.paths)) {
    const kept = value.paths.filter((path) => {
      const hit = typeof path === 'string' ? ruleFor(path, rules, cwd) : undefined
      if (hit !== undefined) changed = true
      return hit === undefined
    })
    if (changed) next = { ...next, paths: kept }
  }
  return changed ? next : undefined
}

/** Audit trail location; a JSONL file beside the user's DSH home. */
const auditHome = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'dsh-protect-files')
const auditPath = join(auditHome, 'audit.jsonl')

/** Denial identity carried into the tool failure the model receives. */
const FAILURE_INFO = { name: 'ProtectFilesError', code: 'PROTECTED_PATH' }

/** Serialize audit writes so concurrent denials cannot interleave partial lines. */
let auditQueue = Promise.resolve()

/** Append one audit record, rotating the file once it grows past 1 MiB. */
function audit(logger, record) {
  auditQueue = auditQueue.then(async () => {
    try {
      await mkdir(auditHome, { recursive: true })
      const current = await stat(auditPath).catch(() => undefined)
      if (current !== undefined && current.size > 1024 * 1024) {
        await rename(auditPath, `${auditPath}.1`).catch(() => undefined)
      }
      await appendFile(auditPath, `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`, 'utf8')
    } catch (error) {
      logger?.warn('dsh-protect-files: audit write failed: %s', String(error))
    }
  })
  return auditQueue
}

/** Every current protection rule, flattened for matching. */
function readRules(config, fallbackRoot) {
  const groups = live(config.groups)
  const entries = []
  for (const group of Array.isArray(groups) ? groups : []) {
    if (group === null || typeof group !== 'object' || group.enabled === false) continue
    const groupName = typeof group.name === 'string' && group.name.trim().length > 0 ? group.name.trim() : 'Group'
    const groupEntries = Array.isArray(group.entries) ? group.entries : []
    for (const entry of groupEntries) {
      if (entry === null || typeof entry !== 'object') continue
      const raw = typeof entry.path === 'string' ? entry.path.trim() : ''
      if (raw.length === 0) continue
      const kind = entry.kind === 'file' ? 'file' : 'dir'
      let absolute
      try {
        absolute = normalizePath(resolvePath(fallbackRoot, raw))
      } catch {
        continue
      }
      const needles = [absolute]
      const tail = tailSegments(absolute, 2, 5)
      if (tail !== undefined && tail.includes('/')) needles.push(tail)
      entries.push({ group: groupName, path: raw, absolute, kind, needles, leaf: leafName(absolute) })
    }
  }
  return entries
}

/** Lowercase leaf of a normalized absolute path (the directory or file name). */
function leafName(normalized) {
  const segments = normalized.split('/').filter(segment => segment.length > 0)
  return segments.length === 0 ? undefined : segments[segments.length - 1]
}

/** Resolve a candidate path the way the fs tools do: against the session directory. */
function absoluteCandidate(candidate, cwd) {
  const text = String(candidate)
  try {
    return normalizePath(resolvePath(cwd, text))
  } catch {
    return normalizePath(text)
  }
}

/** Flatten every string inside tool arguments, with its key hint. */
function collectStrings(value, visit, key = '', depth = 0) {
  if (depth > 8 || value === null || value === undefined) return
  if (typeof value === 'string') {
    visit(value, key)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, visit, key, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  for (const [childKey, child] of Object.entries(value)) {
    collectStrings(child, visit, childKey, depth + 1)
  }
}

/** Session working directory for one execution, when the agent exposes one. */
function sessionDirectory(ctx, exec) {
  try {
    const session = exec.agent?.session
    if (session === undefined || session === null) return undefined
    return ctx.get('workingDirectory')?.get(session)
  } catch {
    return undefined
  }
}

/** Characters that continue a file or directory name. */
const NAME_CHAR = /[a-z0-9._-]/u

/**
 * Whether `text` contains `needle` as a whole path token. A plain substring
 * test would deny `/prod` inside `/production`, or `.env` inside
 * `.env.example`, so the neighbouring characters must not continue a name.
 */
function containsNeedle(text, needle) {
  let from = 0
  for (;;) {
    const at = text.indexOf(needle, from)
    if (at < 0) return false
    const before = at === 0 ? undefined : text[at - 1]
    const after = text[at + needle.length]
    const leftOk = before === undefined || !NAME_CHAR.test(before)
    const rightOk = after === undefined || !NAME_CHAR.test(after)
    if (leftOk && rightOk) return true
    from = at + 1
  }
}

/** Find the first rule a tool call violates. */
function findViolation(ctx, config, exec) {
  const rules = config.rules
  if (rules.length === 0) return undefined
  const cwd = sessionDirectory(ctx, exec) ?? config.fallbackRoot

  // A protected path may not be the target of any call. A PARENT of a protected
  // path stays usable: listing or searching it is allowed, and the protected
  // entries are removed from the results afterwards (see the post-execute
  // filter). Refusing the parent outright used to break ordinary project
  // analysis — a shell call whose `cwd` merely contained the protected folder
  // failed as well.

  // (a) Structured pass: resolve every path-shaped argument and compare it as a
  // real path. This catches relative spellings ("../prod/.env") that never
  // contain the protected path verbatim.
  for (const rule of rules) {
    let hit
    collectStrings(exec.arguments, (text, key) => {
      if (hit !== undefined) return
      if (text.length === 0 || text.length > 4096) return
      const looksPathish = text.includes('/') || text.includes('\\')
        || /(path|paths|dir|directory|file|filename|cwd|workdir|root|target|source|destination|output|input)/iu.test(key)
      if (!looksPathish) return
      if (covers(absoluteCandidate(text, cwd), rule.absolute)) hit = { rule, via: text }
    })
    if (hit !== undefined) return hit
  }

  // (a2) Leaf-name pass: while the session directory is the PARENT of a
  // protected entry, a call may name the entry by its bare name — as a path
  // segment (`<leaf>/x.jsp`), as a standalone path argument (`<leaf>`), or
  // inside a code string (`readFileSync("<leaf>/a.jsp")`). Reading through that
  // name is exactly the leak the absolute-path rules cannot see.
  //
  // This pass is deliberately limited to entries the session directory can
  // REACH by name: when the cwd sits elsewhere, `./.env` must not match a
  // protected `secrets/.env` just because the file names coincide.
  for (const rule of rules) {
    if (rule.leaf === undefined || rule.leaf.length < 3) continue
    if (!covers(rule.absolute, normalizePath(cwd))) continue
    const whole = new RegExp(`(^|[^A-Za-z0-9._-])${escapeRegExp(rule.leaf)}(?=$|[^A-Za-z0-9._-])`, 'iu')
    let hit
    collectStrings(exec.arguments, (text, key) => {
      if (hit !== undefined) return
      if (text.length === 0 || text.length > 8192) return
      const looksPathish = text.includes('/') || text.includes('\\')
        || /(path|paths|dir|directory|file|filename|cwd|workdir|root|target|source|destination|output|input|code)/iu.test(key)
      if (!looksPathish) return
      const segments = normalizePath(text).split(/[\\/]+/u)
      const namesEntry = segments.some(segment => segment === rule.leaf)
        || ((text.includes('/') || text.includes('\\')) && whole.test(text))
      if (namesEntry) hit = { rule, via: rule.leaf }
    })
    if (hit !== undefined) return hit
  }

  // (b) Raw mention pass: the arguments as one lowercase, separator-normalized
  // text. Shell commands, patch bodies, and unknown tools are covered here.
  if (config.guardShell) {
    let raw
    try {
      raw = normalizePath(JSON.stringify(exec.arguments) ?? '')
    } catch {
      raw = ''
    }
    if (raw.length > 0) {
      for (const rule of rules) {
        const needle = rule.needles.find(candidate => candidate.length >= 4 && containsNeedle(raw, candidate))
        if (needle !== undefined) return { rule, via: needle }
      }
    }
  }
  return undefined
}

/** Build the denial reason shown to the model. */
function denial(reason) {
  return { reason, info: FAILURE_INFO }
}

/** Format the standard denial sentence. */
function denialReason(toolName, rule, via) {
  return `Blocked by dsh-protect-files: tool "${toolName}" may not read, search, or write the protected path "${rule.path}" (group "${rule.group}", matched "${via}"). To analyse the surrounding project, list or search its PARENT directory, or any directory that does not contain a protected path: protected entries are removed from those results automatically. Do not retry this exact path through another tool, another spelling, or a subagent; ask the user if its contents are genuinely required.`
}

/** Characters that continue a path once a protected prefix has matched. */
const PATH_CHAR = /[A-Za-z0-9._\-\\/ 、。，]/u

/**
 * Rules whose LEAF appears as a whole path segment of `text`.
 *
 * A result line produced while the session directory is the protected entry's
 * parent shows only a RELATIVE path (the entry name, then the file under it) —
 * never the absolute path, and not necessarily the two-segment tail either.
 * Comparing whole segments keeps a longer sibling name from matching a shorter
 * rule name, while catching the relative spelling.
 *
 * @returns the matching rules (usually zero or one).
 */
function leafMatches(text, rules, cwd) {
  const normalized = normalizePath(text)
  // Relative results resolve against the session directory, so a bare entry name
  // is inside the protected path when the cwd is that entry's parent.
  const candidates = [normalized]
  if (cwd !== undefined) candidates.push(normalizePath(`${cwd}/${normalized}`))
  const hits = []
  for (const rule of rules) {
    if (rule.leaf === undefined || rule.leaf.length < 3) continue
    const found = candidates.some((candidate) => {
      if (covers(candidate, rule.absolute)) return true
      return candidate.split('/').some(segment => segment === rule.leaf)
    })
    if (found) hits.push(rule)
  }
  return hits
}

/**
 * Remove protected path occurrences from a RELATIVE listing.
 *
 * A listing rendered while the session sits in the protected entry's parent
 * prints the entry name on its own line and then its files as bare names, so
 * per-line redaction can only replace the name line — the file rows underneath
 * carry no path at all. Walking the block line by line tracks "inside a
 * protected entry" and drops the following rows until a line closes that
 * section (a blank line, or a sibling entry that resolves outside it).
 * @returns the rewritten block text, or undefined when nothing was inside.
 */
function redactListing(text, rules, cwd) {
  if (cwd === undefined) return undefined
  const lines = text.split('\n')
  let inside = false
  let changed = false
  const out = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      inside = false
      out.push(line)
      continue
    }
    // A leading entry name (with or without a trailing separator) opens a section.
    const head = trimmed.replace(/[\\/]+$/u, '')
    const rule = rules.find(item => item.leaf !== undefined
      && item.leaf.length >= 3
      && normalizePath(head) === item.leaf)
    if (rule !== undefined) {
      inside = true
      changed = true
      out.push('[受保护路径]')
      continue
    }
    if (inside) {
      // A sibling entry that resolves outside the protected path closes it.
      const sibling = /^([A-Za-z]:[\\/]|\/|[A-Za-z0-9._-]+[\\/])/u.test(trimmed)
      if (sibling && !rules.some(item => item.leaf !== undefined
        && trimmed.toLowerCase().includes(item.leaf))) {
        inside = false
        out.push(line)
        continue
      }
      out.push('[受保护路径]')
      changed = true
      continue
    }
    out.push(line)
  }
  return changed ? out.join('\n') : undefined
}

/** Placeholder that replaces one protected path occurrence, name included. */
const REDACTED = '[受保护路径]'

/** Escape one literal path segment for use inside a RegExp. */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * Build the search pattern for one protected path. Separators accept any run of
 * `\` or `/`, because the same path arrives as `a\b`, `a/b`, or JSON-escaped
 * `a\\b`; a plain substring test misses the escaped spelling and its index
 * would not line up with the original text anyway.
 */
function pathPattern(needle, flags) {
  const segments = needle.split('/').filter(segment => segment.length > 0)
  const body = segments.map(escapeRegExp).join('[\\\\/]+')
  // A trailing separator is optional so `…/prod` also matches `…/prod/`.
  return new RegExp(body, flags)
}

/**
 * Index where the path starting at `from` ends. Walks over name characters but
 * stops at a quote, a structural punctuator, a JSON line-end escape — or a `:`
 * that is not the drive letter. A listing row prints the path followed by
 * `  2025-10-21  12:42:27`; a colon treated as path content would leave
 * `[受保护路径]:42:27` behind.
 */
function pathEnd(text, from) {
  let end = from
  while (end < text.length) {
    const char = text[end]
    if (char === '"' || char === "'" || char === ',' || char === ';' || char === '}' || char === ']') break
    // Only a drive-letter colon (index 1, e.g. `C:\`) belongs to the path.
    if (char === ':' && end !== 1) break
    // A path may contain one space; a run of two or more is a column gap.
    if (char === ' ' && text[end + 1] === ' ') break
    if (char === '\t') break
    if (char === '\\') {
      const next = text[end + 1]
      if (next === 'n' || next === 'r' || next === 't' || next === 'b' || next === 'f' || next === '"' || next === 'u') break
      end += 2
      continue
    }
    if (!PATH_CHAR.test(char)) break
    end += 1
  }
  return end
}

/**
 * Remove protected path occurrences from one line WITHOUT dropping the line.
 *
 * Hiding whole lines breaks tools that return one long line — the PTC
 * `run_code` executor, for example, returns the program's stdout as a single
 * JSON line, so one matching path used to swallow the entire output. Here the
 * matched path and every path character continuing it are replaced in place,
 * so the rest of the line survives.
 *
 * @returns the redacted line, or undefined when nothing was protected.
 */
function redactLine(line, rules, cwd) {
  let text = line
  let changed = false
  const flags = process.platform === 'win32' ? 'iu' : 'u'

  // Relative spellings first: a bare entry name (or entry name + file) is
  // resolved against the session directory, and only that resolution decides
  // whether it names a protected entry.
  if (cwd !== undefined) {
    for (const rule of rules) {
      if (rule.leaf === undefined || rule.leaf.length < 3) continue
      const pattern = new RegExp(`(^|[\\\\/\\s"'(])${escapeRegExp(rule.leaf)}(?=[\\\\/\\s"'),;}\\]]|$)`, flags)
      for (let guard = 0; guard < 64; guard += 1) {
        const match = pattern.exec(text)
        if (match === null) break
        const start = match.index + match[1].length
        const end = pathEnd(text, start + rule.leaf.length)
        text = `${text.slice(0, start)}${REDACTED}${text.slice(end)}`
        changed = true
      }
    }
  }

  for (const rule of rules) {
    for (const needle of rule.needles) {
      if (needle.length < 4) continue
      const pattern = pathPattern(needle, flags)
      // Bounded: every iteration either shortens the match or ends the loop.
      for (let guard = 0; guard < 64; guard += 1) {
        const match = pattern.exec(text)
        if (match === null) break
        const end = pathEnd(text, match.index + match[0].length)
        text = `${text.slice(0, match.index)}${REDACTED}${text.slice(end)}`
        changed = true
      }
    }
  }
  return changed ? text : undefined
}
function scrubContent(content, rules, toolName, cwd) {
  let changed = false
  const blocks = content.map((block) => {
    if (block === null || typeof block !== 'object' || block.type !== 'text' || typeof block.text !== 'string') return block
    // Two gates: an absolute/tail needle anywhere, or a relative spelling whose
    // segment names a protected leaf. Both are needed — a result listed while
    // the session sits in the parent shows only the relative form.
    const gate = rules.some(rule => rule.needles.some(needle => needle.length >= 4
      && pathPattern(needle, process.platform === 'win32' ? 'iu' : 'u').test(block.text)))
      || leafMatches(block.text, rules, cwd).length > 0
    if (!gate) return block
    // Replace the path IN PLACE and keep every other character. Whole-line
    // hiding was wrong twice over: a plain listing of a parent directory lost
    // its other rows, and a tool that returns its output as one long line (the
    // PTC `run_code` executor) lost its ENTIRE stdout to one match.
    //
    // A relative listing is the one case that still needs section tracking: the
    // file rows under an entry name carry no path of their own.
    const asListing = redactListing(block.text, rules, cwd)
    if (asListing !== undefined) {
      changed = true
      return { ...block, text: asListing }
    }
    const lines = block.text.split('\n')
    let touched = false
    const next = lines.map((line) => {
      const redacted = redactLine(line, rules, cwd)
      if (redacted === undefined) return line
      touched = true
      return redacted
    })
    if (!touched) return block
    changed = true
    return { ...block, text: next.join('\n') }
  })
  return changed ? blocks : undefined
}

/**
 * Register the guard, the result filter, and the prompt notice.
 * @param ctx - plugin context; registrations are its effects.
 * @param config - validated plugin config (volatile fields stay live references).
 */
export function apply(ctx, config) {
  const logger = ctx.logger

  /** One immutable view of the current config for this call. */
  const snapshot = () => {
    const fallbackRoot = ctx.get('workingDirectory')?.defaultDirectory ?? process.cwd()
    const extra = []
    if (live(config.guardProfile) !== false) {
      // The config editor owns the active profile patch path; the Host process
      // need not carry DSH_PROFILE_DIR, so prefer the service over the env.
      let patchPath
      try {
        patchPath = ctx.get('configEditor')?.documentPath
      } catch {
        patchPath = undefined
      }
      if (typeof patchPath !== 'string' || patchPath.length === 0) {
        const profileDirectory = process.env.DSH_PROFILE_DIR
        if (typeof profileDirectory === 'string' && profileDirectory.length > 0) {
          patchPath = join(profileDirectory, 'cordis.patch.yml')
        }
      }
      if (typeof patchPath === 'string' && patchPath.length > 0) {
        extra.push({
          group: 'dsh-protect-files itself',
          path: patchPath,
          absolute: normalizePath(patchPath),
          kind: 'file',
        })
      }
    }
    const rules = [...readRules(config, fallbackRoot), ...extra.map(rule => ({ ...rule, needles: [rule.absolute] }))]
    return {
      enabled: live(config.enabled) !== false,
      guardShell: live(config.guardShell) !== false,
      rules,
      fallbackRoot,
    }
  }

  // 1. Monotonic denial: the call never reaches its tool body.
  ctx.tools.guard((exec) => {
    let config
    try {
      config = snapshot()
    } catch (error) {
      logger?.warn('dsh-protect-files: guard could not read its config: %s', String(error))
      return undefined
    }
    if (!config.enabled || config.rules.length === 0) return undefined
    try {
      const violation = findViolation(ctx, config, exec)
      if (violation === undefined) return undefined
      void audit(logger, {
        kind: 'denied',
        tool: exec.name,
        group: violation.rule.group,
        path: violation.rule.path,
        matched: violation.via,
        session: exec.agent?.id,
      })
      logger?.info('dsh-protect-files: denied %s for %s', exec.name, violation.rule.path)
      return denial(denialReason(exec.name, violation.rule, violation.via))
    } catch (error) {
      logger?.warn('dsh-protect-files: guard failed open: %s', String(error))
      return undefined
    }
  })

  // 2. Result filter. Two passes:
  //    (a) structured: a search or listing of a parent directory keeps its
  //        non-protected entries and loses every entry under a protected path.
  //        Replacing the VALUE re-renders the tool's own text, so protected
  //        file paths and matched lines never reach the model at all.
  //    (b) text: tools without a known structure (shell commands, MCP tools)
  //        get line-level redaction; while the session sits inside a protected
  //        path, every line is hidden.
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (decision.kind !== 'accept') return decision
    // A guard denial is itself an error result whose text names the protected
    // path; scrubbing it would replace the explanation the model needs.
    if (result.isError === true) return decision
    let config
    try {
      config = snapshot()
    } catch {
      return decision
    }
    if (!config.enabled || config.rules.length === 0) return decision
    // A `value` replacement rebuilds the presentation; the pipeline rejects both.
    if (Object.hasOwn(decision, 'value')) return decision
    try {
      const cwd = normalizePath(sessionDirectory(ctx, exec) ?? config.fallbackRoot)

      const structured = filterStructuredValue(result.value, config.rules, cwd)
      if (structured !== undefined) {
        void audit(logger, { kind: 'redacted-structured', tool: exec.name, session: exec.agent?.id })
        const contexts = decision.additionalContexts ?? result.additionalContexts
        return {
          kind: 'accept',
          value: structured,
          ...contexts !== undefined && contexts.length > 0 ? { additionalContexts: contexts } : {},
        }
      }

      const content = Object.hasOwn(decision, 'content') ? decision.content : result.content
      if (!Array.isArray(content) || content.length === 0) return decision
      const scrubbed = scrubContent(content, config.rules, exec.name, cwd)
      if (scrubbed === undefined) return decision
      void audit(logger, { kind: 'redacted', tool: exec.name, session: exec.agent?.id })
      return { ...decision, content: scrubbed }
    } catch (error) {
      logger?.warn('dsh-protect-files: could not filter a result: %s', String(error))
      return decision
    }
  })

  // 3. Tell the model the protection exists, without listing the paths.
  ctx.inject(['systemPrompt'], (child) => {
    child.effect(() => child.systemPrompt.section({
      name: 'tool:dsh-protect-files',
      order: 62,
      text: () => {
        let state
        try {
          state = snapshot()
        } catch {
          return ''
        }
        if (!state.enabled || state.rules.length === 0) return ''
        if (live(config.announce) === false) return ''
        const groupCount = state.rules.length
        return `The user protects ${groupCount} production configuration path${groupCount === 1 ? '' : 's'} with the dsh-protect-files plugin. Tool calls that name, resolve to, or search those paths are denied and their results are hidden. This protection is not negotiable in this conversation: report the denial to the user and ask for the information instead of trying another tool, another spelling, a copy, or a subagent.`
      },
    }), 'dsh-protect-files: prompt notice')
  })
}
