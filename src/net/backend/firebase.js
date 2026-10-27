import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, getAuth, linkWithPopup, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut
} from 'firebase/auth';
import {
  arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, getFirestore, limit, query, runTransaction,
  setDoc, updateDoc, where
} from 'firebase/firestore';
import { getDatabase, onChildAdded, onDisconnect, push, ref, remove, serverTimestamp } from 'firebase/database';
import { freeSeats } from '../../../shared/lobby/directory.ts';

const LOBBIES = 'lobbies';
const USERS = 'users';
const PROMO_CODES = 'promoCodes';
const OPEN_LOBBY_LIMIT = 25;
/** Mail older than this is from an earlier session (a stale offer); it is dropped unread. */
const MAIL_MAX_AGE_MS = 60_000;

/** Resolves with the signed-in user, signing in anonymously when nobody is (play needs no account). */
function currentUser(auth) {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      stop();
      if (user) resolve(user);
      else signInAnonymously(auth).then((credential) => resolve(credential.user), reject);
    }, reject);
  });
}

/**
 * Firebase backend. Peer id = Firebase Auth uid (anonymous until the player links Google), so security
 * rules can check who wrote what. Firestore holds the lobby directory and player profiles; the Realtime
 * Database carries the mailbox (WebRTC offers/answers, and relayed traffic when a direct link fails).
 */
export async function createFirebaseBackend(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const database = getDatabase(app);
  let user = await currentUser(auth);
  const lobby = (code) => doc(firestore, LOBBIES, code);

  const directory = {
    async get(code) {
      const snap = await getDoc(lobby(code));
      return snap.exists() ? snap.data() : null;
    },
    async listOpen() {
      const snap = await getDocs(query(collection(firestore, LOBBIES), where('open', '==', true), limit(OPEN_LOBBY_LIMIT)));
      return snap.docs.map((d) => d.data()).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    publish: (entry) => setDoc(lobby(entry.code), entry),
    update: (code, patch) => updateDoc(lobby(code), patch),
    remove: (code) => deleteDoc(lobby(code)),
    reserve: (code, peerId, expiresAt, now) =>
      runTransaction(firestore, async (tx) => {
        const snap = await tx.get(lobby(code));
        if (!snap.exists() || freeSeats(snap.data(), now, peerId) <= 0) return false;
        tx.update(lobby(code), { [`reservations.${peerId}`]: expiresAt });
        return true;
      }),
    async release(code, peerId) {
      await updateDoc(lobby(code), { [`reservations.${peerId}`]: deleteField() }).catch(() => {});
    }
  };

  const mailbox = {
    send(to, payload) {
      return push(ref(database, `mail/${to}`), { from: user.uid, p: JSON.stringify(payload), at: serverTimestamp() });
    },
    listen(handler) {
      const inbox = ref(database, `mail/${user.uid}`);
      void onDisconnect(inbox).remove();
      return onChildAdded(inbox, (snap) => {
        const mail = snap.val();
        void remove(snap.ref);
        if (!mail || typeof mail.p !== 'string' || Date.now() - (mail.at ?? 0) > MAIL_MAX_AGE_MS) return;
        try {
          handler(mail.from, JSON.parse(mail.p));
        } catch (error) {
          console.warn('[mailbox] bad message', error);
        }
      });
    }
  };

  const listeners = new Set();
  onAuthStateChanged(auth, (next) => {
    if (!next) return;
    user = next;
    for (const listener of listeners) listener(account.user());
  });

  const profileRef = () => doc(firestore, USERS, user.uid);
  const account = {
    user: () => ({ uid: user.uid, anonymous: user.isAnonymous, name: user.displayName ?? '', email: user.email ?? '' }),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Keep the anonymous uid (and its profile) by linking Google to it; fall back to a plain sign-in if that Google account already exists. */
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider();
      try {
        await linkWithPopup(user, provider);
      } catch (error) {
        if (error?.code !== 'auth/credential-already-in-use' && error?.code !== 'auth/provider-already-linked') throw error;
        await signInWithPopup(auth, provider);
      }
      user = auth.currentUser;
      return account.user();
    },
    async signOut() {
      await signOut(auth);
      user = (await signInAnonymously(auth)).user;
      return account.user();
    },
    async loadProfile() {
      const snap = await getDoc(profileRef());
      return snap.exists() ? snap.data() : null;
    },
    saveProfile: (profile) => setDoc(profileRef(), profile, { merge: true }),
    /**
     * Server-checked promo: the code's hash must exist in promoCodes (rules allow single gets only, so
     * the list stays hidden). Returns the unlocked vehicle id, or null for an unknown code.
     */
    async redeemPromo(hash) {
      const snap = await getDoc(doc(firestore, PROMO_CODES, hash)).catch(() => null);
      const vehicleId = snap?.exists() ? snap.data().vehicleId : null;
      if (!vehicleId) return null;
      await setDoc(profileRef(), { unlockedVehicles: arrayUnion(vehicleId), lastPromo: hash }, { merge: true });
      return vehicleId;
    }
  };

  return { kind: 'firebase', get peerId() { return user.uid; }, directory, mailbox, account };
}
