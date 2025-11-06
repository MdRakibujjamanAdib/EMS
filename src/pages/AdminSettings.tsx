import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, updateDoc, setDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { UserPlus, Trash2, Shield, ShieldCheck } from 'lucide-react';

type Admin = {
  id: string;
  email: string;
  name?: string;
  role: 'super_admin' | 'scanner_admin';
  google_linked?: boolean;
  created_at: any;
};

export function AdminSettings() {
  const { isSuperAdmin } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'super_admin' | 'scanner_admin'>('scanner_admin');

  useEffect(() => {
    if (isSuperAdmin) {
      fetchAdmins();
    }
  }, [isSuperAdmin]);

  const fetchAdmins = async () => {
    try {
      const adminsRef = collection(db, 'admins');
      const q = query(adminsRef, orderBy('created_at', 'desc'));
      const snapshot = await getDocs(q);
      
      const adminsData: Admin[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Admin));
      
      setAdmins(adminsData);
    } catch (error) {
      // console.error('Error fetching admins:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newAdminEmail || !newAdminPassword || !newAdminName) {
      alert('Please fill in all fields');
      return;
    }

    if (newAdminPassword.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, newAdminEmail, newAdminPassword);
      
      // Create admin profile in Firestore
      const adminRef = doc(db, 'admins', userCredential.user.uid);
      await setDoc(adminRef, {
        email: newAdminEmail,
        name: newAdminName,
        role: newAdminRole,
        google_linked: false,
        created_at: serverTimestamp(),
      });

      setShowAddModal(false);
      setNewAdminEmail('');
      setNewAdminName('');
      setNewAdminPassword('');
      setNewAdminRole('scanner_admin');
      fetchAdmins();
      alert(`Admin account created successfully!\nEmail: ${newAdminEmail}\nPassword: ${newAdminPassword}\n\nPlease save this password - it won't be shown again.`);
    } catch (error: any) {
      // console.error('Error adding admin:', error);
      if (error.code === 'auth/email-already-in-use') {
        alert('Email already in use');
      } else {
        alert('Error adding admin: ' + (error.message || 'Please try again'));
      }
    }
  };

  const handleDeleteAdmin = async (adminId: string, adminEmail: string) => {
    if (!confirm(`Are you sure you want to remove ${adminEmail}?\n\nNote: This will remove the Firestore profile but the Firebase Auth account must be deleted manually from Firebase Console.`)) {
      return;
    }

    try {
      const adminRef = doc(db, 'admins', adminId);
      await deleteDoc(adminRef);
      fetchAdmins();
      alert('Admin profile removed. Remember to delete the auth account from Firebase Console if needed.');
    } catch (error) {
      // console.error('Error deleting admin:', error);
      alert('Error removing admin. Please try again.');
    }
  };

  const handleRoleChange = async (adminId: string, newRole: 'super_admin' | 'scanner_admin') => {
    if (!confirm(`Are you sure you want to change this admin's role?`)) {
      return;
    }

    try {
      const adminRef = doc(db, 'admins', adminId);
      await updateDoc(adminRef, { role: newRole });
      fetchAdmins();
    } catch (error) {
      // console.error('Error updating admin role:', error);
      alert('Error updating role. Please try again.');
    }
  };

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardBody className="py-12 text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-600">Only super admins can access this page.</p>
        </CardBody>
      </Card>
    );
  }

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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Settings</h1>
          <p className="text-gray-600">Manage admin users and their permissions</p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <UserPlus className="w-5 h-5 mr-2" />
          Add Admin
        </Button>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Admin Users</h2>
        </CardHeader>
        <CardBody>
          <div className="space-y-3">
            {admins.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors duration-200"
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      admin.role === 'super_admin' ? 'bg-yellow-100' : 'bg-blue-100'
                    }`}
                  >
                    {admin.role === 'super_admin' ? (
                      <ShieldCheck className="w-5 h-5 text-yellow-600" />
                    ) : (
                      <Shield className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{admin.email}</p>
                    <p className="text-sm text-gray-500">
                      {admin.role === 'super_admin' ? 'Super Admin' : 'Scanner Admin'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <select
                    value={admin.role}
                    onChange={(e) => handleRoleChange(admin.id, e.target.value as 'super_admin' | 'scanner_admin')}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  >
                    <option value="scanner_admin">Scanner Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteAdmin(admin.id, admin.email)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Role Descriptions</h2>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200">
              <div className="flex items-center space-x-2 mb-2">
                <ShieldCheck className="w-5 h-5 text-yellow-600" />
                <h3 className="font-semibold text-gray-900">Super Admin</h3>
              </div>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Full system access</li>
                <li>• Create and manage events</li>
                <li>• Generate QR codes</li>
                <li>• Send invitations</li>
                <li>• Scan passes</li>
                <li>• View analytics</li>
                <li>• Manage admin users</li>
              </ul>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-center space-x-2 mb-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Scanner Admin</h3>
              </div>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Scan passes</li>
                <li>• View analytics</li>
                <li>• View dashboard</li>
                <li>• Limited access only</li>
              </ul>
            </div>
          </div>
        </CardBody>
      </Card>

      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Add New Admin</h2>
            </CardHeader>
            <form onSubmit={handleAddAdmin}>
              <CardBody className="space-y-4">
                <Input
                  label="Name"
                  type="text"
                  placeholder="Admin Name"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  required
                />
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="admin@example.com"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="Min. 6 characters"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                  <select
                    value={newAdminRole}
                    onChange={(e) => setNewAdminRole(e.target.value as 'super_admin' | 'scanner_admin')}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  >
                    <option value="scanner_admin">Scanner Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
              </CardBody>
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => {
                    setShowAddModal(false);
                    setNewAdminEmail('');
                    setNewAdminName('');
                    setNewAdminPassword('');
                    setNewAdminRole('scanner_admin');
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">Add Admin</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
