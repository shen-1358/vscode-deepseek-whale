import { build, context } from 'esbuild'
import { mkdirSync } from 'node:fs'

const watch = process.argv.includes('--watch')
mkdirSync('dist', { recursive: true })

const common = { bundle: true, sourcemap: true, logLevel: 'info' }

const targets = [
  {
    ...common,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['vscode'],
  },
  {
    ...common,
    entryPoints: ['src/webview/shim.ts'],
    outfile: 'dist/dshw-shim.js',
    platform: 'browser',
    format: 'iife',
    target: 'chrome110',
  },
  {
    ...common,
    entryPoints: ['src/webview/probe.ts'],
    outfile: 'dist/probe.js',
    platform: 'browser',
    format: 'iife',
    target: 'chrome110',
  },
  {
    ...common,
    entryPoints: ['src/webview/sidebar-ui.ts'],
    outfile: 'dist/sidebar-ui.js',
    platform: 'browser',
    format: 'iife',
    target: 'chrome110',
  },
]

if (watch) {
  for (const t of targets) (await context(t)).watch()
  console.log('esbuild: watching')
} else {
  for (const t of targets) await build(t)
}
