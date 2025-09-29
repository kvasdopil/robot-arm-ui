/*
 * Local Modbus-based servo control adapted from ~/simplectl/motor-control.js
 */

'use server';

import ModbusRTU from 'modbus-serial';
import { angleToPulses, pulsesToAngle } from './motorUtils';

const SERIAL_PORT = process.env.SERVO_SERIAL_PORT || '/dev/ttyUSB0';
const BAUD_RATE = Number(process.env.SERVO_BAUD_RATE || 38400);
const DEFAULT_TARGET_SLAVE_ID = Number(process.env.SERVO_SLAVE_ID || 1);
const TIMEOUT_MS = Number(process.env.SERVO_TIMEOUT_MS || 1000);

// Register addresses per simplectl
const POS_ADDR = 51;
const POS_QTY = 2; // 2 registers -> 4 bytes
const MOVE_ABS_ADDR = 254;

let client: ModbusRTU | null = null;
let isInitialized = false;

export async function initializeClient(): Promise<void> {
  if (isInitialized && client) return;
  const c = new ModbusRTU();
  await c.connectRTUBuffered(SERIAL_PORT, { baudRate: BAUD_RATE });
  c.setID(DEFAULT_TARGET_SLAVE_ID);
  c.setTimeout(TIMEOUT_MS);
  client = c;
  isInitialized = true;
}

export async function readPosition(
  slaveId: number,
): Promise<{ angle: number; pulses: number } | null> {
  if (!isInitialized) await initializeClient();
  if (!client) return null;
  const originalId = client.getID();
  try {
    client.setID(slaveId);
    const response = await client.readInputRegisters(POS_ADDR, POS_QTY);
    // response.buffer is a Node Buffer with 4 bytes representing signed 32-bit
    const buf = response.buffer;
    if (!buf || buf.length !== 4) {
      return null;
    }
    const pulses = buf.readInt32BE(0);
    const angle = pulsesToAngle(pulses);
    return { angle, pulses };
  } catch {
    return null;
  } finally {
    try {
      client.setID(originalId);
    } catch {}
  }
}

export async function moveToAngle(
  angle: number,
  speed: number,
  acceleration: number,
  slaveId: number,
): Promise<boolean> {
  if (!isInitialized) await initializeClient();
  if (!client) return false;

  const absPulses = angleToPulses(angle);
  const originalId = client.getID();
  try {
    client.setID(slaveId);
    const register1 = acceleration & 0xffff;
    const register2 = speed & 0xffff;
    const register3 = (absPulses >> 16) & 0xffff;
    const register4 = absPulses & 0xffff;
    const arr = [register1, register2, register3, register4];
    const resp = await client.writeRegisters(MOVE_ABS_ADDR, arr);
    return resp.address === MOVE_ABS_ADDR && resp.length === arr.length;
  } catch {
    return false;
  } finally {
    try {
      client.setID(originalId);
    } catch {}
  }
}

export async function cleanup(): Promise<void> {
  if (client && client.isOpen) {
    try {
      client.close();
    } catch {}
  }
  client = null;
  isInitialized = false;
}
