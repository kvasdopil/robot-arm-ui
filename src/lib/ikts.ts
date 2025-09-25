'use client';

import * as IK from 'ikts';
import { Vector3, Quaternion, Euler, MathUtils } from 'three';

export type Vec3 = [number, number, number];

export type RobotArmIkOptions = {
    baseLength?: number;
    shoulderLength?: number;
    ankleLength?: number;
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
    const structure = new IK.Structure3D();
    structure.add(chain, v3(target));
    structure.update();

    const bones: BoneWorldPose[] = chain.bones.map((b, idx) => ({
        name: idx === 0 ? baseName : b.name || `bone-${idx}`,
        start: toTuple(b.start),
        end: toTuple(b.end),
    }));
    const effector = toTuple(chain.getEffectorLocation());
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

    const chain = new IK.Chain3D();

    // Base
    const baseBone = new IK.Bone3D(v3([0, -1, 0]), v3([0, -1 + baseLen, 0]));
    chain.addBone(baseBone);
    chain.setFixedBaseMode(true);
    chain.setRotorBaseboneConstraint('GLOBAL', v3([0, 1, 0]), 0);

    // Shoulder
    chain.addConsecutiveHingedBone(
        v3([-1, 0, 0]),
        shoulderLen,
        'LOCAL',
        v3([0, 0, 1]),
        180,
        180,
        v3([-1, 0, 0]),
    );

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

    // Tuning for smoother/minimal changes
    chain.setMaxIterationAttempts(15);
    chain.setMinIterationChange(0.0005);
    chain.setSolveDistanceThreshold(0.001);

    const structure = new IK.Structure3D();
    const tgt = v3([0, 0, 0]);
    structure.add(chain, tgt);

    const buildResult = (): RobotArmIkResult => {
        const bones: BoneWorldPose[] = chain.bones.map((b, idx) => ({
            name: idx === 0 ? 'base' : idx === 1 ? 'shoulder' : 'ankle',
            start: toTuple(b.start),
            end: toTuple(b.end),
        }));
        const effector = toTuple(chain.getEffectorLocation());
        return { chain, structure, bones, effector };
    };

    const update = (target: Vec3): RobotArmIkResult => {
        tgt.set(target[0], target[1], target[2]);
        structure.update();
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

    const chainConfig: ChainConfig = {
        base: {
            name: 'base',
            start: [0, -1, 0],
            end: [0, -1 + baseLen, 0],
            // Force base bone to always point up (no swing), but can yaw around vertical
            constraint: { kind: 'rotor', axis: [0, 1, 0], angleDeg: 0 },
        },
        consecutive: [
            {
                name: 'shoulder',
                direction: [-1, 0, 0],
                length: shoulderLen,
                // Hinge around Y with 0° range, locked to reference axis -X in LOCAL space
                constraint: {
                    kind: 'hinge',
                    axis: [0, 0, 1],
                    cwDeg: 180,
                    acwDeg: 180,
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
} {
    const bones = result.chain.bones;
    if (bones.length < 3) return { yawDeg: 0, pitchDeg: 0 };

    const shoulder = bones[1];
    const ankle = bones[2];

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
    return { yawDeg, pitchDeg: Math.max(-90, Math.min(90, pitchDeg)) };
}
