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
