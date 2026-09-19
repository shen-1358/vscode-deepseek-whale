/**
 * 上游记账内核的 characterization 测试（行为刻画测试）。
 *
 * 内核是 vendored 代码（逐字节复制自上游，MIT），不是我们写的实现，
 * 所以这些测试的职责不是驱动开发，而是**回归保护**：
 * 一旦有人改了 src/core/accounting.mjs，或升级上游后行为变了，这里必须立刻报警。
 *
 * 覆盖的行为均由 spec §7 的数据流决定：
 *   - 余额下降 = 当日消费；余额上升（充值）= 单独记录的 credit，不冲抵消费
 *   - 重复/乱序的观测被忽略（防止同一次刷新被重复计费）
 *   - 不同币种按 scope+currency 分账本，互不干扰
 */
import { describe, expect, it } from 'vitest'
import {
  balanceSummary, beijingDay, moneyUnits, observeBalance, preciseMoney, sumMoney,
} from '../src/core/accounting.mjs'

// 2026-09-19 10:00:00 +08:00
const T0 = Date.parse('2026-09-19T02:00:00Z')
const HOUR = 3600_000

function fresh() {
  return {} as Record<string, unknown>
}

describe('定点金额', () => {
  it('8 位小数精确往返', () => {
    expect(preciseMoney('0.00000001')).toBe(0.00000001)
    expect(moneyUnits('23.45')).toBe(2345000000)
  })

  it('求和避免浮点误差', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
  })

  it('非法金额抛错', () => {
    expect(() => moneyUnits('abc')).toThrow()
    expect(() => moneyUnits(Infinity)).toThrow()
  })
})

describe('beijingDay', () => {
  it('按北京时间切日', () => {
    expect(beijingDay(Date.parse('2026-09-18T16:00:00Z'))).toBe('2026-09-19')
    expect(beijingDay(Date.parse('2026-09-18T15:59:59Z'))).toBe('2026-09-18')
  })
})

describe('observeBalance', () => {
  it('首次观测只建立起点，消费为 0', () => {
    const ledger = fresh()
    const s = observeBalance(ledger, { at: T0, balance: 100, currency: 'CNY', scope: 'deepseek' })
    expect(s?.amount).toBe(0)
    expect(s?.openingBalance).toBe(100)
    expect(s?.currentBalance).toBe(100)
  })

  it('余额下降计为消费', () => {
    const ledger = fresh()
    observeBalance(ledger, { at: T0, balance: 100, currency: 'CNY', scope: 'deepseek' })
    const s = observeBalance(ledger, { at: T0 + HOUR, balance: 97.5, currency: 'CNY', scope: 'deepseek' })
    expect(s?.amount).toBe(2.5)
    expect(s?.observedDecrease).toBe(2.5)
  })

  it('余额上升（充值）不冲抵已有消费', () => {
    const ledger = fresh()
    observeBalance(ledger, { at: T0, balance: 100, currency: 'CNY', scope: 'deepseek' })
    observeBalance(ledger, { at: T0 + HOUR, balance: 97.5, currency: 'CNY', scope: 'deepseek' })
    const s = observeBalance(ledger, { at: T0 + 2 * HOUR, balance: 197.5, currency: 'CNY', scope: 'deepseek' })
    expect(s?.amount).toBe(2.5)
    expect(s?.observedIncrease).toBe(100)
    expect(s?.needsReview).toBe(true)
  })

  it('重复或乱序的观测被忽略', () => {
    const ledger = fresh()
    observeBalance(ledger, { at: T0, balance: 100, currency: 'CNY', scope: 'deepseek' })
    const s = observeBalance(ledger, { at: T0 - HOUR, balance: 50, currency: 'CNY', scope: 'deepseek' })
    expect(s?.currentBalance).toBe(100)
  })

  it('不同币种互不干扰', () => {
    const ledger = fresh()
    observeBalance(ledger, { at: T0, balance: 100, currency: 'CNY', scope: 'deepseek' })
    const s = observeBalance(ledger, { at: T0 + HOUR, balance: 10, currency: 'USD', scope: 'deepseek' })
    expect(s?.currency).toBe('USD')
    expect(s?.amount).toBe(0)
    expect(balanceSummary(ledger, beijingDay(T0 + HOUR))?.currency).toBe('USD')
  })

  it('币种只校验“三位字母”这一形状', () => {
    // 内核的校验是 /^[A-Z]{3}$/，所以 'RMB' 形状合法、不会抛错——
    // 这不是我们要在上游内核上改的东西，如实记录为既有行为。
    expect(observeBalance(fresh(), { at: T0, balance: 1, currency: 'RMB', scope: 'x' })?.currency).toBe('RMB')
    expect(() => observeBalance(fresh(), { at: T0, balance: 1, currency: 'RMBX', scope: 'x' })).toThrow()
    expect(() => observeBalance(fresh(), { at: T0, balance: 1, currency: '¥', scope: 'x' })).toThrow()
  })
})
