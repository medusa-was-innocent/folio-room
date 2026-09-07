import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function makeRoomCode(len = 6): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < len; i++) code += ALPHABET[bytes[i]! % ALPHABET.length];
  return code;
}

export function cleanRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

export function hostKey(code: string): string {
  return `folio:host:${code}`;
}

export function nameKey(): string {
  return "folio:name";
}

export function clientIdKey(): string {
  return "folio:id";
}

export function getClientId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(clientIdKey());
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(clientIdKey(), id);
  }
  return id;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chunk = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.byteLength));
    let piece = "";
    for (let j = 0; j < slice.length; j++) piece += String.fromCharCode(slice[j]!);
    binary += piece;
  }
  return btoa(binary);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
