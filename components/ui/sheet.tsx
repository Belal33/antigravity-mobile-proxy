'use client';

import { Drawer } from 'vaul';
import type { ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: 'right' | 'bottom';
}

/**
 * Unified panel shell — uses Vaul Drawer for mobile bottom sheet,
 * side drawer for tablet/desktop. Handles backdrop, focus trap, swipe-to-dismiss.
 */
export default function Sheet({ open, onClose, title, children, side = 'right' }: SheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }} direction={side === 'bottom' ? 'bottom' : 'right'}>
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-overlay" />
        <Drawer.Content className={`sheet-content sheet-content--${side}`} aria-describedby={undefined}>
          <Drawer.Title className="sheet-title">{title}</Drawer.Title>
          {side === 'bottom' && <div className="sheet-handle" />}
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
