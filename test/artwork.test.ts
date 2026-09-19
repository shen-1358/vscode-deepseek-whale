import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodePng } from '../tools/png.mjs'
import { ARTWORK, TARGET_LONG_SIDE } from '../tools/artwork-pins.mjs'
import { MOOD_ART } from '../src/webview/mood'

const MEDIA = join(process.cwd(), 'media')

describe('素材 pin 表', () => {
  it('每个 pin 的 sha256 都是 64 位十六进制', () => {
    for (const item of ARTWORK) expect(item.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('pin 表的表情集合与 MOOD_ART 完全一致', () => {
    expect(ARTWORK.map(item => item.mood).sort()).toEqual(Object.keys(MOOD_ART).sort())
  })
})

describe('成品素材', () => {
  it.each(ARTWORK.map(item => item.mood))('%s：长边 512、RGBA、含透明像素', mood => {
    const png = decodePng(readFileSync(join(MEDIA, `whale-${mood}.png`)))
    expect(Math.max(png.width, png.height)).toBe(TARGET_LONG_SIDE)
    let transparent = 0
    for (let i = 3; i < png.pixels.length; i += 4) if (png.pixels[i]! < 255) transparent++
    expect(transparent).toBeGreaterThan(1000)
  })
})

describe('git 跟踪范围', () => {
  it('原始素材不进仓库，只有成品进', () => {
    const tracked = execFileSync('git', ['ls-files', 'media/'], { encoding: 'utf8' })
    expect(tracked).not.toContain('media/raw/')
    expect(tracked).toContain('media/whale-delighted.png')
  })
})
