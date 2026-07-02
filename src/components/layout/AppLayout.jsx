import React, { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import NotificationBell from './NotificationBell';
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
        <div className="flex justify-end items-center px-4 md:px-6 lg:px-8 pt-16 lg:pt-6 pb-0">
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
