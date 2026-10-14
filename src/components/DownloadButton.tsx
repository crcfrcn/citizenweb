import { useState } from 'react'

/** 移动端沿用既有同源入口；公民链节点从 GitHub 正式 Release 直接下载。 */
export type CitizenChainPlatform = 'macos' | 'windows' | 'linux-arm' | 'linux-amd'
export type DownloadOption =
  | { label: string; kind: 'store'; message: string }
  | { label: string; kind: 'file'; downloadPath: string }
  | { label: string; kind: 'github-release'; platform: CitizenChainPlatform }

const chainFiles: Record<CitizenChainPlatform, { stem: string; extension: string; workflow: string }> = {
  macos: { stem: 'macOS', extension: 'dmg', workflow: 'macos.yml' },
  windows: { stem: 'Windows', extension: 'exe', workflow: 'windows.yml' },
  'linux-arm': { stem: 'LinuxARM', extension: 'deb', workflow: 'linuxarm.yml' },
  'linux-amd': { stem: 'LinuxAMD', extension: 'deb', workflow: 'linuxamd.yml' },
}
const chainTag = /^citizenchain-(macos|windows|linux-arm|linux-amd)-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-r([1-9]\d*)-a([1-9]\d*)$/
const sha256 = /^[a-f0-9]{64}$/
const sha1 = /^[a-f0-9]{40}$/
type GitHubAsset = { name?: unknown; state?: unknown; size?: unknown; digest?: unknown; browser_download_url?: unknown }
type GitHubRelease = { tag_name?: unknown; draft?: unknown; prerelease?: unknown; published_at?: unknown;
  target_commitish?: unknown; body?: unknown; assets?: unknown }
type GitHubRun = { id?: unknown; run_attempt?: unknown; status?: unknown; conclusion?: unknown; event?: unknown;
  head_branch?: unknown; head_sha?: unknown; path?: unknown; repository?: { full_name?: unknown } }
const newer = (left: bigint[], right: bigint[]) => {
  for (let index = 0; index < left.length; index++) {
    if (left[index] > right[index]) return true
    if (left[index] < right[index]) return false
  }
  return false
}

/** 不使用仓库级 latest：公民链四个平台各有自己的正式 Tag 和安装包。 */
export async function resolveCitizenChainDownload(platform: CitizenChainPlatform, request: typeof fetch = fetch): Promise<string> {
  const target = chainFiles[platform]
  if (!target) throw Error('公民链下载平台无效')
  const candidates: { rank: bigint[]; url: string; runID: number; attempt: number; sourceSHA: string }[] = []
  for (let page = 1; page <= 10; page++) {
    let response: Response
    try {
      response = await request(`https://api.github.com/repos/crcfrcn/citizenchain/releases?per_page=100&page=${page}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      })
    } catch { throw Error('GitHub 正式版查询超时或网络不可用') }
    if (!response.ok) throw Error(response.status === 403 || response.status === 429 ? 'GitHub 查询限额已满，请稍后重试' : 'GitHub 正式版查询失败')
    let body: string
    try { body = await response.text() } catch { throw Error('GitHub 正式版列表读取中断') }
    if (body.length > 4 * 1024 * 1024) throw Error('GitHub 正式版列表超出上限')
    let releases: unknown
    try { releases = JSON.parse(body) } catch { throw Error('GitHub 正式版列表无效') }
    if (!Array.isArray(releases) || releases.length > 100) throw Error('GitHub 正式版列表无效')
    for (const item of releases as GitHubRelease[]) {
      if (!item || item.draft !== false || item.prerelease !== false || typeof item.published_at !== 'string'
        || !Number.isFinite(Date.parse(item.published_at)) || typeof item.tag_name !== 'string' || item.tag_name.length > 128
        || typeof item.target_commitish !== 'string' || !sha1.test(item.target_commitish)
        || typeof item.body !== 'string' || item.body.length > 65536 || !Array.isArray(item.assets)) continue
      const match = chainTag.exec(item.tag_name)
      if (!match || match[1] !== platform || item.assets.length > 32) continue
      const [, , version, runID, attempt] = match
      if (!Number.isSafeInteger(Number(runID)) || !Number.isSafeInteger(Number(attempt))) continue
      const file = `citizenchain-node-${target.stem}-v${version}.${target.extension}`
      const installer = (item.assets as GitHubAsset[]).filter(asset => asset?.name === file)
      if (installer.length !== 1) continue
      const asset = installer[0]
      const expectedURL = `https://github.com/crcfrcn/citizenchain/releases/download/${encodeURIComponent(item.tag_name)}/${encodeURIComponent(file)}`
      if (asset.state !== 'uploaded' || typeof asset.size !== 'number' || !Number.isSafeInteger(asset.size) || asset.size < 1
        || typeof asset.digest !== 'string' || !asset.digest.startsWith('sha256:') || !sha256.test(asset.digest.slice(7))
        || asset.browser_download_url !== expectedURL) continue
      const proofs = [...item.body.matchAll(/<!-- automation:(\{[^\r\n]*\}) -->/g)]
      if (proofs.length !== 1) continue
      let proof: Record<string, unknown>
      try { proof = JSON.parse(proofs[0][1]) as Record<string, unknown> } catch { continue }
      if (!proof || typeof proof !== 'object' || Array.isArray(proof)) continue
      const proofAssets = proof.assets
      if (proof.schema !== 1 || proof.repository !== 'crcfrcn/citizenchain' || proof.product_id !== 'citizenchain' || proof.platform !== platform
        || proof.workflow !== `.github/workflows/${target.workflow}` || proof.tag !== item.tag_name || proof.version !== version
        || proof.source_sha !== item.target_commitish || proof.run_id !== Number(runID) || proof.run_attempt !== Number(attempt)
        || !Array.isArray(proofAssets) || proofAssets.length !== item.assets.length) continue
      const names = new Set<string>()
      const allAssetsMatch = (item.assets as GitHubAsset[]).every(current => {
        if (typeof current?.name !== 'string' || names.has(current.name) || typeof current.size !== 'number'
          || !Number.isSafeInteger(current.size) || current.size < 1 || current.state !== 'uploaded'
          || typeof current.digest !== 'string' || !current.digest.startsWith('sha256:')
          || !sha256.test(current.digest.slice(7))) return false
        names.add(current.name)
        const rows = proofAssets.filter(value => typeof value === 'object' && value !== null
          && (value as { name?: unknown }).name === current.name)
        return rows.length === 1 && (rows[0] as { size?: unknown; sha256?: unknown }).size === current.size
          && (rows[0] as { size?: unknown; sha256?: unknown }).sha256 === current.digest.slice(7)
      })
      if (!allAssetsMatch) continue
      const rank = [...version.split('.').map(value => BigInt(value)), BigInt(runID), BigInt(attempt)]
      candidates.push({ rank, url: expectedURL, runID: Number(runID), attempt: Number(attempt), sourceSHA: item.target_commitish })
    }
    if (releases.length < 100) break
    if (page === 10) throw Error('GitHub 正式版列表超出检索上限')
  }
  const ordered = candidates.sort((left, right) => newer(left.rank, right.rank) ? -1 : newer(right.rank, left.rank) ? 1 : 0)
  for (const candidate of ordered.slice(0, 20)) {
    let response: Response
    try {
      response = await request(`https://api.github.com/repos/crcfrcn/citizenchain/actions/runs/${candidate.runID}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      })
    } catch { throw Error('GitHub 自动化结果查询超时或网络不可用') }
    if (response.status === 404) continue
    if (!response.ok) throw Error(response.status === 403 || response.status === 429 ? 'GitHub 查询限额已满，请稍后重试' : 'GitHub 自动化结果查询失败')
    let body: string
    try { body = await response.text() } catch { throw Error('GitHub 自动化结果读取中断') }
    if (body.length > 1024 * 1024) throw Error('GitHub 自动化结果超出上限')
    let run: GitHubRun
    try { run = JSON.parse(body) as GitHubRun } catch { throw Error('GitHub 自动化结果无效') }
    const workflow = `.github/workflows/${target.workflow}`
    if (run?.id === candidate.runID && run.run_attempt === candidate.attempt
      && run.status === 'completed' && run.conclusion === 'success' && run.event === 'workflow_dispatch'
      && run.head_branch === 'main' && run.head_sha === candidate.sourceSHA
      && run.repository?.full_name === 'crcfrcn/citizenchain'
      && (run.path === workflow || run.path === `${workflow}@main`)) return candidate.url
  }
  if (ordered.length > 20) throw Error('GitHub 正式版候选超出核验上限')
  throw Error('该平台尚无可下载的公民链正式版')
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
              option.kind === 'store' ? (
                <button
                  key={option.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    window.alert(option.message)
                  }}
                  className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-white/5 hover:text-gold-300"
                >
                  {option.label}
                </button>
              ) : option.kind === 'github-release' ? (
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
              ) : (
                <a
                  key={option.label}
                  role="menuitem"
                  href={`/api${option.downloadPath}`}
                  onClick={() => setOpen(false)}
                  className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-200 no-underline transition-colors hover:bg-white/5 hover:text-gold-300"
                >
                  {option.label}
                </a>
              ),
            )}
            {error && <p role="alert" className="px-4 py-2 text-xs text-red-300">{error}</p>}
          </div>
        </>
      )}
    </div>
  )
}
