import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    watch: {
      usePolling: true,
      // Docker bind mounts can expose a large JSX file before its write finishes.
      // Wait for a stable file instead of caching a transient syntax error in HMR.
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
    },
    hmr: {
      overlay: false
    }
  },
})
