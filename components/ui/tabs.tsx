'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export const Root = TabsPrimitive.Root;

export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.List className={`tabs-list ${className}`}>
      {children}
    </TabsPrimitive.List>
  );
}

export function Trigger({ children, value, className = '' }: { children: ReactNode; value: string; className?: string }) {
  return (
    <TabsPrimitive.Trigger className={`tabs-trigger ${className}`} value={value}>
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function Content({ children, value, className = '' }: { children: ReactNode; value: string; className?: string }) {
  return (
    <TabsPrimitive.Content className={`tabs-content ${className}`} value={value}>
      {children}
    </TabsPrimitive.Content>
  );
}
