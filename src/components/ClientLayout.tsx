'use client';

import Assistant from './Assistant';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Assistant />
    </>
  );
}
