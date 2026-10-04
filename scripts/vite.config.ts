import { fileURLToPath, URL } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createSecureContext } from 'node:tls'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 本配置固定CitizenWeb产品根、前端插件、源码外构建输出和开发服务器读取边界。
const productRoot = fileURLToPath(new URL('..', import.meta.url))
const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url))

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
  return {
    root: productRoot,
    plugins: [react(), tailwindcss()],
    build: {
      outDir: process.env.CITIZENWEB_DIST || join(tmpdir(), 'citizenweb', 'dist'),
    },
    preview: { https },
    server: {
      https,
      fs: {
        allow: [workspaceRoot],
      },
    },
  }
})
