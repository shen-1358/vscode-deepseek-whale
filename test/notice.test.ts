import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const notice = readFileSync(join(root, 'NOTICE.md'), 'utf8')
const artwork = readFileSync(join(root, 'LICENSE-ARTWORK'), 'utf8')
const readme = readFileSync(join(root, 'README.md'), 'utf8')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { license?: string }

describe('NOTICE.md 的署名义务', () => {
  it('三层署名链一个都不能少', () => {
    expect(notice).toContain('62155430')       // 原始鲸鱼少女角色设计
    expect(notice).toContain('18604994')       // 女仆版改设计
    expect(notice).toContain('Small-tailqwq')  // 本皮肤素材
  })

  it('写明许可、上游地址与锁定 commit', () => {
    expect(notice).toContain('CC BY-NC-SA 4.0')
    expect(notice).toContain('https://github.com/Small-tailqwq/dsh-deep-whale')
    expect(notice).toContain('80630009aee821fe69a9bcd1078c7098300f2c26')
  })

  it('写明我们的改动与非商业限制', () => {
    expect(notice).toContain('512')
    expect(notice).toContain('非商业')
  })

  it('保留收到权利主张即处理的承诺', () => {
    expect(notice).toContain('移除')
  })
})

describe('LICENSE-ARTWORK', () => {
  it('给出许可名称与官方链接', () => {
    expect(artwork).toContain('CC BY-NC-SA 4.0')
    expect(artwork).toContain('creativecommons.org/licenses/by-nc-sa/4.0')
  })

  it('说明代码与美术是两套许可', () => {
    expect(artwork).toContain('MIT')
    expect(artwork).toContain('美术')
  })
})

describe('包与文档里的许可字段', () => {
  it('package.json 不再声称整包是 MIT', () => {
    expect(pkg.license).toBe('SEE LICENSE IN LICENSE')
  })

  it('README 说明非商业限制', () => {
    expect(readme).toContain('CC BY-NC-SA 4.0')
    expect(readme).toContain('非商业')
  })
})
