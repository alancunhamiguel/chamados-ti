import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import ChatDock from '../Chat/ChatDock';
import ChatNotificationPoller from '../Chat/ChatNotificationPoller';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem('sidebar-open') !== '0');

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-open', next ? '1' : '0');
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-surface-50">
      <Sidebar open={sidebarOpen} onToggle={toggleSidebar} />

      <div className={`transition-[margin] duration-300 ${sidebarOpen ? 'ml-64' : 'ml-16'}`}>
        <Header />
        <main className="p-6">
          <Outlet />
        </main>
      </div>

      {/* Global notification poller */}
      <ChatNotificationPoller />

      {/* MSN-style chat dock: conversation list + active chat in one window */}
      <ChatDock />
    </div>
  );
}