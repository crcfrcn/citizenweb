import { useEffect, useState } from 'react'

interface ConstitutionClause {
  text_cn: string
  text_en: string | null
}

interface ConstitutionArticle {
  number: number
  title_cn: string
  title_en: string | null
  body_cn: string
  body_en: string | null
  immutable: boolean
  clauses: ConstitutionClause[]
}

interface ConstitutionSection {
  number: number
  title_cn: string
  title_en: string | null
  articles: ConstitutionArticle[]
}

interface ConstitutionChapter {
  number: number
  title_cn: string
  title_en: string | null
  sections: ConstitutionSection[]
}

interface ConstitutionDocument {
  version: number | null
  content_hash: string
  version_label: { cn: string; en: string | null } | null
  chapters: ConstitutionChapter[]
}

// 节点只提供正文来源；官网保留自己的原有布局，不加载返回文档的样式或脚本。
type ConstitutionBlock =
  | { kind: 'chapter'; value: Omit<ConstitutionChapter, 'sections'> }
  | { kind: 'section'; chapter: number; value: Omit<ConstitutionSection, 'articles'> }
  | { kind: 'article'; value: ConstitutionArticle }

function assembleChapters(blocks: ConstitutionBlock[]): ConstitutionChapter[] {
  const chapters: ConstitutionChapter[] = []
  const anchors = new Set<string>()
  let chapter: ConstitutionChapter | undefined
  let section: ConstitutionSection | undefined
  for (const block of blocks) {
    const anchor = block.kind === 'chapter' ? `chapter-${block.value.number}`
      : block.kind === 'section' ? `chapter-${block.chapter}-section-${block.value.number}`
        : `article-${block.value.number}`
    if (!Number.isSafeInteger(block.value.number) || block.value.number < 1 || anchors.has(anchor)) {
      throw new Error('宪法章节编号异常')
    }
    anchors.add(anchor)
    if (block.kind === 'chapter') {
      chapter = { ...block.value, sections: [] }
      chapters.push(chapter)
      section = undefined
    } else if (block.kind === 'section') {
      if (!chapter || chapter.number !== block.chapter) throw new Error('宪法节所属章节异常')
      section = { ...block.value, articles: [] }
      chapter.sections.push(section)
    } else {
      if (!section) throw new Error('宪法条文缺少所属节')
      section.articles.push(block.value)
    }
  }
  if (!chapters.length || !chapters.some(item => item.sections.some(child => child.articles.length))) {
    throw new Error('宪法正文为空')
  }
  return chapters
}

function decodeDocument(value: unknown): ConstitutionDocument {
  if (!value || typeof value !== 'object') throw new Error('宪法响应格式异常')
  const document = value as Record<string, unknown>
  if (typeof document.html !== 'string' || !document.html.trim()
    || typeof document.blake2_256 !== 'string' || !/^0x[0-9a-f]{64}$/.test(document.blake2_256)
    || document.source !== 'legislation-raw') throw new Error('宪法响应内容异常')
  // DOMParser 只解析，不挂载节点文档；所有文字随后由 React 转义渲染。
  const parsed = new DOMParser().parseFromString(document.html, 'text/html')
  const text = (root: ParentNode, selector: string) => {
    const element = root.querySelector(selector)?.cloneNode(true) as Element | undefined
    element?.querySelectorAll('.immutable-badge').forEach(badge => badge.remove())
    return element?.textContent?.trim() ?? ''
  }
  const blocks: ConstitutionBlock[] = []
  for (const element of parsed.querySelectorAll('.content > .block')) {
    const title_cn = text(element, '.heading-cn')
    const title_en = text(element, '.heading-en') || null
    if (!title_cn) throw new Error('宪法标题为空')
    let match: RegExpExecArray | null
    if (element.classList.contains('chapter-block') && (match = /^chapter-(\d+)$/.exec(element.id))) {
      blocks.push({kind:'chapter',value:{number:Number(match[1]),title_cn,title_en}})
    } else if (element.classList.contains('section-block') && (match = /^chapter-(\d+)-section-(\d+)$/.exec(element.id))) {
      blocks.push({kind:'section',chapter:Number(match[1]),value:{number:Number(match[2]),title_cn,title_en}})
    } else if (element.classList.contains('article-block') && (match = /^article-(\d+)$/.exec(element.id))) {
      const paragraphs = [...element.querySelectorAll(':scope > .article-paragraph')].map(paragraph => ({
        text_cn:text(paragraph,'.body-cn'),text_en:text(paragraph,'.body-en') || null,
      }))
      if (!paragraphs.length) throw new Error('宪法条文正文缺失')
      const [body, ...clauses] = paragraphs
      blocks.push({kind:'article',value:{number:Number(match[1]),title_cn,title_en,
        body_cn:body.text_cn,body_en:body.text_en,clauses,
        immutable:element.querySelector('.immutable-badge') !== null}})
    } else throw new Error('宪法正文结构异常')
  }
  const cn = text(parsed,'.doc-version-cn')
  const en = text(parsed,'.doc-version-en') || null
  // 接口只给出版本标签时直接显示标签，不推测或虚构版本号。
  const version = /^v(\d+)$/.exec(cn)?.[1]
  return {chapters:assembleChapters(blocks),content_hash:document.blake2_256,
    version:version ? Number(version) : null,version_label:cn || en ? {cn:cn || en!,en} : null}
}

const chapterAnchor = (chapter: number) => `chapter-${chapter}`
const sectionAnchor = (chapter: number, section: number) => `chapter-${chapter}-section-${section}`
const articleAnchor = (article: number) => `article-${article}`

/** 中英并列的标题：中文主行 + 英文副行（复用白皮书双语样式类）。 */
function BilingualHeading({ cn, en }: { cn: string; en: string | null }) {
  return (
    <>
      <span className="whitepaper-heading-title">{cn}</span>
      {en && <span className="whitepaper-heading-en">{en}</span>}
    </>
  )
}

/** 一段正文：中文 + 英文（英文缩进副行）。 */
function BilingualParagraph({ cn, en }: { cn: string; en: string | null }) {
  return (
    <p>
      <span className="whitepaper-heading-title">{cn}</span>
      {en && <span className="whitepaper-en">{en}</span>}
    </p>
  )
}

interface TocProps {
  chapters: ConstitutionChapter[]
  openKeys: Set<string>
  onToggle: (key: string) => void
}

function ConstitutionToc({ chapters, openKeys, onToggle }: TocProps) {
  return (
    <ul className="whitepaper-toc-tree">
      {chapters.map((chapter) => {
        const chapterKey = `c${chapter.number}`
        const chapterOpen = openKeys.has(chapterKey)
        return (
          <li key={chapterKey} className="whitepaper-toc-item whitepaper-toc-level-1">
            <button
              type="button"
              className="whitepaper-toc-trigger"
              aria-expanded={chapterOpen}
              onClick={() => onToggle(chapterKey)}
            >
              <span className="whitepaper-toc-caret" aria-hidden="true">
                {chapterOpen ? '-' : '+'}
              </span>
              <span className="whitepaper-toc-text">
                <span>{chapter.title_cn}</span>
                {chapter.title_en && <small>{chapter.title_en}</small>}
              </span>
            </button>
            {chapterOpen && (
              <ul className="whitepaper-toc-tree">
                {chapter.sections.map((section) => {
                  const sectionKey = `c${chapter.number}s${section.number}`
                  const sectionOpen = openKeys.has(sectionKey)
                  return (
                    <li key={sectionKey} className="whitepaper-toc-item whitepaper-toc-level-2">
                      <button
                        type="button"
                        className="whitepaper-toc-trigger"
                        aria-expanded={sectionOpen}
                        onClick={() => onToggle(sectionKey)}
                      >
                        <span className="whitepaper-toc-caret" aria-hidden="true">
                          {sectionOpen ? '-' : '+'}
                        </span>
                        <span className="whitepaper-toc-text">
                          <span>{section.title_cn}</span>
                          {section.title_en && <small>{section.title_en}</small>}
                        </span>
                      </button>
                      {sectionOpen && (
                        <ul className="whitepaper-toc-tree">
                          {section.articles.map((article) => (
                            <li
                              key={article.number}
                              className="whitepaper-toc-item whitepaper-toc-level-3"
                            >
                              <a
                                href={`#${articleAnchor(article.number)}`}
                                className="whitepaper-toc-link"
                              >
                                <span className="whitepaper-toc-caret" aria-hidden="true" />
                                <span className="whitepaper-toc-text">
                                  <span>{article.title_cn}</span>
                                  {article.title_en && <small>{article.title_en}</small>}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ConstitutionArticleBlock({ article }: { article: ConstitutionArticle }) {
  return (
    <article id={articleAnchor(article.number)} className="constitution-article">
      <h3>
        <span className="whitepaper-heading-title">
          {article.title_cn}
          {article.immutable && (
            <span className="constitution-immutable-badge">不可修改条款 · Immutable</span>
          )}
        </span>
        {article.title_en && <span className="whitepaper-heading-en">{article.title_en}</span>}
      </h3>
      <BilingualParagraph cn={article.body_cn} en={article.body_en} />
      {article.clauses.map((clause, index) => (
        <BilingualParagraph key={index} cn={clause.text_cn} en={clause.text_en} />
      ))}
    </article>
  )
}

export default function Constitution() {
  const [doc, setDoc] = useState<ConstitutionDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set())

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
        if (!cancelled) {
          setDoc(document)
          setOpenKeys(new Set([`c${document.chapters[0].number}`]))
        }
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

  const toggleKey = (key: string) => {
    setOpenKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })
  const retry = () => {
    setError(null)
    setDoc(null)
    setAttempt(value => value + 1)
  }

  if (error) {
    return (
      <section className="whitepaper-page constitution-page min-h-screen bg-navy-950">
        <div className="constitution-message">
          <p>公民宪法加载失败：{error}</p>
          <button type="button" onClick={retry}>重试</button>
        </div>
      </section>
    )
  }

  if (!doc) {
    return (
      <section className="whitepaper-page constitution-page min-h-screen bg-navy-950">
        <div className="constitution-message">
          <p>公民宪法加载中...</p>
        </div>
      </section>
    )
  }

  const versionLabel = doc.version_label

  return (
    <section className="whitepaper-page constitution-page min-h-screen bg-navy-950">
      <div className="whitepaper-shell mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="whitepaper-toc lg:sticky lg:top-24 lg:self-start">
          <div className="whitepaper-toc-title">
            <span>目录</span>
            <span>Table of Contents</span>
          </div>
          <nav className="whitepaper-toc-list" aria-label="公民宪法目录">
            <ConstitutionToc chapters={doc.chapters} openKeys={openKeys} onToggle={toggleKey} />
          </nav>
        </aside>

        <article className="whitepaper-body">
          <h1>
            <span className="whitepaper-heading-title">公民宪法</span>
            <span className="whitepaper-title-en">Citizen Constitution</span>
          </h1>
          <p className="constitution-version">
            <span>
              {versionLabel?.cn ?? '公民宪法'}
              {doc.version !== null && <span className="constitution-version-no">第 {doc.version} 版</span>}
            </span>
            {versionLabel?.en && <span className="whitepaper-en">{versionLabel.en}</span>}
          </p>

          {doc.chapters.map((chapter) => (
            <section
              key={chapter.number}
              id={chapterAnchor(chapter.number)}
              className="constitution-chapter"
            >
              <h1>
                <BilingualHeading cn={chapter.title_cn} en={chapter.title_en} />
              </h1>
              {chapter.sections.map((section) => (
                <section
                  key={section.number}
                  id={sectionAnchor(chapter.number, section.number)}
                  className="constitution-section"
                >
                  <h2>
                    <BilingualHeading cn={section.title_cn} en={section.title_en} />
                  </h2>
                  {section.articles.map((article) => (
                    <ConstitutionArticleBlock key={article.number} article={article} />
                  ))}
                </section>
              ))}
            </section>
          ))}

          <p className="constitution-hash" title="链上宪法内容摘要（blake2_256）">
            链上内容摘要 {doc.content_hash}
          </p>
        </article>
      </div>

      <button
        type="button"
        className="whitepaper-back-top"
        aria-label="回到顶部"
        title="回到顶部"
        onClick={scrollToTop}
      >
        ↑
      </button>
    </section>
  )
}
