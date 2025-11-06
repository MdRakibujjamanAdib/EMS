// TypeScript type definitions for the application
// Used across all components and pages for type safety

export type Admin = {
  id: string;
  email: string;
  role: 'super_admin' | 'scanner_admin';
  google_tokens?: any;
  created_at?: string;
};

export type Event = {
  id: string;
  admin_id: string;
  title: string;
  description?: string;
  logo_url?: string;
  bg_image_url?: string;
  bg_color?: string;
  accent_color?: string;
  qr_prefix?: string;
  created_at?: string;
  updated_at?: string;
};

export type Pass = {
  id: string;
  event_id: string;
  code: string;
  guest_name: string;
  guest_email: string;
  sheet_id?: string;
  sent_at?: string;
  used?: boolean;
  scanned_at?: string;
  scanned_by?: string;
  pdf_url?: string;
  created_at?: string;
};

export type ScanLog = {
  id: string;
  pass_id?: string;
  scanned_code: string;
  scanner_id: string;
  status: 'valid' | 'already_used' | 'invalid';
  scanned_at?: string;
  event_id?: string;
};

export type EmailLog = {
  id: string;
  pass_id: string;
  event_id: string;
  recipient_email: string;
  subject?: string;
  status?: 'sent' | 'failed' | 'pending';
  error_message?: string;
  sent_at?: string;
};

// Minimal migration shim: export a `supabase` object that throws useful error messages
// when app code still tries to call Supabase-specific methods. Gradually replace these
// usages with Firestore equivalents.
export const supabase = new Proxy(
  {},
  {
    get() {
      return () => {
        throw new Error(
          'Supabase has been removed. Migrate database calls to Firestore in src/lib/firebase.ts and update page code.'
        );
      };
    },
  }
);
