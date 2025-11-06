import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Events } from './pages/Events';
import { Guests } from './pages/Guests';
import { MailInvitations } from './pages/MailInvitations';
import { Scanner } from './pages/Scanner';
import { Analytics } from './pages/Analytics';
import { AdminSettings } from './pages/AdminSettings';
import { QREditor } from './pages/QREditor';
import { History } from './pages/History';
import { Layout } from './components/Layout';

function AppContent() {
  const { user, admin, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        setCurrentPage(hash);
      } else if (admin) {
        // Set default page based on role
        const defaultPage = admin.role === 'scanner_admin' ? 'scanner' : 'dashboard';
        window.location.hash = defaultPage;
        setCurrentPage(defaultPage);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [admin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  if (!user || !admin) {
    return <Login />;
  }

  const renderPage = () => {
    // Scanner admins only see Scanner and History
    if (admin.role === 'scanner_admin') {
      switch (currentPage) {
        case 'scanner':
          return <Scanner />;
        case 'history':
          return <History />;
        default:
          return <Scanner />; // Default to scanner for scanner admins
      }
    }

    // Super admins see all pages
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'events':
        return <Events />;
      case 'guests':
        return <Guests />;
      case 'mail':
        return <MailInvitations />;
      case 'qr-editor':
        return <QREditor />;
      case 'scanner':
        return <Scanner />;
      case 'history':
        return <History />;
      case 'analytics':
        return <Analytics />;
      case 'settings':
        return <AdminSettings />;
      default:
        return <Dashboard />;
    }
  };

  return <Layout>{renderPage()}</Layout>;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
