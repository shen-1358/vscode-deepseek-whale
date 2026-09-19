import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const W = 256
const H = 256

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

const BODY = [58, 140, 214, 255]
const BELLY = [214, 236, 250, 255]
const DARK = [28, 48, 72, 255]
const WHITE = [255, 255, 255, 255]
const CLEAR = [0, 0, 0, 0]

function inCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

function inEllipse(x, y, cx, cy, rx, ry) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
}

function inTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by)
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy)
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

function pixel(x, y) {
  // 判定顺序规则：后判的会覆盖先判的；同一区域内必须「细节先行、内层先行」。
  // 这两条规则是在像素采样验证里踩过坑得出的：写反了会让分支永远不可达。

  // 1) 水柱与水花（在头顶上方，不接触身体）
  if (inEllipse(x, y, 100, 64, 6, 16)) return BODY
  if (inCircle(x, y, 86, 40, 5)) return BODY
  if (inCircle(x, y, 114, 44, 4)) return BODY

  // 2) 尾鳭（合并的 V 形，顶点落在身体内部以形成连接）
  if (inTriangle(x, y, 186, 148, 252, 96, 220, 150)) return DARK
  if (inTriangle(x, y, 186, 148, 252, 200, 220, 150)) return DARK

  // 3) 身体与其内部细节
  if (inEllipse(x, y, 120, 150, 80, 62)) {
    if (y >= 164 && y <= 170 && x >= 44 && x <= 92) return DARK // 嘴（需在腹部之前）
    if (inCircle(x, y, 84, 130, 5)) return DARK // 瞳孔（需在眼白之前）
    if (inCircle(x, y, 84, 130, 12)) return WHITE // 眼白
    if (inEllipse(x, y, 108, 180, 54, 38)) return BELLY // 腹部（最后判，作底色）
    return BODY
  }

  return CLEAR
}

const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) {
  const rowStart = y * (W * 4 + 1)
  raw[rowStart] = 0 // filter: None
  for (let x = 0; x < W; x++) {
    const [r, g, b, a] = pixel(x, y)
    const p = rowStart + 1 + x * 4
    raw[p] = r
    raw[p + 1] = g
    raw[p + 2] = b
    raw[p + 3] = a
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type: RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

mkdirSync('media', { recursive: true })
writeFileSync('media/placeholder-whale.png', png)
console.log(`wrote media/placeholder-whale.png (${png.length} bytes)`)
