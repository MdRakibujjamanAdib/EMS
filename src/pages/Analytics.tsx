import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { db } from '../lib/firebase';
import { collection, query, getDocs, orderBy, limit, getDoc, doc } from 'firebase/firestore';
import { Download, TrendingUp, TrendingDown, Activity, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

type AnalyticsData = {
  totalGenerated: number;
  totalSent: number;
  totalFailed: number;
  totalScanned: number;
  invalidScans: number;
  duplicateScans: number;
  scanRate: number;
};

export function Analytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalGenerated: 0,
    totalSent: 0,
    totalFailed: 0,
    totalScanned: 0,
    invalidScans: 0,
    duplicateScans: 0,
    scanRate: 0,
  });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
    fetchRecentLogs();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Get all passes
      const passesRef = collection(db, 'passes');
      const passesSnapshot = await getDocs(passesRef);
      const totalGenerated = passesSnapshot.size;

      // Count used passes
      const usedPasses = passesSnapshot.docs.filter(doc => doc.data().used === true || doc.data().scanned_at);
      const totalScanned = usedPasses.length;

      // Get email logs
      const emailLogsRef = collection(db, 'email_logs');
      const emailLogsSnapshot = await getDocs(emailLogsRef);
      
      let totalSent = 0;
      let totalFailed = 0;
      
      emailLogsSnapshot.docs.forEach(doc => {
        const status = doc.data().status;
        if (status === 'sent') {
          totalSent++;
        } else if (status === 'failed' || status === 'invalid') {
          totalFailed++;
        }
      });

      // Get scan logs
      const scanLogsRef = collection(db, 'scan_logs');
      const scanLogsSnapshot = await getDocs(scanLogsRef);
      
      let invalidScans = 0;
      let duplicateScans = 0;
      
      scanLogsSnapshot.docs.forEach(doc => {
        const status = doc.data().status;
        if (status === 'invalid') {
          invalidScans++;
        } else if (status === 'already_used') {
          duplicateScans++;
        }
      });

      const scanRate = totalGenerated > 0 ? (totalScanned / totalGenerated) * 100 : 0;

      setAnalytics({
        totalGenerated,
        totalSent,
        totalFailed,
        totalScanned,
        invalidScans,
        duplicateScans,
        scanRate,
      });
    } catch (error) {
      // console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentLogs = async () => {
    try {
      const scanLogsRef = collection(db, 'scan_logs');
      const q = query(scanLogsRef, orderBy('scanned_at', 'desc'), limit(20));
      const snapshot = await getDocs(q);
      
      // Fetch related data for each scan log
      const logsWithDetails = await Promise.all(
        snapshot.docs.map(async (logDoc) => {
          const logData: any = { id: logDoc.id, ...logDoc.data() };
          
          // Fetch pass data if pass_id exists
          if (logData.pass_id) {
            try {
              const passDoc = await getDoc(doc(db, 'passes', logData.pass_id));
              if (passDoc.exists()) {
                logData.passes = passDoc.data();
              }
            } catch (err) {
              // console.error('Error fetching pass:', err);
            }
          }
          
          // Fetch admin/scanner data if scanner_id exists
          if (logData.scanner_id) {
            try {
              const adminDoc = await getDoc(doc(db, 'admins', logData.scanner_id));
              if (adminDoc.exists()) {
                logData.admins = adminDoc.data();
              }
            } catch (err) {
              // console.error('Error fetching admin:', err);
            }
          }
          
          return logData;
        })
      );
      
      setRecentLogs(logsWithDetails);
    } catch (error) {
      // console.error('Error fetching logs:', error);
    }
  };

  const exportToCSV = () => {
    const headers = ['Timestamp', 'Code', 'Guest Name', 'Email', 'Status', 'Scanner'];
    const rows = recentLogs.map((log) => {
      // Handle Firestore timestamp
      const timestamp = log.scanned_at?.toDate ? 
        log.scanned_at.toDate().toLocaleString() : 
        log.scanned_at ? 
        new Date(log.scanned_at).toLocaleString() :
        'N/A';
      
      return [
        timestamp,
        log.scanned_code || 'N/A',
        log.guest_name || log.passes?.guest_name || 'N/A',
        log.passes?.guest_email || 'N/A',
        log.status || 'N/A',
        log.admins?.email || 'N/A',
      ];
    });

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qrpass-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">Analytics</h1>
          <p className="text-sm md:text-base text-gray-600">Track performance and scan statistics</p>
        </div>
        <Button onClick={exportToCSV} size="sm" className="self-start sm:self-auto">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card hover>
          <CardBody>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div className="mb-2 md:mb-0">
                <p className="text-xs md:text-sm text-gray-600 mb-1">QR Generated</p>
                <p className="text-xl md:text-3xl font-bold text-gray-900">{analytics.totalGenerated}</p>
              </div>
              <div className="bg-blue-50 p-2 md:p-3 rounded-xl self-end md:self-auto">
                <Activity className="w-4 h-4 md:w-6 md:h-6 text-blue-600" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card hover>
          <CardBody>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div className="mb-2 md:mb-0">
                <p className="text-xs md:text-sm text-gray-600 mb-1">Emails Sent</p>
                <p className="text-xl md:text-3xl font-bold text-gray-900">{analytics.totalSent}</p>
                {analytics.totalFailed > 0 && (
                  <p className="text-xs text-red-600 mt-1">{analytics.totalFailed} failed</p>
                )}
              </div>
              <div className="bg-green-50 p-2 md:p-3 rounded-xl self-end md:self-auto">
                <CheckCircle className="w-4 h-4 md:w-6 md:h-6 text-green-600" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card hover>
          <CardBody>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div className="mb-2 md:mb-0">
                <p className="text-xs md:text-sm text-gray-600 mb-1">Scanned</p>
                <p className="text-xl md:text-3xl font-bold text-gray-900">{analytics.totalScanned}</p>
                <p className="text-xs text-gray-500 mt-1">{analytics.scanRate.toFixed(1)}%</p>
              </div>
              <div className="bg-yellow-50 p-2 md:p-3 rounded-xl self-end md:self-auto">
                <TrendingUp className="w-4 h-4 md:w-6 md:h-6 text-yellow-600" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card hover>
          <CardBody>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
              <div className="mb-2 md:mb-0">
                <p className="text-xs md:text-sm text-gray-600 mb-1">Issues</p>
                <p className="text-xl md:text-3xl font-bold text-gray-900">
                  {analytics.invalidScans + analytics.duplicateScans}
                </p>
                <p className="text-xs text-gray-500 mt-1 hidden md:block">
                  {analytics.invalidScans} invalid, {analytics.duplicateScans} dup
                </p>
              </div>
              <div className="bg-red-50 p-2 md:p-3 rounded-xl self-end md:self-auto">
                <AlertTriangle className="w-4 h-4 md:w-6 md:h-6 text-red-600" />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <h2 className="text-lg md:text-xl font-semibold text-gray-900">Performance Overview</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs md:text-sm font-medium text-gray-700">Scan Rate</span>
                  <span className="text-xs md:text-sm font-bold text-gray-900">{analytics.scanRate.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-yellow-400 to-yellow-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(analytics.scanRate, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs md:text-sm font-medium text-gray-700">Email Success Rate</span>
                  <span className="text-xs md:text-sm font-bold text-gray-900">
                    {analytics.totalSent + analytics.totalFailed > 0
                      ? ((analytics.totalSent / (analytics.totalSent + analytics.totalFailed)) * 100).toFixed(1)
                      : 0}
                    %
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-green-400 to-green-500 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        analytics.totalSent + analytics.totalFailed > 0
                          ? (analytics.totalSent / (analytics.totalSent + analytics.totalFailed)) * 100
                          : 0
                      }%`,
                    }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs md:text-sm font-medium text-gray-700">Valid Scans</span>
                  <span className="text-xs md:text-sm font-bold text-gray-900">
                    {analytics.invalidScans + analytics.duplicateScans + analytics.totalScanned > 0
                      ? (
                          (analytics.totalScanned /
                            (analytics.invalidScans + analytics.duplicateScans + analytics.totalScanned)) *
                          100
                        ).toFixed(1)
                      : 0}
                    %
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-400 to-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        analytics.invalidScans + analytics.duplicateScans + analytics.totalScanned > 0
                          ? (analytics.totalScanned /
                              (analytics.invalidScans + analytics.duplicateScans + analytics.totalScanned)) *
                            100
                          : 0
                      }%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg md:text-xl font-semibold text-gray-900">Quick Stats</h2>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div className="bg-green-50 p-3 md:p-4 rounded-xl">
                <CheckCircle className="w-6 h-6 md:w-8 md:h-8 text-green-600 mb-2" />
                <p className="text-lg md:text-2xl font-bold text-gray-900">{analytics.totalScanned}</p>
                <p className="text-xs md:text-sm text-gray-600">Valid Entries</p>
              </div>
              <div className="bg-yellow-50 p-3 md:p-4 rounded-xl">
                <AlertTriangle className="w-6 h-6 md:w-8 md:h-8 text-yellow-600 mb-2" />
                <p className="text-lg md:text-2xl font-bold text-gray-900">{analytics.duplicateScans}</p>
                <p className="text-xs md:text-sm text-gray-600">Duplicates</p>
              </div>
              <div className="bg-red-50 p-3 md:p-4 rounded-xl">
                <XCircle className="w-6 h-6 md:w-8 md:h-8 text-red-600 mb-2" />
                <p className="text-lg md:text-2xl font-bold text-gray-900">{analytics.invalidScans}</p>
                <p className="text-xs md:text-sm text-gray-600">Invalid</p>
              </div>
              <div className="bg-blue-50 p-3 md:p-4 rounded-xl">
                <TrendingDown className="w-6 h-6 md:w-8 md:h-8 text-blue-600 mb-2" />
                <p className="text-lg md:text-2xl font-bold text-gray-900">
                  {analytics.totalGenerated - analytics.totalScanned}
                </p>
                <p className="text-xs md:text-sm text-gray-600">Pending</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg md:text-xl font-semibold text-gray-900">Recent Scan Logs</h2>
        </CardHeader>
        <CardBody>
          {/* Mobile: Card list, Desktop: Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Guest</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Scanner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No scan logs yet
                    </td>
                  </tr>
                ) : (
                  recentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {log.scanned_at?.toDate ? 
                          log.scanned_at.toDate().toLocaleString() : 
                          log.scanned_at ? 
                          new Date(log.scanned_at).toLocaleString() :
                          'N/A'
                        }
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-700">{log.scanned_code || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{log.guest_name || log.passes?.guest_name || 'N/A'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium px-2 py-1 rounded-full ${
                            log.status === 'valid'
                              ? 'bg-green-100 text-green-800'
                              : log.status === 'already_used'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {log.status?.replace('_', ' ') || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{log.admins?.email || 'N/A'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Mobile view: Card-based list */}
          <div className="md:hidden space-y-2">
            {recentLogs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No scan logs yet</p>
              </div>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {log.guest_name || log.passes?.guest_name || 'Unknown'}
                      </p>
                      <p className="text-xs font-mono text-gray-600 truncate">{log.scanned_code || 'N/A'}</p>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                        log.status === 'valid'
                          ? 'bg-green-100 text-green-800'
                          : log.status === 'already_used'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {log.status === 'valid' ? '✓' : log.status === 'already_used' ? '⚠' : '✗'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {log.scanned_at?.toDate ? 
                        log.scanned_at.toDate().toLocaleString(undefined, { 
                          month: 'short', 
                          day: 'numeric', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        }) : 
                        'N/A'
                      }
                    </span>
                    <span className="truncate ml-2">{log.admins?.email || 'N/A'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
