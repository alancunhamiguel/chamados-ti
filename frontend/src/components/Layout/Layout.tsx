import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import ChatDock from '../Chat/ChatDock';
import ChatNotificationPoller from '../Chat/ChatNotificationPoller';

export default function Layout() {
  return (
    <div className="min-h-screen bg-surface-50">
      <Sidebar />
      <div className="ml-64">
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