import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const target = body?.target as [number, number, number] | undefined;
    const origin = body?.origin as [number, number, number] | undefined;
    if (!target || !Array.isArray(target) || target.length !== 3) {
      return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
    }
    const projectRoot = process.cwd();
    const scriptPath = path.join(projectRoot, 'scripts', 'ik_solver.py');
    const venvPython = path.join(projectRoot, '.venv', 'bin', 'python');
    const py = spawn(venvPython, [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });

    const payload = {
      target,
      origin,
      config: {
        baseLength: 3,
        shoulderLength: 4,
        ankleLength: 10,
        ankle2Length: 4,
        forearmLength: 10,
      },
      fractions: [0.25, 0.5, 0.75],
      use_ctraj: true,
      ctrajSteps: 6,
    };
    const input = JSON.stringify(payload);

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    py.stdout.on('data', (d) => {
      const buf = Buffer.isBuffer(d) ? d : Buffer.from(d);
      stdoutChunks.push(buf);
    });
    py.stderr.on('data', (d) => {
      const buf = Buffer.isBuffer(d) ? d : Buffer.from(d);
      stderrChunks.push(buf);
      try {
        // Forward solver stderr to Next.js/server stderr so it appears in logs
        process.stderr.write(buf);
      } catch { }
    });

    let resolved = false;
    let timedOut = false;
    const done = new Promise<{ code: number | null; timedOut: boolean }>((resolve) => {
      py.on('close', (code) => {
        if (!resolved) {
          resolved = true;
          resolve({ code, timedOut });
        }
      });
      py.on('error', () => {
        if (!resolved) {
          resolved = true;
          resolve({ code: -1, timedOut: false });
        }
      });
    });

    py.stdin.write(input);
    py.stdin.end();

    const timer = setTimeout(() => {
      if (!resolved) {
        timedOut = true;
        try {
          py.kill('SIGKILL');
        } catch { }
      }
    }, 20000);

    const result = await done;
    clearTimeout(timer);

    if (result.code !== 0) {
      const errStr = Buffer.concat(stderrChunks).toString('utf8');
      const details =
        errStr && errStr.trim().length > 0
          ? errStr
          : `code=${result.code}${result.timedOut ? ' (timeout)' : ''}`;
      return NextResponse.json({ error: 'Python solver failed', details }, { status: 500 });
    }
    const outStr = Buffer.concat(stdoutChunks).toString('utf8');
    let data: unknown;
    try {
      data = JSON.parse(outStr);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON from python' }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
