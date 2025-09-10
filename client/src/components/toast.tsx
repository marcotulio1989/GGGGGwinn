import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  isVisible: boolean;
  onHide: () => void;
}

export function Toast({ message, isVisible, onHide }: ToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onHide();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onHide]);

  if (!isVisible) return null;

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 glass-panel rounded-lg px-4 py-2">
      <span className="text-sm text-foreground">{message}</span>
    </div>
  );
}
