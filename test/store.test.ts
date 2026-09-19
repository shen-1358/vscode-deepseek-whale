import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileStore } from '../src/core/store'

const dirs: string[] = []

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dshw-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('FileStore', () => {
  it('写入后可读回', async () => {
    const store = new FileStore(scratch())
    await store.writeText('a.json', '{"x":1}')
    expect(await store.readText('a.json')).toBe('{"x":1}')
  })

  it('读取不存在的文件返回 null', async () => {
    const store = new FileStore(scratch())
    expect(await store.readText('nope.json')).toBeNull()
  })

  it('目录不存在时自动创建', async () => {
    const store = new FileStore(join(scratch(), 'deep', 'nested'))
    await store.writeText('a.txt', 'hi')
    expect(await store.readText('a.txt')).toBe('hi')
  })

  it('原子写不留下临时文件', async () => {
    const dir = scratch()
    const store = new FileStore(dir)
    await store.writeText('a.json', '{"x":1}')
    expect(readdirNames(dir).filter(n => n.includes('.tmp'))).toEqual([])
  })

  it('原子写覆盖旧内容', async () => {
    const dir = scratch()
    const store = new FileStore(dir)
    await store.writeText('a.json', '{"x":1}')
    await store.writeText('a.json', '{"x":2}')
    expect(JSON.parse(readFileSync(join(dir, 'a.json'), 'utf8'))).toEqual({ x: 2 })
  })

  it('读 JSON：缺失返回 null，损坏抛错', async () => {
    const store = new FileStore(scratch())
    expect(await store.readJson('none.json')).toBeNull()
    await store.writeText('bad.json', '{oops')
    await expect(store.readJson('bad.json')).rejects.toThrow()
  })
})

function readdirNames(dir: string): string[] {
  return readdirSync(dir)
}
