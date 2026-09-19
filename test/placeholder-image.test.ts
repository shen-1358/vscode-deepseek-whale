/**
 * 占位图的特征像素校验。
 *
 * 为什么需要它：`tools/make-placeholder.mjs` 用一串 `if (...) return` 决定每个像素的颜色，
 * 判定顺序写错会让某些分支**永远不可达**（例如把瞳孔写在眼白之后 → 眼睛没有瞳）。
 * 这种错误在 96px 的显示尺寸下肉眼几乎看不出来，已经真实发生过两次。
 *
 * ⚠️ #1 用真实鲸鱼形象替换 `media/placeholder-whale.png` 时，本测试应当同步更新或删除。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const PNG_PATH = 'media/placeholder-whale.png'

interface DecodedPng {
  width: number
  height: number
  depth: number
  colorType: number
  chunks: string[]
  pixel(x: number, y: number): [number, number, number, number]
}

function decodePng(buf: Buffer): DecodedPng {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')

  let off = 8
  let width = 0
  let height = 0
  let depth = 0
  let colorType = 0
  const idat: Buffer[] = []
  const chunks: string[] = []

  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.subarray(off + 4, off + 8).toString('ascii')
    const body = buf.subarray(off + 8, off + 8 + len)
    chunks.push(type)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      depth = body[8]!
      colorType = body[9]!
    } else if (type === 'IDAT') {
      idat.push(body)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4 + 1

  return {
    width,
    height,
    depth,
    colorType,
    chunks,
    pixel(x, y) {
      const row = y * stride
      if (raw[row] !== 0) throw new Error('仅支持 filter=0 的行，本解码器不适用')
      const p = row + 1 + x * 4
      return [raw[p]!, raw[p + 1]!, raw[p + 2]!, raw[p + 3]!]
    },
  }
}

const png = decodePng(readFileSync(PNG_PATH))

const WHALE_BLUE: [number, number, number, number] = [58, 140, 214, 255]
const LIGHT_BELLY: [number, number, number, number] = [214, 236, 250, 255]
const DARK: [number, number, number, number] = [28, 48, 72, 255]
const WHITE: [number, number, number, number] = [255, 255, 255, 255]
const TRANSPARENT: [number, number, number, number] = [0, 0, 0, 0]

describe('占位鲸鱼图', () => {
  it('尺寸为 256x256 的 8 位 RGBA', () => {
    expect(png.width).toBe(256)
    expect(png.height).toBe(256)
    expect(png.depth).toBe(8)
    expect(png.colorType).toBe(6)
  })

  it('chunk 序列干净，不含任何元数据块', () => {
    expect(png.chunks).toEqual(['IHDR', 'IDAT', 'IEND'])
    for (const forbidden of ['eXIf', 'iTXt', 'tEXt', 'zTXt']) {
      expect(png.chunks).not.toContain(forbidden)
    }
  })

  it('各部位特征像素落在预期颜色上（防止判定顺序把分支写死）', () => {
    const landmarks: [string, number, number, [number, number, number, number]][] = [
      ['瞳孔', 84, 130, DARK],
      ['眼白', 84, 122, WHITE],
      ['鲸身', 150, 120, WHALE_BLUE],
      ['腹部', 108, 185, LIGHT_BELLY],
      ['嘴', 60, 167, DARK],
      ['尾鳍', 235, 120, DARK],
      ['水柱', 100, 64, WHALE_BLUE],
    ]
    const wrong: string[] = []
    for (const [name, x, y, want] of landmarks) {
      const got = png.pixel(x, y)
      if (got.join(',') !== want.join(',')) {
        wrong.push(`${name}(${x},${y}) 实际 ${got.join(',')} 期望 ${want.join(',')}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('四角为透明背景', () => {
    for (const [x, y] of [[2, 2], [253, 2], [2, 253], [253, 253]] as const) {
      expect(png.pixel(x, y)).toEqual(TRANSPARENT)
    }
  })
})
