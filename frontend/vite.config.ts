import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/events': 'http://localhost:4381',
      '/prompt': 'http://localhost:4381',
      '/copilot': 'http://localhost:4381',
      '/error': 'http://localhost:4381',
      '/summary': 'http://localhost:4381',
      '/match': 'http://localhost:4381',
      '/health': 'http://localhost:4381',
    },
  },
})
