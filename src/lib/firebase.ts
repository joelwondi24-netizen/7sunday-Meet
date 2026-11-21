import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import defaultFirebaseConfig from '../../firebase-applet-config.json';

const env = import.meta.env as Record<string, string | undefined>;

const cleanEnv = (val?: string): string => (val ? val.trim() : '');
const normalizeDomain = (val?: string): string =>
  cleanEnv(val)
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .trim();

const projectId = cleanEnv(env.VITE_FIREBASE_PROJECT_ID) || defaultFirebaseConfig.projectId;
const explicitAuthDomain = normalizeDomain(env.VITE_FIREBASE_AUTH_DOMAIN);
const defaultAuthDomain =
  projectId === defaultFirebaseConfig.projectId
    ? normalizeDomain(defaultFirebaseConfig.authDomain) || `${projectId}.firebaseapp.com`
    : `${projectId}.firebaseapp.com`;

export const activeFirebaseConfig = {
  projectId,
  appId: cleanEnv(env.VITE_FIREBASE_APP_ID) || defaultFirebaseConfig.appId,
  apiKey: cleanEnv(env.VITE_FIREBASE_API_KEY) || defaultFirebaseConfig.apiKey,
  authDomain: explicitAuthDomain || defaultAuthDomain,
  firestoreDatabaseId: cleanEnv(env.VITE_FIREBASE_DATABASE_ID) || defaultFirebaseConfig.firestoreDatabaseId,
  storageBucket: cleanEnv(env.VITE_FIREBASE_STORAGE_BUCKET) || defaultFirebaseConfig.storageBucket,
  messagingSenderId: cleanEnv(env.VITE_FIREBASE_MESSAGING_SENDER_ID) || defaultFirebaseConfig.messagingSenderId,
};

const app = initializeApp(activeFirebaseConfig);

export const db =
  activeFirebaseConfig.firestoreDatabaseId && activeFirebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, activeFirebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export const BOOTSTRAP_ADMIN_EMAIL = 'joelwondi24@gmail.com';
export const CORPORATE_EMAIL_DOMAIN = 'sevensundayethiopia.com';

export async function testFirestoreConnection(): Promise<{ ok: boolean; offline?: boolean }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firestore connection failed: client is offline. Check firebase-applet-config.json.');
      return { ok: false, offline: true };
    }
    // Permission denied on unauthenticated boot proves server reachability
    return { ok: true };
  }
}

testFirestoreConnection();
