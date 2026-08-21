import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.PORT) || 5173,
    strictPort: false,
    // Bind to all interfaces so phones/tablets on the same Wi-Fi can load it.
    host: true,
  },
})
