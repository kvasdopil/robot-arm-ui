'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, TransformControls } from '@react-three/drei';
import { DoubleSide, Mesh } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { usePersistedState } from '@/hooks/usePersistedState';
import RobotArm from '@/components/RobotArm';
import IkDebug, { BonePoint } from '@/components/IkDebug';

export default function Home() {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const tc1Ref = useRef<any>(null);
  const tc2Ref = useRef<any>(null);
  const dragging1Ref = useRef<boolean>(false);
  const dragging2Ref = useRef<boolean>(false);
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
  const [sphere2Pos, setSphere2Pos] = usePersistedState<[number, number, number]>(
    'sphere2-position',
    [-2, 3, 2],
  );
  const [angle1Deg, setAngle1Deg] = usePersistedState<number>('arm-angle1-deg', 0);
  const [angle2Deg, setAngle2Deg] = usePersistedState<number>('arm-angle2-deg', 0);
  const [angle3Deg, setAngle3Deg] = usePersistedState<number>('arm-angle3-deg', 0);
  const [serverBones, setServerBones] = useState<BonePoint[] | null>(null);

  // Animated angles (tween to target in 0.5s)
  const [animA1, setAnimA1] = useState<number>(0);
  const [animA2, setAnimA2] = useState<number>(0);
  const [animA3, setAnimA3] = useState<number>(0);
  const rafRef = useRef<number | null>(null);
  const animStartRef = useRef<number>(0);
  const fromRef = useRef<{ a1: number; a2: number; a3: number }>({ a1: 0, a2: 0, a3: 0 });
  const toRef = useRef<{ a1: number; a2: number; a3: number }>({ a1: 0, a2: 0, a3: 0 });
  const fetchAbortRef = useRef<AbortController | null>(null);
  const lastG1AnglesRef = useRef<{ baseYawDeg: number; shoulderPitchDeg: number; forearmPitchDeg: number } | null>(null);
  const lastG1BonesRef = useRef<BonePoint[] | null>(null);
  const lastG2AnglesRef = useRef<{ baseYawDeg: number; shoulderPitchDeg: number; forearmPitchDeg: number } | null>(null);
  const lastG2BonesRef = useRef<BonePoint[] | null>(null);

  function runIk(pos: [number, number, number], goal?: 1 | 2) {
    try {
      fetchAbortRef.current?.abort();
    } catch { }
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    fetch('/api/ik', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: pos }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then(
        (data: {
          angles: { baseYawDeg: number; shoulderPitchDeg: number; forearmPitchDeg: number };
          bones: BonePoint[];
        }) => {
          const { angles, bones } = data;
          setAngle1Deg(angles.baseYawDeg);
          setAngle2Deg(Math.max(-90, Math.min(90, angles.shoulderPitchDeg)));
          setAngle3Deg(Math.max(-90, Math.min(90, angles.forearmPitchDeg)));
          setServerBones(bones);
          if (goal === 1) {
            lastG1AnglesRef.current = angles;
            lastG1BonesRef.current = bones;
          } else if (goal === 2) {
            lastG2AnglesRef.current = angles;
            lastG2BonesRef.current = bones;
          }
        },
      )
      .catch(() => {
        // ignore abort/errors
      });
  }

  function applyGoal(goal: 1 | 2) {
    const a = goal === 1 ? lastG1AnglesRef.current : lastG2AnglesRef.current;
    const b = goal === 1 ? lastG1BonesRef.current : lastG2BonesRef.current;
    if (!a || !b) return;
    setAngle1Deg(a.baseYawDeg);
    setAngle2Deg(Math.max(-90, Math.min(90, a.shoulderPitchDeg)));
    setAngle3Deg(Math.max(-90, Math.min(90, a.forearmPitchDeg)));
    setServerBones(b);
  }

  function normalizeDeltaDeg(delta: number): number {
    let d = ((delta + 180) % 360) - 180;
    if (d < -180) d += 360;
    return d;
  }

  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  useEffect(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const from = { a1: animA1, a2: animA2, a3: animA3 };
    const to = {
      a1: angle1Deg,
      a2: Math.min(Math.max(angle2Deg, -90), 90),
      a3: Math.min(Math.max(angle3Deg, -90), 90),
    };
    fromRef.current = from;
    toRef.current = to;
    animStartRef.current = performance.now();
    const duration = 500; // ms
    const step = (now: number) => {
      const t = Math.min(1, (now - animStartRef.current) / duration);
      const k = easeInOutCubic(t);
      const d1 = normalizeDeltaDeg(toRef.current.a1 - fromRef.current.a1);
      const d2 = normalizeDeltaDeg(toRef.current.a2 - fromRef.current.a2);
      const d3 = normalizeDeltaDeg(toRef.current.a3 - fromRef.current.a3);
      setAnimA1(fromRef.current.a1 + d1 * k);
      setAnimA2(fromRef.current.a2 + d2 * k);
      setAnimA3(fromRef.current.a3 + d3 * k);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [angle1Deg, angle2Deg, angle3Deg]);

  return (
    <div className="relative w-screen h-screen">
      <div className="flex items-center gap-2 absolute right-4 top-4 z-10 flex-row">
        <button
          type="button"
          onClick={() => applyGoal(1)}
          className="px-2 py-1 rounded border border-gray-400 bg-white/80 dark:bg-black/60 hover:bg-white dark:hover:bg-black text-xl px-4"
          title="Apply last IK for goal 1"
        >
          1
        </button>
        <button
          type="button"
          onClick={() => applyGoal(2)}
          className="px-2 py-1 rounded border border-gray-400 bg-white/80 dark:bg-black/60 hover:bg-white dark:hover:bg-black text-xl px-4"
          title="Apply last IK for goal 2"
        >
          2
        </button>
      </div>
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
        <div>
          <label htmlFor="angle3" className="block mb-1">
            Forearm pitch (deg): {Math.round(angle3Deg)}
          </label>
          <input
            id="angle3"
            type="range"
            min={-90}
            max={90}
            step={1}
            value={Math.min(Math.max(angle3Deg, -90), 90)}
            onChange={(e) => setAngle3Deg(Number(e.target.value))}
          />
        </div>
      </div>
      <Canvas camera={{ position: cameraPos, fov: 50 }}>
        <SceneInitializer orbitRef={orbitRef} cameraTarget={cameraTarget} />
        <color attach="background" args={['lightgray']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />

        <TransformControls
          ref={tc1Ref}
          mode="translate"
          position={spherePos}
          onMouseDown={() => {
            if (orbitRef.current) orbitRef.current.enabled = false;
            dragging1Ref.current = true;
          }}
          onChange={() => {
            // no-op during drag; IK runs on mouse up only
          }}
          onMouseUp={() => {
            if (orbitRef.current) orbitRef.current.enabled = true;
            const obj = (tc1Ref.current?.object as Mesh | undefined) ?? undefined;
            if (!obj) return;
            const pos: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
            setSpherePos(pos);
            runIk(pos, 1);
            dragging1Ref.current = false;
          }}
        >
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.25, 32, 32]} />
            <meshStandardMaterial color="orange" />
          </mesh>
        </TransformControls>

        <TransformControls
          ref={tc2Ref}
          mode="translate"
          position={sphere2Pos}
          onMouseDown={() => {
            if (orbitRef.current) orbitRef.current.enabled = false;
            dragging2Ref.current = true;
          }}
          onChange={() => {
            // no-op during drag; IK runs on mouse up only
          }}
          onMouseUp={() => {
            if (orbitRef.current) orbitRef.current.enabled = true;
            const obj = (tc2Ref.current?.object as Mesh | undefined) ?? undefined;
            if (!obj) return;
            const pos: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
            setSphere2Pos(pos);
            runIk(pos, 2);
            dragging2Ref.current = false;
          }}
        >
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.25, 32, 32]} />
            <meshStandardMaterial color="#8a2be2" />
          </mesh>
        </TransformControls>

        <RobotArm
          angle1={(animA1 * Math.PI) / 180}
          angle2={(Math.min(Math.max(animA2, -90), 90) * Math.PI) / 180}
          angle3={(Math.min(Math.max(animA3, -90), 90) * Math.PI) / 180}
        />

        {serverBones && <IkDebug bones={serverBones} />}

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
