// Cross-runtime auth: uses Web Crypto (available in both Node 18+ and the
// Edge runtime that Next.js middleware runs on).
import { cookies } from "next/headers";

export const SESSION_COOKIE = "eink_session";

function secret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret";
}

function toHex(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

function randomHex(n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(sig);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function makeToken(): Promise<string> {
  const ts = Date.now().toString();
  const nonce = randomHex(8);
  const payload = `${ts}.${nonce}`;
  const sig = await hmac(payload);
  return `${payload}.${sig}`;
}

export async function verifyToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [ts, nonce, sig] = parts;
  const expected = await hmac(`${ts}.${nonce}`);
  return timingSafeEqual(sig, expected);
}

export async function isAuthed(): Promise<boolean> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifyToken(token);
}

export function checkPassword(input: string): boolean {
  const pw = process.env.APP_PASSWORD || "";
  if (!pw) return false;
  return timingSafeEqual(input, pw);
}
