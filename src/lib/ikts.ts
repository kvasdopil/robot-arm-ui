'use client';

import * as IK from 'ikts';
import { Vector3, Quaternion, Euler, MathUtils } from 'three';

export type Vec3 = [number, number, number];

export type RobotArmIkOptions = {
    baseLength?: number;
    shoulderLength?: number;
    ankleLength?: number;
    ankle2Length?: number;
    forearmLength?: number;
};

export type BoneWorldPose = {
    name: string;
    start: Vec3;
    end: Vec3;
};

export type RobotArmIkResult = {
    chain: IK.Chain3D;
    structure: IK.Structure3D;
    bones: BoneWorldPose[];
    effector: Vec3;
};

function v3(a: Vec3): IK.V3 {
    return new IK.V3(a[0], a[1], a[2]);
}

function toTuple(v: IK.V3): Vec3 {
    return [v.x, v.y, v.z];
}

/**
 * Generic bone constraint definitions
 */
export type BaseConstraint =
    | { kind: 'freeHinge'; axis: Vec3 } // freely rotating hinge around axis
    | {
        kind: 'hinge';
        axis: Vec3;
        cwDeg: number;
        acwDeg: number;
        referenceAxis: Vec3;
        space: 'GLOBAL' | 'LOCAL';
    }
    | { kind: 'rotor'; axis: Vec3; angleDeg: number };

export type ConsecutiveBoneConstraint =
    | { kind: 'none' }
    | {
        kind: 'hinge';
        axis: Vec3;
        cwDeg: number;
        acwDeg: number;
        referenceAxis: Vec3;
        space: 'GLOBAL' | 'LOCAL';
    }
    | { kind: 'rotor'; axis: Vec3; angleDeg: number };

export type ConsecutiveBoneConfig = {
    name?: string;
    direction: Vec3; // unit-ish direction
    length: number;
    constraint: ConsecutiveBoneConstraint;
};

export type ChainConfig = {
    base: {
        name?: string;
        start: Vec3;
        end: Vec3;
        constraint: BaseConstraint;
    };
    consecutive: ConsecutiveBoneConfig[];
};

export function solveIkChain(config: ChainConfig, target: Vec3): RobotArmIkResult {
    const chain = new IK.Chain3D();

    // Base
    const baseBone = new IK.Bone3D(v3(config.base.start), v3(config.base.end));
    chain.addBone(baseBone);
    // Keep base anchored at its start location
    chain.setFixedBaseMode(true);
    const baseName = config.base.name ?? 'base';

    switch (config.base.constraint.kind) {
        case 'freeHinge':
            chain.setFreelyRotatingGlobalHingedBasebone(v3(config.base.constraint.axis));
            break;
        case 'hinge':
            if (config.base.constraint.space === 'GLOBAL') {
                chain.setGlobalHingedBasebone(
                    v3(config.base.constraint.axis),
                    config.base.constraint.cwDeg,
                    config.base.constraint.acwDeg,
                    v3(config.base.constraint.referenceAxis),
                );
            } else {
                chain.setLocalHingedBasebone(
                    v3(config.base.constraint.axis),
                    config.base.constraint.cwDeg,
                    config.base.constraint.acwDeg,
                    v3(config.base.constraint.referenceAxis),
                );
            }
            break;
        case 'rotor':
            chain.setRotorBaseboneConstraint(
                'GLOBAL',
                v3(config.base.constraint.axis),
                config.base.constraint.angleDeg,
            );
            break;
        default:
            break;
    }

    // Consecutive bones
    for (const [i, b] of config.consecutive.entries()) {
        const name = b.name ?? `bone-${i + 1}`;
        if (b.constraint.kind === 'none') {
            chain.addConsecutiveBone(v3(b.direction), b.length);
        } else if (b.constraint.kind === 'hinge') {
            chain.addConsecutiveHingedBone(
                v3(b.direction),
                b.length,
                b.constraint.space,
                v3(b.constraint.axis),
                b.constraint.cwDeg,
                b.constraint.acwDeg,
                v3(b.constraint.referenceAxis),
            );
        } else if (b.constraint.kind === 'rotor') {
            chain.addConsecutiveRotorConstrainedBone(v3(b.direction), b.length, b.constraint.angleDeg);
        }
        // Store name on bone for later reporting
        const last = chain.bones[chain.bones.length - 1];
        last.name = name;
    }

    // Solve for target
    // Solve directly via chain for stability
    chain.solveForTarget(v3(target));

    const bones: BoneWorldPose[] = chain.bones.map((b, idx) => ({
        name: idx === 0 ? baseName : b.name || `bone-${idx}`,
        start: toTuple(b.start),
        end: toTuple(b.end),
    }));
    const effector = toTuple(chain.getEffectorLocation());
    // Return a lightweight structure with just the chain; structure field kept for API compat
    const structure = new IK.Structure3D();
    return { chain, structure, bones, effector };
}

export type RobotArmIkSolver = {
    update: (target: Vec3) => RobotArmIkResult;
    getResult: () => RobotArmIkResult;
};

export function createRobotArmIkSolver(options: RobotArmIkOptions = {}): RobotArmIkSolver {
    const baseLen = options.baseLength ?? 3;
    const shoulderLen = options.shoulderLength ?? 4;
    const ankleLen = options.ankleLength ?? 10;
    const ankle2Len = options.ankle2Length ?? 4;
    const forearmLen = options.forearmLength ?? 10;

    const chain = new IK.Chain3D();

    // Base
    const baseBone = new IK.Bone3D(v3([0, -1, 0]), v3([0, -1 + baseLen, 0]));
    chain.addBone(baseBone);
    chain.setFixedBaseMode(true);
    // Allow free yaw around Y while preventing base swing
    chain.setFreelyRotatingGlobalHingedBasebone(v3([0, 1, 0]));

    // Shoulder
    chain.addConsecutiveHingedBone(
        v3([-1, 0, 0]),
        shoulderLen,
        'LOCAL',
        v3([0, 0, 1]),
        90,
        90,
        v3([-1, 0, 0]),
    );
    chain.bones[1].name = 'shoulder';

    // Ankle
    chain.addConsecutiveHingedBone(
        v3([0, 1, 0]),
        ankleLen,
        'LOCAL',
        v3([0, 0, 1]),
        90,
        90,
        v3([0, 1, 0]),
    );
    chain.bones[2].name = 'ankle';

    // Ankle2 - fixed sideways offset, points opposite of shoulder (+X), no rotation (0° hinge)
    chain.addConsecutiveHingedBone(
        v3([1, 0, 0]),
        ankle2Len,
        'LOCAL',
        v3([0, 0, 1]),
        0,
        0,
        v3([1, 0, 0]),
    );
    chain.bones[3].name = 'ankle2';

    // Forearm - pitches around ankle2 axis
    chain.addConsecutiveHingedBone(
        v3([0, 1, 0]),
        forearmLen,
        'LOCAL',
        v3([0, 0, 1]),
        90,
        90,
        v3([0, 1, 0]),
    );
    chain.bones[4].name = 'forearm';

    // Tuning for smoother/minimal changes
    chain.setMaxIterationAttempts(15);
    chain.setMinIterationChange(0.0005);
    chain.setSolveDistanceThreshold(0.001);

    const structure = new IK.Structure3D();
    const tgt = v3([0, 0, 0]);
    structure.add(chain, tgt);

    const buildResult = (): RobotArmIkResult => {
        const bones: BoneWorldPose[] = chain.bones.map((b, idx) => ({
            name: idx === 0 ? 'base' : b.name || `bone-${idx}`,
            start: toTuple(b.start),
            end: toTuple(b.end),
        }));
        const effector = toTuple(chain.getEffectorLocation());
        return { chain, structure, bones, effector };
    };

    const update = (target: Vec3): RobotArmIkResult => {
        tgt.set(target[0], target[1], target[2]);
        chain.solveForTarget(tgt);
        return buildResult();
    };

    const getResult = (): RobotArmIkResult => buildResult();

    return { update, getResult };
}

/**
 * Convenience function: build the specified 3-bone robot arm and solve.
 * - base: (0,0,0)->(0,3,0), freely rotates around Y
 * - shoulder: left by 4, hinge around X, [-90, +90]
 * - ankle: up by 10, unconstrained
 */
export function solveIkWithIkts(target: Vec3, options: RobotArmIkOptions = {}): RobotArmIkResult {
    const baseLen = options.baseLength ?? 3;
    const shoulderLen = options.shoulderLength ?? 4;
    const ankleLen = options.ankleLength ?? 10;
    const ankle2Len = options.ankle2Length ?? 4;
    const forearmLen = options.forearmLength ?? 10;

    const chainConfig: ChainConfig = {
        base: {
            name: 'base',
            start: [0, -1, 0],
            end: [0, -1 + baseLen, 0],
            // Base can yaw freely around Y (global hinged basebone)
            constraint: { kind: 'freeHinge', axis: [0, 1, 0] },
        },
        consecutive: [
            {
                name: 'shoulder',
                direction: [-1, 0, 0],
                length: shoulderLen,
                // Hinge around local Z with ±90°, reference -X
                constraint: {
                    kind: 'hinge',
                    axis: [0, 0, 1],
                    cwDeg: 90,
                    acwDeg: 90,
                    referenceAxis: [-1, 0, 0],
                    space: 'LOCAL',
                },
            },
            {
                name: 'ankle',
                direction: [0, 1, 0],
                length: ankleLen,
                // Local hinge around the previous bone's axis with ±90° limits.
                // Using LOCAL and axis [0,0,1] so, after transforming by the previous bone's
                // rotation matrix, the hinge rotation axis aligns with the previous bone direction.
                constraint: {
                    kind: 'hinge',
                    axis: [0, 0, 1],
                    cwDeg: 90,
                    acwDeg: 90,
                    referenceAxis: [0, 1, 0],
                    space: 'LOCAL',
                },
            },
            {
                name: 'ankle2',
                direction: [1, 0, 0],
                length: ankle2Len,
                // fixed, no rotation
                constraint: {
                    kind: 'hinge',
                    axis: [0, 0, 1],
                    cwDeg: 0,
                    acwDeg: 0,
                    referenceAxis: [1, 0, 0],
                    space: 'LOCAL',
                },
            },
            {
                name: 'forearm',
                direction: [0, 1, 0],
                length: forearmLen,
                constraint: {
                    kind: 'hinge',
                    axis: [0, 0, 1],
                    cwDeg: 90,
                    acwDeg: 90,
                    referenceAxis: [0, 1, 0],
                    space: 'LOCAL',
                },
            },
        ],
    };

    return solveIkChain(chainConfig, target);
}


function angleBetween3D(a: Vec3, b: Vec3, ref: Vec3) {
    // a, b, ref = [x, y, z]
    // `ref` is the reference axis (e.g. [0,0,1] for XY plane signed angle)

    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    const cross = [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];

    const crossMag = Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2);
    const angleRad = Math.atan2(crossMag, dot); // unsigned in [0..π]

    // Determine sign using reference axis
    const sign = Math.sign(
        ref[0] * cross[0] + ref[1] * cross[1] + ref[2] * cross[2]
    );

    return angleRad * sign;
}


export function extractYawPitchDegrees(result: RobotArmIkResult): {
    yawDeg: number;
    pitchDeg: number;
    forearmDeg?: number;
} {
    const bones = result.chain.bones;
    if (bones.length < 3) return { yawDeg: 0, pitchDeg: 0 };

    const shoulder = bones[1];
    const ankle = bones[2];
    const ankle2 = bones[3];
    const forearm = bones[4];

    const sdx = shoulder.end.x - shoulder.start.x;
    const sdy = shoulder.end.y - shoulder.start.y;
    const sdz = shoulder.end.z - shoulder.start.z;
    const sl = Math.hypot(sdx, sdy, sdz) || 1;
    const sDirX = sdx / sl;
    const sDirZ = sdz / sl;

    // // Yaw using three.js quaternion/euler between default +X and current shoulder direction
    // const defaultDir = new Vector3(1, 0, 0);
    // const shoulderDir = new Vector3(sdx, sdy, sdz);
    // const q = new Quaternion().setFromUnitVectors(defaultDir, shoulderDir);
    // const e = new Euler().setFromQuaternion(q, 'YXZ');
    // console.log('e', e);
    const yawRad = angleBetween3D([1, 0, 0], [sdx, sdy, sdz], [0, 1, 0]);

    const adx = ankle.end.x - ankle.start.x;
    const ady = ankle.end.y - ankle.start.y;
    const adz = ankle.end.z - ankle.start.z;
    const al = Math.hypot(adx, ady, adz) || 1;
    const aDir = new Vector3(adx / al, ady / al, adz / al);

    // Shoulder axis (previous bone direction) is the hinge axis for joint 2
    const shoulderAxis = new Vector3(sdx / sl, sdy / sl, sdz / sl);

    // Build world reference direction for ankle zero using LOCAL hinge reference [0,1,0]
    const qShoulder = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), shoulderAxis);
    const refWorld = new Vector3(0, 1, 0).applyQuaternion(qShoulder).normalize();

    // Project both reference and ankle directions onto plane perpendicular to the hinge axis
    const projOntoPlane = (v: Vector3, axis: Vector3) => v.clone().sub(axis.clone().multiplyScalar(v.dot(axis))).normalize();
    const refProj = projOntoPlane(refWorld, shoulderAxis);
    const ankleProj = projOntoPlane(aDir, shoulderAxis);

    // Signed angle in that plane, around the hinge axis
    const pitchRad = angleBetween3D(
        [refProj.x, refProj.y, refProj.z],
        [ankleProj.x, ankleProj.y, ankleProj.z],
        [shoulderAxis.x, shoulderAxis.y, shoulderAxis.z],
    );

    const yawDeg = (yawRad * 180) / Math.PI;
    const pitchDeg = (pitchRad * 180) / Math.PI;

    // If forearm exists, compute its hinge angle around ankle2 axis
    if (forearm && ankle2) {
        const fdx = forearm.end.x - forearm.start.x;
        const fdy = forearm.end.y - forearm.start.y;
        const fdz = forearm.end.z - forearm.start.z;
        const fl = Math.hypot(fdx, fdy, fdz) || 1;
        const fDir = new Vector3(fdx / fl, fdy / fl, fdz / fl);

        const a2dx = ankle2.end.x - ankle2.start.x;
        const a2dy = ankle2.end.y - ankle2.start.y;
        const a2dz = ankle2.end.z - ankle2.start.z;
        const a2l = Math.hypot(a2dx, a2dy, a2dz) || 1;
        const a2Axis = new Vector3(a2dx / a2l, a2dy / a2l, a2dz / a2l);

        // Reference direction for zero: [0,1,0] rotated by ankle2 axis from +X
        const qA2 = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), a2Axis);
        const refWorld2 = new Vector3(0, 1, 0).applyQuaternion(qA2).normalize();
        const projRef2 = refWorld2.clone().sub(a2Axis.clone().multiplyScalar(refWorld2.dot(a2Axis))).normalize();
        const projFore2 = fDir.clone().sub(a2Axis.clone().multiplyScalar(fDir.dot(a2Axis))).normalize();

        const forearmRad = angleBetween3D(
            [projRef2.x, projRef2.y, projRef2.z],
            [projFore2.x, projFore2.y, projFore2.z],
            [a2Axis.x, a2Axis.y, a2Axis.z],
        );
        const forearmDeg = (forearmRad * 180) / Math.PI;
        return { yawDeg, pitchDeg: Math.max(-90, Math.min(90, pitchDeg)), forearmDeg: Math.max(-90, Math.min(90, forearmDeg)) };
    }

    return { yawDeg, pitchDeg: Math.max(-90, Math.min(90, pitchDeg)) };
}
