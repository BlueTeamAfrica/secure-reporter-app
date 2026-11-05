/**
 * Device adapter for the vault: AsyncStorage (blobs) + SecureStore (device secret) + expo-crypto.
 *
 * Phase 1: NOT imported anywhere yet. Phase 2 wires it into the state modules.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { makeVault, type Vault, type VaultStorage } from "./vault";

// THIS_DEVICE_ONLY: the device secret never leaves this device through iCloud backup or
// device migration. No requireAuthentication (decided: no biometric prompt).
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const expoVaultStorage: VaultStorage = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  delete: (key) => AsyncStorage.removeItem(key),
  secureGet: (key) => SecureStore.getItemAsync(key, SECURE_OPTIONS),
  secureSet: (key, value) => SecureStore.setItemAsync(key, value, SECURE_OPTIONS),
  secureDelete: (key) => SecureStore.deleteItemAsync(key, SECURE_OPTIONS),
};

let instance: Vault | null = null;

/** The app-wide vault instance (one write queue, one in-memory session). */
export function getVault(): Vault {
  if (!instance) {
    instance = makeVault({ storage: expoVaultStorage, randomBytes: getRandomBytes });
  }
  return instance;
}
