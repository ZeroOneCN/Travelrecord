import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 9005,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9505',
        changeOrigin: true,
      }
    }
  },
  preview: {
    host: true,
    port: 9005,
    strictPort: true,
  }
})
