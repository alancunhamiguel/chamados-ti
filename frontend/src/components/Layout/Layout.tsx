import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import ChatPopup from '../Chat/ChatPopup';
import ChatNotificationPoller from '../Chat/ChatNotificationPoller';
import { useChat } from '../../contexts/ChatContext';

export default function Layout() {
  const { openChats, openChat, closeChat } = useChat();

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

      {/* Multiple Chat Popups - stacked from right */}
      {openChats.map((chat, index) => (
        <ChatPopup
          key={chat.ticketId}
          ticketId={chat.ticketId}
          ticketNumber={chat.ticketNumber ?? undefined}
          isOpen={true}
          onOpen={() => openChat(chat.ticketId, chat.ticketNumber ?? undefined)}
          onClose={() => closeChat(chat.ticketId)}
          stackIndex={index}
        />
      ))}
    </div>
  );
}
