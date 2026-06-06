import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' → relative asset URLs so the build also works when served from a
// sub-path (e.g. GitHub Pages project sites), not just the domain root.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'scripts/**/*.test.js'],
  },
})
