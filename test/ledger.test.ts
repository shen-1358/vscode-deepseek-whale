/**
 * Task 9 的补充测试：计划没有给 `ledger.ts` 配测试，但它的形状守卫
 * （`!raw || typeof raw !== 'object' || Array.isArray(raw)`）正是那种
 * 「写反了也不会有人发现、直到用户账本被吞掉」的代码，值得钉住。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LEDGER_FILE, loadLedger, saveLedger } from '../src/core/ledger'
import { FileStore } from '../src/core/store'

const dirs: string[] = []

function scratchStore(): FileStore {
  const dir = mkdtempSync(join(tmpdir(), 'dshw-'))
  dirs.push(dir)
  return new FileStore(dir)
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('ledger', () => {
  it('存下再读回，内容一致', async () => {
    const store = scratchStore()
    const ledger = { accounting: { version: 1, active: 'deepseek-CNY', books: {} } }
    await saveLedger(store, ledger)
    expect(await loadLedger(store)).toEqual(ledger)
  })

  it('落盘文件名是 ledger.json', async () => {
    const store = scratchStore()
    await saveLedger(store, { todayUsage: 1 })
    expect(await store.readJson(LEDGER_FILE)).toEqual({ todayUsage: 1 })
  })

  it('文件缺失时退回空账本', async () => {
    expect(await loadLedger(scratchStore())).toEqual({})
  })

  it.each(['[]', '"字符串"', 'null', '3'])('形状不对的 %s 退回空账本', async (text) => {
    const store = scratchStore()
    await store.writeText(LEDGER_FILE, text)
    expect(await loadLedger(store)).toEqual({})
  })

  it('JSON 语法损坏向上抛（由调用方决定降级）', async () => {
    const store = scratchStore()
    await store.writeText(LEDGER_FILE, '{"accounting":')
    await expect(loadLedger(store)).rejects.toThrow()
  })
})
