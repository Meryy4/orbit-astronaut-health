import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// /api/* is forwarded to the FastAPI backend (backend/, port 8010), so no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8010',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
