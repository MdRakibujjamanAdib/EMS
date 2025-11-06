import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { QrCode, Mail, CheckCircle, Users } from 'lucide-react';

type Event = {
  id: string;
  title: string;
  description: string;
  logo_url?: string;
  created_at: any;
};

export function Dashboard() {
  const [stats, setStats] = useState({
    totalEvents: 0,
    totalPasses: 0,
    emailsSent: 0,
    scannedPasses: 0,
  });
  const [recentEvents, setRecentEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch all events
      const eventsRef = collection(db, 'events');
      const eventsSnapshot = await getDocs(eventsRef);
      const totalEvents = eventsSnapshot.size;

      // Get recent events (last 5)
      const recentEventsQuery = query(eventsRef, orderBy('created_at', 'desc'), limit(5));
      const recentEventsSnapshot = await getDocs(recentEventsQuery);
      const eventsData: Event[] = recentEventsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Event));

      // Fetch all passes
      const passesRef = collection(db, 'passes');
      const passesSnapshot = await getDocs(passesRef);
      const totalPasses = passesSnapshot.size;

      // Count scanned passes (where used = true or scanned_at exists)
      const scannedPasses = passesSnapshot.docs.filter(doc => {
        const data = doc.data();
        return data.used === true || data.scanned_at;
      }).length;

      // Fetch email logs and count sent emails
      const emailLogsRef = collection(db, 'email_logs');
      const emailLogsSnapshot = await getDocs(emailLogsRef);
      const emailsSent = emailLogsSnapshot.docs.filter(doc => 
        doc.data().status === 'sent'
      ).length;

      setStats({
        totalEvents,
        totalPasses,
        emailsSent,
        scannedPasses,
      });

      setRecentEvents(eventsData);
    } catch (error) {
      // console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Events',
      value: stats.totalEvents,
      icon: QrCode,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Passes Generated',
      value: stats.totalPasses,
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Emails Sent',
      value: stats.emailsSent,
      icon: Mail,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Entries Scanned',
      value: stats.scannedPasses,
      icon: CheckCircle,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">Dashboard</h1>
        <p className="text-sm md:text-base text-gray-600">Welcome to QR Pass management system</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} hover>
            <CardBody>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div className="mb-2 md:mb-0">
                  <p className="text-xs md:text-sm text-gray-600 mb-1">{stat.title}</p>
                  <p className="text-xl md:text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`${stat.bgColor} p-2 md:p-3 rounded-xl self-end md:self-auto`}>
                  <stat.icon className={`w-4 h-4 md:w-6 md:h-6 ${stat.color}`} />
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg md:text-xl font-semibold text-gray-900">Recent Events</h2>
        </CardHeader>
        <CardBody>
          {recentEvents.length === 0 ? (
            <div className="text-center py-6 md:py-8 text-gray-500">
              <QrCode className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm md:text-base">No events created yet</p>
            </div>
          ) : (
            <div className="space-y-2 md:space-y-3">
              {recentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 md:p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors duration-200 gap-3"
                >
                  <div className="flex items-center space-x-2 md:space-x-3 min-w-0 flex-1">
                    {event.logo_url ? (
                      <img src={event.logo_url} alt={event.title} className="w-8 h-8 md:w-10 md:h-10 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <QrCode className="w-4 h-4 md:w-6 md:h-6 text-white" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm md:text-base text-gray-900 truncate">{event.title}</p>
                      <p className="text-xs md:text-sm text-gray-500 truncate hidden sm:block">{event.description}</p>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {event.created_at?.toDate ? 
                      event.created_at.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 
                      event.created_at ? 
                      new Date(event.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) :
                      'N/A'
                    }
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
