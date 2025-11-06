import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Event, Pass } from '../lib/types';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { sendGmail, generateInvitationHTML, readGoogleSheet, updateGoogleSheet, createGoogleSheet } from '../lib/googleApi';
import { generateQRCodeDataURL } from '../utils/qrGenerator';
import { Mail, Send, CheckCircle, AlertCircle, FileSpreadsheet, Plus, Save, Bookmark } from 'lucide-react';

type EmailStatus = {
  total: number;
  sent: number;
  failed: number;
  current: string;
  inProgress: boolean;
};

type EmailPreset = {
  id: string;
  name: string;
  subject: string;
  message: string;
  created_at?: any;
};

export function MailInvitations() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [passes, setPasses] = useState<Pass[]>([]);
  const [subject, setSubject] = useState('Your Event Invitation');
  const [message, setMessage] = useState(
    'Dear {NAME},\n\nYou are invited to our event! Please find your personalized QR pass attached.\n\nBest regards,\nEvent Team'
  );
  const [status, setStatus] = useState<EmailStatus>({
    total: 0,
    sent: 0,
    failed: 0,
    current: '',
    inProgress: false,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [showSheetImport, setShowSheetImport] = useState(false);
  const [sheetId, setSheetId] = useState('');
  const [sheetRange, setSheetRange] = useState('Email List!A:B');
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newSheetName, setNewSheetName] = useState('');
  const [presets, setPresets] = useState<EmailPreset[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showPresetList, setShowPresetList] = useState(false);

  useEffect(() => {
    fetchEvents();
    fetchPresets();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      fetchPasses();
    }
  }, [selectedEventId]);

  const fetchPresets = async () => {
    try {
      const presetsRef = collection(db, 'email_presets');
      const q = query(presetsRef, orderBy('created_at', 'desc'));
      const snapshot = await getDocs(q);
      
      const presetsData = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      } as EmailPreset));
      
      setPresets(presetsData);
    } catch (error) {
      // console.error('Error fetching presets:', error);
    }
  };

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
    try {
      const passesRef = collection(db, 'passes');
      const q = query(
        passesRef,
        where('event_id', '==', selectedEventId)
      );
      const snapshot = await getDocs(q);
      
      // Filter for unsent passes (where sent_at doesn't exist or is null)
      const passesData: Pass[] = snapshot.docs
        .map(d => ({
          id: d.id,
          ...d.data(),
        } as Pass))
        .filter(pass => !pass.sent_at);
      
      setPasses(passesData);
    } catch (error) {
      // console.error('Error fetching passes:', error);
    }
  };

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      alert('Please enter a preset name');
      return;
    }

    try {
      const presetsRef = collection(db, 'email_presets');
      await addDoc(presetsRef, {
        name: presetName,
        subject,
        message,
        created_at: serverTimestamp(),
      });
      
      alert(`Preset "${presetName}" saved successfully!`);
      setShowSavePreset(false);
      setPresetName('');
      fetchPresets();
    } catch (error: any) {
      // console.error('Error saving preset:', error);
      alert(`Failed to save preset: ${error.message}`);
    }
  };

  const handleLoadPreset = (preset: EmailPreset) => {
    setSubject(preset.subject);
    setMessage(preset.message);
    setShowPresetList(false);
    addLog(`✓ Loaded preset: ${preset.name}`);
  };

  const handleCreateSheet = async () => {
    if (!newSheetName.trim()) {
      alert('Please enter a sheet name');
      return;
    }

    try {
      addLog(`Creating new Google Sheet: ${newSheetName}...`);
      const spreadsheetId = await createGoogleSheet(newSheetName);
      
      addLog(`✓ Sheet created successfully!`);
      addLog(`Sheet ID: ${spreadsheetId}`);
      addLog(`You can now paste this ID above to use it.`);
      
      setSheetId(spreadsheetId);
      setShowCreateSheet(false);
      setNewSheetName('');
    } catch (error: any) {
      // console.error('Error creating sheet:', error);
      
      if (error.message.includes('insufficient authentication scopes')) {
        alert('Insufficient permissions! Please sign out and sign in again to grant full Google Sheets access (create/edit permissions).');
        addLog('✗ Need to sign out and sign in again for full Sheets access');
      } else {
        alert(`Failed to create sheet: ${error.message}`);
        addLog(`✗ Failed to create sheet: ${error.message}`);
      }
    }
  };

  const handleSendWithSheetUpdate = async () => {
    if (!selectedEventId) {
      alert('Please select an event');
      return;
    }

    if (!sheetId.trim()) {
      alert('Please enter a Google Sheet ID to track email status');
      return;
    }

    const unsent = passes.filter((p) => !p.sent_at);
    if (unsent.length === 0) {
      alert('All invitations have already been sent!');
      return;
    }

    const selectedEvent = events.find((e) => e.id === selectedEventId);
    if (!selectedEvent) return;

    try {
      // Read current sheet data to get row numbers and detect format
      const sheetData = await readGoogleSheet(sheetId, sheetRange);
      const emailToRowMap = new Map<string, number>();
      let isNameEmailFormat = false; // Format 1: Name (A), Email (B), Status (C), Timestamp (D)
      
      if (sheetData && sheetData.length > 0) {
        // Detect format: check if column B has emails (Name+Email format) or column A has emails (Email only format)
        const startRow = (sheetData[0][0]?.toLowerCase().includes('name') || sheetData[0][1]?.toLowerCase().includes('email')) ? 1 : 0;
        
        // Check first data row to determine format
        if (sheetData[startRow] && sheetData[startRow].length >= 2 && sheetData[startRow][1]?.includes('@')) {
          isNameEmailFormat = true; // Format 1: Name in A, Email in B
        }
        
        for (let i = startRow; i < sheetData.length; i++) {
          let email = '';
          if (isNameEmailFormat && sheetData[i][1]) {
            email = sheetData[i][1].trim().toLowerCase(); // Email is in column B
          } else if (sheetData[i][0]) {
            email = sheetData[i][0].trim().toLowerCase(); // Email is in column A
          }
          
          if (email) {
            emailToRowMap.set(email, i + 1); // +1 for 1-indexed rows
          }
        }
      }

      setStatus({
        total: unsent.length,
        sent: 0,
        failed: 0,
        current: '',
        inProgress: true,
      });

      addLog('Starting email send process with sheet updates...');

      for (const pass of unsent) {
        setStatus((prev) => ({ ...prev, current: pass.guest_name }));
        addLog(`Sending to ${pass.guest_name} (${pass.guest_email})...`);

        try {
          // Generate QR code
          const qrCodeDataUrl = await generateQRCodeDataURL(pass.code);

          // Generate HTML email
          const htmlBody = generateInvitationHTML({
            guestName: pass.guest_name,
            eventTitle: selectedEvent.title,
            eventDescription: selectedEvent.description,
            message,
            qrCodeDataUrl,
            bgColor: selectedEvent.bg_color,
            accentColor: selectedEvent.accent_color,
          });

          // Send email via Gmail API
          await sendGmail({
            to: pass.guest_email,
            subject: subject,
            body: message.replace('{NAME}', pass.guest_name),
            html: htmlBody,
          });

          // Update pass as sent
          const passRef = doc(db, 'passes', pass.id);
          await updateDoc(passRef, {
            sent_at: serverTimestamp(),
          });

          // Update sheet with success status
          const rowNum = emailToRowMap.get(pass.guest_email.toLowerCase());
          if (rowNum) {
            const sheetName = sheetRange.split('!')[0];
            // Update Status (C) and Timestamp (D) for Name+Email format
            // or Status (B) and Timestamp (C) for Email-only format
            const statusCol = isNameEmailFormat ? 'C' : 'B';
            const timestampCol = isNameEmailFormat ? 'D' : 'C';
            await updateGoogleSheet(sheetId, `${sheetName}!${statusCol}${rowNum}:${timestampCol}${rowNum}`, [
              ['Sent', new Date().toLocaleString()],
            ]);
          }

          setStatus((prev) => ({ ...prev, sent: prev.sent + 1 }));
          addLog(`✓ Sent to ${pass.guest_name} and updated sheet`);
        } catch (error: any) {
          // console.error('Error sending email:', error);
          
          // Determine status based on error
          let failureStatus = 'Failed';
          if (error.message?.toLowerCase().includes('address not found') || 
              error.message?.toLowerCase().includes('invalid') ||
              error.message?.toLowerCase().includes('recipient address rejected')) {
            failureStatus = 'Invalid';
          }
          
          // Update sheet with failure/invalid status
          const rowNum = emailToRowMap.get(pass.guest_email.toLowerCase());
          if (rowNum) {
            try {
              const sheetName = sheetRange.split('!')[0];
              const statusCol = isNameEmailFormat ? 'C' : 'B';
              const timestampCol = isNameEmailFormat ? 'D' : 'C';
              await updateGoogleSheet(sheetId, `${sheetName}!${statusCol}${rowNum}:${timestampCol}${rowNum}`, [
                [failureStatus, new Date().toLocaleString()],
              ]);
            } catch (updateError: any) {
              // console.error('Error updating sheet status:', updateError);
              if (updateError.message?.includes('insufficient authentication scopes')) {
                addLog('⚠ Cannot update sheet - please sign out and sign in again for write access');
              }
            }
          }

          setStatus((prev) => ({ ...prev, failed: prev.failed + 1 }));
          addLog(`✗ Failed to send to ${pass.guest_name}: ${error.message} (Status: ${failureStatus})`);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      addLog('Email send process completed!');
      setStatus((prev) => ({ ...prev, inProgress: false, current: '' }));
      fetchPasses();
    } catch (error: any) {
      // console.error('Error in send process:', error);
      alert(`Error: ${error.message}`);
      setStatus((prev) => ({ ...prev, inProgress: false, current: '' }));
    }
  };

  const handleSendEmails = async () => {
    if (passes.length === 0) {
      alert('No pending invitations to send');
      return;
    }

    if (!confirm(`Send invitations to ${passes.length} guests?`)) {
      return;
    }

    // Get the selected event details
    const selectedEvent = events.find((e) => e.id === selectedEventId);
    if (!selectedEvent) {
      alert('Event not found');
      return;
    }

    setStatus({
      total: passes.length,
      sent: 0,
      failed: 0,
      current: '',
      inProgress: true,
    });
    setLogs([]);

    addLog(`Starting email send process for ${passes.length} guests...`);

    for (let i = 0; i < passes.length; i++) {
      const pass = passes[i];

      setStatus((prev) => ({ ...prev, current: pass.guest_email }));
      addLog(`Sending to ${pass.guest_name} (${pass.guest_email})...`);

      try {
        // Generate QR code for this pass
        const qrCodeDataUrl = await generateQRCodeDataURL(pass.code);

        // Generate HTML email
        const htmlBody = generateInvitationHTML({
          guestName: pass.guest_name,
          eventTitle: selectedEvent.title,
          eventDescription: selectedEvent.description,
          message,
          qrCodeDataUrl,
          bgColor: selectedEvent.bg_color,
          accentColor: selectedEvent.accent_color,
        });

        // Send email via Gmail API
        await sendGmail({
          to: pass.guest_email,
          subject: subject,
          body: message.replace('{NAME}', pass.guest_name),
          html: htmlBody,
        });

        // Update pass as sent
        const passRef = doc(db, 'passes', pass.id);
        await updateDoc(passRef, {
          sent_at: serverTimestamp(),
        });

        // Update Google Sheet if this pass came from a sheet
        if (pass.sheet_id && sheetId) {
          try {
            const sheetData = await readGoogleSheet(pass.sheet_id, sheetRange);
            if (sheetData && sheetData.length > 0) {
              // Detect format
              const startRow = (sheetData[0][0]?.toLowerCase().includes('name') || sheetData[0][1]?.toLowerCase().includes('email')) ? 1 : 0;
              const isNameEmailFormat = sheetData[startRow] && sheetData[startRow].length >= 2 && sheetData[startRow][1]?.includes('@');
              
              // Find email row
              let emailIndex = -1;
              if (isNameEmailFormat) {
                emailIndex = sheetData.findIndex(row => row[1]?.toLowerCase() === pass.guest_email.toLowerCase());
              } else {
                emailIndex = sheetData.findIndex(row => row[0]?.toLowerCase() === pass.guest_email.toLowerCase());
              }
              
              if (emailIndex >= 0) {
                const sheetName = sheetRange.split('!')[0];
                const statusCol = isNameEmailFormat ? 'C' : 'B';
                const timestampCol = isNameEmailFormat ? 'D' : 'C';
                await updateGoogleSheet(pass.sheet_id, `${sheetName}!${statusCol}${emailIndex + 1}:${timestampCol}${emailIndex + 1}`, [
                  ['Sent', new Date().toLocaleString()],
                ]);
              }
            }
          } catch (sheetError) {
            // console.error('Error updating sheet:', sheetError);
            // Don't fail the email send if sheet update fails
          }
        }

        // Log success
        const emailLogsRef = collection(db, 'email_logs');
        await addDoc(emailLogsRef, {
          pass_id: pass.id,
          event_id: selectedEventId,
          recipient_email: pass.guest_email,
          subject: subject,
          status: 'sent',
          sent_at: serverTimestamp(),
        });

        setStatus((prev) => ({ ...prev, sent: prev.sent + 1 }));
        addLog(`✓ Successfully sent to ${pass.guest_name}`);
      } catch (error: any) {
        // console.error('Error sending email:', error);
        
        // Determine status based on error
        let failureStatus = 'failed';
        if (error.message?.toLowerCase().includes('address not found') || 
            error.message?.toLowerCase().includes('invalid') ||
            error.message?.toLowerCase().includes('recipient address rejected')) {
          failureStatus = 'invalid';
        }
        
        // Update Google Sheet if this pass came from a sheet
        if (pass.sheet_id && sheetId) {
          try {
            const sheetData = await readGoogleSheet(pass.sheet_id, sheetRange);
            if (sheetData && sheetData.length > 0) {
              // Detect format
              const startRow = (sheetData[0][0]?.toLowerCase().includes('name') || sheetData[0][1]?.toLowerCase().includes('email')) ? 1 : 0;
              const isNameEmailFormat = sheetData[startRow] && sheetData[startRow].length >= 2 && sheetData[startRow][1]?.includes('@');
              
              // Find email row
              let emailIndex = -1;
              if (isNameEmailFormat) {
                emailIndex = sheetData.findIndex(row => row[1]?.toLowerCase() === pass.guest_email.toLowerCase());
              } else {
                emailIndex = sheetData.findIndex(row => row[0]?.toLowerCase() === pass.guest_email.toLowerCase());
              }
              
              if (emailIndex >= 0) {
                const sheetName = sheetRange.split('!')[0];
                const statusCol = isNameEmailFormat ? 'C' : 'B';
                const timestampCol = isNameEmailFormat ? 'D' : 'C';
                await updateGoogleSheet(pass.sheet_id, `${sheetName}!${statusCol}${emailIndex + 1}:${timestampCol}${emailIndex + 1}`, [
                  [failureStatus === 'invalid' ? 'Invalid' : 'Failed', new Date().toLocaleString()],
                ]);
              }
            }
          } catch (sheetError) {
            // console.error('Error updating sheet:', sheetError);
            // Don't fail the email send if sheet update fails
          }
        }
        
        // Log failure
        const emailLogsRef = collection(db, 'email_logs');
        await addDoc(emailLogsRef, {
          pass_id: pass.id,
          event_id: selectedEventId,
          recipient_email: pass.guest_email,
          subject: subject,
          status: failureStatus,
          error_message: error.message || 'Unknown error',
          sent_at: serverTimestamp(),
        });

        setStatus((prev) => ({ ...prev, failed: prev.failed + 1 }));
        addLog(`✗ Failed to send to ${pass.guest_name}: ${error.message} (Status: ${failureStatus === 'invalid' ? 'Invalid' : 'Failed'})`);
      }

      // Small delay between emails to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    addLog('Email send process completed!');
    setStatus((prev) => ({ ...prev, inProgress: false, current: '' }));
    fetchPasses();
  };

  const handleSheetImport = async () => {
    if (!sheetId.trim()) {
      alert('Please enter a Google Sheet ID');
      return;
    }

    const selectedEvent = events.find((e) => e.id === selectedEventId);
    if (!selectedEvent) {
      alert('Please select an event');
      return;
    }

    // Check if access token exists
    const accessToken = localStorage.getItem('google_access_token');
    if (!accessToken) {
      alert('No Google access token found. Please sign out and sign in again to grant access to Google Sheets.');
      addLog('✗ Failed to import: No access token. Please sign in again.');
      return;
    }

    try {
      addLog(`Reading Google Sheet: ${sheetId}...`);
      const data = await readGoogleSheet(sheetId, sheetRange);
      
      if (!data || data.length === 0) {
        alert('No data found in the sheet');
        return;
      }

      addLog(`Found ${data.length} row(s). Importing...`);

      // Skip header row if it exists (check for 'name' or 'email' in first cells)
      const startRow = (data[0][0]?.toLowerCase().includes('name') || data[0][1]?.toLowerCase().includes('email')) ? 1 : 0;
      let imported = 0;

      for (let i = startRow; i < data.length; i++) {
        const row = data[i];
        
        // Support two formats:
        // Format 1: Name (A), Email (B)
        // Format 2: Email only (A)
        let name = '';
        let email = '';
        
        if (row.length >= 2 && row[1]?.includes('@')) {
          // Format 1: Name in A, Email in B
          name = row[0]?.trim() || '';
          email = row[1]?.trim() || '';
        } else if (row[0]?.includes('@')) {
          // Format 2: Email only in A
          email = row[0]?.trim() || '';
          name = email.split('@')[0]; // Use email prefix as name
        } else {
          continue; // Skip invalid rows
        }
        
        if (!email) continue;

        const { generateUniqueCode } = await import('../utils/qrGenerator');
        const code = generateUniqueCode(selectedEvent.qr_prefix || 'QRP');

        try {
          const passesRef = collection(db, 'passes');
          const docRef = await addDoc(passesRef, {
            event_id: selectedEventId,
            code,
            guest_name: name, // Use actual name from sheet
            guest_email: email,
            sheet_id: sheetId, // Store sheet ID for tracking
            used: false,
            created_at: serverTimestamp(),
          });
          // console.log(`Created pass ${docRef.id} for ${name} (${email})`);
          imported++;
        } catch (error) {
          // console.error(`Error importing ${email}:`, error);
          addLog(`✗ Failed to import ${email}: ${error}`);
        }
      }

      addLog(`✓ Successfully imported ${imported} guests from Google Sheets`);
      alert(`Successfully imported ${imported} guests! Check the Guests page or select the event to see them.`);
      // console.log(`Import complete. Fetching passes for event ${selectedEventId}...`);
      setShowSheetImport(false);
      // Don't clear sheetId so we can use it for tracking
      await fetchPasses(); // Wait for fetch to complete
      // console.log(`Passes refreshed. Current count: ${passes.length}`);
    } catch (error: any) {
      // console.error('Error importing from Google Sheets:', error);
      alert(`Failed to import from Google Sheets: ${error.message}`);
      addLog(`✗ Failed to import: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Send Invitations</h1>
        <p className="text-gray-600">Create and send personalized email invitations with QR passes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Email Configuration</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Event</label>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  disabled={status.inProgress}
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Email Subject"
                placeholder="Your Event Invitation"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={status.inProgress}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Message Body</label>
                <textarea
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all duration-200"
                  placeholder="Email message"
                  rows={8}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={status.inProgress}
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  Use {'{NAME}'} as a placeholder for guest name
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800 mb-1">
                  <strong>Pending Invitations:</strong> {passes.length}
                </p>
                <p className="text-xs text-blue-700">
                  QR passes will be automatically generated and attached to each email
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => setShowSavePreset(true)}
                  variant="secondary"
                  disabled={status.inProgress}
                  className="w-full"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Preset
                </Button>

                <Button
                  onClick={() => setShowPresetList(true)}
                  variant="secondary"
                  disabled={status.inProgress || presets.length === 0}
                  className="w-full"
                >
                  <Bookmark className="w-4 h-4 mr-2" />
                  Load Preset
                </Button>
              </div>

              <Button
                onClick={handleSendEmails}
                disabled={status.inProgress || passes.length === 0}
                isLoading={status.inProgress}
                className="w-full"
              >
                <Send className="w-5 h-5 mr-2" />
                {status.inProgress ? 'Sending...' : `Send ${passes.length} Invitations`}
              </Button>

              <div className="space-y-2">
                <Button
                  onClick={() => setShowSheetImport(true)}
                  variant="secondary"
                  disabled={status.inProgress}
                  className="w-full"
                >
                  <FileSpreadsheet className="w-5 h-5 mr-2" />
                  Import from Google Sheets
                </Button>

                <Button
                  onClick={() => setShowCreateSheet(true)}
                  variant="secondary"
                  disabled={status.inProgress}
                  className="w-full"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Create New Sheet
                </Button>

                {sheetId && (
                  <Button
                    onClick={handleSendWithSheetUpdate}
                    disabled={status.inProgress || passes.length === 0}
                    isLoading={status.inProgress}
                    variant="secondary"
                    className="w-full"
                  >
                    <Mail className="w-5 h-5 mr-2" />
                    Send & Track in Sheet
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {status.inProgress && (
            <Card>
              <CardHeader>
                <h2 className="text-xl font-semibold text-gray-900">Sending Progress</h2>
              </CardHeader>
              <CardBody>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Progress</span>
                      <span className="text-sm font-bold text-gray-900">
                        {status.sent + status.failed} / {status.total}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-yellow-400 to-yellow-500 h-3 rounded-full transition-all duration-300"
                        style={{
                          width: `${((status.sent + status.failed) / status.total) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 p-3 rounded-xl">
                      <div className="flex items-center space-x-2 mb-1">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-gray-700">Sent</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{status.sent}</p>
                    </div>
                    <div className="bg-red-50 p-3 rounded-xl">
                      <div className="flex items-center space-x-2 mb-1">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <span className="text-sm font-medium text-gray-700">Failed</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{status.failed}</p>
                    </div>
                  </div>

                  {status.current && (
                    <div className="bg-gray-50 p-3 rounded-xl">
                      <p className="text-sm text-gray-600">Currently sending to:</p>
                      <p className="text-sm font-medium text-gray-900">{status.current}</p>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Activity Log</h2>
            </CardHeader>
            <CardBody>
              {logs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No activity yet</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={`text-xs p-2 rounded ${
                        log.includes('✓')
                          ? 'bg-green-50 text-green-800'
                          : log.includes('✗')
                          ? 'bg-red-50 text-red-800'
                          : 'bg-gray-50 text-gray-700'
                      }`}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Google Sheets Import Modal */}
      {showSheetImport && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-6 h-6 text-yellow-500" />
                <h2 className="text-xl font-semibold text-gray-900">Import from Google Sheets</h2>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-gray-600">
                Import guest names and emails from Google Sheets. Supports two formats:
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-xs text-gray-700 mb-2"><strong>Format 1 (Recommended):</strong></p>
                <p className="text-xs text-gray-600 mb-1">Column A: Name | Column B: Email</p>
                <p className="text-xs text-gray-700 mt-2"><strong>Format 2:</strong></p>
                <p className="text-xs text-gray-600">Column A: Email only (name auto-generated)</p>
              </div>
              <Input
                label="Google Sheet ID"
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                helperText="Find the ID in your sheet's URL"
              />
              <Input
                label="Sheet Range"
                placeholder="Sheet1!A:B"
                value={sheetRange}
                onChange={(e) => setSheetRange(e.target.value)}
                helperText="Use A:B for Name+Email or A:A for Email only"
              />
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Names from the sheet will be used in {'{NAME}'} placeholder for personalized emails.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> Your Google Sheet must be shared (anyone with the link can view) or you need proper permissions.
                </p>
              </div>
            </CardBody>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowSheetImport(false);
                  setSheetId('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSheetImport}>
                Import Guests
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Create Sheet Modal */}
      {showCreateSheet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Plus className="w-6 h-6 text-yellow-500" />
                <h2 className="text-xl font-semibold text-gray-900">Create New Google Sheet</h2>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-gray-600">
                Create a new Google Sheet with columns for Name, Email, Status, and Timestamp tracking.
              </p>
              
              <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-3">
                <p className="text-xs text-yellow-900 font-semibold mb-1">⚠️ Important:</p>
                <p className="text-xs text-yellow-800">
                  If this is your first time, you need to <strong>sign out and sign in again</strong> to grant full Google Sheets permissions (create/edit).
                </p>
              </div>
              
              <Input
                label="Sheet Name"
                placeholder="Event Email List"
                value={newSheetName}
                onChange={(e) => setNewSheetName(e.target.value)}
                helperText="Choose a descriptive name for your sheet"
              />
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-xs text-green-800">
                  <strong>What happens:</strong> A new sheet will be created in your Google Drive with headers: Name | Email | Status | Timestamp
                </p>
              </div>
            </CardBody>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowCreateSheet(false);
                  setNewSheetName('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateSheet}>
                Create Sheet
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Save Preset Modal */}
      {showSavePreset && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Save className="w-6 h-6 text-yellow-500" />
                <h2 className="text-xl font-semibold text-gray-900">Save Email Preset</h2>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-gray-600">
                Save your current subject and message as a preset for quick reuse.
              </p>
              <Input
                label="Preset Name"
                placeholder="e.g., Event Invitation Template"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                helperText="Give your preset a descriptive name"
              />
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                <p className="text-xs text-gray-700 mb-1"><strong>Current Subject:</strong></p>
                <p className="text-xs text-gray-600 mb-2">{subject}</p>
                <p className="text-xs text-gray-700 mb-1"><strong>Current Message:</strong></p>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{message.substring(0, 100)}...</p>
              </div>
            </CardBody>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowSavePreset(false);
                  setPresetName('');
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSavePreset}>
                Save Preset
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Load Preset Modal */}
      {showPresetList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Bookmark className="w-6 h-6 text-yellow-500" />
                <h2 className="text-xl font-semibold text-gray-900">Load Email Preset</h2>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <p className="text-sm text-gray-600">
                Select a saved preset to load the subject and message.
              </p>
              {presets.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Bookmark className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">No presets saved yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="border border-gray-200 rounded-xl p-3 hover:border-yellow-400 cursor-pointer transition-colors"
                      onClick={() => handleLoadPreset(preset)}
                    >
                      <h3 className="font-medium text-gray-900 mb-1">{preset.name}</h3>
                      <p className="text-xs text-gray-600 mb-1">
                        <strong>Subject:</strong> {preset.subject}
                      </p>
                      <p className="text-xs text-gray-500">
                        {preset.message.substring(0, 60)}...
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowPresetList(false)}
              >
                Close
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
