import { Injectable, isDevMode, signal } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { Firestore, connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { Functions, connectFunctionsEmulator, getFunctions } from 'firebase/functions';

/**
 * Firebase project configuration.
 * For local development the emulators are used and the demo- project needs no
 * real credentials. For production, replace with your Firebase web app config
 * (Firebase console > Project settings > Your apps).
 */
const firebaseConfig = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-wiezen.firebaseapp.com',
  projectId: 'demo-wiezen',
};

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly firestore: Firestore;
  readonly functions: Functions;

  /** Current anonymous uid; null until sign-in completes. */
  readonly uid = signal<string | null>(null);

  constructor() {
    this.app = initializeApp(firebaseConfig);
    this.auth = getAuth(this.app);
    this.firestore = getFirestore(this.app);
    this.functions = getFunctions(this.app, 'europe-west1');

    if (isDevMode()) {
      connectAuthEmulator(this.auth, 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(this.firestore, 'localhost', 8080);
      connectFunctionsEmulator(this.functions, 'localhost', 5001);
    }

    onAuthStateChanged(this.auth, (user) => this.uid.set(user?.uid ?? null));
    signInAnonymously(this.auth).catch((e) => console.error('anonymous sign-in failed', e));
  }
}
