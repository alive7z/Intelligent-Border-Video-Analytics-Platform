import React, { useEffect } from "react";
import { XIcon } from "./Icons";

/**
 * Accessible modal dialog. Pressing Escape closes it; focus-friendly.
 */
function Modal({ open, onClose, title, children, footer, size = "md" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const width =
    size === "sm"
      ? "max-w-md"
      : size === "lg"
        ? "max-w-2xl"
        : size === "xl"
          ? "max-w-5xl"
          : "max-w-lg";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 animate-[backdropIn_0.2s_ease-out] bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative max-h-[calc(100vh-2rem)] w-full overflow-y-auto ${width} card animate-[modalIn_0.2s_ease-out] shadow-pop`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <h3 className="text-primary text-lg font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn-focus text-muted hover:text-primary rounded-lg p-1.5 hover:bg-slate-100"
            aria-label="Close dialog"
          >
            <XIcon size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50/70 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
