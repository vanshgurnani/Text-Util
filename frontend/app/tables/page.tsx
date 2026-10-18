'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TablesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const requestedTableId = new URLSearchParams(window.location.search).get('table_id');
    if (requestedTableId) {
      router.replace(`/?table_id=${encodeURIComponent(requestedTableId)}`);
    } else {
      router.replace('/');
    }
  }, [router]);

  return (
    <div className="notion-loading-screen">
      <span className="notion-spinner" />
      <p>Opening database in workspace…</p>
    </div>
  );
}
