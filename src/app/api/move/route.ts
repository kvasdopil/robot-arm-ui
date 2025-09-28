import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Angles = {
  baseYawDeg: number;
  shoulderPitchDeg: number;
  forearmPitchDeg: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const angles = body?.angles as Partial<Angles> | undefined;
    if (
      !angles ||
      typeof angles.baseYawDeg !== 'number' ||
      typeof angles.shoulderPitchDeg !== 'number' ||
      typeof angles.forearmPitchDeg !== 'number'
    ) {
      return NextResponse.json({ error: 'Invalid angles' }, { status: 400 });
    }

    const a = -1 * angles.baseYawDeg;
    const b = angles.shoulderPitchDeg;
    const c = -1 * angles.forearmPitchDeg;

    const res = await fetch('http://nuc8.lan:3000/move', {
      method: 'POST',
      body: JSON.stringify({ a, b, c, aa: 1000, ba: 1000, ca: 1000 }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    await res.json();

    // Placeholder: integrate with hardware controller here
    // For now, echo back accepted target
    return NextResponse.json({ ok: true, angles });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
