import { observeBalance, balanceSummary, beijingDay } from './accounting.mjs'
import { loadLedger, saveLedger } from './ledger'
import type { FileStore } from './store'
import { BalanceError, type BalanceSnapshot } from '../provider/types'
// 注意：KeySource 来自 keyresolve（纯逻辑），不是 credentials（那个 import vscode，
// 在 Node/vitest 里加载不了）。计划原文写的是 '../credentials'，见执行记录。
import type { KeySource } from '../keyresolve'

export type RefreshState = 'ok' | 'no-key' | 'auth-error' | 'network-error'

export interface RefreshResult {
  state: RefreshState
  balance?: number
  currency?: string
  todayUsage?: number | null
  stale?: boolean
  observedAt?: number
  message?: string
}

export interface RefreshDeps {
  resolveKey: () => Promise<KeySource | null>
  fetchBalance: (key: string) => Promise<BalanceSnapshot>
  store: FileStore
  now: () => number
  log: (line: string) => void
  scope?: string
}

export interface Refresher {
  (force?: boolean): Promise<RefreshResult>
  last(): RefreshResult | null
}

export function createRefresher(deps: RefreshDeps): Refresher {
  const scope = deps.scope ?? 'deepseek'
  let cached: RefreshResult | null = null

  const run = async (): Promise<RefreshResult> => {
    const resolved = await deps.resolveKey()
    if (!resolved) {
      cached = { state: 'no-key', message: '未配置 API Key' }
      return cached
    }

    let snapshot: BalanceSnapshot
    try {
      snapshot = await deps.fetchBalance(resolved.key)
    } catch (err) {
      // 未知异常也兜住：Task 10 记录过 response.text() 会抛裸 TypeError。
      const code = err instanceof BalanceError ? err.code : 'NETWORK'
      const message = err instanceof Error ? err.message : String(err)
      deps.log(`余额拉取失败（${code}）：${message}`)
      if (code === 'AUTH') {
        cached = { state: 'auth-error', message }
        return cached
      }
      if (cached && cached.state === 'ok' && cached.balance !== undefined) {
        cached = { ...cached, stale: true, message }
        return cached
      }
      cached = { state: 'network-error', message }
      return cached
    }

    const at = deps.now()
    const ledger = await loadLedger(deps.store)
    const summary = observeBalance(ledger, {
      at,
      balance: snapshot.balance,
      currency: snapshot.currency,
      scope,
    })
    try {
      await saveLedger(deps.store, ledger)
    } catch (err) {
      deps.log(`落盘失败（不影响显示）：${err instanceof Error ? err.message : String(err)}`)
    }

    const today = summary ?? balanceSummary(ledger, beijingDay(at))
    cached = {
      state: 'ok',
      balance: snapshot.balance,
      currency: snapshot.currency,
      todayUsage: today ? today.amount : null,
      stale: false,
      observedAt: at,
    }
    deps.log(`余额 ${snapshot.balance} ${snapshot.currency}，今日已用 ${cached.todayUsage}`)
    return cached
  }

  const refresher = run as Refresher
  refresher.last = () => cached
  return refresher
}
