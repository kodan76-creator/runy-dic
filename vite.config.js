import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  //base: '/runy-dic/', // <-- ОБЯЗАТЕЛЬНО: Замените на точное имя вашего репозитория
})
