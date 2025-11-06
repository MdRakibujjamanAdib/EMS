import { useState, useEffect, useRef } from 'react';
import QrScanner from 'qr-scanner';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { db } from '../lib/firebase';
import { getDocs, getDoc, doc, updateDoc, addDoc, where, serverTimestamp, collection, query, limit } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, XCircle, AlertTriangle, Camera, CameraOff } from 'lucide-react';

type ScanResult = {
  status: 'valid' | 'already_used' | 'invalid';
  message: string;
  guestName?: string;
  scannedAt?: string;
  code?: string;
};

export function Scanner() {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanner, setScanner] = useState<QrScanner | null>(null);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const lastScannedCodeRef = useRef<string>('');
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (scanner) {
        scanner.stop();
        scanner.destroy();
      }
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [scanner]);

  const startScanning = async () => {
    if (!videoRef.current) return;

    try {
      const qrScanner = new QrScanner(
        videoRef.current,
        async (result) => {
          await handleScan(result.data);
        },
        {
          returnDetailedScanResult: true,
          highlightScanRegion: false,
          highlightCodeOutline: false,
          maxScansPerSecond: 1, // Limit to 1 scan per second
        }
      );

      await qrScanner.start();
      setScanner(qrScanner);
      setScanning(true);
      setResult(null);
    } catch (error) {
      // console.error('Error starting scanner:', error);
      alert('Unable to access camera. Please grant camera permissions.');
    }
  };

  const stopScanning = () => {
    if (scanner) {
      scanner.stop();
      setScanning(false);
    }
  };

  const handleScan = async (code: string) => {
    if (!user) {
      // console.error('No user logged in');
      return;
    }

    // Prevent duplicate scans of the same code
    if (isProcessing || lastScannedCodeRef.current === code) {
      // console.log('Skipping duplicate scan:', code);
      return;
    }

    // Mark as processing and stop scanner
    setIsProcessing(true);
    lastScannedCodeRef.current = code;
    
    if (scanner && scanning) {
      scanner.stop();
    }

    // console.log('Processing scan code:', code);

    try {
      // Find pass by code
      const passesRef = collection(db, 'passes');
      const q = query(passesRef, where('code', '==', code), limit(1));
      const snapshot = await getDocs(q);
      
      let pass: any = null;
      let passDocId: string | null = null;
      
      if (!snapshot.empty) {
        passDocId = snapshot.docs[0].id;
        pass = { id: passDocId, ...snapshot.docs[0].data() };
        
        // console.log('Pass found:', pass);
        
        // Fetch event title if event_id exists
        if (pass.event_id) {
          try {
            const eventDoc = await getDoc(doc(db, 'events', pass.event_id));
            if (eventDoc.exists()) {
              pass.event_title = eventDoc.data().title;
            }
          } catch (err) {
            // console.error('Error fetching event:', err);
          }
        }
      } else {
        // console.log('No pass found with code:', code);
      }

      let scanStatus: 'valid' | 'already_used' | 'invalid';
      let message: string;
      let guestName: string | undefined;
      let scannedAt: Date | undefined;

      if (!pass) {
        scanStatus = 'invalid';
        message = 'Invalid QR Code - Pass Not Found';
        // console.log('Invalid pass');
      } else if (pass.used || pass.scanned_at) {
        // Check both used flag and scanned_at timestamp
        scanStatus = 'already_used';
        message = `Already Scanned - ${pass.guest_name || 'Guest'}`;
        guestName = pass.guest_name;
        // Convert Firestore Timestamp to Date
        scannedAt = pass.scanned_at?.toDate ? pass.scanned_at.toDate() : new Date(pass.scanned_at);
        // console.log('Pass already used');
      } else {
        scanStatus = 'valid';
        message = `✓ Access Granted - Welcome ${pass.guest_name || 'Guest'}!`;
        guestName = pass.guest_name;
        // console.log('Valid pass, marking as used');

        // Update pass to mark as used
        if (passDocId) {
          try {
            const passRef = doc(db, 'passes', passDocId);
            await updateDoc(passRef, {
              used: true,
              scanned_at: serverTimestamp(),
              scanned_by: user.uid,
            });
            // console.log('Pass marked as used');
          } catch (updateError) {
            // console.error('Error updating pass:', updateError);
          }
        }
      }

      // Log the scan only for valid scans or first-time invalid/already_used scans
      // Don't log duplicate scans of the same code in a short time
      try {
        const scanLogsRef = collection(db, 'scan_logs');
        await addDoc(scanLogsRef, {
          pass_id: passDocId,
          scanned_code: code,
          scanner_id: user.uid,
          status: scanStatus,
          event_id: pass?.event_id || null,
          guest_name: pass?.guest_name || null,
          scanned_at: serverTimestamp(),
        });
        // console.log('Scan logged successfully');
      } catch (logError) {
        // console.error('Error logging scan:', logError);
      }

      setResult({
        status: scanStatus,
        message,
        guestName,
        scannedAt: scannedAt?.toLocaleString(),
        code,
      });
    } catch (error) {
      // console.error('Error processing scan:', error);
      setResult({
        status: 'invalid',
        message: 'Error processing scan: ' + (error as Error).message,
      });
    } finally {
      // Reset processing state after a delay to prevent re-scanning the same code
      setIsProcessing(false);
    }
  };

  const getResultStyles = (status: string) => {
    switch (status) {
      case 'valid':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'already_used':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'invalid':
        return 'bg-red-50 border-red-200 text-red-800';
      default:
        return '';
    }
  };

  const getResultIcon = (status: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="w-16 h-16" />;
      case 'already_used':
        return <AlertTriangle className="w-16 h-16" />;
      case 'invalid':
        return <XCircle className="w-16 h-16" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
      {/* Mobile-optimized header */}
      <div className="sticky top-0 bg-white z-10 pb-3 md:pb-0 md:static border-b md:border-0">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-1 md:mb-2">QR Scanner</h1>
        <p className="text-sm md:text-base text-gray-600">Scan guest passes for event entry validation</p>
      </div>

      {/* Camera Section - Centered single column */}
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg md:text-xl font-semibold text-gray-900">Camera</h2>
              {scanning ? (
                <Button variant="danger" size="sm" onClick={stopScanning}>
                  <CameraOff className="w-4 h-4 mr-1 md:mr-2" />
                  <span className="hidden xs:inline">Stop</span>
                </Button>
              ) : (
                <Button size="sm" onClick={startScanning}>
                  <Camera className="w-4 h-4 mr-1 md:mr-2" />
                  <span className="hidden xs:inline">Start</span>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardBody>
            {/* Mobile: Take full viewport width, Desktop: Aspect square */}
            <div className="relative w-full h-[60vh] md:h-auto md:aspect-square bg-gray-900 rounded-xl overflow-hidden qr-scanner-container">
              <video ref={videoRef} className="w-full h-full object-cover" />
              {scanning && <div className="scan-line"></div>}
              {!scanning && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                  <div className="text-center text-white px-4">
                    <Camera className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-3 opacity-50" />
                    <p className="text-xs md:text-sm">Tap "Start" to begin scanning</p>
                  </div>
                </div>
              )}
              {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-20">
                  <div className="text-center text-white">
                    <div className="animate-spin rounded-full h-10 w-10 md:h-12 md:w-12 border-b-2 border-white mx-auto mb-2"></div>
                    <p className="text-xs md:text-sm font-medium">Processing...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Manual Code Input - Compact on mobile */}
            <div className="mt-3 md:mt-4 p-3 md:p-4 bg-gray-50 rounded-xl">
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-2">
                Manual Code Entry
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Enter code"
                  className="flex-1 px-3 md:px-4 py-2 text-sm md:text-base bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && manualCode.trim() && !isProcessing) {
                      handleScan(manualCode.trim());
                      setManualCode('');
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (manualCode.trim() && !isProcessing) {
                      handleScan(manualCode.trim());
                      setManualCode('');
                    }
                  }}
                  disabled={!manualCode.trim() || isProcessing}
                  size="sm"
                >
                  Scan
                </Button>
              </div>
            </div>

            {/* Result Display - Full screen on mobile */}
            {result && (
              <div
                className={`fixed md:relative inset-0 md:inset-auto md:mt-4 z-50 md:z-auto flex items-center justify-center md:block ${getResultStyles(result.status)} md:rounded-xl md:border-2 transition-all duration-300`}
              >
                <div className="bg-inherit w-full h-full md:h-auto flex items-center justify-center p-6 md:p-6">
                  <div className="flex flex-col items-center text-center max-w-md">
                    {getResultIcon(result.status)}
                    <h3 className="text-xl md:text-2xl font-bold mt-4 mb-2">{result.message}</h3>
                    {result.guestName && <p className="text-lg md:text-lg font-medium mb-1">{result.guestName}</p>}
                    {result.code && <p className="text-xs md:text-sm opacity-75 mb-2 break-all">Code: {result.code}</p>}
                    {result.scannedAt && (
                      <p className="text-xs md:text-sm opacity-75">
                        Previously scanned: {result.scannedAt}
                      </p>
                    )}
                    <Button
                      onClick={() => {
                        setResult(null);
                        setIsProcessing(false);
                        lastScannedCodeRef.current = '';
                        
                        // Clear any existing timeout
                        if (scanTimeoutRef.current) {
                          clearTimeout(scanTimeoutRef.current);
                        }
                        
                        // Set timeout to allow rescanning after 2 seconds
                        scanTimeoutRef.current = setTimeout(() => {
                          lastScannedCodeRef.current = '';
                        }, 2000);
                        
                        if (scanner && scanning) {
                          scanner.start();
                        }
                      }}
                      className="mt-6 w-full md:w-auto text-base md:text-sm px-8 py-3 md:py-2"
                    >
                      {scanning ? 'Resume Scanning' : 'Close'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
