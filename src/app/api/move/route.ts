import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Angles = {
  baseYawDeg: number;
  shoulderPitchDeg: number;
  forearmPitchDeg: number;
  wristPitchDeg?: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Accept legacy schema { angles: {...} } or new flat { a,b,c,d }
    const legacy = body?.angles as Partial<Angles> | undefined;
    let a: number | undefined = undefined;
    let b: number | undefined = undefined;
    let c: number | undefined = undefined;
    let d: number | undefined = undefined;

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

    if (a === undefined && b === undefined && c === undefined && d === undefined) {
      return NextResponse.json({ error: 'No parameters provided' }, { status: 400 });
    }

    const payload: Record<string, number> = {};
    if (typeof a === 'number') payload.a = a;
    if (typeof b === 'number') payload.b = b;
    if (typeof c === 'number') payload.c = c;
    if (typeof d === 'number') payload.d = d;

    const res = await fetch('http://nuc8.lan:3000/move', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    let downstream: unknown = null;
    try {
      downstream = await res.json();
    } catch {}

    return NextResponse.json({ ok: true, sent: payload, downstream });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
