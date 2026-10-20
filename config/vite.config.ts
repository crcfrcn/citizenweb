import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

// 只声明官方插件与默认输出；本轮路径、HTTPS输入与文件生成归产品入口。
export default defineConfig({
  root: fileURLToPath(new URL('../', import.meta.url)),
  plugins: [react(), tailwindcss()],
  cacheDir: 'target/cache/vite',
  build: { outDir: 'target/build/dist' },
})
