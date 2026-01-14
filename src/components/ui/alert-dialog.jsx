import React from "react";

// Dependency-free Alert Dialog shim.
// Keeps imports from breaking without requiring Radix.
export function AlertDialog({ children, open, onOpenChange }) {
  if (!open) return null;
  
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={() => onOpenChange?.(false)}
    >
      {children}
    </div>
  );
}

export function AlertDialogTrigger({ children, onConfirm, confirmText }) {
  const handleClick = (e) => {
    e?.preventDefault?.();
    const ok = window.confirm(confirmText || "Are you sure?");
    if (ok && typeof onConfirm === "function") onConfirm();
  };

  return React.cloneElement(React.Children.only(children), {
    onClick: handleClick,
  });
}

export function AlertDialogContent({ children }) {
  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '500px',
        width: '90%',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function AlertDialogHeader({ children }) {
  return <div style={{ marginBottom: '16px' }}>{children}</div>;
}

export function AlertDialogFooter({ children }) {
  return (
    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '24px' }}>
      {children}
    </div>
  );
}

export function AlertDialogTitle({ children }) {
  return <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1B1A1A' }}>{children}</h2>;
}

export function AlertDialogDescription({ children }) {
  return <p style={{ fontSize: '14px', color: '#3E4349', marginTop: '8px' }}>{children}</p>;
}

export function AlertDialogAction({ children, onClick, className }) {
  return React.cloneElement(React.Children.only(children), { onClick });
}

export function AlertDialogCancel({ children }) {
  return <>{children}</>;
}