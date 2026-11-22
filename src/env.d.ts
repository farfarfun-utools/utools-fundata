/// <reference types="vite/client" />

export interface UtoolsPluginEnterAction {
  code: string
  type: string
  payload: unknown
  option?: unknown
}

export interface FunDataFilePayload {
  name: string
  content: string
}

export interface FunDataBridge {
  onEnter(callback: (action: UtoolsPluginEnterAction) => void): () => void
  openFile(): FunDataFilePayload | null
  readEntryFiles(files: Array<string | { path?: string }>): FunDataFilePayload[]
  saveFile(defaultName: string, content: string): boolean
}

export interface UtoolsApi {
  onPluginEnter?(callback: (action: UtoolsPluginEnterAction) => void): void
  copyText?(text: string): boolean | void
  isDarkColors?(): boolean
  registerTool?(
    name: string,
    handler: (params: Record<string, unknown>) => unknown | Promise<unknown>,
  ): void
  showNotification?(body: string, clickFeatureCode?: string): void
  shellOpenExternal?(url: string): void
}

declare global {
  interface Window {
    fundata?: FunDataBridge
    utools?: UtoolsApi
  }

  const utools: UtoolsApi | undefined
}
