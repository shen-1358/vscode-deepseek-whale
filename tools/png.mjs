import { deflateSync, inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

export function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'latin1')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crcBuf])
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

function unfilter(type, src, out, prev, bpp) {
  if (type > 4) throw new Error(`未知的滤波类型 ${type}`)
  for (let i = 0; i < src.length; i++) {
    const a = i >= bpp ? out[i - bpp] : 0
    const b = prev[i]
    const c = i >= bpp ? prev[i - bpp] : 0
    const x = src[i]
    let value
    if (type === 0) value = x
    else if (type === 1) value = x + a
    else if (type === 2) value = x + b
    else if (type === 3) value = x + ((a + b) >> 1)
    else value = x + paeth(a, b, c)
    out[i] = value & 0xff
  }
}

/** 解码成 RGBA8（RGB 源自动补 alpha=255）；只支持 8 位、非隔行、colortype 2/6 */
export function decodePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('不是 PNG 文件')
  let width = 0
  let height = 0
  let colorType = 0
  const idat = []
  let at = 8
  while (at + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(at)
    const type = buffer.toString('latin1', at + 4, at + 8)
    const data = buffer.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const bitDepth = data[8]
      colorType = data[9]
      if (bitDepth !== 8) throw new Error(`只支持 8 位色深，实际 ${bitDepth}`)
      if (colorType !== 2 && colorType !== 6) throw new Error(`只支持 RGB/RGBA，实际 colortype=${colorType}`)
      if (data[12] !== 0) throw new Error('不支持隔行扫描')
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    at += 12 + length
  }
  if (width === 0 || height === 0) throw new Error('缺少 IHDR')
  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  if (raw.length < (stride + 1) * height) throw new Error('IDAT 数据不完整')
  const pixels = Buffer.alloc(width * height * 4)
  const line = Buffer.alloc(stride)
  const prev = Buffer.alloc(stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    unfilter(filter, raw.subarray(pos, pos + stride), line, prev, bpp)
    pos += stride
    for (let x = 0; x < width; x++) {
      const i = x * bpp
      const o = (y * width + x) * 4
      pixels[o] = line[i]
      pixels[o + 1] = line[i + 1]
      pixels[o + 2] = line[i + 2]
      pixels[o + 3] = bpp === 4 ? line[i + 3] : 255
    }
    prev.set(line)
  }
  return { width, height, pixels }
}

/** 一律输出 RGBA8、filter 0（未压缩优先级的简单实现） */
export function encodePng({ width, height, pixels }) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * 面积平均缩放。颜色按 alpha 加权求平均，否则透明像素的黑色会把边缘染黑
 * （抠图缩小时最容易被看出来的瑕疵）。
 */
export function resizeRgba(image, targetLongSide) {
  const { width, height, pixels } = image
  const scale = targetLongSide / Math.max(width, height)
  const outWidth = Math.max(1, Math.round(width * scale))
  const outHeight = Math.max(1, Math.round(height * scale))
  const out = Buffer.alloc(outWidth * outHeight * 4)
  for (let y = 0; y < outHeight; y++) {
    const y0 = Math.floor(y * height / outHeight)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * height / outHeight))
    for (let x = 0; x < outWidth; x++) {
      const x0 = Math.floor(x * width / outWidth)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * width / outWidth))
      let r = 0
      let g = 0
      let b = 0
      let aSum = 0
      let count = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * width + sx) * 4
          const alpha = pixels[i + 3] / 255
          r += pixels[i] * alpha
          g += pixels[i + 1] * alpha
          b += pixels[i + 2] * alpha
          aSum += alpha
          count++
        }
      }
      const o = (y * outWidth + x) * 4
      out[o] = aSum > 0 ? Math.round(r / aSum) : 0
      out[o + 1] = aSum > 0 ? Math.round(g / aSum) : 0
      out[o + 2] = aSum > 0 ? Math.round(b / aSum) : 0
      out[o + 3] = Math.round((aSum / count) * 255)
    }
  }
  return { width: outWidth, height: outHeight, pixels: out }
}
