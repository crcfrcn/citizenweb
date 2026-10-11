import { fileURLToPath, URL } from 'node:url'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { readFileSync } from 'node:fs'
import { createSecureContext } from 'node:tls'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 本配置固定CitizenWeb产品根、前端插件、自有target构建输出和开发服务器读取边界。
const productRoot = fileURLToPath(new URL('../', import.meta.url))

// 官网正式构建交付节点可直接读取的正文；图片以内嵌数据保留节点原有排版。
export function whitepaperContent(markdown: string, readImage: (name: string) => Buffer): string {
  const mime: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml',
  }
  const content = markdown.replace(/\.\/assets\/([A-Za-z0-9._-]+\.(png|jpg|jpeg|webp|gif|svg))/gu,
    (_match, name: string, extension: string) =>
      `data:${mime[extension]};base64,${readImage(name).toString('base64')}`)
  return `${JSON.stringify({ markdown: content })}\n`
}

const whitepaperAsset: Plugin = {
  name: 'citizenweb-whitepaper-content',
  generateBundle() {
    const markdown = readFileSync(join(productRoot, 'src/whitepaper.md'), 'utf8')
    this.emitFile({
      type: 'asset',
      fileName: 'whitepaper/content.json',
      source: whitepaperContent(markdown, name => readFileSync(join(productRoot, 'src/assets', name))),
    })
  },
}

// 中文注释：开发/预览必须使用调用方提供的可信 TLS 材料；构建静态文件无需服务证书。
export function developmentTLS() {
  const certificate = process.env.CITIZENWEB_TLS_CERT_FILE
  const privateKey = process.env.CITIZENWEB_TLS_KEY_FILE
  if (!certificate || !privateKey) throw new Error('CitizenWeb HTTPS 证书与私钥路径未配置')
  const cert = readFileSync(certificate)
  const key = readFileSync(privateKey)
  const options = { cert, key, minVersion: 'TLSv1.3' as const }
  createSecureContext(options)
  return options
}

export default defineConfig(({ command }) => {
  const https = command === 'serve' ? developmentTLS() : undefined
  const target = join(process.env.PRODUCT_BUILD_ROOT || productRoot, 'target')
  const outDir = process.env.CITIZENWEB_DIST || join(target, 'build', 'dist')
  const difference = relative(target, outDir)
  if (!isAbsolute(outDir) || resolve(outDir) !== outDir || difference === '' || isAbsolute(difference) || difference === '..' || difference.startsWith('..' + sep)) throw new Error('CitizenWeb输出必须归本产品target')
  return {
    root: productRoot,
    plugins: [react(), tailwindcss(), whitepaperAsset],
    cacheDir: join(dirname(outDir), 'vite-cache'),
    build: {
      outDir,
    },
    preview: { https },
    server: {
      https,
      fs: {
        allow: [productRoot],
      },
    },
  }
})
