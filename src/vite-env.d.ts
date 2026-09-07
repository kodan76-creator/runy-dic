/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_TOKEN?: string
  readonly VITE_ENCRYPTION_KEY?: string
  readonly VITE_ENCRYPTION_KEY_B64?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
