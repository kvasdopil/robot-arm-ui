#!/usr/bin/env python3
import sys
import json
import math

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


def build_chain(cfg):
    base_len = float(cfg.get("baseLength", 3))
    shoulder_len = float(cfg.get("shoulderLength", 4))
    ankle_len = float(cfg.get("ankleLength", 10))
    ankle2_len = float(cfg.get("ankle2Length", 4))
    forearm_len = float(cfg.get("forearmLength", 10))

    # We construct a chain with 9 links (3 actuated joints), ensuring each revolute joint is followed by a fixed-length link
    # so the rotation affects the end-effector position:
    # 1) base_yaw (rot-y)
    # 2) base_len (fixed)
    # 3) shoulder_joint (rot-x)
    # 4) shoulder_link (fixed -X)
    # 5) ankle_link (fixed +Y)
    # 6) ankle2_link (fixed +X)
    # 7) forearm_joint (rot-x)
    # 8) forearm_link (fixed +Y)

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

    # Helper to solve IK and return (pose, ik_vector)
    def solve_pose(target_pos, init_guess):
        # Ensure init guess length matches links
        if not isinstance(init_guess, list) or len(init_guess) != len(chain.links):
            init_guess = [0.0 for _ in chain.links]
        ik = chain.inverse_kinematics(target_position=target_pos, initial_position=init_guess)
        frames = chain.forward_kinematics(ik, full_kinematics=True)
        pts = [vec_from_frame(f) for f in frames]
        bone_defs = [
            ("base", 1, 2),
            ("shoulder", 2, 4),
            ("ankle", 4, 5),
            ("ankle2", 5, 6),
            ("forearm", 6, 8),
        ]
        bones_loc = [
            {"name": n, "start": pts[i], "end": pts[j]}
            for (n, i, j) in bone_defs
        ]
        base_yaw_loc = to_deg(ik[1])
        shoulder_pitch_loc = to_deg(ik[3])
        forearm_pitch_loc = to_deg(ik[7])
        return ({
            "angles": {
                "baseYawDeg": clamp(base_yaw_loc, -180.0, 180.0),
                "shoulderPitchDeg": clamp(shoulder_pitch_loc, -90.0, 90.0),
                "forearmPitchDeg": clamp(forearm_pitch_loc, -135.0, 135.0),
            },
            "bones": bones_loc,
            "effector": pts[-1],
        }, ik)

    # Prefer continuity: evaluate multiple initial guesses and choose solution closest to prev_ik
    def solve_pose_prefer_continuity(target_pos, prev_ik_vec):
        # Base candidate: previous ik
        candidates = []
        base = list(prev_ik_vec) if isinstance(prev_ik_vec, list) and len(prev_ik_vec) == len(chain.links) else [0.0 for _ in chain.links]
        candidates.append(base)
        # Nudge shoulder/forearm up/down to escape wrong basin if needed
        for delta in (-0.5, 0.5, -1.0, 1.0):
            alt = list(base)
            alt[3] = clamp(alt[3] + delta, -math.pi/2, math.pi/2)
            alt[7] = clamp(alt[7] - delta, -3*math.pi/4, 3*math.pi/4)
            candidates.append(alt)
        best = None
        best_cost = None
        best_ik = None
        for init in candidates:
            pose, ik_vec = solve_pose(target_pos, init)
            # cost: squared L2 over actuated joints [1,3,7]
            d1 = float(ik_vec[1] - base[1])
            d2 = float(ik_vec[3] - base[3])
            d3 = float(ik_vec[7] - base[7])
            cost = d1*d1 + d2*d2 + d3*d3
            if best is None or cost < best_cost:
                best = pose
                best_cost = cost
                best_ik = ik_vec
        return best, best_ik

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
                if isinstance(ctraj_steps, int) and ctraj_steps > 1:
                    Ts = ctraj(T0, T1, int(ctraj_steps))
                    # Ts may be a numpy array of shape (4,4,N) or an iterable of SE3
                    if hasattr(Ts, "shape") and len(getattr(Ts, "shape", [])) == 3:
                        n = Ts.shape[2]  # type: ignore
                        for k in range(1, max(0, n - 1)):
                            A = Ts[:, :, k]  # type: ignore
                            t = [float(A[0, 3]), float(A[1, 3]), float(A[2, 3])]
                            pose, prev_ik = solve_pose_prefer_continuity(t, prev_ik)
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
                            elif t is not None:
                                t = [float(t[0]), float(t[1]), float(t[2])]
                            else:
                                continue
                            pose, prev_ik = solve_pose_prefer_continuity(t, prev_ik)
                            intermediates.append(pose)
                else:
                    for f in sorted(fracs):
                        Ti = T0.interp(T1, float(f))
                        t = Ti.t
                        p = [float(t[0]), float(t[1]), float(t[2])]
                        pose, prev_ik = solve_pose_prefer_continuity(p, prev_ik)
                        intermediates.append(pose)
            except Exception as e:
                print(json.dumps({"error": "ctraj required", "details": str(e)}))
                sys.exit(2)

            final_pose, _ = solve_pose_prefer_continuity(target, prev_ik)
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


