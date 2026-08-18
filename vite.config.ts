import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  // GitHub project sites are served from /<repository-name>/.
  // Keep local development and any future custom-domain deployment at root.
  base: mode === 'github-pages' ? '/tape-type/' : '/',
  plugins: [react()],
}))
