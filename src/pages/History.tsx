import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, getDocs, getDoc, doc } from 'firebase/firestore';
import { Camera, Download } from 'lucide-react';
import { Button } from '../components/Button';

export function History() {
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentScans();
  }, []);

  const fetchRecentScans = async () => {
    try {
      const scanLogsRef = collection(db, 'scan_logs');
      const q = query(scanLogsRef, orderBy('scanned_at', 'desc'), limit(100));
      const snapshot = await getDocs(q);
      
      // For each scan, fetch the related pass data
      const scansWithPasses = await Promise.all(
        snapshot.docs.map(async (scanDoc) => {
          const scanData: any = { id: scanDoc.id, ...scanDoc.data() };
          if (scanData.pass_id) {
            try {
              const passDoc = await getDoc(doc(db, 'passes', scanData.pass_id));
              if (passDoc.exists()) {
                return {
                  ...scanData,
                  passes: passDoc.data(),
                };
              }
            } catch (err) {
              // console.error('Error fetching pass for scan:', err);
            }
          }
          return scanData;
        })
      );

      setRecentScans(scansWithPasses);
    } catch (error) {
      // console.error('Error fetching recent scans:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Timestamp', 'Code', 'Guest Name', 'Status'];
    const rows = recentScans.map(scan => [
      scan.scanned_at?.toDate ? scan.scanned_at.toDate().toLocaleString() : 'N/A',
      scan.scanned_code || 'N/A',
      scan.guest_name || scan.passes?.guest_name || 'N/A',
      scan.status || 'N/A',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">Scan History</h1>
          <p className="text-sm md:text-base text-gray-600">View all your scan records</p>
        </div>
        <Button onClick={exportToCSV} size="sm" className="self-start sm:self-auto">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-semibold text-gray-900">
              Recent Scans ({recentScans.length})
            </h2>
          </div>
        </CardHeader>
        <CardBody>
          {recentScans.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Camera className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm md:text-base">No scans yet</p>
            </div>
          ) : (
            <>
              {/* Desktop: Table view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Timestamp</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Guest</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentScans.map((scan) => (
                      <tr key={scan.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {scan.scanned_at?.toDate ? 
                            scan.scanned_at.toDate().toLocaleString() : 
                            scan.scanned_at ? 
                            new Date(scan.scanned_at).toLocaleString() :
                            'N/A'
                          }
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-700">{scan.scanned_code || 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{scan.guest_name || scan.passes?.guest_name || 'N/A'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-medium px-2 py-1 rounded-full ${
                              scan.status === 'valid'
                                ? 'bg-green-100 text-green-800'
                                : scan.status === 'already_used'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {scan.status?.replace('_', ' ') || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: Card-based list */}
              <div className="md:hidden space-y-2 max-h-[70vh] overflow-y-auto">
                {recentScans.map((scan) => (
                  <div
                    key={scan.id}
                    className={`p-3 rounded-lg border ${
                      scan.status === 'valid'
                        ? 'bg-green-50 border-green-200'
                        : scan.status === 'already_used'
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">
                          {scan.guest_name || scan.passes?.guest_name || 'Unknown'}
                        </p>
                        <p className="text-xs font-mono text-gray-600 truncate">{scan.scanned_code || 'N/A'}</p>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                          scan.status === 'valid'
                            ? 'bg-green-100 text-green-800'
                            : scan.status === 'already_used'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {scan.status === 'valid' ? '✓ Valid' : scan.status === 'already_used' ? '⚠ Used' : '✗ Invalid'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {scan.scanned_at?.toDate ? 
                          scan.scanned_at.toDate().toLocaleString(undefined, { 
                            month: 'short', 
                            day: 'numeric', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          }) : 
                          'N/A'
                        }
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
