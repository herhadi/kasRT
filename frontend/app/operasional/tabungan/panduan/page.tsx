'use client';

import Navbar from '@/components/layout/Navbar';
import TabunganPembangunanGuide from '@/components/tabungan/TabunganPembangunanGuide';

export default function TabunganPembangunanGuidePage() {
  return (
    <>
      <Navbar sticky={false} />
      <TabunganPembangunanGuide />
    </>
  );
}
