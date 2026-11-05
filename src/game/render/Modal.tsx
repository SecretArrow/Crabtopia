// Crabtopia - shared Modal component (extracted to avoid circular imports).
"use client";

import React from "react";

export function Modal({
  title,
  onClose,
  children,
  maxWidth = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`panel-frame rounded-2xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto animate-slide-up shadow-[0_24px_60px_rgba(0,0,0,0.6)]`}
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 12px 60px rgba(18,167,160,0.25)" }}
      >
        <div className="flex items-center justify-between p-3 border-b border-[rgba(124,245,225,0.16)] sticky top-0 bg-[#06122B] z-10">
          <div className="font-bold font-display tracking-wide display-glow">{title}</div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white w-10 h-10 -my-1 flex items-center justify-center rounded-md hover:bg-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}

export default Modal;
