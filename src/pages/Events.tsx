import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Event } from '../lib/types';
import { db } from '../lib/firebase';
import { collection, query, orderBy, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Plus, QrCode, Trash2, Edit2 } from 'lucide-react';

export function Events() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    qr_prefix: 'QRP',
    bg_color: '#ffffff',
    accent_color: '#FFD43B',
  });

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const eventsRef = collection(db, 'events');
      const q = query(eventsRef, orderBy('created_at', 'desc'));
      const snapshot = await getDocs(q);
      
      const eventsData: Event[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Event));
      
      setEvents(eventsData);
    } catch (error) {
      // console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const eventsRef = collection(db, 'events');
      await addDoc(eventsRef, {
        admin_id: user.uid,
        title: formData.title,
        description: formData.description,
        qr_prefix: formData.qr_prefix,
        bg_color: formData.bg_color,
        accent_color: formData.accent_color,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      setShowCreateModal(false);
      setFormData({
        title: '',
        description: '',
        qr_prefix: 'QRP',
        bg_color: '#ffffff',
        accent_color: '#FFD43B',
      });
      fetchEvents();
    } catch (error) {
      // console.error('Error creating event:', error);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event? This will also delete all passes.')) {
      return;
    }

    try {
      const eventRef = doc(db, 'events', eventId);
      await deleteDoc(eventRef);
      fetchEvents();
    } catch (error) {
      // console.error('Error deleting event:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Events</h1>
          <p className="text-gray-600">Manage your events and generate QR passes</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-5 h-5 mr-2" />
          Create Event
        </Button>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <QrCode className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No events yet</h3>
            <p className="text-gray-600 mb-6">Create your first event to start managing invitations</p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-5 h-5 mr-2" />
              Create Your First Event
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((event) => (
            <Card key={event.id} hover>
              <CardBody>
                <div className="flex items-start justify-between mb-4">
                  {event.logo_url ? (
                    <img src={event.logo_url} alt={event.title} className="w-12 h-12 rounded-lg object-cover" />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: event.accent_color }}
                    >
                      <QrCode className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <div className="flex space-x-2">
                    <button className="text-gray-400 hover:text-yellow-600 transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteEvent(event.id)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{event.title}</h3>
                <p className="text-sm text-gray-600 mb-4">{event.description}</p>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Prefix: {event.qr_prefix}</span>
                  <span>{event.created_at ? new Date(event.created_at as any).toLocaleDateString() : 'N/A'}</span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Create New Event</h2>
            </CardHeader>
            <form onSubmit={handleCreateEvent}>
              <CardBody className="space-y-4">
                <Input
                  label="Event Title"
                  placeholder="Summer Concert 2025"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                  <textarea
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all duration-200"
                    placeholder="Event description"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <Input
                  label="QR Code Prefix"
                  placeholder="QRP"
                  value={formData.qr_prefix}
                  onChange={(e) => setFormData({ ...formData, qr_prefix: e.target.value.toUpperCase() })}
                  maxLength={4}
                  helperText="4 characters max (e.g., FFBD)"
                  required
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Background Color</label>
                    <input
                      type="color"
                      value={formData.bg_color}
                      onChange={(e) => setFormData({ ...formData, bg_color: e.target.value })}
                      className="w-full h-10 rounded-lg border border-gray-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Accent Color</label>
                    <input
                      type="color"
                      value={formData.accent_color}
                      onChange={(e) => setFormData({ ...formData, accent_color: e.target.value })}
                      className="w-full h-10 rounded-lg border border-gray-200"
                    />
                  </div>
                </div>
              </CardBody>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3">
                <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Event</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
