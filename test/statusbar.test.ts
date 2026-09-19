import { describe, expect, it } from 'vitest'
import { formatMoney, renderStatus } from '../src/statusview'

describe('formatMoney', () => {
  it('CNY 用 ¥ 且保留两位', () => {
    expect(formatMoney(23.456, 'CNY')).toBe('¥23.46')
  })

  it('USD 用 $', () => {
    expect(formatMoney(1.5, 'USD')).toBe('$1.50')
  })

  it('其他币种用代码加空格', () => {
    expect(formatMoney(7.1, 'JPY')).toBe('JPY 7.10')
  })

  it('零显示为两位小数', () => {
    expect(formatMoney(0, 'CNY')).toBe('¥0.00')
  })
})

describe('renderStatus', () => {
  it('未配置密钥时提示点击设置', () => {
    const view = renderStatus({ state: 'no-key' })
    expect(view.text).toBe('$(key) 鲸鱼 · 未配置')
    expect(view.command).toBe('whale.setApiKey')
    expect(view.tooltip).toContain('设置')
  })

  it('密钥无效时给出警告图标与刷新入口', () => {
    const view = renderStatus({ state: 'auth-error' })
    expect(view.text).toContain('Key 无效')
    expect(view.text.startsWith('$(alert)')).toBe(true)
    expect(view.command).toBe('whale.setApiKey')
  })

  it('成功时显示余额与今日已用', () => {
    const view = renderStatus({ state: 'ok', balance: 23.45, currency: 'CNY', todayUsage: 1.02 })
    expect(view.text).toBe('🐋 ¥23.45 · 今日 ¥1.02')
    expect(view.command).toBe('whale.refresh')
  })

  it('stale 时前缀 ~', () => {
    const view = renderStatus({ state: 'ok', balance: 23.45, currency: 'CNY', todayUsage: 1.02, stale: true })
    expect(view.text.startsWith('~ ')).toBe(true)
    expect(view.tooltip).toContain('上次')
  })

  it('今日已用未知时显示 --', () => {
    const view = renderStatus({ state: 'ok', balance: 5, currency: 'CNY', todayUsage: null })
    expect(view.text).toBe('🐋 ¥5.00 · 今日 --')
  })

  it('网络异常且无历史值时提示网络', () => {
    const view = renderStatus({ state: 'network-error' })
    expect(view.text).toContain('网络异常')
    expect(view.command).toBe('whale.refresh')
  })

  it('tooltip 带上观测时间与来源', () => {
    const view = renderStatus({
      state: 'ok', balance: 1, currency: 'CNY', todayUsage: 0,
      observedAt: Date.parse('2026-09-19T02:34:00Z'),
    })
    expect(view.tooltip).toContain('2026-09-19')
  })
})
