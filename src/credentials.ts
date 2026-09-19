import * as vscode from 'vscode'
import { KEY_SECRET_NAME, nonEmpty, resolveKey, type KeySource } from './keyresolve'

// 纯逻辑在 keyresolve.ts（可脱离宿主测试）；这里只放与 vscode API 打交道的外壳。
// 刻意不 re-export keyresolve 的符号：否则日后从本文件 import 常量又会踩到
// 「Node 里加载不到 vscode」这堵墙——Task 6 已经踩过一次。
export class Credentials {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private get envVarName(): string {
    return vscode.workspace.getConfiguration('whaleWidget').get<string>('envVarName', 'DEEPSEEK_API_KEY')
  }

  resolve(): Promise<KeySource | null> {
    return resolveKey({
      secrets: this.context.secrets,
      getenv: name => process.env[name],
      envVarName: this.envVarName,
    })
  }

  async set(key: string): Promise<void> {
    await this.context.secrets.store(KEY_SECRET_NAME, key.trim())
  }

  async clear(): Promise<void> {
    await this.context.secrets.delete(KEY_SECRET_NAME)
  }

  async promptAndStore(): Promise<boolean> {
    const value = await vscode.window.showInputBox({
      title: 'DeepSeek API Key',
      prompt: '只写入系统凭据管理器（VSCode SecretStorage），不会落进任何配置文件',
      placeHolder: 'sk-…',
      password: true,
      ignoreFocusOut: true,
      validateInput: input => (nonEmpty(input) ? undefined : '不能为空'),
    })
    if (value === undefined) return false
    await this.set(value)
    return true
  }
}
