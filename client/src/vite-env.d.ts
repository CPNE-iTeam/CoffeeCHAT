/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WSS_PORT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
