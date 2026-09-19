import { describe, expect, it } from 'vitest'
import { KEY_SECRET_NAME, keyFromEnv, resolveKey, type SecretStore } from '../src/keyresolve'

// 计划里的写法是把数据袋也命名为 `store`，同时把接口方法写成 `set`：
// 名字和数据袋撞了，方法名也与 SecretStore（VSCode 的 `store`）不符，
// 于是 `as` 断言被 TS 判为「两侧没有充分重叠」而报错。改用闭包，不必断言。
function secrets(initial: Record<string, string> = {}): SecretStore {
  const data: Record<string, string> = { ...initial }
  return {
    async get(key: string) { return data[key] },
    async store(key: string, value: string) { data[key] = value },
    async delete(key: string) { delete data[key] },
  }
}

const noEnv = () => undefined

describe('keyFromEnv', () => {
  it('读取非空环境变量', () => {
    expect(keyFromEnv(n => (n === 'K' ? 'sk-a' : undefined), 'K')).toBe('sk-a')
  })

  it('去空白', () => {
    expect(keyFromEnv(() => '  sk-a  ', 'K')).toBe('sk-a')
  })

  it('空串与纯空白视为未配置', () => {
    expect(keyFromEnv(() => '', 'K')).toBeNull()
    expect(keyFromEnv(() => '   ', 'K')).toBeNull()
  })

  it('未定义视为未配置', () => {
    expect(keyFromEnv(noEnv, 'K')).toBeNull()
  })
})

describe('resolveKey', () => {
  it('SecretStorage 优先于环境变量', async () => {
    const result = await resolveKey({
      secrets: secrets({ [KEY_SECRET_NAME]: 'sk-secret' }),
      getenv: () => 'sk-env',
      envVarName: 'K',
    })
    expect(result).toEqual({ key: 'sk-secret', source: 'secret' })
  })

  it('SecretStorage 为空时回退到环境变量', async () => {
    const result = await resolveKey({ secrets: secrets(), getenv: () => 'sk-env', envVarName: 'K' })
    expect(result).toEqual({ key: 'sk-env', source: 'env' })
  })

  it('SecretStorage 只有空白时回退到环境变量', async () => {
    const result = await resolveKey({
      secrets: secrets({ [KEY_SECRET_NAME]: '   ' }),
      getenv: () => 'sk-env',
      envVarName: 'K',
    })
    expect(result).toEqual({ key: 'sk-env', source: 'env' })
  })

  it('两者都没有返回 null', async () => {
    expect(await resolveKey({ secrets: secrets(), getenv: noEnv, envVarName: 'K' })).toBeNull()
  })
})
