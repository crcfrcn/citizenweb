import { useState } from 'react'

/** 移动端仅由官网提供商店入口；公民链节点从 GitHub 正式 Release 直接下载。 */
export type CitizenChainPlatform = 'macos' | 'windows' | 'linux-arm' | 'linux-amd'
export type DownloadOption =
  | { label: string; kind: 'store'; url?: string }
  | { label: string; kind: 'github-release'; platform: CitizenChainPlatform }

const chainFiles: Record<CitizenChainPlatform, { stem: string; extension: string }> = {
  macos: { stem: 'macOS', extension: 'dmg' },
  windows: { stem: 'Windows', extension: 'exe' },
  'linux-arm': { stem: 'LinuxARM', extension: 'deb' },
  'linux-amd': { stem: 'LinuxAMD', extension: 'deb' },
}

type GitHubRelease = {
  tag_name: string
  draft: boolean
  prerelease: boolean
  published_at: string
  assets: { name: string; state: string; browser_download_url: string }[]
}

/** 每个平台取发布时间最新的正式 Release，安装包由 GitHub 直接交付。 */
async function resolveCitizenChainDownload(platform: CitizenChainPlatform, request: typeof fetch = fetch): Promise<string> {
  const { stem, extension } = chainFiles[platform]
  const prefix = `公民链·${stem}·v`
  const signal = AbortSignal.timeout(15000)
  let latest: GitHubRelease | undefined
  let latestTime = -Infinity

  for (let page = 1; page <= 10; page++) {
    const response = await request(`https://api.github.com/repos/crcfrcn/citizenchain/releases?per_page=100&page=${page}`, {
      redirect: 'error', signal,
    })
    if (!response.ok) throw Error('GitHub 正式版查询失败')
    const releases: GitHubRelease[] = await response.json()
    if (!Array.isArray(releases)) throw Error('GitHub 正式版列表无效')
    for (const release of releases) {
      if (!release || release.draft !== false || release.prerelease !== false
        || typeof release.tag_name !== 'string' || !release.tag_name.startsWith(prefix)
        || !/^\d+\.\d+\.\d+$/.test(release.tag_name.slice(prefix.length))) continue
      const published = Date.parse(release.published_at)
      if (published > latestTime) {
        latest = release
        latestTime = published
      }
    }
    if (releases.length < 100) break
    if (page === 10) throw Error('GitHub 正式版列表超出检索上限')
  }

  if (!latest) throw Error('该平台尚无公民链正式版')
  const file = `citizenchain-${stem}-v${latest.tag_name.slice(prefix.length)}.${extension}`
  const url = `https://github.com/crcfrcn/citizenchain/releases/download/${encodeURIComponent(latest.tag_name)}/${file}`
  if (!Array.isArray(latest.assets) || !latest.assets.some(asset =>
    asset?.name === file && asset.state === 'uploaded' && asset.browser_download_url === url)) {
    throw Error('该平台最新正式版的安装包不可用')
  }
  return url
}

interface DownloadButtonProps {
  /** 无障碍标签，标明所属产品，如「CitizenApp」。 */
  productLabel: string
  options: DownloadOption[]
}

export default function DownloadButton({ productLabel, options }: DownloadButtonProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function downloadFromGitHub(option: Extract<DownloadOption, { kind: 'github-release' }>) {
    if (pending) return
    setError(null)
    setPending(option.platform)
    try {
      const url = await resolveCitizenChainDownload(option.platform)
      setOpen(false)
      window.location.assign(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'GitHub 正式版查询失败')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={`下载 ${productLabel}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 text-xl font-bold text-gold-400 transition-colors hover:text-gold-300"
      >
        下载
        {/* 折线 chevron(非实心三角):收起指向下,展开旋转 180° 指向上。死规则禁 ▶▼ 实心三角。 */}
        <span className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true">
          <svg viewBox="0 0 12 12" width="12" height="12" className="block">
            <polyline
              points="2,4 6,8 10,4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open && (
        <>
          {/* 点击菜单外任意处关闭。 */}
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 min-w-[168px] overflow-hidden rounded-xl border border-gold-500/30 bg-navy-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
          >
            {options.map((option) =>
              option.kind === 'store' ? option.url ? (
                <a
                  key={option.label}
                  role="menuitem"
                  href={option.url}
                  onClick={() => setOpen(false)}
                  className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-200 no-underline transition-colors hover:bg-white/5 hover:text-gold-300"
                >
                  {option.label}
                </a>
              ) : (
                <button
                  key={option.label}
                  type="button"
                  role="menuitem"
                  disabled
                  aria-label={`${productLabel} ${option.label} 尚未上架`}
                  className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-400 opacity-60"
                >
                  {option.label} · 未上架
                </button>
              ) : (
                <button
                  key={option.label}
                  type="button"
                  role="menuitem"
                  disabled={pending !== null}
                  aria-label={`下载 ${productLabel} ${option.label} GitHub 正式版`}
                  onClick={() => { void downloadFromGitHub(option) }}
                  className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-white/5 hover:text-gold-300 disabled:opacity-50"
                >
                  {pending === option.platform ? '正在查询…' : option.label}
                </button>
              ),
            )}
            {error && <p role="alert" className="px-4 py-2 text-xs text-red-300">{error}</p>}
          </div>
        </>
      )}
    </div>
  )
}
