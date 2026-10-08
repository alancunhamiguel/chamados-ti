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
      <Sidebar open={sidebarOpen} />

      {/* Seta para abrir/fechar a sidebar */}
      <button
        onClick={toggleSidebar}
        title={sidebarOpen ? 'Recolher menu' : 'Abrir menu'}
        className={`fixed top-1/2 -translate-y-1/2 z-50 flex items-center justify-center w-8 h-8 rounded-full bg-white border border-surface-200 shadow-lg text-slate-500 hover:text-primary-500 hover:border-primary-200 transition-all duration-300 ${
          sidebarOpen ? 'left-[16.5rem]' : 'left-3'
        }`}
      >
        <svg className={`w-4 h-4 transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className={`transition-[margin] duration-300 ${sidebarOpen ? 'ml-64' : 'ml-0'}`}>
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