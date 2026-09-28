import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(),],

  server: {
    host: true, // 0.0.0.0 pe bhi listen karega, taaki LAN ke doosre devices (phone/scanner) se bhi khul sake
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // your actual backend port
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000', // uploaded item images bhi isi backend se serve hoti hain
        changeOrigin: true,
      },
    },
  },
})