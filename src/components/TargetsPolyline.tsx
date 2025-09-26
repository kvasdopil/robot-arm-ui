'use client';

import { Line } from '@react-three/drei';

type Vec3 = [number, number, number];

export function TargetsPolyline({ points }: { points: Vec3[] }) {
    if (!points || points.length < 2) return null;

    function segmentLength(a: Vec3, b: Vec3): number {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const dz = b[2] - a[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    function subdivideCollect(a: Vec3, b: Vec3, out: Vec3[], maxLen = 4): void {
        const len = segmentLength(a, b);
        if (len <= maxLen) return;
        const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        out.push(mid);
        subdivideCollect(a, mid, out, maxLen);
        subdivideCollect(mid, b, out, maxLen);
    }

    const splitPoints: Vec3[] = [];
    for (let i = 0; i < points.length - 1; i += 1) {
        subdivideCollect(points[i], points[i + 1], splitPoints, 20);
    }
    return (
        <group>
            <Line
                points={points}
                color="orange"
                lineWidth={1}
                dashed={false}
                transparent
                opacity={0.5}
            />
            {splitPoints.map((p, i) => (
                <mesh key={`split-${i}`} position={p}>
                    <sphereGeometry args={[0.12, 16, 16]} />
                    <meshStandardMaterial color="orange" transparent opacity={0.5} />
                </mesh>
            ))}
        </group>
    );
}

export default TargetsPolyline;


