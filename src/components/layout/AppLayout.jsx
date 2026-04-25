import React, { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import OfflineBanner from '@/components/shared/OfflineBanner';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleToggle = useCallback(
    () => setSidebarOpen(prev => !prev),
    []
  );

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onToggle={handleToggle} />
      <main className="lg:ml-64 min-h-screen">
        <div className="p-4 md:p-6 lg:p-8 pt-16 lg:pt-8">
          <Outlet />
        </div>
      </main>
      <OfflineBanner />
    </div>
  );
}
