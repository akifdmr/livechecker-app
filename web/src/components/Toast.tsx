// src/components/Toast.tsx
import { create } from 'zustand';

type Kind = 'success' | 'error' | 'info';

interface Item { id: number; kind: Kind; msg: string; }

interface ToastState {
  items: Item[];
  push: (kind: Kind, msg: string) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (kind, msg) => {
    const id = ++counter;
    set((s) => ({ items: [...s.items, { id, kind, msg }] }));
    setTimeout(() => {
      set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    }, 4500);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (m: string) => useToast.getState().push('success', m),
  error:   (m: string) => useToast.getState().push('error', m),
  info:    (m: string) => useToast.getState().push('info', m),
};

export function ToastHost() {
  const items = useToast((s) => s.items);
  const dismiss = useToast((s) => s.dismiss);
  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2 max-w-sm">
      {items.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`cursor-pointer px-4 py-2 rounded-md shadow-lg text-sm text-white ${
            t.kind === 'error'   ? 'bg-red-600' :
            t.kind === 'success' ? 'bg-emerald-600' :
                                   'bg-blue-600'
          }`}
          role="status"
          aria-live="polite"
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}