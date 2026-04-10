'use client';

import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import type { ReactNode } from 'react';

interface ScrollAreaProps {
  children: ReactNode;
  className?: string;
}

export default function ScrollArea({ children, className = '' }: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root className={`scroll-area-root ${className}`}>
      <ScrollAreaPrimitive.Viewport className="scroll-area-viewport">
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar className="scroll-area-scrollbar" orientation="vertical">
        <ScrollAreaPrimitive.Thumb className="scroll-area-thumb" />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  );
}
