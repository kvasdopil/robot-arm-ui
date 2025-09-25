'use client';

import { useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, TransformControls } from '@react-three/drei';
import { DoubleSide, Mesh } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { usePersistedState } from '@/hooks/usePersistedState';
import RobotArm from '@/components/RobotArm';
import { extractYawPitchDegrees, solveIkWithIkts } from '@/lib/ikts';
import IkDebug from '@/components/IkDebug';

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
  const [angle1Deg, setAngle1Deg] = usePersistedState<number>('arm-angle1-deg', 0);
  const [angle2Deg, setAngle2Deg] = usePersistedState<number>('arm-angle2-deg', 0);

  return (
    <div className="relative w-screen h-screen">
      <div className="absolute left-4 top-4 z-10 rounded-md bg-white/80 dark:bg-black/60 backdrop-blur p-3 shadow text-sm space-y-2">
        <div>
          <label htmlFor="angle1" className="block mb-1">
            Base yaw (deg): {Math.round(angle1Deg)}
          </label>
          <input
            id="angle1"
            type="range"
            min={-180}
            max={180}
            step={1}
            value={angle1Deg}
            onChange={(e) => setAngle1Deg(Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="angle2" className="block mb-1">
            Shoulder pitch (deg): {Math.round(angle2Deg)}
          </label>
          <input
            id="angle2"
            type="range"
            min={-90}
            max={90}
            step={1}
            value={Math.min(Math.max(angle2Deg, -90), 90)}
            onChange={(e) => setAngle2Deg(Number(e.target.value))}
          />
        </div>
      </div>
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
            const pos: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
            setSpherePos(pos);
            const solved = solveIkWithIkts(pos);
            const { yawDeg, pitchDeg } = extractYawPitchDegrees(solved);
            setAngle1Deg(-yawDeg);
            setAngle2Deg(Math.max(-90, Math.min(90, pitchDeg)));
          }}
        >
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.25, 32, 32]} />
            <meshStandardMaterial color="orange" />
          </mesh>
        </TransformControls>

        <RobotArm
          angle1={(angle1Deg * Math.PI) / 180}
          angle2={(Math.min(Math.max(angle2Deg, -90), 90) * Math.PI) / 180}
        />

        <IkDebug target={spherePos} />

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
