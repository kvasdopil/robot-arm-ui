#!/usr/bin/env python3
import sys
import json
import math
import numpy as np

try:
    from ikpy.chain import Chain
    from ikpy.link import OriginLink, URDFLink
except Exception as e:
    print(json.dumps({"error": "ikpy not available", "details": str(e)}))
    sys.exit(1)

# Optional Robotics Toolbox (for ctraj / SE3 interpolation) – import lazily in main
SE3 = None  # type: ignore
ctraj = None  # type: ignore


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def to_deg(rad: float) -> float:
    return rad * 180.0 / math.pi


def vec_from_frame(frame):
    # frame: 4x4
    return [float(frame[0, 3]), float(frame[1, 3]), float(frame[2, 3])]


def rot_from_frame(frame):
    # Returns 3x3 rotation matrix (numpy array)
    return np.array([[float(frame[0, 0]), float(frame[0, 1]), float(frame[0, 2])],
                     [float(frame[1, 0]), float(frame[1, 1]), float(frame[1, 2])],
                     [float(frame[2, 0]), float(frame[2, 1]), float(frame[2, 2])]])


def orientation_angle_between(R_prev: np.ndarray, R_curr: np.ndarray) -> float:
    # Computes the geodesic angle between two rotations using trace formula
    # Clamp for numerical stability
    R_delta = R_prev.T.dot(R_curr)
    tr = float(np.trace(R_delta))
    cos_theta = (tr - 1.0) * 0.5
    if cos_theta > 1.0:
        cos_theta = 1.0
    elif cos_theta < -1.0:
        cos_theta = -1.0
    return float(math.acos(cos_theta))


def normalize_quaternion_sign_for_endpoints(A0, A1):
    """Ensure shortest-arc interpolation by flipping the sign of q1 if dot(q0,q1)<0.
    Accepts 4x4 transforms (numpy-like); returns possibly adjusted 4x4 for A1.
    """
    try:
        # Lazy import to avoid adding a hard dependency at module load
        from scipy.spatial.transform import Rotation as SciRot  # type: ignore
        R0 = np.array([[float(A0[0, 0]), float(A0[0, 1]), float(A0[0, 2])],
                       [float(A0[1, 0]), float(A0[1, 1]), float(A0[1, 2])],
                       [float(A0[2, 0]), float(A0[2, 1]), float(A0[2, 2])]])
        R1 = np.array([[float(A1[0, 0]), float(A1[0, 1]), float(A1[0, 2])],
                       [float(A1[1, 0]), float(A1[1, 1]), float(A1[1, 2])],
                       [float(A1[2, 0]), float(A1[2, 1]), float(A1[2, 2])]])
        q0 = SciRot.from_matrix(R0).as_quat()  # [x,y,z,w]
        q1 = SciRot.from_matrix(R1).as_quat()
        if float(np.dot(q0, q1)) < 0.0:
            q1 = -q1
        R1n = SciRot.from_quat(q1).as_matrix()
        A1n = np.array(A1, dtype=float).copy()
        A1n[0:3, 0:3] = R1n
        return A1n
    except Exception:
        return A1


def build_chain(cfg):
    base_len = float(cfg.get("baseLength", 3))
    shoulder_len = float(cfg.get("shoulderLength", 4))
    ankle_len = float(cfg.get("ankleLength", 10))
    ankle2_len = float(cfg.get("ankle2Length", 4))
    forearm_len = float(cfg.get("forearmLength", 10))

    # We construct a chain with 12 links (4 actuated joints), ensuring each revolute joint is followed by a fixed-length link
    # so the rotation affects the end-effector position:
    # 1) base_yaw (rot-y)
    # 2) base_len (fixed)
    # 3) shoulder_joint (rot-x)
    # 4) shoulder_link (fixed -X)
    # 5) ankle_link (fixed +Y)
    # 6) ankle2_link (fixed +X)
    # 7) forearm_joint (rot-x)
    # 8) forearm_link (fixed +Y)
    # 9) wrist_joint (rot-x)
    # 10) wrist_left (fixed -X, length=4)
    # 11) wrist_up (fixed +Y, length=5)

    return Chain(name="robot_arm", links=[
        OriginLink(),
        # Base yaw: revolute around Y
        URDFLink(
            name="base_yaw",
            origin_translation=[0.0, -1.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            rotation=[0.0, 1.0, 0.0],
            bounds=(-math.pi, math.pi),
            joint_type="revolute",
        ),
        # Base fixed link up
        URDFLink(
            name="base",
            origin_translation=[0.0, base_len, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
        # Shoulder joint: revolute around X (pitch)
        URDFLink(
            name="shoulder_joint",
            origin_translation=[0.0, 0.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            rotation=[1.0, 0.0, 0.0],
            bounds=(-math.pi/2, math.pi/2),
            joint_type="revolute",
        ),
        # Shoulder link: fixed -X
        URDFLink(
            name="shoulder",
            origin_translation=[-shoulder_len, 0.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
        # Ankle: fixed up
        URDFLink(
            name="ankle",
            origin_translation=[0.0, ankle_len, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
        # Ankle2: fixed +X
        URDFLink(
            name="ankle2",
            origin_translation=[ankle2_len, 0.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
        # Forearm joint: revolute around X (same axis as shoulder)
        URDFLink(
            name="forearm_joint",
            origin_translation=[0.0, 0.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            rotation=[1.0, 0.0, 0.0],
            bounds=(-3*math.pi/4, 3*math.pi/4),
            joint_type="revolute",
        ),
        # Forearm link: fixed +Y
        URDFLink(
            name="forearm",
            origin_translation=[0.0, forearm_len, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
        # Wrist joint at forearm tip: revolute around X
        URDFLink(
            name="wrist_joint",
            origin_translation=[0.0, 0.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            rotation=[1.0, 0.0, 0.0],
            bounds=(-3*math.pi/4, 3*math.pi/4),
            joint_type="revolute",
        ),
        # Wrist left: fixed -X by 4
        URDFLink(
            name="wrist_left",
            origin_translation=[-4.0, 0.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
        # Wrist up: fixed +Y by 5
        URDFLink(
            name="wrist_up",
            origin_translation=[0.0, 5.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
    ])


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except Exception:
        print(json.dumps({"error": "Invalid JSON input"}))
        sys.exit(1)

    target = payload.get("target")
    origin = payload.get("origin")
    fractions = payload.get("fractions")
    cfg = payload.get("config", {})
    # ctraj required; no linear fallback
    ctraj_steps = payload.get("ctrajSteps")
    if not isinstance(target, list) or len(target) != 3:
        print(json.dumps({"error": "Invalid target"}))
        sys.exit(1)

    chain = build_chain(cfg)

    # Helper to solve IK and return (pose, ik_vector, eff_rot3x3)
    def solve_pose(target_pos, init_guess, target_frame=None):
        # Ensure init guess length matches links
        if not isinstance(init_guess, list) or len(init_guess) != len(chain.links):
            init_guess = [0.0 for _ in chain.links]
        ik = None
        # Try full-pose IK when possible
        if target_frame is not None:
            try:
                # Preferred API (available in newer ikpy)
                ik = chain.inverse_kinematics_frame(target_frame, initial_position=init_guess)  # type: ignore[attr-defined]
            except Exception:
                # Fallback to position-only if full frame isn't supported
                ik = chain.inverse_kinematics(target_position=target_pos, initial_position=init_guess)
        else:
            ik = chain.inverse_kinematics(target_position=target_pos, initial_position=init_guess)
        frames = chain.forward_kinematics(ik, full_kinematics=True)
        pts = [vec_from_frame(f) for f in frames]
        eff_rot = rot_from_frame(frames[-1])
        bone_defs = [
            ("base", 1, 2),
            ("shoulder", 2, 4),
            ("ankle", 4, 5),
            ("ankle2", 5, 6),
            ("forearm", 6, 8),
            ("wrist_left", 8, 10),
            ("wrist_up", 10, 11),
        ]
        bones_loc = [
            {"name": n, "start": pts[i], "end": pts[j]}
            for (n, i, j) in bone_defs
        ]
        base_yaw_loc = to_deg(ik[1])
        shoulder_pitch_loc = to_deg(ik[3])
        forearm_pitch_loc = to_deg(ik[7])
        wrist_pitch_loc = to_deg(ik[9])
        return ({
            "angles": {
                "baseYawDeg": clamp(base_yaw_loc, -180.0, 180.0),
                "shoulderPitchDeg": clamp(shoulder_pitch_loc, -90.0, 90.0),
                "forearmPitchDeg": clamp(forearm_pitch_loc, -135.0, 135.0),
                "wristPitchDeg": clamp(wrist_pitch_loc, -135.0, 135.0),
            },
            "bones": bones_loc,
            "effector": pts[-1],
        }, ik, eff_rot)

    # Prefer continuity: evaluate multiple initial guesses and choose solution closest to prev_ik and orientation
    def solve_pose_prefer_continuity(target_pos, prev_ik_vec, target_frame=None, prev_eff_rot=None):
        # Base candidate: previous ik
        candidates = []
        base = list(prev_ik_vec) if isinstance(prev_ik_vec, list) and len(prev_ik_vec) == len(chain.links) else [0.0 for _ in chain.links]
        candidates.append(base)
        # Nudge shoulder/forearm/wrist up/down to escape wrong basin if needed
        for delta in (-0.5, 0.5, -1.0, 1.0):
            alt = list(base)
            alt[3] = clamp(alt[3] + delta, -math.pi/2, math.pi/2)
            alt[7] = clamp(alt[7] - delta, -3*math.pi/4, 3*math.pi/4)
            alt[9] = clamp(alt[9] - delta, -3*math.pi/4, 3*math.pi/4)
            candidates.append(alt)
        best = None
        best_cost = None
        best_ik = None
        best_rot = None
        # Weights for joint deltas (heavier penalty on wrist to avoid flips)
        joint_weights = {1: 1.0, 3: 1.0, 7: 1.0, 9: 2.0}
        orientation_weight = 4.0  # scales radians^2 contribution
        for init in candidates:
            pose, ik_vec, eff_rot = solve_pose(target_pos, init, target_frame=target_frame)
            # cost: weighted squared L2 over actuated joints [1,3,7,9]
            cost = 0.0
            for j in (1, 3, 7, 9):
                dj = float(ik_vec[j] - base[j])
                wj = joint_weights.get(j, 1.0)
                cost += wj * dj * dj
            # orientation continuity penalty if previous effector rotation is known
            if isinstance(prev_eff_rot, np.ndarray):
                try:
                    ang = orientation_angle_between(prev_eff_rot, eff_rot)
                    cost += orientation_weight * ang * ang
                except Exception:
                    pass
            if best is None or cost < best_cost:
                best = pose
                best_cost = cost
                best_ik = ik_vec
                best_rot = eff_rot
        return best, best_ik, best_rot

    try:
        if isinstance(origin, list) and len(origin) == 3:
            # Validate and build fractions list (exclusive of 0 and 1)
            fracs: list[float] = []
            if isinstance(fractions, list) and len(fractions) > 0:
                for f in fractions:
                    try:
                        fv = float(f)
                        if 0.0 < fv < 1.0:
                            fracs.append(fv)
                    except Exception:
                        pass
                fracs = sorted(list(dict.fromkeys(fracs)))
            else:
                fracs = [0.25, 0.5, 0.75]

            intermediates = []
            prev_ik = [0.0 for _ in chain.links]
            prev_rot = None

            # Require Robotics Toolbox ctraj/SE3 interpolation
            try:
                # Lazy import here to avoid cold-start penalty when not used
                global SE3, ctraj
                if SE3 is None or ctraj is None:
                    try:
                        from spatialmath import SE3 as _SE3  # type: ignore
                        try:
                            from roboticstoolbox.tools.trajectory import ctraj as _ctraj  # type: ignore
                        except Exception:
                            _ctraj = None  # type: ignore
                        SE3 = _SE3  # type: ignore
                        ctraj = _ctraj  # type: ignore
                    except Exception:
                        SE3 = None  # type: ignore
                        ctraj = None  # type: ignore
                if SE3 is None or ctraj is None:
                    raise RuntimeError("Robotics Toolbox not available")
                T0 = SE3(float(origin[0]), float(origin[1]), float(origin[2]))
                T1 = SE3(float(target[0]), float(target[1]), float(target[2]))
                # Normalize quaternion sign to avoid 360° slerp when orientations are equivalent
                try:
                    A0n = T0.A  # type: ignore
                    A1n = T1.A  # type: ignore
                    A1n = normalize_quaternion_sign_for_endpoints(A0n, A1n)
                    # Re-wrap into SE3 if possible
                    try:
                        T1 = SE3(A1n)  # type: ignore
                    except Exception:
                        pass
                except Exception:
                    pass
                # Seed baseline by solving the origin pose to capture initial orientation
                _, prev_ik, prev_rot = solve_pose_prefer_continuity([float(origin[0]), float(origin[1]), float(origin[2])], prev_ik, target_frame=T0.A, prev_eff_rot=None)
                if isinstance(ctraj_steps, int) and ctraj_steps > 1:
                    Ts = ctraj(T0, T1, int(ctraj_steps))
                    # Ts may be a numpy array of shape (4,4,N) or an iterable of SE3
                    if hasattr(Ts, "shape") and len(getattr(Ts, "shape", [])) == 3:
                        n = Ts.shape[2]  # type: ignore
                        for k in range(1, max(0, n - 1)):
                            A = Ts[:, :, k]  # type: ignore
                            t = [float(A[0, 3]), float(A[1, 3]), float(A[2, 3])]
                            pose, prev_ik, prev_rot = solve_pose_prefer_continuity(t, prev_ik, target_frame=A, prev_eff_rot=prev_rot)
                            intermediates.append(pose)
                    elif hasattr(Ts, "__iter__"):
                        seq = list(Ts)
                        L = len(seq)
                        for idx, T in enumerate(seq):
                            if idx == 0 or idx == L - 1:
                                continue
                            t = getattr(T, "t", None)
                            if t is None and hasattr(T, "A"):
                                A = T.A  # type: ignore
                                t = [float(A[0, 3]), float(A[1, 3]), float(A[2, 3])]
                                pose, prev_ik, prev_rot = solve_pose_prefer_continuity(t, prev_ik, target_frame=A, prev_eff_rot=prev_rot)
                                intermediates.append(pose)
                            elif t is not None:
                                t = [float(t[0]), float(t[1]), float(t[2])]
                                pose, prev_ik, prev_rot = solve_pose_prefer_continuity(t, prev_ik, target_frame=T.A if hasattr(T, "A") else None, prev_eff_rot=prev_rot)
                                intermediates.append(pose)
                            else:
                                continue
                else:
                    for f in sorted(fracs):
                        Ti = T0.interp(T1, float(f))
                        t = Ti.t
                        p = [float(t[0]), float(t[1]), float(t[2])]
                        pose, prev_ik, prev_rot = solve_pose_prefer_continuity(p, prev_ik, target_frame=Ti.A if hasattr(Ti, "A") else None, prev_eff_rot=prev_rot)
                        intermediates.append(pose)
            except Exception as e:
                print(json.dumps({"error": "ctraj required", "details": str(e)}))
                sys.exit(2)

            final_pose, _, _ = solve_pose_prefer_continuity(target, prev_ik, target_frame=T1.A, prev_eff_rot=prev_rot)
            out = {
                "intermediates": intermediates,
                "final": final_pose,
                # Back-compat top-level mirrors final
                "angles": final_pose["angles"],
                "bones": final_pose["bones"],
                "effector": final_pose["effector"],
            }
            print(json.dumps(out))
        else:
            base_init = [0.0 for _ in chain.links]
            final_pose, _ = solve_pose(target, base_init)
            out = {
                "intermediates": [],
                "final": final_pose,
                "angles": final_pose["angles"],
                "bones": final_pose["bones"],
                "effector": final_pose["effector"],
            }
            print(json.dumps(out))
    except Exception as e:
        print(json.dumps({"error": "IK failed", "details": str(e)}))
        sys.exit(2)


if __name__ == "__main__":
    main()


