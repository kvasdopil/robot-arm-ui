'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, TransformControls, Line } from '@react-three/drei';
import { DoubleSide, Mesh, Object3D, Vector3 } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { usePersistedState } from '@/hooks/usePersistedState';
import RobotArm from '@/components/RobotArm';
import IkDebug, { BonePoint } from '@/components/IkDebug';

export default function Home() {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const tc1Ref = useRef<any>(null);
  const tc2Ref = useRef<any>(null);
  const tc3Ref = useRef<any>(null);
  const tc4Ref = useRef<any>(null);
  const dragging1Ref = useRef<boolean>(false);
  const dragging2Ref = useRef<boolean>(false);
  const dragging3Ref = useRef<boolean>(false);
  const dragging4Ref = useRef<boolean>(false);
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
  const [sphere3Pos, setSphere3Pos] = usePersistedState<[number, number, number]>(
    'sphere3-position',
    [2, 2, 2],
  );
  const [sphere4Pos, setSphere4Pos] = usePersistedState<[number, number, number]>(
    'sphere4-position',
    [-2, 2, -2],
  );
  const [activeTarget, setActiveTarget] = useState<1 | 2 | 3 | 4>(1);
  const [angle1Deg, setAngle1Deg] = usePersistedState<number>('arm-angle1-deg', 0);
  const [angle2Deg, setAngle2Deg] = usePersistedState<number>('arm-angle2-deg', 0);
  const [angle3Deg, setAngle3Deg] = usePersistedState<number>('arm-angle3-deg', 0);
  const [serverBones, setServerBones] = useState<BonePoint[] | null>(null);

  // Animated angles (tween to target in 1s)
  const [animA1, setAnimA1] = useState<number>(0);
  const [animA2, setAnimA2] = useState<number>(0);
  const [animA3, setAnimA3] = useState<number>(0);
  const rafRef = useRef<number | null>(null);
  const animStartRef = useRef<number>(0);
  const fromRef = useRef<{ a1: number; a2: number; a3: number }>({ a1: 0, a2: 0, a3: 0 });
  const toRef = useRef<{ a1: number; a2: number; a3: number }>({ a1: 0, a2: 0, a3: 0 });
  const fetchAbortRef = useRef<AbortController | null>(null);
  const endEffectorRef = useRef<Object3D | null>(null);
  const trajectoryTimerRef = useRef<number | null>(null);
  const [trajectoryPoints, setTrajectoryPoints] = useState<[number, number, number][]>([]);
  const lastG1AnglesRef = useRef<{ baseYawDeg: number; shoulderPitchDeg: number; forearmPitchDeg: number } | null>(null);
  const lastG1BonesRef = useRef<BonePoint[] | null>(null);
  const lastG2AnglesRef = useRef<{ baseYawDeg: number; shoulderPitchDeg: number; forearmPitchDeg: number } | null>(null);
  const lastG2BonesRef = useRef<BonePoint[] | null>(null);
  const lastG3AnglesRef = useRef<{ baseYawDeg: number; shoulderPitchDeg: number; forearmPitchDeg: number } | null>(null);
  const lastG3BonesRef = useRef<BonePoint[] | null>(null);
  const lastG4AnglesRef = useRef<{ baseYawDeg: number; shoulderPitchDeg: number; forearmPitchDeg: number } | null>(null);
  const lastG4BonesRef = useRef<BonePoint[] | null>(null);

  function startTrajectory() {
    if (trajectoryTimerRef.current != null) {
      clearInterval(trajectoryTimerRef.current as unknown as number);
      trajectoryTimerRef.current = null;
    }
    setTrajectoryPoints([]);
    const id = window.setInterval(() => {
      const eff = endEffectorRef.current;
      if (!eff) return;
      const v = new Vector3();
      eff.getWorldPosition(v);
      const p: [number, number, number] = [v.x, v.y, v.z];
      setTrajectoryPoints((pts) => [...pts, p]);
    }, 100) as unknown as number;
    trajectoryTimerRef.current = id;
    window.setTimeout(() => {
      if (trajectoryTimerRef.current != null) {
        clearInterval(trajectoryTimerRef.current as unknown as number);
        trajectoryTimerRef.current = null;
      }
    }, 1300);
  }

  function runIk(pos: [number, number, number], goal?: 1 | 2 | 3 | 4) {
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
          setAngle3Deg(Math.max(-135, Math.min(135, angles.forearmPitchDeg)));
          setServerBones(bones);
          startTrajectory();
          if (goal === 1) {
            lastG1AnglesRef.current = angles;
            lastG1BonesRef.current = bones;
          } else if (goal === 2) {
            lastG2AnglesRef.current = angles;
            lastG2BonesRef.current = bones;
          } else if (goal === 3) {
            lastG3AnglesRef.current = angles;
            lastG3BonesRef.current = bones;
          } else if (goal === 4) {
            lastG4AnglesRef.current = angles;
            lastG4BonesRef.current = bones;
          }
        },
      )
      .catch(() => {
        // ignore abort/errors
      });
  }

  function applyGoal(goal: 1 | 2 | 3 | 4) {
    const a = goal === 1 ? lastG1AnglesRef.current : goal === 2 ? lastG2AnglesRef.current : goal === 3 ? lastG3AnglesRef.current : lastG4AnglesRef.current;
    const b = goal === 1 ? lastG1BonesRef.current : goal === 2 ? lastG2BonesRef.current : goal === 3 ? lastG3BonesRef.current : lastG4BonesRef.current;
    if (!a || !b) return;
    setAngle1Deg(a.baseYawDeg);
    setAngle2Deg(Math.max(-90, Math.min(90, a.shoulderPitchDeg)));
    setAngle3Deg(Math.max(-135, Math.min(135, a.forearmPitchDeg)));
    setServerBones(b);
    startTrajectory();
  }

  function getGoalPos(goal: 1 | 2 | 3 | 4): [number, number, number] {
    if (goal === 1) return spherePos;
    if (goal === 2) return sphere2Pos;
    if (goal === 3) return sphere3Pos;
    return sphere4Pos;
  }

  function hasGoalIk(goal: 1 | 2 | 3 | 4): boolean {
    if (goal === 1) return !!lastG1AnglesRef.current && !!lastG1BonesRef.current;
    if (goal === 2) return !!lastG2AnglesRef.current && !!lastG2BonesRef.current;
    if (goal === 3) return !!lastG3AnglesRef.current && !!lastG3BonesRef.current;
    return !!lastG4AnglesRef.current && !!lastG4BonesRef.current;
  }

  function activateGoal(goal: 1 | 2 | 3 | 4) {
    setActiveTarget(goal);
    if (hasGoalIk(goal)) {
      applyGoal(goal);
    } else {
      const pos = getGoalPos(goal);
      runIk(pos, goal);
    }
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
      a3: Math.min(Math.max(angle3Deg, -135), 135),
    };
    fromRef.current = from;
    toRef.current = to;
    animStartRef.current = performance.now();
    const duration = 1000; // ms
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
          onClick={() => { activateGoal(1); }}
          className="px-2 py-1 rounded border border-gray-400 bg-white/80 dark:bg-black/60 hover:bg-white dark:hover:bg-black text-xl px-4"
          title="Apply last IK for goal 1"
        >
          1
        </button>
        <button
          type="button"
          onClick={() => { activateGoal(2); }}
          className="px-2 py-1 rounded border border-gray-400 bg-white/80 dark:bg-black/60 hover:bg-white dark:hover:bg-black text-xl px-4"
          title="Apply last IK for goal 2"
        >
          2
        </button>
        <button
          type="button"
          onClick={() => { activateGoal(3); }}
          className="px-2 py-1 rounded border border-gray-400 bg-white/80 dark:bg-black/60 hover:bg-white dark:hover:bg-black text-xl px-4"
          title="Apply last IK for goal 3"
        >
          3
        </button>
        <button
          type="button"
          onClick={() => { activateGoal(4); }}
          className="px-2 py-1 rounded border border-gray-400 bg-white/80 dark:bg-black/60 hover:bg-white dark:hover:bg-black text-xl px-4"
          title="Apply last IK for goal 4"
        >
          4
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
            min={-135}
            max={135}
            step={1}
            value={Math.min(Math.max(angle3Deg, -135), 135)}
            onChange={(e) => setAngle3Deg(Number(e.target.value))}
          />
        </div>
      </div>
      <Canvas camera={{ position: cameraPos, fov: 50 }}>
        <SceneInitializer orbitRef={orbitRef} cameraTarget={cameraTarget} />
        <color attach="background" args={['lightgray']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        {/* Target 1 */}
        {activeTarget === 1 ? (
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
        ) : (
          <mesh
            position={spherePos}
            onPointerDown={(e) => { (e as any).stopPropagation(); activateGoal(1); }}
          >
            <sphereGeometry args={[0.25, 32, 32]} />
            <meshStandardMaterial color="orange" />
          </mesh>
        )}

        {/* Target 2 */}
        {activeTarget === 2 ? (
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
        ) : (
          <mesh
            position={sphere2Pos}
            onPointerDown={(e) => { (e as any).stopPropagation(); activateGoal(2); }}
          >
            <sphereGeometry args={[0.25, 32, 32]} />
            <meshStandardMaterial color="#8a2be2" />
          </mesh>
        )}

        {/* Target 3 */}
        {activeTarget === 3 ? (
          <TransformControls
            ref={tc3Ref}
            mode="translate"
            position={sphere3Pos}
            onMouseDown={() => {
              if (orbitRef.current) orbitRef.current.enabled = false;
              dragging3Ref.current = true;
            }}
            onChange={() => {
              // no-op during drag; IK runs on mouse up only
            }}
            onMouseUp={() => {
              if (orbitRef.current) orbitRef.current.enabled = true;
              const obj = (tc3Ref.current?.object as Mesh | undefined) ?? undefined;
              if (!obj) return;
              const pos: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
              setSphere3Pos(pos);
              runIk(pos, 3);
              dragging3Ref.current = false;
            }}
          >
            <mesh position={[0, 0, 0]}>
              <sphereGeometry args={[0.25, 32, 32]} />
              <meshStandardMaterial color="#00bcd4" />
            </mesh>
          </TransformControls>
        ) : (
          <mesh
            position={sphere3Pos}
            onPointerDown={(e) => { (e as any).stopPropagation(); activateGoal(3); }}
          >
            <sphereGeometry args={[0.25, 32, 32]} />
            <meshStandardMaterial color="#00bcd4" />
          </mesh>
        )}

        {/* Target 4 */}
        {activeTarget === 4 ? (
          <TransformControls
            ref={tc4Ref}
            mode="translate"
            position={sphere4Pos}
            onMouseDown={() => {
              if (orbitRef.current) orbitRef.current.enabled = false;
              dragging4Ref.current = true;
            }}
            onChange={() => {
              // no-op during drag; IK runs on mouse up only
            }}
            onMouseUp={() => {
              if (orbitRef.current) orbitRef.current.enabled = true;
              const obj = (tc4Ref.current?.object as Mesh | undefined) ?? undefined;
              if (!obj) return;
              const pos: [number, number, number] = [obj.position.x, obj.position.y, obj.position.z];
              setSphere4Pos(pos);
              runIk(pos, 4);
              dragging4Ref.current = false;
            }}
          >
            <mesh position={[0, 0, 0]}>
              <sphereGeometry args={[0.25, 32, 32]} />
              <meshStandardMaterial color="#4caf50" />
            </mesh>
          </TransformControls>
        ) : (
          <mesh
            position={sphere4Pos}
            onPointerDown={(e) => { (e as any).stopPropagation(); activateGoal(4); }}
          >
            <sphereGeometry args={[0.25, 32, 32]} />
            <meshStandardMaterial color="#4caf50" />
          </mesh>
        )}

        <RobotArm
          angle1={(animA1 * Math.PI) / 180}
          angle2={(Math.min(Math.max(animA2, -90), 90) * Math.PI) / 180}
          angle3={(Math.min(Math.max(animA3, -135), 135) * Math.PI) / 180}
          endEffectorRef={endEffectorRef}
        />

        {serverBones && <IkDebug bones={serverBones} />}

        {trajectoryPoints.length > 1 && (
          <Line points={trajectoryPoints} color="purple" lineWidth={2} dashed={false} transparent opacity={0.8} />
        )}

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
