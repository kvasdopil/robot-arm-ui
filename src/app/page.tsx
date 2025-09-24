'use client';

import { useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, TransformControls } from '@react-three/drei';
import { DoubleSide, Mesh } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { usePersistedState } from '@/hooks/usePersistedState';

export default function Home() {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const [cameraPos, setCameraPos] = usePersistedState<[number, number, number]>(
    'camera-position',
    [10, 10, 10],
  );
  const [cameraTarget, setCameraTarget] = usePersistedState<[number, number, number]>(
    'camera-target',
    [0, 0, 0],
  );
  const [spherePos, setSpherePos] = usePersistedState<[number, number, number]>(
    'sphere-position',
    [1, 3, -1],
  );

  return (
    <div className="w-screen h-screen">
      <Canvas camera={{ position: cameraPos, fov: 50 }}>
        <SceneInitializer orbitRef={orbitRef} cameraTarget={cameraTarget} />
        <color attach="background" args={['lightgray']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />

        <TransformControls
          mode="translate"
          position={spherePos}
          onMouseDown={() => {
            if (orbitRef.current) orbitRef.current.enabled = false;
          }}
          onMouseUp={(e) => {
            if (orbitRef.current) orbitRef.current.enabled = true;
            // e.object is the controlled object
            const obj = (e as unknown as { target: { object: Mesh } }).target.object;
            setSpherePos([obj.position.x, obj.position.y, obj.position.z]);
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
        <OrbitControls
          ref={orbitRef}
          enableRotate
          enableZoom
          minDistance={1}
          maxDistance={100}
          onEnd={() => {
            if (orbitRef.current) {
              const cam = orbitRef.current.object;
              const target = orbitRef.current.target;
              setCameraPos([cam.position.x, cam.position.y, cam.position.z]);
              setCameraTarget([target.x, target.y, target.z]);
            }
          }}
        />
      </Canvas>
    </div>
  );
}

function SceneInitializer({
  orbitRef,
  cameraTarget,
}: {
  orbitRef: React.MutableRefObject<OrbitControlsImpl | null>;
  cameraTarget: [number, number, number];
}) {
  const { camera } = useThree();

  useEffect(() => {
    // position is applied via Canvas initial camera prop; update target here
    if (orbitRef.current) {
      orbitRef.current.target.set(cameraTarget[0], cameraTarget[1], cameraTarget[2]);
      orbitRef.current.update();
    }
  }, [camera, orbitRef, cameraTarget]);

  return null;
}
