import react from '@vitejs/plugin-react'
import { nimiq } from '@nimiq/core/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...nimiq()],
})
