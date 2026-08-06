import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';
import { ToastProvider } from './contexts/ToastContext';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TicketListPage from './pages/TicketListPage';
import NewTicket from './pages/NewTicket';
import TicketDetailPage from './pages/TicketDetailPage';
import AdminPanel from './pages/AdminPanel';

const queryClient = new QueryClient();

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, authLoading } = useAuth();
  if (authLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasRole, authLoading } = useAuth();
  if (authLoading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (!hasRole('admin') && !hasRole('technician')) return <Navigate to="/tickets" />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/tickets" />} />
        <Route path="dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
        <Route path="tickets" element={<TicketListPage />} />
        <Route path="tickets/new" element={<NewTicket />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route path="admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <ChatProvider>
            <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || ''}>
              <AppRoutes />
            </BrowserRouter>
          </ChatProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
