import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { templatesServer } from './scripts/templates-server.mjs'

export default defineConfig(({ mode }) => ({
  // GitHub project sites are served from /<repository-name>/.
  // Keep local development and any future custom-domain deployment at root.
  base: mode === 'github-pages' ? '/tape-type/' : '/',
  // "Save as template" writes into src/templates while the dev server runs.
  plugins: [react(), templatesServer()],
}))
