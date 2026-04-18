import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Mantiene solo los errores para una consola limpia
  plugins: [
    react(),
  ]
});