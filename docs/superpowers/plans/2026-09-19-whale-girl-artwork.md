# 鲸鱼少女形象落地 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把侧边栏的几何占位鲸鱼换成 CC BY-NC-SA 4.0 的鲸鱼少女（三张表情随余额切换），并把素材管线、许可声明、测试一并落地。

**Architecture:** 素材走「锁定上游 commit + sha256 校验 → 零依赖脚本缩到 512px → 成品进 git」，构建与运行不依赖网络。表情规则是纯函数放在宿主侧计算，随 `/dsh-whale/balance.json` 的响应下发；广播只当"该刷新了"的信号，前端收到后重新取数，全链路只有一种数据形状。侧边栏前端拆成纯视图模型 + DOM 胶水两层，前者可在 Node 里测。

**Tech Stack:** TypeScript（strict）· esbuild（四入口）· vitest · 零运行时依赖 · Node `zlib`（自写 PNG 编解码，不引第三方图像库）

**Spec:** `docs/superpowers/specs/2026-09-19-whale-girl-artwork-design.md`

---

## 溯源信息（写死进 `tools/artwork-pins.mjs` 与 `NOTICE.md`）

- 上游：`Small-tailqwq/dsh-deep-whale`，commit `80630009aee821fe69a9bcd1078c7098300f2c26`
- 路径：`maid-atelier/assets/icons/`

| 文件 | 字节数 | sha256 |
|---|---|---|
| `delighted-cutout.png` | 1669896 | `5f8149d52b8cbdba7b5efeacbda9d1abd9c55a1ee129551b476540452ad83ec9` |
| `sleepy-cutout.png` | 1542451 | `4dd731cad7b132fb47f4fedd6848efbf21b8c5acb792a9c56bc25b421a0ab3e0` |
| `determined-cutout.png` | 700815 | `85628c8003043147248eeeb6ba425975c7873b08cf5da498b4ac4b9f452000d5` |

三张源图均为 **PNG RGBA8、非隔行、8 位色深**（已实测），故解码器只需支持 colortype 2/6。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `tools/png.mjs` | 零依赖 PNG 解码/编码/缩放（`node:zlib`）。被缩放脚本与测试共用 |
| `tools/artwork-pins.mjs` | 溯源与镜像配置（纯数据，无副作用） |
| `tools/fetch-artwork.mjs` | 按 pin 下载三张透明抠图到 `media/raw/`，校验 sha256 |
| `tools/resize-artwork.mjs` | `media/raw/*.png` → `media/whale-{mood}.png`（长边 512） |
| `src/webview/mood.ts` | 表情规则纯函数 + 媒体键 + 中文标签 |
| `src/webview/sidebar-view.ts` | 侧边栏**纯视图模型**（payload → 文案/按钮/表情） |
| `src/webview/sidebar-ui.ts` | 侧边栏 **DOM 胶水**（取数、监听事件、写 DOM） |
| `src/routes/command.ts` | 命令白名单路由（webview 触发宿主动作） |
| `LICENSE-ARTWORK` | 美术许可说明（代码 MIT / 美术 CC BY-NC-SA 4.0） |
| `media/whale-{delighted,sleepy,determined}.png` | 成品素材（进 git） |

**修改**：`src/statusview.ts`（导出 `beijingStamp`）、`src/webview/html.ts`（参数化入口与根元素）、`src/webview/host.ts`（`attach` 带页面参数）、`src/webview/probe.ts`（媒体断言文件名）、`src/routes/balance.ts`（响应带 `mood`）、`src/extension.ts`（接线）、`esbuild.mjs`、`package.json`、`tsconfig.json`、`.gitignore`、`.vscodeignore`、`NOTICE.md`、`README.md`

**删除**（Task 12）：`media/placeholder-whale.png`、`tools/make-placeholder.mjs`、`test/placeholder-image.test.ts`

---

## Task 1: 零依赖 PNG 编解码

**Files:**
- Create: `tools/png.mjs`, `test/tool-png.test.ts`
- Modify: `tsconfig.json`（include 加 `tools/**/*.mjs`）

- [ ] **Step 1: 写失败测试 `test/tool-png.test.ts`**

```ts
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
    // 左半白不透明、右半全透明；缩到 2px 宽后，左像素应仍是白色
    const img = solid(4, 1, [255, 255, 255, 255])
    img.pixels[8] = 0; img.pixels[9] = 0; img.pixels[10] = 0; img.pixels[11] = 0
    img.pixels[12] = 0; img.pixels[13] = 0; img.pixels[14] = 0; img.pixels[15] = 0
    const small = resizeRgba(img, 2)
    expect(small.width).toBe(2)
    expect(small.pixels[0]).toBe(255)
    expect(small.pixels[4]).toBeGreaterThan(200)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/tool-png.test.ts`
Expected: FAIL — 无法解析 `../tools/png.mjs`。

- [ ] **Step 3: 实现 `tools/png.mjs`**

```js
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
```

- [ ] **Step 4: 把 `tools/**/*.mjs` 纳入类型检查**

`tsconfig.json` 的 `include` 加一项：

```json
"include": ["src/**/*.ts", "src/**/*.mts", "src/**/*.mjs", "test/**/*.ts", "tools/**/*.mjs"]
```

- [ ] **Step 5: 运行确认通过 + 类型检查**

Run: `npx vitest run test/tool-png.test.ts && npm run typecheck`
Expected: PASS（11 个用例）；`tsc` 退出码 0。

- [ ] **Step 6: Commit**

```bash
git add tools/png.mjs test/tool-png.test.ts tsconfig.json
git commit -m "feat(tools): 零依赖 PNG 编解码与 alpha 加权缩放"
```

---

## Task 2: 素材 pin 表与下载脚本

**Files:**
- Create: `tools/artwork-pins.mjs`, `tools/fetch-artwork.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: 写 `tools/artwork-pins.mjs`**

```js
/**
 * 素材溯源与镜像配置。改这里之前先读 NOTICE.md 的署名链与 CC BY-NC-SA 4.0 条款。
 * sha256 是唯一可信的锚点：上游若改动 main，脚本会因校验失败而报错停下。
 */
export const UPSTREAM = {
  repo: 'Small-tailqwq/dsh-deep-whale',
  commit: '80630009aee821fe69a9bcd1078c7098300f2c26',
  path: 'maid-atelier/assets/icons',
  license: 'CC BY-NC-SA 4.0',
}

export const ARTWORK = [
  {
    mood: 'delighted',
    file: 'delighted-cutout.png',
    bytes: 1669896,
    sha256: '5f8149d52b8cbdba7b5efeacbda9d1abd9c55a1ee129551b476540452ad83ec9',
  },
  {
    mood: 'sleepy',
    file: 'sleepy-cutout.png',
    bytes: 1542451,
    sha256: '4dd731cad7b132fb47f4fedd6848efbf21b8c5acb792a9c56bc25b421a0ab3e0',
  },
  {
    mood: 'determined',
    file: 'determined-cutout.png',
    bytes: 700815,
    sha256: '85628c8003043147248eeeb6ba425975c7873b08cf5da498b4ac4b9f452000d5',
  },
]

/** 运行时成品的长边像素。512 供侧边栏 240px 显示（2x DPI 够用）。 */
export const TARGET_LONG_SIDE = 512

/** 按序重试；实测只有第一个在这台机器上稳定，其余作为兜底保留。 */
export const MIRRORS = [
  (commit, path) => `https://ghfast.top/https://raw.githubusercontent.com/${UPSTREAM.repo}/${commit}/${path}`,
  (commit, path) => `https://ghproxy.net/https://raw.githubusercontent.com/${UPSTREAM.repo}/${commit}/${path}`,
  (commit, path) => `https://cdn.jsdelivr.net/gh/${UPSTREAM.repo}@${commit}/${path}`,
  (commit, path) => `https://raw.githubusercontent.com/${UPSTREAM.repo}/${commit}/${path}`,
]
```

- [ ] **Step 2: 写 `tools/fetch-artwork.mjs`**

```js
#!/usr/bin/env node
/**
 * 从上游锁定 commit 下载三张透明抠图到 media/raw/ 并校验 sha256。
 * 只在开发期需要运行：成品已提交进 media/，构建与运行都不依赖网络。
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ARTWORK, MIRRORS, UPSTREAM } from './artwork-pins.mjs'

const RAW_DIR = join(process.cwd(), 'media', 'raw')

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function readIfExists(path) {
  try {
    return await readFile(path)
  } catch {
    return null
  }
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length === 0) throw new Error('空响应')
  return buffer
}

async function fetchOne(item) {
  const target = join(RAW_DIR, item.file)
  const existing = await readIfExists(target)
  if (existing && sha256(existing) === item.sha256) {
    console.log(`跳过（已存在且校验通过） ${item.file}`)
    return
  }
  for (const mirror of MIRRORS) {
    const url = mirror(UPSTREAM.commit, `${UPSTREAM.path}/${item.file}`)
    try {
      const buffer = await download(url)
      const digest = sha256(buffer)
      if (digest !== item.sha256) throw new Error(`sha256 不符（得到 ${digest}）`)
      await writeFile(target, buffer)
      console.log(`✅ ${item.file}  ${buffer.length} bytes  ${digest}`)
      return
    } catch (err) {
      const host = (() => {
        try {
          return new URL(url).host
        } catch {
          return url
        }
      })()
      console.log(`   ✗ ${host} — ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.error(`❌ ${item.file} 所有镜像都失败。若上游已变动，需人工复核后更新 tools/artwork-pins.mjs 的 pin。`)
  process.exitCode = 1
}

await mkdir(RAW_DIR, { recursive: true })
for (const item of ARTWORK) await fetchOne(item)
```

- [ ] **Step 3: 让 `media/raw/` 不进 git**

`.gitignore` 追加一行：

```
media/raw/
```

- [ ] **Step 4: 运行下载**

Run: `node tools/fetch-artwork.mjs`
Expected: 三行 `✅ … 1669896 bytes 5f8149…`（或"跳过"），无 `❌`。
若网络全部镜像都不通：**不要**改成无校验下载，改为等网络恢复后重跑（这是刻意的硬失败设计）。

- [ ] **Step 5: 确认原始素材确实被忽略**

Run: `git status --short media/ && ls -la media/raw`
Expected: `git status` 里**不出现** `media/raw/`；目录里有三个文件。

- [ ] **Step 6: Commit**

```bash
git add tools/artwork-pins.mjs tools/fetch-artwork.mjs .gitignore
git commit -m "feat(tools): 按锁定 commit + sha256 抓取上游鲸鱼少女素材"
```

---

## Task 3: 缩放脚本与成品素材

**Files:**
- Create: `tools/resize-artwork.mjs`, `test/artwork.test.ts`, `media/whale-{delighted,sleepy,determined}.png`

- [ ] **Step 1: 写失败测试 `test/artwork.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/artwork.test.ts`
Expected: FAIL — `Cannot find module '../src/webview/mood'`（Task 4 才建），以及成品图不存在。

- [ ] **Step 3: 写 `tools/resize-artwork.mjs`**

```js
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
```

- [ ] **Step 4: 先建 `src/webview/mood.ts` 的最小版本以解锁测试**

（完整实现与测试见 Task 4，这里只需要 `MOOD_ART` 存在。）

```ts
export type Mood = 'delighted' | 'sleepy' | 'determined'

export const MOOD_ART: Record<Mood, string> = {
  delighted: '/dsh-whale/whale-delighted.png',
  sleepy: '/dsh-whale/whale-sleepy.png',
  determined: '/dsh-whale/whale-determined.png',
}
```

- [ ] **Step 5: 生成成品并跑测试**

Run: `node tools/resize-artwork.mjs && npx vitest run test/artwork.test.ts`
Expected: 三行 `… → whale-xxx.png 512x512 …KB`；测试 PASS。
体积参考：每张应在 **200–500KB**；若某张超过 800KB，说明缩放写错了（例如没真正下采样）。

- [ ] **Step 6: Commit**

```bash
git add tools/resize-artwork.mjs src/webview/mood.ts test/artwork.test.ts media/whale-delighted.png media/whale-sleepy.png media/whale-determined.png
git commit -m "feat(media): 鲸鱼少女三态成品图（512px，透明抠图）"
```

---

## Task 4: 表情规则纯函数

**Files:**
- Modify: `src/webview/mood.ts`（补齐 `pickMood`、`MOOD_LABEL`）
- Test: `test/mood.test.ts`

- [ ] **Step 1: 写失败测试 `test/mood.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { MOOD_ART, MOOD_LABEL, pickMood, type Mood } from '../src/webview/mood'

const states = ['ok', 'no-key', 'auth-error', 'network-error'] as const

describe('pickMood', () => {
  it('余额大于等于阈值是开心', () => {
    expect(pickMood({ state: 'ok', balance: 23.45, threshold: 5 })).toBe('delighted')
  })

  it('余额正好等于阈值算开心（边界取上）', () => {
    expect(pickMood({ state: 'ok', balance: 5, threshold: 5 })).toBe('delighted')
  })

  it('余额低于阈值是坚定', () => {
    expect(pickMood({ state: 'ok', balance: 4.99, threshold: 5 })).toBe('determined')
  })

  it('余额为 0 是坚定', () => {
    expect(pickMood({ state: 'ok', balance: 0, threshold: 5 })).toBe('determined')
  })

  it('阈值为 0 时永不预警', () => {
    expect(pickMood({ state: 'ok', balance: 0, threshold: 0 })).toBe('delighted')
  })

  it('余额缺失或非有限数是坚定（异常兜底）', () => {
    expect(pickMood({ state: 'ok', threshold: 5 })).toBe('determined')
    expect(pickMood({ state: 'ok', balance: Number.NaN, threshold: 5 })).toBe('determined')
    expect(pickMood({ state: 'ok', balance: Number.POSITIVE_INFINITY, threshold: 5 })).toBe('determined')
  })

  it('未配置密钥是困', () => {
    expect(pickMood({ state: 'no-key', threshold: 5 })).toBe('sleepy')
  })

  it('Key 无效与网络异常都是坚定', () => {
    expect(pickMood({ state: 'auth-error', threshold: 5 })).toBe('determined')
    expect(pickMood({ state: 'network-error', threshold: 5 })).toBe('determined')
  })

  it('不读取 stale：沿用旧值时仍按余额给脸', () => {
    const withStale = { state: 'ok' as const, balance: 100, threshold: 5, stale: true } as never
    expect(pickMood(withStale)).toBe('delighted')
  })

  it('每种状态都能给出三种表情之一', () => {
    const valid: Mood[] = ['delighted', 'sleepy', 'determined']
    for (const state of states) {
      expect(valid).toContain(pickMood({ state, balance: 1, threshold: 5 }))
    }
  })
})

describe('表情资源表', () => {
  it('三张图都有媒体键与中文标签', () => {
    for (const mood of Object.keys(MOOD_ART) as Mood[]) {
      expect(MOOD_ART[mood]).toMatch(/^\/dsh-whale\/whale-[a-z]+\.png$/)
      expect(MOOD_LABEL[mood].length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/mood.test.ts`
Expected: FAIL — `pickMood is not a function`。

- [ ] **Step 3: 补齐 `src/webview/mood.ts`**

```ts
/**
 * 表情规则：**纯函数**，不 import `vscode` 也不碰 DOM。
 * 由宿主侧调用（webview 读不到 `workspace` 配置），结果随 balance.json 下发。
 */
export type Mood = 'delighted' | 'sleepy' | 'determined'

export type MoodState = 'ok' | 'no-key' | 'auth-error' | 'network-error'

export interface MoodInput {
  state: MoodState
  balance?: number
  threshold: number
}

/**
 * 判定只看「余额健康度」：
 * - 有数据（含断网沿用旧值）→ 按余额与阈值比大小
 * - 没数据 → 未配置密钥是困，其余（Key 无效 / 网络异常）是坚定
 * `stale` 刻意不参与：数字还在，脸就不该变，不新鲜由 `~` 前缀与文案承担。
 */
export function pickMood(input: MoodInput): Mood {
  if (input.state === 'ok') {
    const healthy = typeof input.balance === 'number'
      && Number.isFinite(input.balance)
      && input.balance >= input.threshold
    return healthy ? 'delighted' : 'determined'
  }
  return input.state === 'no-key' ? 'sleepy' : 'determined'
}

/** webview 里写的 URL；媒体 shim 会把它改写成 asWebviewUri 指向的地址 */
export const MOOD_ART: Record<Mood, string> = {
  delighted: '/dsh-whale/whale-delighted.png',
  sleepy: '/dsh-whale/whale-sleepy.png',
  determined: '/dsh-whale/whale-determined.png',
}

export const MOOD_LABEL: Record<Mood, string> = {
  delighted: '开心',
  sleepy: '困',
  determined: '坚定',
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/mood.test.ts`
Expected: PASS，11 个用例。

- [ ] **Step 5: Commit**

```bash
git add src/webview/mood.ts test/mood.test.ts
git commit -m "feat(webview): 表情规则纯函数（按余额健康度，阈值可配）"
```

---

## Task 5: 侧边栏纯视图模型

**Files:**
- Modify: `src/statusview.ts`（导出 `beijingStamp`）
- Create: `src/webview/sidebar-view.ts`
- Test: `test/sidebar-view.test.ts`

- [ ] **Step 1: 写失败测试 `test/sidebar-view.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { buildPanelView } from '../src/webview/sidebar-view'

describe('buildPanelView', () => {
  it('正常：开心 + 余额与今日 + 时间戳，无备注无按钮', () => {
    const view = buildPanelView({
      ok: true, mood: 'delighted', totalBalance: 23.45, currency: 'CNY',
      todayUsage: 1.02, stale: false, observedAt: Date.parse('2026-09-19T02:34:00Z'),
    })
    expect(view.mood).toBe('delighted')
    expect(view.imageKey).toBe('/dsh-whale/whale-delighted.png')
    expect(view.imageAlt).toBe('鲸鱼少女（开心）')
    expect(view.balanceText).toBe('¥23.45')
    expect(view.todayText).toBe('¥1.02')
    expect(view.stampText).toContain('2026-09-19 10:34')
    expect(view.note).toBe('')
    expect(view.showSetKey).toBe(false)
  })

  it('余额低：坚定，没有按钮', () => {
    const view = buildPanelView({ ok: true, mood: 'determined', totalBalance: 3.2, currency: 'CNY', todayUsage: 0 })
    expect(view.mood).toBe('determined')
    expect(view.balanceText).toBe('¥3.20')
    expect(view.showSetKey).toBe(false)
    expect(view.note).toBe('')
  })

  it('沿用旧值：备注说明不新鲜，余额前加 ~，但表情仍是传进来的那张', () => {
    const view = buildPanelView({
      ok: true, mood: 'delighted', totalBalance: 23.45, currency: 'CNY',
      todayUsage: 1.02, stale: true, observedAt: 0,
    })
    expect(view.mood).toBe('delighted')
    expect(view.balanceText).toBe('~ ¥23.45')
    expect(view.note).toContain('上次数据')
    expect(view.noteTone).toBe('warn')
    expect(view.stampText).toBe('')
  })

  it('未配置密钥：困 + 文案 + 设置按钮，数字位补 --', () => {
    const view = buildPanelView({ ok: false, mood: 'sleepy', code: 'NO_KEY', error: '未配置 API Key' })
    expect(view.mood).toBe('sleepy')
    expect(view.balanceText).toBe('--')
    expect(view.todayText).toBe('--')
    expect(view.note).toBe('未配置 API Key')
    expect(view.showSetKey).toBe(true)
    expect(view.noteTone).toBe('warn')
  })

  it('Key 无效：坚定 + 设置按钮', () => {
    const view = buildPanelView({ ok: false, mood: 'determined', code: 'AUTH' })
    expect(view.showSetKey).toBe(true)
    expect(view.note).toContain('Key')
  })

  it('网络异常且无历史：坚定 + 网络文案，不给设置按钮', () => {
    const view = buildPanelView({ ok: false, mood: 'determined', code: 'NETWORK' })
    expect(view.showSetKey).toBe(false)
    expect(view.note).toContain('网络')
  })

  it('payload 缺 mood 时兜底为坚定', () => {
    expect(buildPanelView({}).mood).toBe('determined')
  })

  it('未知 code 也给得出兜底文案', () => {
    const view = buildPanelView({ ok: false, code: 'WHATEVER' })
    expect(view.note.length).toBeGreaterThan(0)
    expect(view.showSetKey).toBe(false)
  })

  it('非 CNY 币种走代码形式', () => {
    const view = buildPanelView({ ok: true, mood: 'delighted', totalBalance: 1.5, currency: 'USD', todayUsage: 0 })
    expect(view.balanceText).toBe('$1.50')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/sidebar-view.test.ts`
Expected: FAIL — 无法解析 `../src/webview/sidebar-view`。

- [ ] **Step 3: 导出 `beijingStamp`**

`src/statusview.ts` 里把 `function beijingStamp` 改成：

```ts
export function beijingStamp(ms: number): string {
```

- [ ] **Step 4: 写 `src/webview/sidebar-view.ts`**

```ts
/**
 * 侧边栏的**纯视图模型**：payload → 文案 / 按钮 / 表情。
 * 不碰 DOM、不 import `vscode`，所以能在 Node 里断言字符串。
 * DOM 写入在 sidebar-ui.ts。
 */
import { MOOD_ART, MOOD_LABEL, type Mood } from './mood'
// formatMoney / beijingStamp 都住在 statusview.ts，且该模块没有 vscode 依赖
// （见 Task 6 的模块边界记录），直接复用避免两套金额格式
import { beijingStamp, formatMoney } from '../statusview'

/** 字段与 `/dsh-whale/balance.json` 的成功/失败两个分支逐字对应 */
export interface PanelPayload {
  ok?: boolean
  mood?: Mood
  code?: string
  totalBalance?: number
  currency?: string
  todayUsage?: number | null
  stale?: boolean
  observedAt?: number
}

export interface PanelView {
  mood: Mood
  imageKey: string
  imageAlt: string
  balanceText: string
  todayText: string
  stampText: string
  note: string
  noteTone: 'info' | 'warn'
  showSetKey: boolean
}

const FALLBACK_MOOD: Mood = 'determined'

const NOTE_BY_CODE: Record<string, string> = {
  NO_KEY: '未配置 API Key',
  AUTH: 'API Key 无效或无权限',
  NETWORK: '网络异常，拿不到余额',
}

export function buildPanelView(payload: PanelPayload): PanelView {
  const mood = payload.mood && payload.mood in MOOD_ART ? payload.mood : FALLBACK_MOOD
  const currency = payload.currency ?? 'CNY'
  const failed = payload.ok === false
  const money = (value: number | null | undefined): string =>
    typeof value === 'number' && Number.isFinite(value) ? formatMoney(value, currency) : '--'

  const note = failed
    ? (NOTE_BY_CODE[payload.code ?? ''] ?? '读取余额失败，详情见输出面板')
    : payload.stale === true
      ? '网络异常，正在显示上次数据'
      : ''

  return {
    mood,
    imageKey: MOOD_ART[mood],
    imageAlt: `鲸鱼少女（${MOOD_LABEL[mood]}）`,
    balanceText: failed ? '--' : `${payload.stale === true ? '~ ' : ''}${money(payload.totalBalance)}`,
    todayText: failed ? '--' : money(payload.todayUsage),
    stampText: !failed && payload.observedAt ? `上次成功：${beijingStamp(payload.observedAt)}` : '',
    note,
    noteTone: note === '' ? 'info' : 'warn',
    showSetKey: payload.code === 'NO_KEY' || payload.code === 'AUTH',
  }
}
```

- [ ] **Step 5: 运行确认通过 + 类型检查**

Run: `npx vitest run test/sidebar-view.test.ts && npm run typecheck`
Expected: PASS，9 个用例；`tsc` 退出码 0。

- [ ] **Step 6: Commit**

```bash
git add src/statusview.ts src/webview/sidebar-view.ts test/sidebar-view.test.ts
git commit -m "feat(webview): 侧边栏纯视图模型（文案/备注/按钮决策）"
```

---

## Task 6: `html.ts` 参数化（入口脚本与根元素）

**Files:**
- Modify: `src/webview/html.ts`, `test/host.test.ts`

- [ ] **Step 1: 先改测试（`test/host.test.ts`）**

把 `uris` 常量与相关断言改为新形状，并补两个用例：

```ts
const uris = {
  shim: 'vscode-webview-resource://x/dist/dshw-shim.js',
  entry: 'vscode-webview-resource://x/dist/probe.js',
  media: 'vscode-webview-resource://x/media',
}
```

```ts
  it('注入入口脚本并带 nonce', () => {
    const html = buildHtml({ cspSource: 'vscode-webview-resource://x', nonce: 'NONCE123', uris, mediaMap: {} })
    expect(html).toContain('<script nonce="NONCE123" src="vscode-webview-resource://x/dist/dshw-shim.js"></script>')
    expect(html).toContain('<script nonce="NONCE123" src="vscode-webview-resource://x/dist/probe.js"></script>')
  })

  it('shim 排在入口脚本之前（入口依赖 shim 先装好）', () => {
    const html = buildHtml({ cspSource: 'c', nonce: 'n', uris, mediaMap: {} })
    expect(html.indexOf('dshw-shim.js')).toBeLessThan(html.indexOf('probe.js'))
  })

  it('根元素 id 与占位文案可定制（侧边栏用 app，探针用 probe）', () => {
    const html = buildHtml({ cspSource: 'c', nonce: 'n', uris, mediaMap: {}, rootId: 'app' })
    expect(html).toContain('<div id="app"></div>')
    const probe = buildHtml({ cspSource: 'c', nonce: 'n', uris, mediaMap: {}, rootId: 'probe', rootPlaceholder: '正在自检…' })
    expect(probe).toContain('<div id="probe">正在自检…</div>')
  })
```

原来的 `包含探针挂载点` 用例改名并入上面这条；其余用例只需把 `uris.probe` 换成 `uris.entry`。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/host.test.ts`
Expected: FAIL — `entry` 未定义 / `rootId` 不生效。

- [ ] **Step 3: 改 `src/webview/html.ts`**

`HtmlUris` 与 `BuildHtmlInput` 改为：

```ts
export interface HtmlUris {
  /** 注入的 shim 脚本（必须先于入口脚本加载） */
  shim: string
  /** 页面入口脚本（侧边栏或探针） */
  entry: string
  media: string
}

export interface BuildHtmlInput {
  cspSource: string
  nonce: string
  uris: HtmlUris
  mediaMap: Record<string, string>
  /** 挂载点 id，默认 `app` */
  rootId?: string
  /** 挂载点初始文案，默认空 */
  rootPlaceholder?: string
}
```

`buildHtml` 函数体改为（其余部分不动）：

```ts
export function buildHtml(input: BuildHtmlInput): string {
  const { cspSource, nonce, uris, mediaMap } = input
  const rootId = input.rootId ?? 'app'
  const rootPlaceholder = input.rootPlaceholder ?? ''
  const csp = buildCsp(cspSource, nonce)
  // 以 application/json 注入：不会被执行，因此不受 script-src 的 nonce 限制。
  const mediaJson = escapeJsonForScript(JSON.stringify(mediaMap))
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>小鲸鱼</title>
<style>
  body { margin: 0; padding: 8px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
  #app { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
  #app img { width: 100%; max-width: 240px; height: auto; user-select: none; -webkit-user-drag: none; }
  .whale-row { display: flex; justify-content: space-between; width: 100%; gap: 12px; }
  .whale-row span:last-child { font-variant-numeric: tabular-nums; font-weight: 600; }
  .whale-balance span:last-child { font-size: 20px; font-weight: 600; }
  .whale-muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .whale-note { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .whale-note.warn { color: var(--vscode-editorWarning-foreground, var(--vscode-foreground)); }
  #app button {
    font-family: inherit; font-size: 12px; padding: 4px 10px; cursor: pointer;
    color: var(--vscode-button-foreground); background: var(--vscode-button-background);
    border: none; border-radius: 2px;
  }
  #app button.secondary {
    color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground);
  }
</style>
</head>
<body>
<div id="${rootId}">${rootPlaceholder}</div>
<script type="application/json" id="${MEDIA_MAP_ELEMENT_ID}">${mediaJson}</script>
<script nonce="${nonce}" src="${uris.shim}"></script>
<script nonce="${nonce}" src="${uris.entry}"></script>
</body>
</html>`
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/host.test.ts`
Expected: PASS（原 7 条 + 新增 1 条，共 8 条）。

- [ ] **Step 5: Commit**

```bash
git add src/webview/html.ts test/host.test.ts
git commit -m "refactor(webview): buildHtml 支持自定义入口脚本与根元素"
```

---

## Task 7: 命令白名单路由

**Files:**
- Create: `src/routes/command.ts`, `test/routes-command.test.ts`

- [ ] **Step 1: 写失败测试 `test/routes-command.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { RouteTable } from '../src/routes/registry'
import { ALLOWED_COMMANDS, registerCommandRoute } from '../src/routes/command'

function table() {
  const executed: string[] = []
  const t = new RouteTable()
  registerCommandRoute(t, { execute: async command => { executed.push(command) } })
  return { t, executed }
}

const request = (body: string, method = 'POST') => ({
  method, path: '/dsh-whale/command.json', query: '', body,
})

describe('command.json', () => {
  it('白名单内的命令被真正执行', async () => {
    const { t, executed } = table()
    const res = await t.dispatch(request(JSON.stringify({ command: 'whale.refresh' })))
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    expect(executed).toEqual(['whale.refresh'])
  })

  it('白名单外的命令返回 403 且不执行', async () => {
    const { t, executed } = table()
    const res = await t.dispatch(request(JSON.stringify({ command: 'workbench.action.terminal.new' })))
    expect(res.status).toBe(403)
    expect(executed).toEqual([])
  })

  it('非 POST 返回 405', async () => {
    const { t } = table()
    expect((await t.dispatch(request('', 'GET'))).status).toBe(405)
    expect((await t.dispatch(request('', 'PUT'))).status).toBe(405)
  })

  it('缺 command 或非法 JSON 返回 400', async () => {
    const { t } = table()
    expect((await t.dispatch(request('{oops'))).status).toBe(400)
    expect((await t.dispatch(request('{}'))).status).toBe(400)
    expect((await t.dispatch(request(JSON.stringify({ command: 42 })))).status).toBe(400)
  })

  it('白名单里都是本扩展自己的命令', () => {
    for (const command of ALLOWED_COMMANDS) expect(command.startsWith('whale.')).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/routes-command.test.ts`
Expected: FAIL — 无法解析 `../src/routes/command`。

- [ ] **Step 3: 写 `src/routes/command.ts`**

```ts
import { jsonResponse, type RouteRequest, type RouteResponse, type RouteTable } from './registry'

/**
 * 写死白名单，而不是放行任意命令：webview 里的内容并非全部受我们控制
 * （例如错误信息可能来自远端响应），只有显式列出的命令才允许触发宿主行为。
 */
export const ALLOWED_COMMANDS = [
  'whale.setApiKey',
  'whale.clearApiKey',
  'whale.refresh',
  'whale.showLog',
] as const

export interface CommandRouteDeps {
  execute: (command: string) => Promise<void>
}

export function registerCommandRoute(table: RouteTable, deps: CommandRouteDeps): void {
  table.register('/dsh-whale/command.json', async (req: RouteRequest): Promise<RouteResponse> => {
    if (req.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'method not allowed' }, 405)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(req.body ?? '')
    } catch {
      return jsonResponse({ ok: false, error: 'invalid json' }, 400)
    }
    const command = (parsed as { command?: unknown } | null)?.command
    if (typeof command !== 'string' || command.length === 0) {
      return jsonResponse({ ok: false, error: 'missing command' }, 400)
    }
    if (!(ALLOWED_COMMANDS as readonly string[]).includes(command)) {
      return jsonResponse({ ok: false, error: `command not allowed: ${command}` }, 403)
    }
    await deps.execute(command)
    return jsonResponse({ ok: true })
  })
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/routes-command.test.ts`
Expected: PASS，5 个用例。

- [ ] **Step 5: Commit**

```bash
git add src/routes/command.ts test/routes-command.test.ts
git commit -m "feat(routes): 命令白名单路由（侧边栏按钮触发宿主动作）"
```

---

## Task 8: `balance.json` 带上 `mood`

**Files:**
- Modify: `src/routes/balance.ts`, `test/routes-balance.test.ts`

- [ ] **Step 1: 先改测试**

`test/routes-balance.test.ts` 里给 `registerBalanceRoutes` 的两处调用都补上 `moodOf`：

```ts
import { pickMood, type Mood } from '../src/webview/mood'
import type { RefreshResult } from '../src/core/refresh'

// table() 内：
  registerBalanceRoutes(t, {
    refresh: refresher,
    moodOf: (result: RefreshResult): Mood =>
      pickMood({ state: result.state, balance: result.balance, threshold: 5 }),
    readSize: async () => (store ? (await store.readJson('size.json')) as Record<string, unknown> : {}),
    writeSize: async value => { if (store) await store.writeJson('size.json', value) },
  })
```

「?refresh=1 触发实际拉取」那条用例里是**第二处**注册，同样要补：

```ts
    registerBalanceRoutes(t, {
      refresh: Object.assign(async (force?: boolean) => { seen.push(force === true); return OK }, { last: () => OK }),
      moodOf: (): Mood => 'delighted',
      readSize: async () => ({}),
      writeSize: async () => {},
    })
```

「返回上游字段形状」用例补上 `mood`，并新增两个用例：

```ts
    expect(JSON.parse(res.body)).toEqual({
      ok: true, totalBalance: 23.45, currency: 'CNY', todayUsage: 1.02, stale: false,
      observedAt: Date.parse('2026-09-19T02:00:00Z'), mood: 'delighted',
    })
```

```ts
  it('余额低于阈值时 mood 是坚定', async () => {
    const low: RefreshResult = { ...OK, totalBalance: 1, balance: 1 }
    const res = await table([low]).dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(JSON.parse(res.body).mood).toBe('determined')
  })

  it('失败分支同样带 mood（未配置密钥 → 困）', async () => {
    const res = await table([{ state: 'no-key', message: '未配置 API Key' }])
      .dispatch({ method: 'GET', path: '/dsh-whale/balance.json', query: '' })
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: 'NO_KEY', mood: 'sleepy' })
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/routes-balance.test.ts`
Expected: FAIL — 缺少 `moodOf` 参数 / 响应里没有 `mood`。

- [ ] **Step 3: 改 `src/routes/balance.ts`**

依赖与两个分支各改一处：

```ts
import { jsonResponse, parseQuery, type RouteRequest, type RouteResponse, type RouteTable } from './registry'
import type { RefreshResult } from '../core/refresh'
import type { Mood } from '../webview/mood'

export interface BalanceRouteDeps {
  refresh: { (force?: boolean): Promise<RefreshResult>; last(): RefreshResult | null }
  /** 表情由宿主计算（webview 读不到配置），每次调用现读阈值 */
  moodOf: (result: RefreshResult) => Mood
  readSize: () => Promise<Record<string, unknown>>
  writeSize: (value: Record<string, unknown>) => Promise<void>
}
```

```ts
    if (result.state !== 'ok') {
      return jsonResponse({
        ok: false,
        code: CODE_BY_STATE[result.state] ?? 'UNKNOWN',
        error: result.message ?? '',
        mood: deps.moodOf(result),
      })
    }
    return jsonResponse({
      ok: true,
      totalBalance: result.balance,
      currency: result.currency,
      todayUsage: result.todayUsage ?? null,
      stale: result.stale === true,
      observedAt: result.observedAt,
      mood: deps.moodOf(result),
    })
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/routes-balance.test.ts`
Expected: PASS，13 个用例（原 11 + 新增 2）。

- [ ] **Step 5: Commit**

```bash
git add src/routes/balance.ts test/routes-balance.test.ts
git commit -m "feat(routes): balance.json 下发 mood（成功与失败分支都有）"
```

---

## Task 9: 侧边栏前端与第四个构建入口

**Files:**
- Create: `src/webview/sidebar-ui.ts`
- Modify: `esbuild.mjs`, `src/webview/host.ts`

- [ ] **Step 1: 写 `src/webview/sidebar-ui.ts`**

```ts
/**
 * 侧边栏前端的 **DOM 胶水层**：取数 → 交给纯视图模型 → 写 DOM。
 * 所有文案与按钮决策都在 sidebar-view.ts（Node 里可测），这里只做三件事：
 * 首次 fetch、监听"该刷新了"的广播、把结果写进 DOM。
 *
 * 一律用 textContent 而不是 innerHTML：payload 里有来自远端响应的字符串，
 * 不能让它有机会被当成 HTML 解析。
 */
import { installShims } from './shim'
import { buildPanelView, type PanelPayload, type PanelView } from './sidebar-view'

const ROOT_ID = 'app'
const BALANCE_URL = '/dsh-whale/balance.json'
const COMMAND_URL = '/dsh-whale/command.json'

const root = document.getElementById(ROOT_ID)

async function fetchPayload(): Promise<PanelPayload> {
  try {
    const res = await fetch(BALANCE_URL, { cache: 'no-store' })
    return (await res.json()) as PanelPayload
  } catch {
    return { ok: false, code: 'NETWORK' }
  }
}

async function runCommand(command: string): Promise<void> {
  try {
    await fetch(COMMAND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    })
  } catch {
    // 按钮失败不弹错：下一次广播或手动刷新会把状态纠正回来
  }
}

function row(label: string, value: string, className = ''): HTMLDivElement {
  const div = document.createElement('div')
  div.className = className === '' ? 'whale-row' : `whale-row ${className}`
  const name = document.createElement('span')
  name.textContent = label
  const val = document.createElement('span')
  val.textContent = value
  div.append(name, val)
  return div
}

function render(view: PanelView): void {
  if (!root) return
  root.textContent = ''

  const img = document.createElement('img')
  img.id = 'whale'
  img.alt = view.imageAlt
  img.src = view.imageKey // 媒体 shim 会改写成 asWebviewUri
  root.append(img)

  root.append(row('余额', view.balanceText, 'whale-balance'))
  root.append(row('今日', view.todayText))

  if (view.stampText !== '') {
    const stamp = document.createElement('div')
    stamp.className = 'whale-muted'
    stamp.textContent = view.stampText
    root.append(stamp)
  }
  if (view.note !== '') {
    const note = document.createElement('div')
    note.className = `whale-note ${view.noteTone}`
    note.textContent = view.note
    root.append(note)
  }
  if (view.showSetKey) {
    const button = document.createElement('button')
    button.textContent = '设置 API Key'
    button.addEventListener('click', () => { void runCommand('whale.setApiKey') })
    root.append(button)
  }
  const refresh = document.createElement('button')
  refresh.className = 'secondary'
  refresh.textContent = '立即刷新'
  refresh.addEventListener('click', () => { void runCommand('whale.refresh') })
  root.append(refresh)
}

async function load(): Promise<void> {
  render(buildPanelView(await fetchPayload()))
}

window.addEventListener('dshw:event', ((event: CustomEvent) => {
  const detail = event.detail as { name?: string } | undefined
  if (detail?.name === 'balance') void load()
}) as EventListener)

installShims()
void load()
```

- [ ] **Step 2: 加第四个构建入口（`esbuild.mjs`）**

`targets` 数组里，紧跟 `probe` 之后加：

```js
  {
    ...common,
    entryPoints: ['src/webview/sidebar-ui.ts'],
    outfile: 'dist/sidebar-ui.js',
    platform: 'browser',
    format: 'iife',
    target: 'chrome110',
  },
```

- [ ] **Step 3: `host.ts` 支持选择页面**

```ts
export type WebviewPage = 'sidebar' | 'probe'

const PAGES: Record<WebviewPage, { entry: string[]; rootId: string; rootPlaceholder: string }> = {
  sidebar: { entry: ['dist', 'sidebar-ui.js'], rootId: 'app', rootPlaceholder: '' },
  probe: { entry: ['dist', 'probe.js'], rootId: 'probe', rootPlaceholder: '正在自检…' },
}
```

`attach` 签名与 `buildHtml` 调用改为：

```ts
  attach(target: Attachable, page: WebviewPage = 'sidebar'): void {
```

```ts
    const pageConfig = PAGES[page]
    webview.html = buildHtml({
      cspSource: webview.cspSource,
      nonce,
      uris: {
        shim: asCheckedUri(['dist', 'dshw-shim.js']),
        entry: asCheckedUri(pageConfig.entry),
        media: asMediaUri(''),
      },
      mediaMap: this.options.mediaMap(asMediaUri),
      rootId: pageConfig.rootId,
      rootPlaceholder: pageConfig.rootPlaceholder,
    })
```

- [ ] **Step 4: 构建并检查产物**

Run: `npm run build && ls dist/sidebar-ui.js && npm run typecheck`
Expected: 四个入口都构建成功；`dist/sidebar-ui.js` 存在（约 5–8KB）；`tsc` 退出码 0。

- [ ] **Step 5: 跑全量测试**

Run: `npm run test`
Expected: 全绿（`html`/`host` 相关用例已在 Task 6 同步更新）。

- [ ] **Step 6: Commit**

```bash
git add src/webview/sidebar-ui.ts src/webview/host.ts esbuild.mjs
git commit -m "feat(webview): 侧边栏前端（取数 + 事件驱动重取 + 三态主图）"
```

---

## Task 10: 接线（扩展根、配置项、自检命令）

**Files:**
- Modify: `src/extension.ts`, `package.json`, `test/activate.test.ts`

- [ ] **Step 1: 更新 `test/activate.test.ts`**

先把 `mocks` 里加上面板与 webview 映射，并把假 webview 抽成工厂（面板与侧边栏共用同一套断言变量）：

```ts
const mocks = vi.hoisted(() => ({
  statusItems: [] as { text: string; tooltip: string; command: string; name: string }[],
  views: [] as { id: string; provider: { resolveWebviewView: (view: unknown) => void } }[],
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  received: [] as unknown[],
  webviewHtml: '',
  webviews: [] as unknown[],
  panels: [] as { onDidDispose: (cb: () => void) => { dispose(): void } }[],
}))
```

假宿主里加 `createWebviewPanel`：

```ts
      createWebviewPanel: () => {
        const webview = {
          cspSource: 'vscode-webview://panel',
          asWebviewUri: (uri: unknown) => `webview://${String(uri)}`,
          get html() { return mocks.webviewHtml },
          set html(value: string) { mocks.webviewHtml = value },
          options: {},
          postMessage: async () => true,
          onDidReceiveMessage: () => ({ dispose() {} }),
        }
        mocks.webviews.push(webview)
        const panel = { webview, onDidDispose: () => ({ dispose() {} }), dispose() {} }
        mocks.panels.push(panel)
        return panel
      },
```

命令断言改为 5 条，侧边栏断言改为新入口：

```ts
    expect([...mocks.commands.keys()].sort())
      .toEqual(['whale.clearApiKey', 'whale.refresh', 'whale.setApiKey', 'whale.showLog', 'whale.showSelfCheck'].sort())
```

```ts
    expect(mocks.webviewHtml).toContain('sidebar-ui.js')
    expect(mocks.webviewHtml).toContain('<div id="app"></div>')
```

```ts
    expect(JSON.parse(response.body)).toMatchObject({ ok: false, code: 'NO_KEY', mood: 'sleepy' })
```

再补一条：自检命令能挂上探针页

```ts
  it('自检命令打开独立面板并挂载探针页', async () => {
    activate(fakeContext() as never)
    await new Promise(resolve => setTimeout(resolve, 5))
    const show = mocks.commands.get('whale.showSelfCheck')
    expect(typeof show).toBe('function')
    show?.()
    expect(mocks.webviews.length).toBe(1)
    expect(mocks.webviewHtml).toContain('probe.js')
    expect(mocks.webviewHtml).toContain('<div id="probe">')
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/activate.test.ts`
Expected: FAIL — 命令集合只有 4 条、HTML 里是 `probe.js`。

- [ ] **Step 3: 改 `src/extension.ts`**

导入与关键接线：

```ts
import { registerCommandRoute } from './routes/command'
import { pickMood, type Mood } from './webview/mood'
import type { RefreshResult } from './core/refresh'
```

```ts
  const threshold = (): number =>
    vscode.workspace.getConfiguration('whaleWidget').get<number>('lowBalanceThreshold', 5)

  const moodOf = (result: RefreshResult): Mood =>
    pickMood({ state: result.state, balance: result.balance, threshold: threshold() })
```

```ts
  registerBalanceRoutes(routeTable, {
    refresh,
    moodOf,
    readSize: async () => (await store.readJson<Record<string, unknown>>('size.json')) ?? {},
    writeSize: value => store.writeJson('size.json', value),
  })

  registerCommandRoute(routeTable, {
    execute: async command => { await vscode.commands.executeCommand(command) },
  })
```

```ts
    mediaMap: mediaUri => ({
      '/dsh-whale/image.png': mediaUri('whale-delighted.png'),
      '/dsh-whale/whale-delighted.png': mediaUri('whale-delighted.png'),
      '/dsh-whale/whale-sleepy.png': mediaUri('whale-sleepy.png'),
      '/dsh-whale/whale-determined.png': mediaUri('whale-determined.png'),
    }),
```

`subscriptions.push` 里加一条自检命令，并让阈值变化时重播广播：

```ts
    vscode.commands.registerCommand('whale.showSelfCheck', () => {
      const panel = vscode.window.createWebviewPanel(
        'whaleSelfCheck',
        '鲸鱼 · 通信层自检',
        vscode.ViewColumn.Active,
        { enableScripts: true }
      )
      host.attach({
        webview: panel.webview,
        onDidReceiveMessage: cb => panel.webview.onDidReceiveMessage(cb),
      }, 'probe')
      panel.onDidDispose(() => host.detach(panel.webview))
    }),
```

```ts
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('whaleWidget.refreshIntervalSeconds')) restartTimer()
      if (event.affectsConfiguration('whaleWidget.lowBalanceThreshold')) {
        // 不重新拉网络：广播只是"该重新取数了"的信号，界面会重新走 balance.json，
        // 路由在那一刻用新阈值算 mood
        host.broadcast('balance', refresh.last() ?? {})
      }
    }),
```

- [ ] **Step 4: 改 `package.json`**

`contributes.commands` 追加：

```json
      { "command": "whale.showSelfCheck", "title": "鲸鱼: 显示通信层自检页" }
```

`contributes.configuration.properties` 追加：

```json
        "whaleWidget.lowBalanceThreshold": {
          "type": "number",
          "default": 5,
          "minimum": 0,
          "description": "余额低于该数字时，侧边栏的鲸鱼少女变为「坚定」表情。按当前币种的数字直接比较，不做汇率换算"
        }
```

- [ ] **Step 5: 运行确认通过 + 全量**

Run: `npx vitest run test/activate.test.ts && npm run typecheck && npm run test && npm run build`
Expected: activate 测试 PASS；`tsc` 0 错误；全量测试绿；四入口构建成功。

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts package.json test/activate.test.ts
git commit -m "feat: 接线侧边栏形象（阈值配置、mood 下发、自检命令、命令路由）"
```

---

## Task 11: 许可与归属落地

**Files:**
- Create: `LICENSE-ARTWORK`, `test/notice.test.ts`
- Modify: `NOTICE.md`, `README.md`, `package.json`

- [ ] **Step 1: 写失败测试 `test/notice.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const notice = readFileSync(join(root, 'NOTICE.md'), 'utf8')
const artwork = readFileSync(join(root, 'LICENSE-ARTWORK'), 'utf8')
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { license?: string }

describe('NOTICE.md 的署名义务', () => {
  it('三层署名链一个都不能少', () => {
    expect(notice).toContain('62155430')       // 原始鲸鱼少女角色设计
    expect(notice).toContain('18604994')       // 女仆版改设计
    expect(notice).toContain('Small-tailqwq')  // 本皮肤素材
  })

  it('写明许可、上游地址与锁定 commit', () => {
    expect(notice).toContain('CC BY-NC-SA 4.0')
    expect(notice).toContain('https://github.com/Small-tailqwq/dsh-deep-whale')
    expect(notice).toContain('80630009aee821fe69a9bcd1078c7098300f2c26')
  })

  it('写明我们的改动与非商业限制', () => {
    expect(notice).toContain('512')
    expect(notice).toContain('非商业')
  })

  it('保留收到权利主张即处理的承诺', () => {
    expect(notice).toContain('移除')
  })
})

describe('LICENSE-ARTWORK', () => {
  it('给出许可名称与官方链接', () => {
    expect(artwork).toContain('CC BY-NC-SA 4.0')
    expect(artwork).toContain('creativecommons.org/licenses/by-nc-sa/4.0')
  })

  it('说明代码与美术是两套许可', () => {
    expect(artwork).toContain('MIT')
    expect(artwork).toContain('美术')
  })
})

describe('包与文档里的许可字段', () => {
  it('package.json 不再声称整包是 MIT', () => {
    expect(pkg.license).toBe('SEE LICENSE IN LICENSE')
  })

  it('README 说明非商业限制', () => {
    expect(readme).toContain('CC BY-NC-SA 4.0')
    expect(readme).toContain('非商业')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/notice.test.ts`
Expected: FAIL — 读不到 `LICENSE-ARTWORK`。

- [ ] **Step 3: 新建 `LICENSE-ARTWORK`**

```markdown
# 美术素材许可（Artwork License）

## 适用范围

本仓库中的以下文件是**美术素材**，**不属于 MIT 许可**的范围：

- `media/whale-delighted.png`
- `media/whale-sleepy.png`
- `media/whale-determined.png`

本仓库其余部分（`src/`、`tools/`、`test/` 等代码与脚本）继续按 MIT 许可发布，见 `LICENSE`。
即：**代码 MIT，美术 CC BY-NC-SA 4.0**。

## 许可

上述美术素材及其改作，按 **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
（CC BY-NC-SA 4.0）** 提供。许可全文见：

<https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode>

该许可的四条要点（以官方文本为准）：

| 条款 | 含义 |
|---|---|
| **BY 署名** | 必须标明原作者与来源，并**说明是否做过改动**（改动清单见 `NOTICE.md`） |
| **NC 非商业** | **不得用于商业目的**。本项目自身也是免费、非商业的 |
| **SA 同许可** | 对素材的**改作**必须同样以 CC BY-NC-SA 4.0 释出（我们的缩放/裁切属于改作） |
| 无额外限制 | 不得追加法律或技术措施限制他人依本许可使用 |

## 署名

完整署名链与来源见 `NOTICE.md`。简言之：原始鲸鱼少女角色设计、
女仆版改设计（加入 DeepSeek 元素）、以及本皮肤素材分别来自三位不同的作者。

## 商业使用

**不允许。** 如果你想把本项目用于商业用途，必须先替换掉上述美术素材——
代码部分是 MIT，换图即可继续商业使用。
```

- [ ] **Step 4: `NOTICE.md` 追加一节**

```markdown
## 鲸鱼少女形象（侧边栏美术，CC BY-NC-SA 4.0）

### 来源

- 仓库：<https://github.com/Small-tailqwq/dsh-deep-whale>
- 路径：`maid-atelier/assets/icons/`
- **锁定 commit**：`80630009aee821fe69a9bcd1078c7098300f2c26`（素材可用 `tools/fetch-artwork.mjs` 按此 commit + sha256 重新取回）

### 署名链（上游 `maid-atelier/NOTICE` 声明，逐层转写）

| 层 | 作者 | 贡献 |
|---|---|---|
| 一次创作 | Pixiv 画师（<https://www.pixiv.net/users/62155430>） | 原始**鲸鱼少女角色设计** |
| 二次创作 | zipzip（<https://www.pixiv.net/users/18604994>） | 女仆版改设计（加入 DeepSeek 元素，GPT Image 2 生成） |
| 三次创作 | Small-tailqwq | 本皮肤素材（`assets/icons/`，2026-09-07 提供原图） |

### 许可

**CC BY-NC-SA 4.0**（署名—非商业—相同方式共享）。条款全文与边界见仓库根 `LICENSE-ARTWORK`。
**本项目为免费、非商业项目**，不满足该许可的商用条件时不得使用这些素材。

### 我们做的改动（CC BY 的"说明改动"义务）

| 改动 | 说明 |
|---|---|
| 缩放 | 长边缩到 **512px**（面积平均、alpha 加权），供侧边栏 240px 显示 |
| 裁剪 | 仅取原图内容，未裁切画面 |
| 转码 | 统一重编码为 RGBA8 PNG（去掉原文件的元数据块） |
| 用途 | 侧边栏三种状态的表情图；未做二次绘制或调色 |

改作部分同样以 CC BY-NC-SA 4.0 释出（见 `LICENSE-ARTWORK`）。

### 如实说明

- 上游声明这些素材为**使用者提供 / AI 生成或 AI 辅助**，上游亦不声称其为原创作品；
  本项目的署名链完全转写自上游 `NOTICE`，我们无法独立核实原始设计的权利状态。
- 上游 `PROVENANCE.md` 的做法是"收到权利主张即替换或移除"。本项目沿用同一承诺：
  **如权利人提出主张，我们会立即移除或替换上述素材**，不附加条件。
```

- [ ] **Step 5: `package.json` 与 `README.md`**

- `package.json`：`"license": "MIT"` → `"license": "SEE LICENSE IN LICENSE"`
- `README.md` 的「许可」一节替换为：

```markdown
## 许可

- **代码**：MIT，见 `LICENSE`
- **美术**（`media/whale-*.png`，侧边栏的鲸鱼少女形象）：**CC BY-NC-SA 4.0**，
  **仅限非商业使用**，见 `LICENSE-ARTWORK` 与完整的署名链 `NOTICE.md`

即：本项目免费且非商业。若想用于商业用途，替换掉 `media/whale-*.png` 即可
（代码部分没有该限制）。

记账内核复用自 [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（MIT, Copyright (c) 2026 MeteorNOX），
其 `assets/` 下的美术素材**不在 MIT 范围内，本项目未使用**。
```

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run test/notice.test.ts`
Expected: PASS，8 个用例。

- [ ] **Step 7: Commit**

```bash
git add NOTICE.md LICENSE-ARTWORK README.md package.json test/notice.test.ts
git commit -m "docs(license): 代码 MIT + 美术 CC BY-NC-SA 4.0（署名链、改动说明、非商业）"
```

---

## Task 12: 退役占位鲸鱼

**Files:**
- Delete: `media/placeholder-whale.png`, `tools/make-placeholder.mjs`, `test/placeholder-image.test.ts`
- Modify: `src/webview/probe.ts`, `.vscodeignore`

- [ ] **Step 1: 改探针页的媒体断言**

`src/webview/probe.ts` 里那一行：

```ts
  const rewritten = img.src.includes('placeholder-whale.png')
```

改为：

```ts
  const rewritten = img.src.includes('whale-delighted.png')
```

- [ ] **Step 2: 删除占位图三件套**

```bash
git rm media/placeholder-whale.png tools/make-placeholder.mjs test/placeholder-image.test.ts
```

- [ ] **Step 3: `.vscodeignore` 排除原始素材**

追加：

```
media/raw/**
```

（`media/whale-*.png` 必须**保留**在包里，别加 `media/**` 之类的宽规则。）

- [ ] **Step 4: 跑全量测试**

Run: `npm run test && npm run typecheck`
Expected: 全绿（`placeholder-image.test.ts` 的 4 个用例消失，测试总数相应减少）。
若仍有测试引用 `placeholder-whale.png`，说明漏改——用 `grep -rn placeholder-whale src test tools media` 找干净。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(media): 退役几何占位鲸鱼（真实形象已就位）"
```

---

## Task 13: 全量验收与打包

**Files:** 无新增

- [ ] **Step 1: 清理重装 + 全量测试**

```bash
rm -rf node_modules dist
npm install
npm run typecheck
npm run test
npm run build
```

Expected: 安装 0 漏洞；`tsc` 0 错误；测试全绿；四入口构建成功。

- [ ] **Step 2: 打包并核对内容**

```bash
npm run package
npx @vscode/vsce ls
```

Expected：`.vsix` 内的 `media/` 只有 `activity-icon.svg` + 三张 `whale-*.png`；
**没有** `media/raw/`；包含 `LICENSE-ARTWORK`；`dist/` 里有 `sidebar-ui.js`。

- [ ] **Step 3: 素材溯源复核**

```bash
node tools/fetch-artwork.mjs
```

Expected: 三行"跳过（已存在且校验通过）" —— 证明 pin 与本地一致。

- [ ] **Step 4: 🔍 人工验收（需要真实 VSCode + 真密钥）**

```bash
code --install-extension vscode-whale-widget-0.0.1.vsix
```

| # | 操作 | 期望 |
|---|---|---|
| 1 | 打开侧边栏 | 顶部是鲸鱼少女；余额与状态栏一致；下方「立即刷新」可用 |
| 2 | 未配置密钥 | 她显**困**；出现「设置 API Key」按钮，点击能弹出输入框 |
| 3 | 填入正确密钥 | 余额健康 → 她变**开心** |
| 4 | 把 `whaleWidget.lowBalanceThreshold` 调成大于余额 | 表情**当场**变**坚定**（不重新拉网络、不重载窗口） |
| 5 | 填入错误密钥（`sk-wrong`） | 她**坚定** + 「API Key 无效或无权限」；扩展不崩 |
| 6 | 断网后点刷新 | 数字沿用旧值 + `~` 前缀 + 「网络异常，正在显示上次数据」，**表情不变** |
| 7 | 命令面板 → `鲸鱼: 显示通信层自检页` | 探针页打开且全部通过 |
| 8 | 把侧边栏拖到最窄 | 主图跟着缩、文字不溢出 |
| 9 | 深色 / 浅色主题各看一次 | 人物边缘不出现白底方块 |

- [ ] **Step 5: 打 tag 与提交**

```bash
git tag -a v0.1.0 -m "鲸鱼少女形象落地：三态表情 + CC BY-NC-SA 4.0 素材管线"
```

- [ ] **Step 6: 输出完成报告**

在 `docs/superpowers/plans/` 追加 `2026-09-19-whale-girl-artwork-completion.md`，记录：逐条验收结果、
与计划的偏差及原因、留给后续（动效 / 气泡 / Activity Bar 剪影 / 多币种阈值）的清单。

---

# 执行交接（2026-09-19 21:20）

**当前状态：Task 1 尚未开始，工作区干净。**

- 分支：`feat/1-whale-girl-artwork`（从 `3442cec` 切出，仅有本文件的文档提交）
- 上游 pin、镜像可用性、三张源图的色彩类型等**前置事实都已在计划正文里写死**，无需重新探测
- `media/raw/` 尚未下载（Task 2 会做）；`media/whale-*.png` 尚不存在

**执行协议（按 subagent-driven-development）**

每个 Task：`worker` 实现 → `reviewer` 审 spec 合规 → `reviewer`（换角度）审代码质量；
任一审查不通过就回到实现者重修、**重审**，全绿才勾选该 Task 的 checkbox 并进入下一个。

- 实现者：默认模型（本任务多为一两个文件、规格完整）
- 审查者：`deepseek/deepseek-v4-pro`（审查吃判断力）
- 单个 Task 的完整文本从本文件的 `## Task N:` 小节取，**取该节为止，不要通读全文**
- 偏差处理：与计划不符就停下来记进「执行记录」，不要静默改设计
- 每个 Task 结束时跑 `npm run test && npm run typecheck`，按计划里的 commit message 提交

**为什么需要交接**：本会话（20:36 启动）的模型工具表里没有 `subagent`
——`pi-subagents` 是 21:14 装的，晚于会话启动 38 分钟，工具注册表不会追溯生效。
新开一个会话即可拿到 `subagent`，本文件与分支已就位，无需其它准备。

---

# 执行记录（controller 追加）

执行方式：subagent-driven-development。每个 Task：`worker` 实现 → `oracle` 审 spec 合规 →
`reviewer` 审代码质量；任一审查不通过就退回实现者修复并**重审**，全绿才进入下一个 Task。

## DEV-1 · Task 1 用例「透明像素不把边缘染黑（alpha 加权）」自相矛盾（已批准勘误）

- **发现**：首轮实现者逐字照抄计划代码后，该用例 `expect(small.pixels[4]).toBeGreaterThan(200)`
  必然失败（实测得 `0`），因此计划里「PASS（11 个用例）」不可达。
- **根因**：用例把源图最右**两个**像素（索引 2、3）都清零，而 4→2 的边锚定盒式缩放下，
  右侧输出像素的采样区间恰好是 `[2,4)`——全部透明，输出本就该是全透明。
  断言与用例注释（「左半白不透明、右半全透明…左像素应仍是白色」）互相矛盾；`resizeRgba` 实现无误。
- **勘误**（只改测试，`tools/png.mjs` 逐字不动）：删除 `img.pixels[8..11] = 0` 那一行，
  只保留最右一列透明，并把注释改成说明「右侧输出像素混合了不透明白与全透明，
  未做 alpha 加权时红通道会掉到约 127」。
- **验证**：controller 用 `node` 实测——原布局右侧输出像素 `[0,0,0,0]`；勘误后 `[255,255,255,128]`，
  仍能区分 alpha 加权（255）与朴素平均（127）。
- **影响**：`resizeRgba` 被 Task 3 的成品缩放复用，故选择改测试而非改实现。

## DEV-2 · Task 6 顺带改名 `uris.probe` → `uris.entry`（预先批准的最小偏差）

`HtmlUris` 改名后 `src/webview/host.ts` 的 `buildHtml` 调用会类型报错，故允许在该 Task
顺手把 `host.ts` 里那一个属性名改成 `entry`，以保持每个 Task 结束时 `npm run typecheck` 为绿。
Task 9 再做完整的页面参数化。

## DEV-3 · Task 8 提交后 `typecheck` 短暂为红（预先批准的时序窗口）

Task 8 给 `registerBalanceRoutes` 加了必填的 `moodOf`，而调用点 `src/extension.ts` 要到
Task 10 才接线。故 Task 8 只保证测试全绿、`typecheck` 的唯一报错点写在提交说明与执行记录里，
Task 10 修复。

## DEV-4 · 审查不通过时的修复使用新的 `worker`（而非 resume 同一子代理）

多轮修复走「新的 `worker` + 完整发现清单 + 原实现者报告」的交接；优先尝试 `resume`，
失败则回退到新 `worker`。目的是避免长链路 resume 的不确定性，同时保持「一个写入者」。

## DEV-5 · Task 8 提前接线 `moodOf`（DEV-3 的漏判修正，已批准）

- **发现**：DEV-3 只预判了 `typecheck` 变红，实际还有**运行期**后果：
  `test/activate.test.ts` 用真实 `activate()` 走真实路由，`deps.moodOf` 为 `undefined` 时
  在 `dispatch` 内部抛错、被 `RouteTable` 兜成 **500**（实测 200→500，`activate.test.ts:134`）。
- **勘误**：允许 Task 8 在计划清单之外给 `src/extension.ts` 加 2 行临时接线
  （`import { pickMood }` + `moodOf: result => pickMood({ state, balance, threshold: 5 })`，
  附一行「临时：Task 10 起改为读配置」的中文注释）。Task 10 按计划把这两行改写成
  `threshold()` 读 `whaleWidget.lowBalanceThreshold` 的版本。
- **理由**：不让 `npm run test` 在 Task 8→9 期间为红（Task 9 的验收步骤要求全量测试全绿），
  且该接线性本来就在 Task 10 的范围内，提前两行不引入新设计。

## DEV-6 · Task 8 测试片段 `totalBalance` 笔误（已批准）

计划里 `const low: RefreshResult = { ...OK, totalBalance: 1, balance: 1 }` 会触发 TS2353——
`RefreshResult`（`src/core/refresh.ts:11`）没有 `totalBalance` 字段。按批准删掉该属性
（`{ ...OK, balance: 1 }`）；断言只读 `mood`，行为完全一致。

