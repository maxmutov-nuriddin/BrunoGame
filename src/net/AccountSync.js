import { sanitizeName } from '../../shared/net/protocol.ts';
import { findVehicle } from '../../shared/vehicles.ts';

const PUSH_DELAY_MS = 1500;
const SYNCED_KEYS = new Set(['name', 'vehicleId']);

/**
 * Keeps the player's profile (name, chosen car, promo unlocks) on their Firebase account, so it follows
 * them to other devices once they sign in with Google. Local settings stay the source of truth offline;
 * unlocks only ever grow (security rules allow adding one only through a valid promo code).
 */
export default class AccountSync {
  constructor(online, settings) {
    this.online = online;
    this.settings = settings;
    this.timer = null;
  }

  /** Begin after the game has loaded; does nothing without Firebase or internet. */
  start() {
    if (this.online.kind !== 'firebase') return;
    this.settings.addEventListener('change', (event) => {
      if (!SYNCED_KEYS.has(event.detail.key)) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.push(), PUSH_DELAY_MS);
    });
    const later = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 2000));
    later(() => navigator.onLine && void this.pull().catch((error) => console.warn('[account] sync failed', error)));
  }

  /** Merge the stored profile into local settings, creating the profile on first sight. */
  async pull() {
    const { account } = await this.online.backend();
    const profile = await account.loadProfile();
    if (!profile) {
      await account.saveProfile({ name: this.settings.get('name'), vehicleId: this.settings.get('vehicleId'), unlockedVehicles: [] });
      return;
    }
    for (const id of Array.isArray(profile.unlockedVehicles) ? profile.unlockedVehicles : []) this.settings.unlockVehicle(id);
    const name = sanitizeName(profile.name);
    if (name) this.settings.set('name', name);
    const vehicle = findVehicle(profile.vehicleId);
    if (vehicle.id === profile.vehicleId && (!vehicle.hidden || this.settings.get('unlockedVehicles').includes(vehicle.id))) {
      this.settings.set('vehicleId', vehicle.id);
    }
  }

  async push() {
    if (!navigator.onLine) return;
    try {
      const { account } = await this.online.backend();
      await account.saveProfile({ name: this.settings.get('name'), vehicleId: this.settings.get('vehicleId') });
    } catch (error) {
      console.warn('[account] save failed', error);
    }
  }
}
