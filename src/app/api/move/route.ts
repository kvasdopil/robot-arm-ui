import { NextRequest, NextResponse } from 'next/server';
import { moveToAngle, readPosition } from '@/lib/motorControl';

export const runtime = 'nodejs';

type Angles = {
  baseYawDeg?: number;
  shoulderPitchDeg?: number;
  forearmPitchDeg?: number;
  wristPitchDeg?: number;
};

const DEFAULT_SPEED = 100;
const DEFAULT_ACCEL = 100;
const DEFAULT_SPEED_FACTOR = 0.01;

async function computeSpeed(
  slaveId: number,
  targetAngle: number | undefined,
  providedSpeed?: number,
) {
  if (targetAngle === undefined) return { speed: providedSpeed ?? DEFAULT_SPEED, diffPulses: 0 };
  try {
    const pos = await readPosition(slaveId);
    if (!pos) return { speed: providedSpeed ?? DEFAULT_SPEED, diffPulses: 0 };
    const targetPulses = Math.round((targetAngle / 180) * (2 * 30000));
    const diffPulses = Math.abs(targetPulses - pos.pulses);
    if (providedSpeed !== undefined) return { speed: providedSpeed, diffPulses };
    if (diffPulses === 0) return { speed: DEFAULT_SPEED, diffPulses };
    return { speed: DEFAULT_SPEED_FACTOR * diffPulses, diffPulses };
  } catch {
    return { speed: providedSpeed ?? DEFAULT_SPEED, diffPulses: 0 };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Accept legacy schema { angles: {...} } or new flat { a,b,c,d }
    const legacy = body?.angles as Partial<Angles> | undefined;
    let a: number | undefined;
    let b: number | undefined;
    let c: number | undefined;
    let d: number | undefined;
    if (legacy && typeof legacy === 'object') {
      if (typeof legacy.baseYawDeg === 'number') a = -1 * legacy.baseYawDeg;
      if (typeof legacy.shoulderPitchDeg === 'number') b = legacy.shoulderPitchDeg;
      if (typeof legacy.forearmPitchDeg === 'number') c = -1 * legacy.forearmPitchDeg;
      if (typeof legacy.wristPitchDeg === 'number') d = -1 * legacy.wristPitchDeg;
    }
    if (typeof body?.a === 'number') a = body.a;
    if (typeof body?.b === 'number') b = body.b;
    if (typeof body?.c === 'number') c = body.c;
    if (typeof body?.d === 'number') d = body.d;

    // Optional per-axis speed/accel
    const as = typeof body?.as === 'number' ? body.as : undefined;
    const bs = typeof body?.bs === 'number' ? body.bs : undefined;
    const cs = typeof body?.cs === 'number' ? body.cs : undefined;
    const aa = typeof body?.aa === 'number' ? body.aa : undefined;
    const ba = typeof body?.ba === 'number' ? body.ba : undefined;
    const ca = typeof body?.ca === 'number' ? body.ca : undefined;
    const acc = typeof body?.acc === 'number' ? body.acc : undefined;

    if (a === undefined && b === undefined && c === undefined && d === undefined) {
      return NextResponse.json({ error: 'No parameters provided' }, { status: 400 });
    }

    // Compute speeds from current positions if not provided
    const { speed: speedA, diffPulses: diffA } = await computeSpeed(1, a, as);
    const { speed: speedB, diffPulses: diffB } = await computeSpeed(2, b, bs);
    const { speed: speedC, diffPulses: diffC } = await computeSpeed(3, c, cs);
    const accelFallback = acc ?? DEFAULT_ACCEL;
    const accelA = aa ?? accelFallback;
    const accelB = ba ?? accelFallback;
    const accelC = ca ?? accelFallback;

    // Execute moves only if there is a difference
    if (a !== undefined && diffA > 0) {
      const ok = await moveToAngle(a, speedA, accelA, 1);
      if (!ok) return NextResponse.json({ error: 'Failed to move servo 1' }, { status: 500 });
    }
    if (b !== undefined && diffB > 0) {
      const ok = await moveToAngle(b, speedB, accelB, 2);
      if (!ok) return NextResponse.json({ error: 'Failed to move servo 2' }, { status: 500 });
    }
    if (c !== undefined && diffC > 0) {
      const ok = await moveToAngle(c, speedC, accelC, 3);
      if (!ok) return NextResponse.json({ error: 'Failed to move servo 3' }, { status: 500 });
    }
    // d (wrist) not wired in simplectl; ignore if provided

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
