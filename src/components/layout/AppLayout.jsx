import React, { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // useCallback con forma funcional del setter — sin dependencias,
  // referencia estable aunque Sidebar se envuelva en React.memo
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
    </div>
  );
}
