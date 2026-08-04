import React, { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';
import OfflineBanner from '@/components/shared/OfflineBanner';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleToggle = useCallback(
    () => setSidebarOpen(prev => !prev),
    []
  );

  return (
    <div
      className="min-h-screen bg-background relative"
      style={{
        backgroundImage:
          'linear-gradient(hsl(213 20% 90% / 0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(213 20% 90% / 0.6) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }}
    >
      <Sidebar isOpen={sidebarOpen} onToggle={handleToggle} />
      <main className="lg:ml-64 min-h-screen">
        <div className="flex justify-between items-center gap-4 px-4 md:px-6 lg:px-8 pt-16 lg:pt-6 pb-0">
          <GlobalSearch />
          <NotificationBell />
        </div>
        <div className="p-4 md:p-6 lg:p-8 pt-2 lg:pt-4">
          <Outlet />
        </div>
      </main>
      <OfflineBanner />
    </div>
  );
}
