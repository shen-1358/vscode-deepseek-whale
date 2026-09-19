/**
 * 素材溯源与镜像配置。改这里之前先读 NOTICE.md 的署名链与 CC BY-NC-SA 4.0 条款。
 * sha256 是唯一可信的锚点：上游若改动 main，脚本会因校验失败而报错停下。
 */
export const UPSTREAM = {
  repo: 'Small-tailqwq/dsh-deep-whale',
  commit: '80630009aee821fe69a9bcd1078c7098300f2c26',
  path: 'maid-atelier/assets/icons',
  license: 'CC BY-NC-SA 4.0',
}

export const ARTWORK = [
  {
    mood: 'delighted',
    file: 'delighted-cutout.png',
    bytes: 1669896,
    sha256: '5f8149d52b8cbdba7b5efeacbda9d1abd9c55a1ee129551b476540452ad83ec9',
  },
  {
    mood: 'sleepy',
    file: 'sleepy-cutout.png',
    bytes: 1542451,
    sha256: '4dd731cad7b132fb47f4fedd6848efbf21b8c5acb792a9c56bc25b421a0ab3e0',
  },
  {
    mood: 'determined',
    file: 'determined-cutout.png',
    bytes: 700815,
    sha256: '85628c8003043147248eeeb6ba425975c7873b08cf5da498b4ac4b9f452000d5',
  },
]

/** 运行时成品的长边像素。512 供侧边栏 240px 显示（2x DPI 够用）。 */
export const TARGET_LONG_SIDE = 512

/** 按序重试；实测只有第一个在这台机器上稳定，其余作为兜底保留。 */
export const MIRRORS = [
  (commit, path) => `https://ghfast.top/https://raw.githubusercontent.com/${UPSTREAM.repo}/${commit}/${path}`,
  (commit, path) => `https://ghproxy.net/https://raw.githubusercontent.com/${UPSTREAM.repo}/${commit}/${path}`,
  (commit, path) => `https://cdn.jsdelivr.net/gh/${UPSTREAM.repo}@${commit}/${path}`,
  (commit, path) => `https://raw.githubusercontent.com/${UPSTREAM.repo}/${commit}/${path}`,
]
