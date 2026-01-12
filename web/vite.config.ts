import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // For GitHub Pages deployment
  // Change 'tamil-mtv-catalog' to your repo name if different
  // Use '/' for custom domain or root deployment
  base: process.env.GITHUB_ACTIONS ? '/tamil-mtv-catalog/' : '/',
})
