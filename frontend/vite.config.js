import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_DEV_BACKEND_URL || 'http://127.0.0.1:8000'
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      // The SPA and the API share one origin in development (and behind nginx in production),
      // so session cookies and CSRF work without cross-site requests.
      proxy: {
        '/api': { target: backend, changeOrigin: false },
        '/django-admin': { target: backend, changeOrigin: false },
        '/static': { target: backend, changeOrigin: false },
      },
    },
    build: {
      // Never inline fonts as base64: the cyrillic/latin-ext subsets (~18 kB) would otherwise be
      // baked into the render-blocking CSS although the browser fetches them only on demand
      // (unicode-range). Other small assets keep Vite's default 4 kB inline limit.
      assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
      rollupOptions: {
        output: {
          // Third-party code changes rarely: a separate chunk stays cached across app deploys.
          manualChunks(id) {
            if (id.includes('node_modules') && !id.endsWith('.css')) return 'vendor'
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
    },
  }
})
