/// <reference types="vite/client" />

// ⭐ Chrome Extension API — global tanım
declare global {
  const chrome: {
    storage?: {
      local: {
        get: (keys: string[] | string | null, cb: (res: any) => void) => void;
        set: (items: Record<string, any>, cb?: () => void) => void;
        remove: (keys: string[] | string, cb?: () => void) => void;
      };
    };
    runtime?: {
      openOptionsPage: () => void;
      sendMessage: (msg: any) => Promise<any>;
      onMessage: {
        addListener: (
          cb: (msg: any, sender: any, sendResponse: any) => void
        ) => void;
      };
      id?: string;
      getURL: (path: string) => string;
    };
    tabs?: {
      create: (opts: { url: string }) => void;
      query: (opts: any, cb: (tabs: any[]) => void) => void;
    };
    notifications?: {
      create: (opts: {
        type: string;
        iconUrl: string;
        title: string;
        message: string;
      }) => void;
    };
    contextMenus?: {
      create: (opts: any) => void;
      onClicked: {
        addListener: (cb: (info: any, tab: any) => void) => void;
      };
    };
  };
}

export {};
