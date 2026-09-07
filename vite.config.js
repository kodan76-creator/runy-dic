import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    // ⚠️ Отключаем пересылку console.error/warn на dev-сервер.
    // При разрыве websocket (перезапуск dev-сервера с открытой вкладкой)
    // forwardConsole зацикливался: sendError → transport.send → socket undefined
    // → ошибка → снова sendError → браузер виснет.
    forwardConsole: false,
  },
})
