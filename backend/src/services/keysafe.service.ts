/**
 * Keysafe-koppeling — client naar de keysafe-gateway bij de kluis.
 *
 * De gateway draait op een mini-pc op het kluis-netwerk en praat S7 met de PLC.
 * Deze backend bereikt hem via Tailscale op KEYSAFE_GATEWAY_URL, beveiligd met
 * KEYSAFE_API_KEY. Zie ../../KEYSAFE_INTEGRATION.md en het webapp/INTEGRATION.md
 * in het Lockebox-project.
 */
import axios from 'axios';

const BASE = process.env.KEYSAFE_GATEWAY_URL || 'http://localhost:8000';
const API_KEY = process.env.KEYSAFE_API_KEY || '';

const client = axios.create({
  baseURL: BASE,
  timeout: 10000,
  headers: API_KEY ? { 'X-API-Key': API_KEY } : {},
});

export interface KeysafeLocker {
  index: number;
  label: string;
  code: string;
  code_valid_to: string | null;
  days_incremented: number;
  last_inserted: string | null;
  last_delivered: string | null;
  door_locked: boolean;
  product_out: boolean;
  product_in: boolean;
  expired: boolean;
}

export interface AssignResult {
  locker: number;        // 0-gebaseerde index
  locker_number: number; // 1-gebaseerd vaknummer
  code: string;
  valid_to: string;      // ISO datum/tijd
}

export interface KeysafeStatus {
  connected: boolean;
  simulate: boolean;
  site: string;
  cabinets: number;
}

export async function getStatus(): Promise<KeysafeStatus> {
  const { data } = await client.get('/api/status');
  return data;
}

export async function listLockers(): Promise<KeysafeLocker[]> {
  const { data } = await client.get('/api/lockers');
  return data;
}

/** Geef vak `lockerIndex` (0-gebaseerd) een nieuwe code voor een nieuwe klant. */
export async function assignCode(lockerIndex: number, validHours?: number): Promise<AssignResult> {
  const { data } = await client.post(
    `/api/lockers/${lockerIndex}/assign`,
    validHours ? { valid_hours: validHours } : {},
  );
  return data;
}

/** Open vak `lockerIndex` (0-gebaseerd) op afstand (mits virtual-code in de PLC aanstaat). */
export async function openLocker(lockerIndex: number): Promise<{ ok: boolean }> {
  const { data } = await client.post(`/api/lockers/${lockerIndex}/open`, {});
  return data;
}
