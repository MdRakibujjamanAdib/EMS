import { ReactNode, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, QrCode, LayoutDashboard, Mail, Settings, ScanLine, BarChart3, Users, Palette, Link as LinkIcon, AlertCircle, Menu, X } from 'lucide-react';
import { Button } from './Button';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { admin, signOut, isSuperAdmin, hasGoogleLinked, linkGoogleAccount } = useAuth();
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation = isSuperAdmin ? [
    { name: 'Dashboard', href: '#dashboard', icon: LayoutDashboard },
    { name: 'Events', href: '#events', icon: QrCode },
    { name: 'Guests', href: '#guests', icon: Users },
    { name: 'Send Invitations', href: '#mail', icon: Mail },
    { name: 'QR Editor', href: '#qr-editor', icon: Palette },
    { name: 'Scanner', href: '#scanner', icon: ScanLine },
    { name: 'Analytics', href: '#analytics', icon: BarChart3 },
    { name: 'Admin Settings', href: '#settings', icon: Settings },
  ] : [
    { name: 'Scanner', href: '#scanner', icon: ScanLine },
    { name: 'History', href: '#history', icon: BarChart3 },
  ];

  const filteredNavigation = navigation;

  const handleLinkGoogle = async () => {
    try {
      setLinkingGoogle(true);
      setLinkError('');
      await linkGoogleAccount();
      alert('Google account linked successfully! You can now use Sheets and Gmail features.');
    } catch (error: any) {
      // console.error('Error linking Google:', error);
      setLinkError(error.message || 'Failed to link Google account');
    } finally {
      setLinkingGoogle(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7]">
      {/* Mobile-optimized Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 backdrop-blur-xl bg-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 md:h-16 items-center">
            <div className="flex items-center space-x-2 md:space-x-3">
              <QrCode className="w-6 h-6 md:w-8 md:h-8 text-yellow-500" />
              <span className="text-lg md:text-xl font-semibold text-gray-900">QR Pass</span>
            </div>

            <div className="flex items-center space-x-2 md:space-x-4">
              {/* Mobile: Compact view */}
              <div className="text-right hidden sm:block">
                <p className="text-xs md:text-sm font-medium text-gray-900 truncate max-w-[150px] md:max-w-none">{admin?.email}</p>
                <span
                  className={`text-xs px-2 py-0.5 md:py-1 rounded-full ${
                    isSuperAdmin
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {admin?.role === 'super_admin' ? 'Super Admin' : 'Scanner Admin'}
                </span>
              </div>
              
              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              
              {/* Desktop logout */}
              <Button variant="ghost" size="sm" onClick={signOut} className="hidden sm:flex">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div 
            className="absolute right-0 top-14 md:top-16 bottom-0 w-64 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b">
              <p className="text-sm font-medium text-gray-900 truncate">{admin?.email}</p>
              <span
                className={`text-xs px-2 py-1 rounded-full mt-2 inline-block ${
                  isSuperAdmin
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {admin?.role === 'super_admin' ? 'Super Admin' : 'Scanner Admin'}
              </span>
            </div>
            <nav className="p-3 space-y-1">
              {filteredNavigation.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors duration-200 group"
                >
                  <item.icon className="w-5 h-5 text-gray-400 group-hover:text-yellow-500" />
                  <span className="text-sm font-medium">{item.name}</span>
                </a>
              ))}
              <button
                onClick={() => {
                  signOut();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors duration-200 group"
              >
                <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-500" />
                <span className="text-sm font-medium">Logout</span>
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Google Account Link Banner - Only for Super Admins */}
      {isSuperAdmin && !hasGoogleLinked && (
        <div className="bg-blue-50 border-b border-blue-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 md:py-3">
            <div className="flex items-start md:items-center justify-between gap-3">
              <div className="flex items-start md:items-center space-x-2 md:space-x-3 flex-1 min-w-0">
                <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-blue-600 flex-shrink-0 mt-0.5 md:mt-0" />
                <div className="min-w-0">
                  <p className="text-xs md:text-sm font-medium text-blue-900">
                    Connect Google for Sheets & Gmail
                  </p>
                  {linkError && (
                    <p className="text-xs text-red-600 mt-1">{linkError}</p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleLinkGoogle}
                isLoading={linkingGoogle}
                className="flex-shrink-0 text-xs md:text-sm"
              >
                <LinkIcon className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                <span className="hidden xs:inline">Connect</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        <div className="flex gap-6">
          {/* Desktop Sidebar - Hidden on mobile */}
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-3 sticky top-24">
              <nav className="space-y-1">
                {filteredNavigation.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors duration-200 group"
                  >
                    <item.icon className="w-5 h-5 text-gray-400 group-hover:text-yellow-500" />
                    <span className="text-sm font-medium">{item.name}</span>
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
