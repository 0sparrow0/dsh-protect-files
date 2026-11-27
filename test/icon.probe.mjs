/**
 * Icon checks: original artwork that decodes, stays self-contained, and keeps
 * its subject at row size. Run without a browser:
 *
 *   ELECTRON_RUN_AS_NODE=1 <dsh node> test/icon.probe.mjs
 */
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const path = join(here, '..', 'icon.svg')
const text = readFileSync(path, 'utf8')
const bytes = statSync(path).size

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -> ${detail}` : ''}`)
}

check('icon exists and is well under the 256 KiB limit', bytes > 0 && bytes < 256 * 1024, `${bytes} bytes`)
check('declares a 36x36 viewBox', /viewBox="0 0 36 36"/u.test(text))
check('declares intrinsic width and height', /width="36"/u.test(text) && /height="36"/u.test(text))
check('is a real svg root', /^<svg[\s>]/u.test(text.trim()) || text.includes('<svg '))

// Self-containment: these would either fetch resources or need a font.
for (const forbidden of ['<script', 'onload=', 'onclick=', '<style', '<animate', '<image', 'foreignObject', '<text']) {
  check(`avoids ${forbidden}`, !text.includes(forbidden))
}
const urls = [...text.matchAll(/https?:\/\/[^\s"']+/gu)]
  .map(match => match[0])
  .filter(url => !url.startsWith('http://www.w3.org/'))
check('references no external URL', urls.length === 0, urls.join(', '))

// Two visual elements only: the shield and the folder. More shapes at 32px
// turn into noise, which is why the first draft was simplified.
const shapes = [...text.matchAll(/<(path|rect|circle|ellipse|polygon|line)\b/gu)].length
check('stays within three shapes for row-size legibility', shapes > 0 && shapes <= 3, `${shapes} shapes`)

// Palette: one restrained accent, no vivid or neon fills.
const colors = [...new Set([...text.matchAll(/#[0-9a-fA-F]{3,8}/gu)].map(match => match[0].toLowerCase()))]
check('uses a single restrained accent color', colors.length === 1, colors.join(', '))

check('draws no background tile', !/rect[^>]*fill="#[0-9a-fA-F]{6}"/u.test(text))
check('carries an accessible label', /aria-label="[^"]+"/u.test(text))

console.log(`\n${failures === 0 ? 'ALL ICON CHECKS PASSED' : `${failures} ICON CHECK(S) FAILED`}`)
process.exitCode = failures === 0 ? 0 : 1
