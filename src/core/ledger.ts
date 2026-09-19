import type { Ledger } from './accounting.mjs'
import type { FileStore } from './store'

export const LEDGER_FILE = 'ledger.json'

/**
 * 账本形状由上游内核（accounting.mjs）定义，这里只负责搬运。
 * 文件缺失或形状明显不对（数组/标量/空）时退回空账本，宁可丢掉历史，
 * 也不要让一个坏文件把整个扩展卡在启动路径上。
 *
 * 注意：JSON **语法** 损坏（截断、半截写入）仍会向上抛，由调用方决定是否降级；
 * 原子写（store.ts）就是为了把这种情况限制在「不可能发生」的范围内。
 */
export async function loadLedger(store: FileStore): Promise<Ledger> {
  const raw = await store.readJson<Ledger>(LEDGER_FILE)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw
}

export async function saveLedger(store: FileStore, ledger: Ledger): Promise<void> {
  await store.writeJson(LEDGER_FILE, ledger)
}
