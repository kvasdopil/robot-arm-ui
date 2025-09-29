import { NextRequest, NextResponse } from 'next/server';
import { readPosition } from '@/lib/motorControl';

export const runtime = 'nodejs';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
  try {
    const a = await readPosition(1);
    const b = await readPosition(2);
    const c = await readPosition(3);
    return NextResponse.json({
      a: a ? a.angle : null,
      b: b ? b.angle : null,
      c: c ? c.angle : null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
