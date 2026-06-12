/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MUSIC_BASE_URL?: string;
  readonly VITE_ENABLE_DEV_TOOLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    unknown
  >;
  export default component;
}

declare module "*.jsonl?raw" {
  const content: string;
  export default content;
}
