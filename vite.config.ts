import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Fixed, uncommon ports so this never collides with other local dev servers.
const SERVER = `http://127.0.0.1:${process.env.SERVER_PORT ?? 4601}`

export default defineConfig({
  plugins: [react()],
  // Pre-bundle these up front so Vite doesn't re-optimise mid-session (which blanks the page).
  optimizeDeps: { include: ['@heroicons/react/24/outline'] },
  server: {
    port: Number(process.env.CLIENT_PORT ?? 4600),
    strictPort: true,
    proxy: { '/api': SERVER, '/media': SERVER },
  },
})
