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
