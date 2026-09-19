import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * root 目录下的文件读写。写入一律走「临时文件 + rename」，保证任何时刻
 * 目标文件要么是旧内容、要么是新内容，绝不会是被写坏一半的 JSON。
 */
export class FileStore {
  constructor(private readonly root: string) {}

  private resolve(name: string): string {
    return join(this.root, name)
  }

  async readText(name: string): Promise<string | null> {
    try {
      return await readFile(this.resolve(name), 'utf8')
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  }

  async readJson<T>(name: string): Promise<T | null> {
    const text = await this.readText(name)
    if (text === null) return null
    return JSON.parse(text) as T
  }

  async writeText(name: string, data: string): Promise<void> {
    const target = this.resolve(name)
    await mkdir(dirname(target), { recursive: true })
    const tmp = join(dirname(target), `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
    await writeFile(tmp, data, 'utf8')
    await rename(tmp, target)
  }

  async writeJson(name: string, value: unknown): Promise<void> {
    await this.writeText(name, JSON.stringify(value, null, 2))
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT'
}
