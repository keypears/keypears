/**
 * Device detection utilities for session management
 *
 * Provides device ID generation and OS detection for device tracking.
 */

import { platform, version, arch } from "@tauri-apps/plugin-os";
import { generateId } from "@keypears/lib";

/**
 * Auto-detect device description from OS information
 *
 * Examples:
 * - "macOS 14.1 (aarch64)" - MacBook with Apple Silicon
 * - "Windows 11 (x86_64)" - Windows PC
 * - "iPhone (iOS 17.2)" - iPhone
 * - "Android 14" - Android device
 * - "Linux (x86_64)" - Linux desktop
 */
export async function detectDeviceDescription(): Promise<string> {
  const platformName = await platform(); // "macos", "windows", "linux", "ios", "android"
  const osVersion = await version(); // "14.1", "11", "17.2", etc.
  const architecture = await arch(); // "x86_64", "aarch64", etc.

  if (platformName === "ios") {
    return `iPhone (iOS ${osVersion})`;
  } else if (platformName === "android") {
    return `Android ${osVersion}`;
  } else if (platformName === "macos") {
    return `macOS ${osVersion} (${architecture})`;
  } else if (platformName === "windows") {
    return `Windows ${osVersion} (${architecture})`;
  } else if (platformName === "linux") {
    return `Linux ${osVersion} (${architecture})`;
  } else {
    return `${platformName} ${osVersion}`;
  }
}

/**
 * Generate a new device ID for a vault
 *
 * Device IDs are per-vault (privacy-focused):
 * - Same physical device gets different IDs for different vaults
 * - Prevents cross-vault device tracking by servers
 * - Format: 26 characters, time-ordered (UUIDv7 in Crockford Base32)
 */
export function generateDeviceId(): string {
  return generateId();
}
