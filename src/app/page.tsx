'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls, TransformControls, Line } from '@react-three/drei';
import { DoubleSide, Mesh, Object3D, Vector3 } from 'three';
import {
  OrbitControls as OrbitControlsImpl,
  TransformControls as TransformControlsImpl,
} from 'three-stdlib';
import { usePersistedState } from '@/hooks/usePersistedState';
import RobotArm from '@/components/RobotArm';
import IkDebug, { BonePoint } from '@/components/IkDebug';
import TargetsPolyline from '@/components/TargetsPolyline';

export default function Home() {
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const tcRef = useRef<TransformControlsImpl | null>(null);
  const draggingRef = useRef<boolean>(false);
  const activeMeshRef = useRef<Mesh | null>(null);
  const [cameraPos, setCameraPos] = usePersistedState<[number, number, number]>(
    'camera-position',
    [10, 10, 10],
  );
  const [cameraTarget, setCameraTarget] = usePersistedState<[number, number, number]>(
    'camera-target',
    [0, 0, 0],
  );
  const [targets, setTargets] = usePersistedState<[number, number, number][]>('targets', [
    [1, 3, -1],
    [-2, 3, 2],
  ]);
  const [activeTarget, setActiveTarget] = useState<number>(0);
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
  const stageTimerRef = useRef<number | null>(null);
  const trajectoryStopTimerRef = useRef<number | null>(null);
  const trajectoryTimerRef = useRef<number | null>(null);
  const [trajectoryPoints, setTrajectoryPoints] = useState<[number, number, number][]>([]);
  const trajectoryLatestRef = useRef<[number, number, number][]>([]);
  const [trajectoryHistory, setTrajectoryHistory] = useState<
    [number, number, number][][]
  >([]);
  const lastAnglesRef = useRef<
    ({ baseYawDeg: number; shoulderPitchDeg: number; forearmPitchDeg: number } | null)[]
  >([]);
  const lastBonesRef = useRef<(BonePoint[] | null)[]>([]);

  function startTrajectory() {
    if (trajectoryTimerRef.current != null) {
      clearInterval(trajectoryTimerRef.current as unknown as number);
      trajectoryTimerRef.current = null;
    }
    if (trajectoryStopTimerRef.current != null) {
      clearTimeout(trajectoryStopTimerRef.current as unknown as number);
      trajectoryStopTimerRef.current = null;
    }
    // Flush any in-progress segment into history before starting a new one
    const prevPts = trajectoryLatestRef.current;
    if (prevPts && prevPts.length > 1) {
      setTrajectoryHistory((hist) => {
        const next = [...hist, prevPts];
        if (next.length > 10) next.shift();
        return next;
      });
    }
    setTrajectoryPoints([]);
    trajectoryLatestRef.current = [];
    const id = window.setInterval(() => {
      const eff = endEffectorRef.current;
      if (!eff) return;
      const v = new Vector3();
      eff.getWorldPosition(v);
      const p: [number, number, number] = [v.x, v.y, v.z];
      setTrajectoryPoints((pts) => {
        const next = [...pts, p];
        trajectoryLatestRef.current = next;
        return next;
      });
    }, 100) as unknown as number;
    trajectoryTimerRef.current = id;
    trajectoryStopTimerRef.current = window.setTimeout(() => {
      if (trajectoryTimerRef.current != null) {
        clearInterval(trajectoryTimerRef.current as unknown as number);
        trajectoryTimerRef.current = null;
      }
      const finalPts = trajectoryLatestRef.current;
      if (finalPts && finalPts.length > 1) {
        setTrajectoryHistory((hist) => {
          const next = [...hist, finalPts];
          if (next.length > 10) next.shift();
          return next;
        });
      }
      trajectoryLatestRef.current = [];
      if (trajectoryStopTimerRef.current != null) {
        clearTimeout(trajectoryStopTimerRef.current as unknown as number);
        trajectoryStopTimerRef.current = null;
      }
    }, 1300) as unknown as number;
  }

  function runIk(pos: [number, number, number], goalIndex?: number) {
    try {
      fetchAbortRef.current?.abort();
    } catch { }
    if (stageTimerRef.current != null) {
      clearTimeout(stageTimerRef.current as unknown as number);
      stageTimerRef.current = null;
    }
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    // Origin from current end-effector world position
    let origin: [number, number, number] | undefined;
    const eff = endEffectorRef.current;
    if (eff) {
      const v = new Vector3();
      eff.getWorldPosition(v);
      origin = [v.x, v.y, v.z];
    }
    fetch('/api/ik', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: pos, origin }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then(
        (data: unknown) => {
          type Angles = { baseYawDeg: number; shoulderPitchDeg: number; forearmPitchDeg: number };
          type SolverPose = { angles: Angles; bones: BonePoint[] };
          const anyData = data as Record<string, unknown>;
          const mid = anyData.mid as SolverPose | undefined;
          const finalPose = (anyData.final as SolverPose | undefined) || (anyData as unknown as { angles: Angles; bones: BonePoint[] });

          if (mid && finalPose) {
            // Stage 1: animate to mid
            setAngle1Deg(mid.angles.baseYawDeg);
            setAngle2Deg(Math.max(-90, Math.min(90, mid.angles.shoulderPitchDeg)));
            setAngle3Deg(Math.max(-135, Math.min(135, mid.angles.forearmPitchDeg)));
            setServerBones(mid.bones);
            startTrajectory();
            // Stage 2 after 1s: animate to final
            stageTimerRef.current = window.setTimeout(() => {
              setAngle1Deg(finalPose.angles.baseYawDeg);
              setAngle2Deg(Math.max(-90, Math.min(90, finalPose.angles.shoulderPitchDeg)));
              setAngle3Deg(Math.max(-135, Math.min(135, finalPose.angles.forearmPitchDeg)));
              setServerBones(finalPose.bones);
              startTrajectory();
              if (typeof goalIndex === 'number') {
                const len = Math.max(lastAnglesRef.current.length, targets.length);
                if (lastAnglesRef.current.length < len) lastAnglesRef.current.length = len;
                if (lastBonesRef.current.length < len) lastBonesRef.current.length = len;
                lastAnglesRef.current[goalIndex] = finalPose.angles;
                lastBonesRef.current[goalIndex] = finalPose.bones;
              }
              stageTimerRef.current = null;
            }, 1000) as unknown as number;
          } else if (finalPose) {
            const angles = finalPose.angles;
            const bones = finalPose.bones;
            setAngle1Deg(angles.baseYawDeg);
            setAngle2Deg(Math.max(-90, Math.min(90, angles.shoulderPitchDeg)));
            setAngle3Deg(Math.max(-135, Math.min(135, angles.forearmPitchDeg)));
            setServerBones(bones);
            startTrajectory();
            if (typeof goalIndex === 'number') {
              const len = Math.max(lastAnglesRef.current.length, targets.length);
              if (lastAnglesRef.current.length < len) lastAnglesRef.current.length = len;
              if (lastBonesRef.current.length < len) lastBonesRef.current.length = len;
              lastAnglesRef.current[goalIndex] = angles;
              lastBonesRef.current[goalIndex] = bones;
            }
          }
        },
      )
      .catch(() => {
        // ignore abort/errors
      });
  }

  function applyGoal(goalIndex: number) {
    const a = lastAnglesRef.current[goalIndex];
    const b = lastBonesRef.current[goalIndex];
    if (!a || !b) return;
    setAngle1Deg(a.baseYawDeg);
    setAngle2Deg(Math.max(-90, Math.min(90, a.shoulderPitchDeg)));
    setAngle3Deg(Math.max(-135, Math.min(135, a.forearmPitchDeg)));
    setServerBones(b);
    startTrajectory();
  }

  function getGoalPos(goalIndex: number): [number, number, number] {
    return targets[goalIndex];
  }

  function hasGoalIk(goalIndex: number): boolean {
    return !!lastAnglesRef.current[goalIndex] && !!lastBonesRef.current[goalIndex];
  }

  function activateGoal(goalIndex: number) {
    setActiveTarget(goalIndex);
    const pos = getGoalPos(goalIndex);
    // Always run IK with current origin so we always go through a midpoint
    runIk(pos, goalIndex);
  }

  function targetColor(i: number): string {
    const palette = ['orange', '#8a2be2', '#00bcd4', '#4caf50', '#ff9800', '#e91e63'];
    return palette[i % palette.length];
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
    // Clamp bounded joints for the start state to avoid wrap-induced stalls
    const from = {
      a1: animA1,
      a2: Math.min(Math.max(animA2, -90), 90),
      a3: Math.min(Math.max(animA3, -135), 135),
    };
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
      // For bounded joints, interpolate directly in linear space (no wrap)
      const d2 = toRef.current.a2 - fromRef.current.a2;
      const d3 = toRef.current.a3 - fromRef.current.a3;
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
        {targets.map((_, i) => (
          <button
            key={`tbtn-${i}`}
            type="button"
            onClick={() => {
              activateGoal(i);
            }}
            className={`px-2 py-1 rounded border ${activeTarget === i
                ? 'border-orange-500 bg-orange-500/80 text-white dark:bg-orange-500/60'
                : 'border-gray-400 bg-white/80 dark:bg-black/60 hover:bg-white dark:hover:bg-black'
              } text-xl px-4`}
            title={`Apply last IK for goal ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const appended: [number, number, number][] = [...targets, [0, 2, 0]];
            setTargets(appended);
            setActiveTarget(appended.length - 1);
          }}
          className="px-2 py-1 rounded border border-gray-400 bg-white/80 dark:bg-black/60 hover:bg-white dark:hover:bg-black text-xl px-4"
          title="Add new target"
        >
          +
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
        {/* Targets polyline and midpoints */}
        <TargetsPolyline points={targets} />
        {/* Active target with TransformControls */}
        {targets.map((pos, i) =>
          activeTarget === i ? (
            <TransformControls
              key={`tc-${i}`}
              ref={tcRef}
              mode="translate"
              position={pos}
              onMouseDown={() => {
                if (orbitRef.current) orbitRef.current.enabled = false;
                draggingRef.current = true;
              }}
              onChange={() => {
                // no-op during drag; IK runs on mouse up only
              }}
              onMouseUp={() => {
                if (orbitRef.current) orbitRef.current.enabled = true;
                const m = activeMeshRef.current;
                if (!m) return;
                const v = new Vector3();
                m.getWorldPosition(v);
                const newPos: [number, number, number] = [v.x, v.y, v.z];
                setTargets(
                  targets.map((p: [number, number, number], idx: number) =>
                    idx === i ? newPos : p,
                  ),
                );
                runIk(newPos, i);
                draggingRef.current = false;
              }}
            >
              <mesh position={[0, 0, 0]} ref={activeMeshRef}>
                <sphereGeometry args={[0.25, 32, 32]} />
                <meshStandardMaterial color={targetColor(i)} />
              </mesh>
            </TransformControls>
          ) : null,
        )}

        {/* Inactive targets as plain meshes */}
        {targets.map((pos, i) =>
          activeTarget !== i ? (
            <mesh
              key={`tmesh-${i}`}
              position={pos}
              onPointerDown={(e: unknown) => {
                const ev = e as { stopPropagation?: () => void };
                if (ev.stopPropagation) ev.stopPropagation();
                activateGoal(i);
              }}
            >
              <sphereGeometry args={[0.25, 32, 32]} />
              <meshStandardMaterial color={targetColor(i)} />
            </mesh>
          ) : null,
        )}

        <RobotArm
          angle1={(animA1 * Math.PI) / 180}
          angle2={(Math.min(Math.max(animA2, -90), 90) * Math.PI) / 180}
          angle3={(Math.min(Math.max(animA3, -135), 135) * Math.PI) / 180}
          endEffectorRef={endEffectorRef}
        />

        {serverBones && <IkDebug bones={serverBones} />}

        {trajectoryHistory.map((pts, i) =>
          pts.length > 1 ? (
            <Line
              key={`traj-hist-${i}`}
              points={pts}
              color="purple"
              lineWidth={1}
              dashed={false}
              transparent
              opacity={0.35}
            />
          ) : null,
        )}

        {trajectoryPoints.length > 1 && (
          <Line
            points={trajectoryPoints}
            color="purple"
            lineWidth={2}
            dashed={false}
            transparent
            opacity={0.8}
          />
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
