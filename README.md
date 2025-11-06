# QR Pass – Event Invitation & Entry Management Solution

A professional web application for managing event invitations, generating QR passes, and validating entries in real-time.

## Features

### Core Functionality
- **Event Management** - Create and manage multiple events with custom branding
- **Guest Management** - Add guests individually or bulk import from lists
- **QR Code Generation** - Automatic unique QR code generation with custom prefixes
- **Email Invitations** - Send personalized invitations with QR pass attachments
- **Real-time Scanning** - Camera-based QR code validation at entry gates
- **Analytics Dashboard** - Complete event statistics and reporting
- **Role-Based Access** - Super Admin and Scanner Admin roles

### Admin Roles
- **Super Admin**: Full system access including event creation, guest management, email sending, and scanning
- **Scanner Admin**: Limited access to scanning and viewing analytics only

## Technology Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS (iOS 16-inspired design)
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Authentication**: Supabase Auth with Google Sign-In
- **QR Code**: qrcode library for generation, qr-scanner for validation
- **Icons**: Lucide React

## Setup Instructions

### 1. Prerequisites
- Node.js 18+ installed
- A Supabase account and project
- Google OAuth credentials (optional for Google Sign-In)

### 2. Clone and Install
```bash
git clone <repository-url>
cd qr-pass
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Get these from your Supabase project settings: Settings > API

### 4. Database Setup
The database schema has already been migrated. The following tables are created:
- `admins` - Admin users with roles
- `events` - Event configurations
- `passes` - Generated QR passes for guests
- `scan_logs` - Audit trail of all scans
- `email_logs` - Email delivery tracking

### 5. Configure Authentication
In your Supabase dashboard:
1. Go to Authentication > Providers
2. Enable Google provider
3. Add your Google OAuth credentials
4. Add authorized redirect URLs

### 6. Create Your First Admin
After the database is set up, manually insert your first super admin:
```sql
INSERT INTO admins (id, email, role)
VALUES ('your-auth-user-id', 'your-email@example.com', 'super_admin');
```

You can get your user ID after signing in with Google for the first time by checking the auth.users table.

### 7. Run the Application
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Usage Guide

### Creating an Event
1. Navigate to **Events** page
2. Click **Create Event**
3. Fill in event details:
   - Event Title
   - Description
   - QR Code Prefix (4 characters)
   - Background and Accent Colors
4. Click **Create**

### Adding Guests
1. Navigate to **Guests** page
2. Select an event from the dropdown
3. Options:
   - **Add Guest**: Add individual guests with name and email
   - **Bulk Import**: Import multiple guests (format: Name, Email per line)
4. QR codes are automatically generated for each guest

### Sending Invitations
1. Navigate to **Send Invitations** page
2. Select the event
3. Customize email subject and message
   - Use `{NAME}` placeholder for personalized guest names
4. Click **Send Invitations**
5. Monitor progress in real-time

### Scanning Passes
1. Navigate to **Scanner** page
2. Click **Start Scanning**
3. Allow camera permissions
4. Point camera at guest's QR code
5. System shows:
   - ✅ **Valid**: First-time scan, access granted
   - ⚠️ **Already Used**: Pass already scanned
   - ❌ **Invalid**: Unknown or invalid code

### Viewing Analytics
1. Navigate to **Analytics** page
2. View statistics:
   - Total passes generated
   - Emails sent/failed
   - Entries scanned
   - Invalid/duplicate scans
3. Export data to CSV

### Managing Admins
1. Navigate to **Admin Settings** (Super Admin only)
2. Add new admins with specific roles
3. Change roles or remove admins

## Security Features

- **Row Level Security (RLS)** enabled on all tables
- **Role-based access control** for different admin types
- **Audit logging** for all scan attempts
- **Unique QR codes** to prevent duplication
- **Session management** with auto-refresh

## Design Philosophy

The application follows iOS 16 design principles:
- Clean, minimal white interface
- Rounded corners and soft shadows
- Smooth transitions and animations
- Yellow accent color for primary actions
- Excellent readability and contrast
- Mobile-responsive layouts

## Database Schema

### Tables
- **admins**: User accounts with role permissions
- **events**: Event configurations and branding
- **passes**: Guest QR passes with status tracking
- **scan_logs**: Complete audit trail of all scans
- **email_logs**: Email delivery status tracking

All tables have proper foreign key relationships and indexes for optimal performance.

## API Integration Notes

While this application is designed to integrate with Google Sheets and Gmail APIs:
- Current implementation uses manual guest import
- Email sending is simulated (production would use Gmail API)
- Google Sheets integration can be added via OAuth2 tokens

## Troubleshooting

### Camera Not Working
- Ensure HTTPS or localhost
- Grant camera permissions
- Check browser compatibility

### Login Issues
- Verify Supabase credentials
- Check Google OAuth configuration
- Ensure admin record exists in database

### Build Errors
```bash
npm install
npm run build
```

## License

All rights reserved. QR Pass © 2025

## Support

For issues or questions, please contact the development team.
