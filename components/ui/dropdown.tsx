'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

/* ── Thin Radix wrapper — all styling via globals.css ── */

export const Root = DropdownMenu.Root;
export const Trigger = DropdownMenu.Trigger;

export function Content({ children, side = 'bottom', align = 'end', sideOffset = 6, className = '', ...props }: {
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
}) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        className={`dropdown-content ${className}`}
        side={side}
        align={align}
        sideOffset={sideOffset}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function Item({ children, className = '', ...props }: {
  children: ReactNode;
  className?: string;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  return (
    <DropdownMenu.Item className={`dropdown-item ${className}`} {...props}>
      {children}
    </DropdownMenu.Item>
  );
}

export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <DropdownMenu.Label className={`dropdown-label ${className}`}>
      {children}
    </DropdownMenu.Label>
  );
}

export const Separator = () => <DropdownMenu.Separator className="dropdown-separator" />;
