import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(),],

  server: {
    host: true, // also listen on 0.0.0.0 so other devices on the LAN (phone, scanner) can open the app
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // your actual backend port
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000', // uploaded images are served by the same backend
        changeOrigin: true,
      },
    },
  },
})