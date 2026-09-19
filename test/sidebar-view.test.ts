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
