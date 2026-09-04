'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ManagementWaPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/management?wa_gateway=1');
  }, [router]);
  return <main className="min-h-screen" />;
}
