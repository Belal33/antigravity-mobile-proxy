'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';
import type { ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--surface-2)',
            border: '1px solid var(--border-1)',
            color: 'var(--text-1)',
            fontSize: '13px',
          },
        }}
        theme="dark"
      />
    </TooltipProvider>
  );
}
