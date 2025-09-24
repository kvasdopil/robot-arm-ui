'use client';

import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { DoubleSide } from 'three';

export default function Home() {
  return (
    <div className="w-screen h-screen">
      <Canvas camera={{ position: [10, 10, 10], fov: 50 }}>
        <color attach="background" args={['lightgray']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />

        <mesh>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial color="red" />
        </mesh>

        <Grid cellSize={1} sectionSize={10} infiniteGrid side={DoubleSide} />
        <OrbitControls enableRotate enableZoom minDistance={1} maxDistance={100} />
      </Canvas>
    </div>
  );
}
