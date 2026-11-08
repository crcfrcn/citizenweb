import { useEffect, useState } from 'react'

interface ConstitutionDocument {
  html: string
  blake2_256: string
  source: 'legislation-raw'
}

function decodeDocument(value: unknown): ConstitutionDocument {
  if (!value || typeof value !== 'object') throw new Error('宪法响应格式异常')
  const document = value as Record<string, unknown>
  if (typeof document.html !== 'string' || !document.html.trim()
    || typeof document.blake2_256 !== 'string' || !/^0x[0-9a-f]{64}$/.test(document.blake2_256)
    || document.source !== 'legislation-raw') {
    throw new Error('宪法响应内容异常')
  }
  return document as unknown as ConstitutionDocument
}

export default function Constitution() {
  const [doc, setDoc] = useState<ConstitutionDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    const timer = window.setTimeout(() => {
      controller.abort(new DOMException('公民宪法读取超时，请重试', 'TimeoutError'))
    }, 15_000)
    void (async () => {
      for (let attempt = 0; ; attempt++) {
        const response = await fetch('/constitution/data', {
          credentials: 'omit',
          signal: controller.signal,
        })
        if (response.status === 503 && response.headers.get('retry-after') === '2' && attempt < 5) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 2000))
          continue
        }
        if (!response.ok) throw new Error('公民宪法读取失败，请稍后重试')
        return decodeDocument(await response.json())
      }
    })()
      .then((document) => {
        if (!cancelled) setDoc(document)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '公民宪法加载失败')
      })
      .finally(() => window.clearTimeout(timer))
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [attempt])

  const retry = () => {
    setError(null)
    setDoc(null)
    setAttempt((value) => value + 1)
  }

  if (error || !doc) {
    return (
      <section className="whitepaper-page constitution-page min-h-screen bg-navy-950">
        <div className="constitution-message">
          <p>{error ? `公民宪法加载失败：${error}` : '公民宪法加载中...'}</p>
          {error && <button type="button" onClick={retry}>重试</button>}
        </div>
      </section>
    )
  }

  return (
    <section className="constitution-page min-h-screen bg-navy-950 px-4 py-6 sm:px-6">
      <iframe
        className="block h-[calc(100dvh-5rem)] min-h-[720px] w-full rounded-lg border-0 bg-white"
        title="公民宪法"
        sandbox="allow-scripts"
        srcDoc={doc.html}
      />
      <span data-hash={doc.blake2_256} />
    </section>
  )
}
