'use client';

import { Line } from '@react-three/drei';
import { solveIkWithIkts } from '@/lib/ikts';

export function IkDebug({ target }: { target: [number, number, number] }) {
  const result = solveIkWithIkts(target);
  const points: [number, number, number][] = result.bones.flatMap((b, i) =>
    i === 0 ? [b.start, b.end] : [b.end],
  );
  return (
    <group>
      <Line points={points} color="black" lineWidth={2} dashed={false} transparent opacity={0.8} />
      {result.bones.map((b, i) => (
        <mesh key={i} position={b.end}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color={i === result.bones.length - 1 ? 'green' : 'blue'} />
        </mesh>
      ))}
    </group>
  );
}

export default IkDebug;
