import { useEffect, useState, useRef } from 'react';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Event } from '../lib/types';
import { db } from '../lib/firebase';
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { Upload, Download, Image as ImageIcon, Palette, Save } from 'lucide-react';

export function QREditor() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [bgImagePreview, setBgImagePreview] = useState<string>('');
  const [qrSize, setQrSize] = useState(200);
  const [logoSize, setLogoSize] = useState(50);
  const [templateName, setTemplateName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      generatePreview();
    }
  }, [selectedEventId, logoPreview, bgImagePreview, qrSize, logoSize]);

  const fetchEvents = async () => {
    try {
      const eventsRef = collection(db, 'events');
      const q = query(eventsRef, orderBy('created_at', 'desc'));
      const snapshot = await getDocs(q);
      
      const eventsData = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      } as Event));
      
      setEvents(eventsData);
      if (eventsData.length > 0) {
        setSelectedEventId(eventsData[0].id);
      }
    } catch (error) {
      // console.error('Error fetching events:', error);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setBgImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const generatePreview = async () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const selectedEvent = events.find(e => e.id === selectedEventId);
    if (!selectedEvent) return;

    // Set canvas size
    canvas.width = 600;
    canvas.height = 800;

    // Draw background
    if (bgImagePreview) {
      const bgImg = new Image();
      bgImg.onload = () => {
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
        drawContent();
      };
      bgImg.src = bgImagePreview;
    } else {
      ctx.fillStyle = selectedEvent.bg_color || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawContent();
    }

    function drawContent() {
      if (!ctx) return;

      // Draw event title
      ctx.fillStyle = selectedEvent?.accent_color || '#000000';
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(selectedEvent?.title || 'Event Title', canvas.width / 2, 80);

      // Draw QR code placeholder (white box)
      const qrX = (canvas.width - qrSize) / 2;
      const qrY = 150;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(qrX, qrY, qrSize, qrSize);
      
      // Draw QR border
      ctx.strokeStyle = selectedEvent?.accent_color || '#000000';
      ctx.lineWidth = 3;
      ctx.strokeRect(qrX, qrY, qrSize, qrSize);

      // Draw placeholder QR text
      ctx.fillStyle = '#cccccc';
      ctx.font = '16px Arial';
      ctx.fillText('QR Code', canvas.width / 2, qrY + qrSize / 2);

      // Draw logo overlay on QR if exists
      if (logoPreview) {
        const logoImg = new Image();
        logoImg.onload = () => {
          const logoX = (canvas.width - logoSize) / 2;
          const logoY = qrY + (qrSize - logoSize) / 2;
          
          // Draw white background for logo
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(logoX - 5, logoY - 5, logoSize + 10, logoSize + 10);
          
          // Draw logo
          ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        };
        logoImg.src = logoPreview;
      }

      // Draw event info
      ctx.fillStyle = '#333333';
      ctx.font = '18px Arial';
      ctx.fillText(selectedEvent?.description || 'Event Description', canvas.width / 2, qrY + qrSize + 50);
      
      ctx.font = '14px Arial';
      ctx.fillStyle = '#666666';
      ctx.fillText('Scan this QR code at the event entrance', canvas.width / 2, qrY + qrSize + 80);
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `qr-template-${selectedEventId}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    try {
      const templatesRef = collection(db, 'qr_templates');
      await addDoc(templatesRef, {
        name: templateName,
        event_id: selectedEventId,
        logo_url: logoPreview,
        bg_image_url: bgImagePreview,
        qr_size: qrSize,
        logo_size: logoSize,
        created_at: serverTimestamp(),
      });

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        setShowSaveModal(false);
        setTemplateName('');
      }, 2000);
    } catch (error) {
      // console.error('Error saving template:', error);
      alert('Failed to save template');
    }
  };

  const selectedEvent = events.find(e => e.id === selectedEventId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">QR Pass Editor</h1>
        <p className="text-gray-600">Customize your QR pass design with logo and background</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor Controls */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Design Settings</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Event
                </label>
                <select
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <ImageIcon className="w-4 h-4 inline mr-1" />
                  Logo (Center of QR)
                </label>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => logoInputRef.current?.click()}
                  variant="secondary"
                  className="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {logoPreview ? 'Change Logo' : 'Upload Logo'}
                </Button>
                {logoPreview && (
                  <div className="mt-2">
                    <img src={logoPreview} alt="Logo preview" className="w-20 h-20 object-contain mx-auto border rounded" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo Size: {logoSize}px
                </label>
                <input
                  type="range"
                  min="30"
                  max="100"
                  value={logoSize}
                  onChange={(e) => setLogoSize(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Palette className="w-4 h-4 inline mr-1" />
                  Background Image
                </label>
                <input
                  ref={bgInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBgImageUpload}
                  className="hidden"
                />
                <Button
                  onClick={() => bgInputRef.current?.click()}
                  variant="secondary"
                  className="w-full"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {bgImagePreview ? 'Change Background' : 'Upload Background'}
                </Button>
                {bgImagePreview && (
                  <div className="mt-2">
                    <img src={bgImagePreview} alt="Background preview" className="w-full h-32 object-cover rounded" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  QR Code Size: {qrSize}px
                </label>
                <input
                  type="range"
                  min="150"
                  max="300"
                  value={qrSize}
                  onChange={(e) => setQrSize(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="pt-4">
                <Button onClick={handleDownload} className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Event Colors</h2>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Background Color
                  </label>
                  <div
                    className="w-full h-12 rounded-lg border-2 border-gray-300"
                    style={{ backgroundColor: selectedEvent?.bg_color || '#ffffff' }}
                  />
                  <p className="text-xs text-gray-500 mt-1">{selectedEvent?.bg_color || '#ffffff'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Accent Color
                  </label>
                  <div
                    className="w-full h-12 rounded-lg border-2 border-gray-300"
                    style={{ backgroundColor: selectedEvent?.accent_color || '#000000' }}
                  />
                  <p className="text-xs text-gray-500 mt-1">{selectedEvent?.accent_color || '#000000'}</p>
                </div>
              </div>
              <p className="text-xs text-gray-600">
                Edit colors in the Events page to update the design
              </p>
            </CardBody>
          </Card>
        </div>

        {/* Preview */}
        <div>
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">Preview</h2>
            </CardHeader>
            <CardBody>
              <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  className="border-2 border-gray-300 rounded-lg shadow-lg max-w-full h-auto"
                  style={{ maxHeight: '600px' }}
                />
              </div>
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> This is a template preview. The actual QR code will be generated when sending invitations.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
