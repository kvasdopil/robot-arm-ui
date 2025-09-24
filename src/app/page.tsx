'use client';

import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Grid, OrbitControls, TransformControls } from '@react-three/drei';
import { DoubleSide } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export default function Home() {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <div className="w-screen h-screen">
      <Canvas camera={{ position: [10, 10, 10], fov: 50 }}>
        <color attach="background" args={['lightgray']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />

        <TransformControls
          mode="translate"
          position={[1, 3, -1]}
          onMouseDown={() => {
            if (orbitRef.current) orbitRef.current.enabled = false;
          }}
          onMouseUp={() => {
            if (orbitRef.current) orbitRef.current.enabled = true;
          }}
        >
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.25, 32, 32]} />
            <meshStandardMaterial color="orange" />
          </mesh>
        </TransformControls>

        <mesh>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial color="red" />
        </mesh>

        <Grid cellSize={1} sectionSize={10} infiniteGrid side={DoubleSide} />
        <OrbitControls ref={orbitRef} enableRotate enableZoom minDistance={1} maxDistance={100} />
      </Canvas>
    </div>
  );
}
