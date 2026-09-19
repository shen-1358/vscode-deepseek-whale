#!/usr/bin/env node
/**
 * media/raw/*.png → media/whale-{mood}.png（长边 TARGET_LONG_SIDE）。
 * 缩放属于 CC BY-NC-SA 4.0 意义上的"改作"，改动内容记在 NOTICE.md。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ARTWORK, TARGET_LONG_SIDE } from './artwork-pins.mjs'
import { decodePng, encodePng, resizeRgba } from './png.mjs'

const RAW_DIR = join(process.cwd(), 'media', 'raw')
const OUT_DIR = join(process.cwd(), 'media')

await mkdir(OUT_DIR, { recursive: true })
for (const item of ARTWORK) {
  const source = decodePng(await readFile(join(RAW_DIR, item.file)))
  const resized = resizeRgba(source, TARGET_LONG_SIDE)
  const buffer = encodePng(resized)
  await writeFile(join(OUT_DIR, `whale-${item.mood}.png`), buffer)
  console.log(
    `${item.file} ${source.width}x${source.height} → whale-${item.mood}.png ` +
    `${resized.width}x${resized.height} ${(buffer.length / 1024).toFixed(0)}KB`
  )
}
