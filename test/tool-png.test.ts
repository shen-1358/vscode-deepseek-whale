import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import { crc32, decodePng, encodePng, resizeRgba } from '../tools/png.mjs'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

interface Rgba { width: number; height: number; pixels: Buffer }

function solid(width: number, height: number, rgba: [number, number, number, number]): Rgba {
  const pixels = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = rgba[0]
    pixels[i * 4 + 1] = rgba[1]
    pixels[i * 4 + 2] = rgba[2]
    pixels[i * 4 + 3] = rgba[3]
  }
  return { width, height, pixels }
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'latin1')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crcBuf])
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** 手写一个 2×2 PNG：第 0 行 filter 0，第 1 行用指定 filter，用来验证反滤波公式 */
function pngWithFilter(type: number): Buffer {
  const row0 = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80])
  const row1 = Buffer.from([15, 25, 35, 45, 55, 65, 75, 85])
  const bpp = 4
  const filtered = Buffer.alloc(8)
  for (let i = 0; i < 8; i++) {
    const a = i >= bpp ? row1[i - bpp]! : 0
    const b = row0[i]!
    const c = i >= bpp ? row0[i - bpp]! : 0
    const pred = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1 : paeth(a, b, c)
    filtered[i] = (row1[i]! - pred) & 0xff
  }
  const raw = Buffer.concat([Buffer.from([0]), row0, Buffer.from([type]), filtered])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0)
  ihdr.writeUInt32BE(2, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

describe('crc32', () => {
  it('与 PNG 规范里的 IEND 常量一致', () => {
    expect(crc32(Buffer.from('IEND', 'latin1'))).toBe(0xae426082)
  })
})

describe('encodePng / decodePng', () => {
  it('编码后解码能还原像素', () => {
    const back = decodePng(encodePng(solid(3, 2, [10, 20, 30, 40])))
    expect(back.width).toBe(3)
    expect(back.height).toBe(2)
    expect([...back.pixels.subarray(0, 8)]).toEqual([10, 20, 30, 40, 10, 20, 30, 40])
  })

  it.each([0, 1, 2, 3, 4])('能解码滤波类型 %i', (type) => {
    const back = decodePng(pngWithFilter(type))
    expect([...back.pixels.subarray(0, 8)]).toEqual([10, 20, 30, 40, 50, 60, 70, 80])
    expect([...back.pixels.subarray(8, 16)]).toEqual([15, 25, 35, 45, 55, 65, 75, 85])
  })

  it('非 PNG 抛错', () => {
    expect(() => decodePng(Buffer.from('not a png at all'))).toThrow()
  })

  it('未知滤波类型抛错', () => {
    const row0 = Buffer.alloc(8)
    const badRow = Buffer.concat([Buffer.from([9]), row0]) // filter 字节 = 9（非法）
    const bad = Buffer.concat([
      SIGNATURE,
      chunk('IHDR', (() => {
        const ihdr = Buffer.alloc(13)
        ihdr.writeUInt32BE(2, 0)
        ihdr.writeUInt32BE(1, 4)
        ihdr[8] = 8
        ihdr[9] = 6
        return ihdr
      })()),
      chunk('IDAT', deflateSync(badRow)),
      chunk('IEND', Buffer.alloc(0)),
    ])
    expect(() => decodePng(bad)).toThrow()
  })
})

describe('resizeRgba', () => {
  it('按长边等比缩放并保留 alpha', () => {
    const small = resizeRgba(solid(1024, 512, [200, 100, 50, 128]), 512)
    expect(small.width).toBe(512)
    expect(small.height).toBe(256)
    expect(small.pixels[3]).toBe(128)
  })

  it('透明像素不把边缘染黑（alpha 加权）', () => {
    // 只把最右一列置为透明：缩到 2px 宽后，右侧输出像素混合了不透明白与全透明，
    // 若不做 alpha 加权，红通道会掉到约 127；断言 >200 正是为此
    const img = solid(4, 1, [255, 255, 255, 255])
    img.pixels[12] = 0; img.pixels[13] = 0; img.pixels[14] = 0; img.pixels[15] = 0
    const small = resizeRgba(img, 2)
    expect(small.width).toBe(2)
    expect(small.pixels[0]).toBe(255)
    expect(small.pixels[4]).toBeGreaterThan(200)
  })
})
