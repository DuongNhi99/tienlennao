import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
  /** Milliseconds before auto-dismiss; null keeps the toast until dismissed. */
  durationMs: number | null;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
}

const MAX_VISIBLE = 3;
let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Show a toast from anywhere (components, mutations, the service-worker registrar). */
export function showToast(
  message: string,
  options: { variant?: ToastVariant; action?: ToastAction; durationMs?: number | null } = {},
): number {
  return useToastStore.getState().push({
    message,
    variant: options.variant ?? 'info',
    action: options.action,
    durationMs: options.durationMs === undefined ? 4000 : options.durationMs,
  });
}
