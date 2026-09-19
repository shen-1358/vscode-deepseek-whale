/**
 * 密钥解析链的**纯逻辑**部分：不 import `vscode`，所以能在 vitest 里直接跑。
 *
 * 边界与 Task 6 的 `webview/html.ts` 同理：`vscode` 是宿主注入的运行时模块，
 * 不在 `node_modules` 里，任何静态 import 它的文件在 Node 下都无法加载。
 * 与宿主打交道的部分在 `credentials.ts`（它 import 本模块）。
 */
export const KEY_SECRET_NAME = 'vscode-whale-widget.deepseekApiKey'

export interface SecretStore {
  // 返回 PromiseLike 而不是 Promise：vscode.SecretStorage 的方法签名是 Thenable，
  // 而 Thenable 只保证 then()。要求 Promise 会逼出一个纯转换用的适配层，
  // 而调用侧只用 await —— PromiseLike 就是这里真正需要的契约。
  get(key: string): PromiseLike<string | undefined>
  store(key: string, value: string): PromiseLike<void>
  delete(key: string): PromiseLike<void>
}

export interface KeySource {
  key: string
  source: 'secret' | 'env'
}

export interface ResolveInput {
  secrets: SecretStore
  getenv: (name: string) => string | undefined
  envVarName: string
}

export function nonEmpty(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function keyFromEnv(getenv: (name: string) => string | undefined, envVarName: string): string | null {
  return nonEmpty(getenv(envVarName))
}

export async function resolveKey(input: ResolveInput): Promise<KeySource | null> {
  const stored = nonEmpty(await input.secrets.get(KEY_SECRET_NAME))
  if (stored) return { key: stored, source: 'secret' }
  const fromEnv = keyFromEnv(input.getenv, input.envVarName)
  return fromEnv ? { key: fromEnv, source: 'env' } : null
}
