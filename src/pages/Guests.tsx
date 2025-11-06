import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Event, Pass } from '../lib/types';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { generateUniqueCode } from '../utils/qrGenerator';
import { Plus, Users, Download, Trash2, Upload } from 'lucide-react';

export function Guests() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [guestForm, setGuestForm] = useState({ name: '', email: '' });

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchPasses();
    }
  }, [selectedEventId]);

  const fetchEvents = async () => {
    try {
      const eventsRef = collection(db, 'events');
      const q = query(eventsRef, orderBy('created_at', 'desc'));
      const snapshot = await getDocs(q);
      
      const eventsData: Event[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      } as Event));
      
      setEvents(eventsData);
      if (eventsData && eventsData.length > 0 && !selectedEventId) {
        setSelectedEventId(eventsData[0].id);
      }
    } catch (error) {
      // console.error('Error fetching events:', error);
    }
  };

  const fetchPasses = async () => {
    if (!selectedEventId) return;
    setLoading(true);
    try {
      const passesRef = collection(db, 'passes');
      const q = query(
        passesRef,
        where('event_id', '==', selectedEventId)
      );
      const snapshot = await getDocs(q);
      
      const passesData: Pass[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      } as Pass));
      
      // Sort by created_at in JavaScript (some docs might not have this field)
      passesData.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime; // Descending order (newest first)
      });
      
      setPasses(passesData);
      // console.log(`Fetched ${passesData.length} passes for event ${selectedEventId}`);
    } catch (error) {
      // console.error('Error fetching passes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId) return;

    const selectedEvent = events.find((e) => e.id === selectedEventId);
    if (!selectedEvent) return;

    try {
      const code = generateUniqueCode(selectedEvent.qr_prefix || 'QRP');

      const passesRef = collection(db, 'passes');
      await addDoc(passesRef, {
        event_id: selectedEventId,
        code,
        guest_name: guestForm.name,
        guest_email: guestForm.email,
        used: false,
        created_at: serverTimestamp(),
      });

      setShowAddModal(false);
      setGuestForm({ name: '', email: '' });
      fetchPasses();
    } catch (error) {
      // console.error('Error adding guest:', error);
      alert('Error adding guest. Please try again.');
    }
  };

  const handleBulkImport = async () => {
    if (!selectedEventId || !bulkText.trim()) return;

    const selectedEvent = events.find((e) => e.id === selectedEventId);
    if (!selectedEvent) return;

    try {
      const lines = bulkText.trim().split('\n');
      const guests = lines
        .map((line) => {
          const [name, email] = line.split(',').map((s) => s.trim());
          if (name && email) {
            return {
              event_id: selectedEventId,
              code: generateUniqueCode(selectedEvent.qr_prefix || 'QRP'),
              guest_name: name,
              guest_email: email,
              used: false,
              created_at: serverTimestamp(),
            };
          }
          return null;
        })
        .filter(Boolean);

      if (guests.length === 0) {
        alert('No valid guests found. Format: Name, Email (one per line)');
        return;
      }

      // Firestore doesn't have bulk insert, so we add them one by one
      const passesRef = collection(db, 'passes');
      await Promise.all(guests.map(guest => addDoc(passesRef, guest)));

      setShowBulkImport(false);
      setBulkText('');
      fetchPasses();
      alert(`Successfully imported ${guests.length} guests!`);
    } catch (error) {
      // console.error('Error bulk importing:', error);
      alert('Error importing guests. Please try again.');
    }
  };

  const handleDeletePass = async (passId: string) => {
    if (!confirm('Are you sure you want to delete this pass?')) return;

    try {
      const passRef = doc(db, 'passes', passId);
      await deleteDoc(passRef);
      fetchPasses();
    } catch (error) {
      // console.error('Error deleting pass:', error);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Email', 'Code', 'Sent', 'Used', 'Scanned At'];
    const rows = passes.map((pass) => [
      pass.guest_name,
      pass.guest_email,
      pass.code,
      pass.sent_at ? 'Yes' : 'No',
      pass.used ? 'Yes' : 'No',
      pass.scanned_at ? new Date(pass.scanned_at).toLocaleString() : 'N/A',
    ]);

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guests-${selectedEventId}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Guest Management</h1>
          <p className="text-gray-600">Generate and manage QR passes for guests</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="secondary" onClick={() => setShowBulkImport(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Bulk Import
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-5 h-5 mr-2" />
            Add Guest
          </Button>
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <label className="text-sm font-medium text-gray-700">Select Event:</label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-400"
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
        {passes.length > 0 && (
          <Button variant="secondary" size="sm" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
        </div>
      ) : passes.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No guests yet</h3>
            <p className="text-gray-600 mb-6">Add guests to generate QR passes</p>
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="w-5 h-5 mr-2" />
              Add Your First Guest
            </Button>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                Guests ({passes.length})
              </h2>
              <div className="flex items-center space-x-4 text-sm">
                <span className="text-gray-600">
                  Sent: {passes.filter((p) => p.sent_at).length}
                </span>
                <span className="text-gray-600">
                  Scanned: {passes.filter((p) => p.used).length}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {passes.map((pass) => (
                    <tr key={pass.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{pass.guest_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{pass.guest_email}</td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-700">{pass.code}</td>
                      <td className="px-4 py-3">
                        <div className="flex space-x-1">
                          {pass.sent_at && (
                            <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
                              Sent
                            </span>
                          )}
                          {pass.used && (
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                              Scanned
                            </span>
                          )}
                          {!pass.sent_at && !pass.used && (
                            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded-full">
                              Pending
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeletePass(pass.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Add New Guest</h2>
            </CardHeader>
            <form onSubmit={handleAddGuest}>
              <CardBody className="space-y-4">
                <Input
                  label="Guest Name"
                  placeholder="John Doe"
                  value={guestForm.name}
                  onChange={(e) => setGuestForm({ ...guestForm, name: e.target.value })}
                  required
                />
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="john@example.com"
                  value={guestForm.email}
                  onChange={(e) => setGuestForm({ ...guestForm, email: e.target.value })}
                  required
                />
              </CardBody>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3">
                <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Guest</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {showBulkImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Bulk Import Guests</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Guest List (Name, Email - one per line)
                </label>
                <textarea
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all duration-200"
                  placeholder="John Doe, john@example.com&#10;Jane Smith, jane@example.com"
                  rows={10}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800">
                  <strong>Format:</strong> Each line should contain: Name, Email
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  Example: John Doe, john@example.com
                </p>
              </div>
            </CardBody>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3">
              <Button type="button" variant="ghost" onClick={() => setShowBulkImport(false)}>
                Cancel
              </Button>
              <Button onClick={handleBulkImport}>Import Guests</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
