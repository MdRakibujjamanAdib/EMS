import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  signInWithPopup,
  signOut as fbSignOut,
  setPersistence,
  browserLocalPersistence,
  type User,
} from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validate Firebase config before initializing
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error(
    'Missing Firebase configuration. Please add the following environment variables to your .env file:\n' +
    '  VITE_FIREBASE_API_KEY\n' +
    '  VITE_FIREBASE_AUTH_DOMAIN\n' +
    '  VITE_FIREBASE_PROJECT_ID\n' +
    '  VITE_FIREBASE_STORAGE_BUCKET\n' +
    '  VITE_FIREBASE_MESSAGING_SENDER_ID\n' +
    '  VITE_FIREBASE_APP_ID\n' +
    'Get these values from Firebase Console → Project Settings → Your apps → SDK setup and configuration.'
  );
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app) as any;

// Set persistence to LOCAL (keeps user signed in across browser sessions)
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    // console.log('Firebase auth persistence set to LOCAL');
  })
  .catch((error) => {
    // console.error('Error setting auth persistence:', error);
  });

export const provider = new GoogleAuthProvider();
export const signInWithRedirectFn = signInWithRedirect;
export const signInWithPopupFn = signInWithPopup;
export const signOutFn = fbSignOut;

export const db = getFirestore(app);

export async function fetchAdminProfile(userId: string) {
  try {
    // First try to get admin document by document ID (userId)
    const adminDocRef = doc(db, 'admins', userId);
    const adminDoc = await getDoc(adminDocRef);
    
    if (adminDoc.exists()) {
      return { id: adminDoc.id, ...adminDoc.data() };
    }
    
    // If not found by doc ID, try querying by 'id' field (legacy)
    const q = query(collection(db, 'admins'), where('id', '==', userId));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      return snap.docs[0].data();
    }
    
    // If no admin profile exists, create a basic one for first-time users
    // console.log('No admin profile found, creating basic profile for user:', userId);
    const newAdmin = {
      id: userId,
      email: '', // Will be populated from auth
      role: 'scanner_admin', // Default role - can be upgraded by super_admin
      created_at: new Date().toISOString(),
    };
    
    await setDoc(adminDocRef, newAdmin);
    return newAdmin;
  } catch (err) {
    // console.error('Error fetching admin profile from Firestore', err);
    throw err;
  }
}

export type FirebaseUser = User;

// Export convenience functions similar to Firebase SDK surface used in AuthContext
export default app;
