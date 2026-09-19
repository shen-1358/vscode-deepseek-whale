import { describe, expect, it } from 'vitest'
import { FileStore } from '../src/core/store'
import { createRefresher } from '../src/core/refresh'
import { BalanceError } from '../src/provider/types'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const T0 = Date.parse('2026-09-19T02:00:00Z')

function deps(overrides: Partial<Parameters<typeof createRefresher>[0]> = {}) {
  return {
    resolveKey: async () => ({ key: 'sk-a', source: 'secret' as const }),
    fetchBalance: async () => ({ balance: 100, currency: 'CNY' }),
    store: new FileStore(mkdtempSync(join(tmpdir(), 'dshw-r-'))),
    now: () => T0,
    log: () => {},
    ...overrides,
  }
}

describe('createRefresher', () => {
  it('首次成功返回 ok 且今日消费为 0', async () => {
    const refresh = createRefresher(deps())
    const result = await refresh()
    expect(result.state).toBe('ok')
    expect(result.balance).toBe(100)
    expect(result.todayUsage).toBe(0)
    expect(result.stale).toBe(false)
  })

  it('没有密钥时返回 no-key', async () => {
    const refresh = createRefresher(deps({ resolveKey: async () => null }))
    expect((await refresh()).state).toBe('no-key')
  })

  it('密钥无效时返回 auth-error', async () => {
    const refresh = createRefresher(deps({
      fetchBalance: async () => { throw new BalanceError('bad', 'AUTH') },
    }))
    expect((await refresh()).state).toBe('auth-error')
  })

  it('网络失败且无历史时返回 network-error', async () => {
    const refresh = createRefresher(deps({
      fetchBalance: async () => { throw new BalanceError('down', 'NETWORK') },
    }))
    const result = await refresh()
    expect(result.state).toBe('network-error')
    expect(result.balance).toBeUndefined()
  })

  it('网络失败但已有历史时沿用旧值并标 stale', async () => {
    let fail = false
    const refresh = createRefresher(deps({
      fetchBalance: async () => {
        if (fail) throw new BalanceError('down', 'NETWORK')
        return { balance: 88.8, currency: 'CNY' }
      },
    }))
    await refresh()
    fail = true
    const result = await refresh()
    expect(result.state).toBe('ok')
    expect(result.balance).toBe(88.8)
    expect(result.stale).toBe(true)
  })

  it('恢复后 stale 变回 false', async () => {
    let fail = false
    const refresh = createRefresher(deps({
      fetchBalance: async () => {
        if (fail) throw new BalanceError('down', 'NETWORK')
        return { balance: 50, currency: 'CNY' }
      },
    }))
    await refresh()
    fail = true
    await refresh()
    fail = false
    expect((await refresh()).stale).toBe(false)
  })

  it('余额下降后今日消费被累计', async () => {
    let balance = 100
    let clock = T0
    const refresh = createRefresher(deps({
      fetchBalance: async () => ({ balance, currency: 'CNY' }),
      now: () => clock,
    }))
    await refresh()
    balance = 90
    clock = T0 + 3_600_000
    const result = await refresh()
    expect(result.todayUsage).toBe(10)
  })

  // 计划原文把上面的时钟钉死在 T0，于是两次观测的 at 完全相同：
  // 内核的 `if (book.lastAt != null && at <= book.lastAt)` 会把第二次直接丢掉，
  // 断言 10 必失败（拿到的是上一次的 0）。这不是实现 bug，是防重复计费。
  // 这里把这条交互单独钉住，免得以后有人再把时钟写死。
  it('同一时刻的重复观测不重复计费，时间推进后才累计', async () => {
    let balance = 100
    let clock = T0
    const refresh = createRefresher(deps({
      fetchBalance: async () => ({ balance, currency: 'CNY' }),
      now: () => clock,
    }))
    await refresh()
    balance = 90
    expect((await refresh()).todayUsage).toBe(0)
    clock = T0 + 60_000
    expect((await refresh()).todayUsage).toBe(10)
  })

  it('账本写入失败不阻塞返回', async () => {
    const store = new FileStore(mkdtempSync(join(tmpdir(), 'dshw-r-')))
    store.writeJson = async () => { throw new Error('disk full') }
    const logged: string[] = []
    const refresh = createRefresher(deps({ store, log: line => logged.push(line) }))
    const result = await refresh()
    expect(result.state).toBe('ok')
    expect(logged.some(l => l.includes('落盘失败'))).toBe(true)
  })
})
