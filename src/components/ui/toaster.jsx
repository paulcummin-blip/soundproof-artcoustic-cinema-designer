import * as React from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

/** How long a notification stays when it states no lifetime of its own. */
const DEFAULT_TOAST_DURATION_MS = 5000;

/**
 * ONE notification, with a lifetime.
 *
 * A finite `duration` in milliseconds is how long it stays before dismissing
 * itself; a duration that is not a finite number — Infinity — means it stays
 * until it is dismissed. A notification stating no duration uses the default.
 *
 * The timer belongs to this notification alone, and is cancelled whenever it is
 * replaced, dismissed or removed — and on unmount — so no orphaned timer can ever
 * dismiss a later notification or act on one that is already gone.
 */
function ToastItem({ title, description, action, duration, open, onOpenChange, ...props }) {
  const lifetime = duration === undefined ? DEFAULT_TOAST_DURATION_MS : duration;

  React.useEffect(() => {
    if (!open || !Number.isFinite(lifetime)) return undefined;
    const timer = setTimeout(() => onOpenChange?.(false), lifetime);
    return () => clearTimeout(timer);
  }, [lifetime, open, onOpenChange]);

  return (
    <Toast data-state={open ? "open" : "closed"} {...props}>
      <div className="grid gap-1">
        {title && <ToastTitle>{title}</ToastTitle>}
        {description && (
          <ToastDescription>{description}</ToastDescription>
        )}
      </div>
      {action}
      <ToastClose onClick={() => onOpenChange?.(false)} />
    </Toast>
  );
}

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(({ id, ...toast }) => (
        <ToastItem key={id} {...toast} />
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}