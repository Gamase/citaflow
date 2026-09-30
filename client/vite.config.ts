import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
    const apiUrl = env.VITE_API_URL
    if (!apiUrl) {
      throw new Error(
        `VITE_API_URL no está definida para el build (mode "${mode}"). ` +
          'Defínela en .env.production / .env.staging o como variable de entorno.',
      )
    }
    if (/localhost|127\.0\.0\.1/.test(apiUrl)) {
      throw new Error(`VITE_API_URL apunta a ${apiUrl}; un build desplegado no puede usar localhost.`)
    }
    console.log(`[citaflow] build "${mode}" → API: ${apiUrl}`)
  }

  return {
    plugins: [react(), tailwindcss()],
  }
})
