'use client';

import { Line } from '@react-three/drei';

export type BonePoint = {
  name: string;
  start: [number, number, number];
  end: [number, number, number];
};

export function IkDebug({ bones }: { bones: BonePoint[] }) {
  const points: [number, number, number][] = bones.flatMap((b, i) =>
    i === 0 ? [b.start, b.end] : [b.end],
  );
  return (
    <group>
      <Line points={points} color="black" lineWidth={2} dashed={false} transparent opacity={0.8} />
      {bones.map((b, i) => (
        <mesh key={i} position={b.end}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color={i === bones.length - 1 ? 'green' : 'blue'} />
        </mesh>
      ))}
    </group>
  );
}

export default IkDebug;
