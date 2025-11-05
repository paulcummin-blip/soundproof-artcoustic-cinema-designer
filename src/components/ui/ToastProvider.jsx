import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

function isRenderableNode(v) {
  return (
    v == null ||
    typeof v === "string" ||
    typeof v === "number" ||
    React.isValidElement(v)
  );
}

function RenderSafe({ value, label }) {
  if (isRenderableNode(value)) return value ?? null;
  // Don’t crash the tree—log and stringify for visibility
  // eslint-disable-next-line no-console
  console.warn(`[ToastProvider] Non-renderable ${label}:`, value);
  try {
    return (
      <pre className="text-xs whitespace-pre-wrap break-words">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  } catch {
    return <span className="text-xs">[unrenderable {label}]</span>;
  }
}

const ToastCtx = createContext({
  toasts: [],
  push: (_t) => {},
  remove: (_id) => {},
});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = React.useRef(new Map());

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const tm = timersRef.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (t) => {
      const id = Date.now() + Math.random();
      const payload = { id, duration: 3500, ...t };
      setToasts((x) => [...x, payload]);
      if (payload.duration !== 0) {
        const tm = setTimeout(() => remove(id), payload.duration);
        timersRef.current.set(id, tm);
      }
      return id;
    },
    [remove]
  );

  React.useEffect(() => {
    return () => {
      timersRef.current.forEach((tm) => clearTimeout(tm));
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo(() => ({ toasts, push, remove }), [toasts, push, remove]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className="bg-white border border-[#DCDBD6] rounded-lg shadow p-3 w-80 text-sm text-[#1B1A1A]"
          >
            {t.title && (
              <div className="font-medium mb-1">
                <RenderSafe value={t.title} label="toast.title" />
              </div>
            )}
            {t.description && (
              <div className="text-[#3E4349]">
                <RenderSafe value={t.description} label="toast.description" />
              </div>
            )}
            {t.action && isRenderableNode(t.action) && (
              <div className="mt-2">{t.action}</div>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

export default ToastProvider;