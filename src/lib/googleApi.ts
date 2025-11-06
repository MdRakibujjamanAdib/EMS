import { auth } from './firebase';

// Get the access token from Firebase Auth (Google OAuth)
async function getAccessToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) {
    // console.error('No user signed in');
    return null;
  }

  try {
    // For OAuth providers, the access token is stored in localStorage during sign-in
    const accessToken = localStorage.getItem('google_access_token');
    
    // console.log('Access token check:', accessToken ? `Token exists (${accessToken.substring(0, 20)}...)` : 'No token found');
    
    if (!accessToken) {
      // console.error('No Google access token found. User needs to sign in again with correct scopes.');
      return null;
    }
    
    return accessToken;
  } catch (error) {
    // console.error('Error getting access token:', error);
    return null;
  }
}

// Google Sheets API - Read data from a spreadsheet
export async function readGoogleSheet(
  spreadsheetId: string,
  range: string = 'Sheet1!A:B'
): Promise<string[][] | null> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available. Please sign out and sign in again to grant Google Sheets access.');
    }

    // Encode the range properly for URL
    const encodedRange = encodeURIComponent(range);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}`;
    
    // console.log('Fetching sheet data from:', url);
    // console.log('Using access token:', accessToken.substring(0, 20) + '...');
    
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        mode: 'cors',
      });
    } catch (fetchError) {
      // console.error('Network fetch error:', fetchError);
      throw new Error(`Network error: Unable to connect to Google Sheets API. Please check your internet connection. Details: ${fetchError}`);
    }

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const error = await response.json();
        // console.error('Sheets API error:', error);
        errorMessage = error.error?.message || errorMessage;
        
        // Check for common auth errors
        if (response.status === 401) {
          throw new Error('Access token expired or invalid. Please sign out and sign in again.');
        }
        if (response.status === 403) {
          throw new Error('Permission denied. Make sure the spreadsheet is shared with your account or is publicly accessible.');
        }
      } catch (e) {
        // Error parsing JSON
      }
      throw new Error(`Failed to read sheet (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();
    // console.log('Sheet data received:', data);
    return data.values || [];
  } catch (error) {
    // console.error('Error reading Google Sheet:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to import from Google Sheets. Check console for details.');
  }
}

// Update Google Sheet - Write status and timestamp back to the sheet
export async function updateGoogleSheet(
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<boolean> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    const encodedRange = encodeURIComponent(range);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`;
    
    // console.log('Updating sheet range:', range, 'with values:', values);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: values,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      // console.error('Sheets update error:', error);
      throw new Error(`Failed to update sheet: ${error.error?.message || response.statusText}`);
    }

    // console.log('Sheet updated successfully');
    return true;
  } catch (error) {
    // console.error('Error updating Google Sheet:', error);
    throw error;
  }
}

// Create a new Google Sheet
export async function createGoogleSheet(title: string): Promise<string> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: title,
        },
        sheets: [
          {
            properties: {
              title: 'Email List',
              gridProperties: {
                rowCount: 1000,
                columnCount: 4,
              },
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      // console.error('Sheet creation error:', error);
      throw new Error(`Failed to create sheet: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    // console.log('Sheet created:', data);
    
    // Add headers to the new sheet
    await updateGoogleSheet(data.spreadsheetId, 'Email List!A1:D1', [
      ['Name', 'Email', 'Status', 'Timestamp'],
    ]);
    
    return data.spreadsheetId;
  } catch (error) {
    // console.error('Error creating Google Sheet:', error);
    throw error;
  }
}

// Gmail API - Send an email
export async function sendGmail(params: {
  to: string;
  subject: string;
  body: string;
  html?: string;
}): Promise<boolean> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }

    // Create the email message in RFC 2822 format
    const messageParts = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      '',
      params.html || params.body,
    ];

    const message = messageParts.join('\r\n');
    
    // Encode the message in base64url format
    const encodedMessage = btoa(unescape(encodeURIComponent(message)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        raw: encodedMessage,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      // console.error('Gmail API error:', error);
      
      // Extract more specific error messages
      let errorMessage = error.error?.message || response.statusText;
      
      // Check for specific Gmail errors
      if (errorMessage.includes('Invalid to header') || 
          errorMessage.includes('Recipient address rejected') ||
          errorMessage.includes('Invalid recipients')) {
        throw new Error('Invalid email address - Recipient address rejected');
      } else if (errorMessage.includes('Address not found')) {
        throw new Error('Address not found - Invalid email address');
      } else if (errorMessage.includes('Daily sending quota exceeded')) {
        throw new Error('Daily sending quota exceeded - Try again tomorrow');
      }
      
      throw new Error(`Failed to send email: ${errorMessage}`);
    }

    return true;
  } catch (error) {
    // console.error('Error sending Gmail:', error);
    throw error;
  }
}

// Helper to generate HTML email with QR code
export function generateInvitationHTML(params: {
  guestName: string;
  eventTitle: string;
  eventDescription?: string;
  message: string;
  qrCodeDataUrl: string;
  bgColor?: string;
  accentColor?: string;
}): string {
  const {
    guestName,
    eventTitle,
    eventDescription,
    message,
    qrCodeDataUrl,
    bgColor = '#ffffff',
    accentColor = '#FFD43B',
  } = params;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${eventTitle} - Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f7;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: ${bgColor}; border-radius: 24px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #1a1a1a; font-size: 32px; font-weight: bold;">${eventTitle}</h1>
              ${eventDescription ? `<p style="margin: 10px 0 0; color: #333; font-size: 16px;">${eventDescription}</p>` : ''}
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${message.replace('{NAME}', guestName)}</p>
              
              <!-- QR Code -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center" style="background-color: #f9f9f9; padding: 30px; border-radius: 16px;">
                    <p style="margin: 0 0 20px; color: #666; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your QR Pass</p>
                    <img src="${qrCodeDataUrl}" alt="QR Code" style="width: 250px; height: 250px; display: block; margin: 0 auto;" />
                    <p style="margin: 20px 0 0; color: #999; font-size: 12px;">Show this QR code at the entrance</p>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #666; font-size: 14px; line-height: 1.6;">
                Please save this email or take a screenshot of the QR code. You'll need it to enter the event.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0; color: #999; font-size: 12px;">Powered by Mangrove Esports</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
