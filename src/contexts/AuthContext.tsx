import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  auth,
  fetchAdminProfile as fbFetchAdminProfile,
  provider,
  signInWithPopupFn,
  signInWithRedirectFn,
} from '../lib/firebase';
import { getRedirectResult, signInWithEmailAndPassword, createUserWithEmailAndPassword, linkWithPopup } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

type AuthContextType = {
  user: FirebaseUser | null;
  admin: any | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  linkGoogleAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  isSuperAdmin: boolean;
  isScannerAdmin: boolean;
  hasGoogleLinked: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [admin, setAdmin] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for redirect result first (when user comes back from OAuth)
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          // User just signed in via redirect
          // console.log('Redirect sign-in successful:', result.user);
        }
      })
      .catch((error) => {
        // console.error('Error getting redirect result:', error);
      });

    // Subscribe to Firebase auth state changes
    const unsubscribe = auth.onAuthStateChanged((u: FirebaseUser | null) => {
      // console.log('Auth state changed:', u ? `User ${u.uid}` : 'No user');
      setUser(u ?? null);
      if (u) {
        fetchAdminProfile(u.uid);
      } else {
        setAdmin(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchAdminProfile = async (userId: string) => {
    try {
      // console.log('Fetching admin profile for user:', userId);
      const data = await fbFetchAdminProfile(userId);
      // console.log('Admin profile fetched:', data);
      setAdmin(data ?? null);
    } catch (error) {
      // console.error('Error fetching admin profile:', error);
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    // Use Firebase Google Sign-In with popup (more reliable for dev/localhost)
    try {
      // add required scopes
      provider.addScope('email');
      provider.addScope('profile');
      provider.addScope('https://www.googleapis.com/auth/spreadsheets'); // Full access for create/read/write
      provider.addScope('https://www.googleapis.com/auth/gmail.send');

      // Try popup first (works better for localhost)
      try {
        const result = await signInWithPopupFn(auth, provider as any);
        // console.log('Google sign-in successful:', result.user);
        
        // Check if admin profile exists
        const adminProfile = await fbFetchAdminProfile(result.user.uid);
        
        if (!adminProfile) {
          // No admin profile found - sign out and reject
          await auth.signOut();
          throw new Error('Access denied. Contact your administrator to get an account.');
        }
        
        // Store the access token for Google APIs
        const credential = (await import('firebase/auth')).GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          localStorage.setItem('google_access_token', credential.accessToken);
          // console.log('Google access token stored');
          
          // Update admin profile to mark Google as linked
          const { doc, setDoc } = await import('firebase/firestore');
          const adminRef = doc(db, 'admins', result.user.uid);
          await setDoc(adminRef, {
            google_linked: true,
          }, { merge: true });
        }
        
        // onAuthStateChanged will handle the rest
      } catch (popupError: any) {
        // If popup fails or is blocked, provide clear feedback
        const msg = String(popupError?.message ?? popupError ?? '');
        
        if (msg.includes('popup-blocked') || msg.includes('popup-closed-by-user')) {
          alert('Popup was blocked. Please allow popups for this site or try again.');
          throw popupError;
        }
        
        if (msg.includes('provider is not enabled') || msg.includes('Unsupported provider')) {
          alert(
            'OAuth provider is not enabled. Enable the Google provider in your Firebase Console (Authentication → Sign-in method) and ensure the OAuth client and redirect domains are configured.'
          );
          throw popupError;
        }

        // If popup truly doesn't work, fall back to redirect
        // console.log('Popup failed, trying redirect:', popupError);
        await signInWithRedirectFn(auth, provider as any);
        // After redirect, the page will reload and getRedirectResult will handle it
      }
    } catch (error: any) {
      // console.error('Error signing in with Google:', error);
      const fallbackMsg = String(error?.message ?? error ?? '');
      if (fallbackMsg.includes('provider is not enabled') || fallbackMsg.includes('Unsupported provider')) {
        alert(
          'OAuth provider is not enabled. Enable the Google provider in your Firebase Console (Authentication → Sign-in method) and ensure the OAuth client and redirect domains are configured.'
        );
      }
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      // console.log('Email sign-in successful:', result.user);
      // onAuthStateChanged will handle the rest
    } catch (error: any) {
      // console.error('Error signing in with email:', error);
      if (error.code === 'auth/user-not-found') {
        throw new Error('No account found with this email');
      } else if (error.code === 'auth/wrong-password') {
        throw new Error('Incorrect password');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address');
      }
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    try {
      // Create Firebase Auth user
      const result = await createUserWithEmailAndPassword(auth, email, password);
      // console.log('Email sign-up successful:', result.user);
      
      // Create admin profile in Firestore (scanner_admin by default)
      const adminRef = doc(db, 'admins', result.user.uid);
      await setDoc(adminRef, {
        email: email,
        name: name,
        role: 'scanner_admin',
        created_at: serverTimestamp(),
        google_linked: false,
      });
      
      // console.log('Admin profile created');
      // onAuthStateChanged will fetch the profile
    } catch (error: any) {
      // console.error('Error signing up with email:', error);
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('Email already in use');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password should be at least 6 characters');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Invalid email address');
      }
      throw error;
    }
  };

  const linkGoogleAccount = async () => {
    if (!user) {
      throw new Error('No user signed in');
    }

    try {
      // Add Google OAuth scopes
      provider.addScope('email');
      provider.addScope('profile');
      provider.addScope('https://www.googleapis.com/auth/spreadsheets');
      provider.addScope('https://www.googleapis.com/auth/gmail.send');

      // Link Google account to current user
      const result = await linkWithPopup(user, provider as any);
      // console.log('Google account linked:', result.user);
      
      // Store the access token for Google APIs
      const credential = (await import('firebase/auth')).GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        localStorage.setItem('google_access_token', credential.accessToken);
        // console.log('Google access token stored');
      }

      // Update admin profile to mark Google as linked
      const adminRef = doc(db, 'admins', user.uid);
      await setDoc(adminRef, {
        google_linked: true,
      }, { merge: true });

      // Refresh admin profile
      await fetchAdminProfile(user.uid);
    } catch (error: any) {
      // console.error('Error linking Google account:', error);
      if (error.code === 'auth/provider-already-linked') {
        throw new Error('Google account already linked');
      } else if (error.code === 'auth/credential-already-in-use') {
        throw new Error('This Google account is already linked to another user');
      }
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await auth.signOut();
      setUser(null);
      setAdmin(null);
    } catch (error) {
      // console.error('Error signing out:', error);
      throw error;
    }
  };

  const value = {
    user,
    admin,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    linkGoogleAccount,
    signOut,
    isSuperAdmin: admin?.role === 'super_admin',
    isScannerAdmin: admin?.role === 'scanner_admin',
    hasGoogleLinked: !!(admin?.google_linked === true || user?.providerData.some((p: any) => p.providerId === 'google.com')),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
