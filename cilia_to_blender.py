"""
Blender importer/animator for ciliary carpet centerlines.

Usage:
  - In Blender, open this file in the Text Editor and click Run Script,
    or install as an addon: Preferences → Add-ons → Install...
  - Run operator: Search (F3) → "Import Ciliary Curves (JSON)".
  - Pick either:
      • Curves JSON exported by the app's Export Curves button, or
      • Original state JSON exported by the app (the script will regenerate seeds/fields).

The script creates Curve objects (one per cilium), installs a frame-change
handler, and updates points every frame to match the browser animation model.

Notes:
  - Units are ×L0 as in the app. Adjust view scale accordingly.
  - For visibility, curves get a small bevel depth by default.
  - Re-running replaces existing imported curves.
"""

import bpy
import json
import math
import random
from math import sin, cos, pi
from bpy_extras.io_utils import ImportHelper
from bpy.props import StringProperty, FloatProperty, IntProperty, BoolProperty
from bpy.types import Operator


NAME_PREFIX = "Cilium"
DEFAULT_BEVEL = 0.01  # ×L0 units; adjust to taste


def _realf(x, default=0.0):
    """Coerce value to a real float. Falls back to abs(), then default."""
    try:
        # handle numpy types and normal numbers
        if isinstance(x, complex):
            return float(abs(x))
        return float(x)
    except Exception:
        try:
            return float(abs(x))
        except Exception:
            return float(default)


def _randn():
    # Box-Muller
    u = 0.0
    v = 0.0
    while u == 0.0:
        u = random.random()
    while v == 0.0:
        v = random.random()
    return (-(2.0 * math.log(u)) ** 0.5) * math.cos(2.0 * math.pi * v)


def _wave_phase_at(x, y, xSize, ySize, wAmp, wAng):
    kvx = math.cos(wAng) * wAmp
    kvy = math.sin(wAng) * wAmp
    if (xSize == 0.0) and (ySize == 0.0):
        base = 0.0
    elif xSize == 0.0:
        base = (kvy * y / ySize) % 1.0
    elif ySize == 0.0:
        base = (kvx * x / xSize) % 1.0
    else:
        base = (kvx * x / xSize + kvy * y / ySize) % 1.0
    return (base + 1.0) % 1.0


class CiliaSet:
    def __init__(self, data):
        self.data = data
        # detect format
        self.has_curves = ('seeds' in data) and ('fields' in data)

        # common
        self.grid = data.get('grid', {})
        self.params = data.get('params', {})
        self.nseg = int(max(2, _realf(data.get('nSeg', 20), 20)))
        # curvature profile: prefer params.profile.cps; fallback to top-level curvature.cps; else default
        cps_src = None
        prof = self.params.get('profile') if isinstance(self.params.get('profile'), dict) else None
        if prof and isinstance(prof.get('cps'), (list, tuple)):
            cps_src = prof.get('cps')
        elif isinstance(self.data.get('curvature'), dict) and isinstance(self.data['curvature'].get('cps'), (list, tuple)):
            cps_src = self.data['curvature'].get('cps')
        else:
            cps_src = [{'s': 0, 'v': 0.2}, {'s': 1, 'v': 1.0}]
        # sanitize cps values to be real floats
        cps_clean = []
        for c in cps_src:
            try:
                s_val = float(c.get('s', 0.0))
            except Exception:
                try:
                    s_val = float(abs(c.get('s', 0.0)))
                except Exception:
                    s_val = 0.0
            try:
                v_val = float(c.get('v', 1.0))
            except Exception:
                try:
                    v_val = float(abs(c.get('v', 1.0)))
                except Exception:
                    v_val = 1.0
            cps_clean.append({'s': s_val, 'v': v_val})
        self.cps = sorted(cps_clean, key=lambda c: c['s'])
        self.k0 = _realf(self.params.get('k0', 1.0), 1.0)
        self.aK = _realf(self.params.get('aK', 0.8), 0.8)
        self.waveNoise = max(0.0, min(1.0, _realf(self.params.get('waveNoise', 0.0), 0.0)))
        self.ciliaArea = _realf(self.params.get('ciliaArea', 1.0), 1.0)
        self.ciliaArea = max(0.0, min(1.0, self.ciliaArea))
        self.cutoff = (self.ciliaArea ** 0.5)

        # grid
        self.xSize = _realf(self.grid.get('xSize', 0.0), 0.0)
        self.ySize = _realf(self.grid.get('ySize', 0.0), 0.0)
        self.cx = list(self.grid.get('cx', []))
        self.cy = list(self.grid.get('cy', []))
        self.isCiliated = list(map(bool, self.grid.get('isCiliated', [])))
        # derive total robustly if missing
        self.total = int(_realf(self.grid.get('total', 0), 0)) if (self.grid.get('total') is not None) else 0
        if self.total <= 0:
            self.total = max(len(self.cx), len(self.isCiliated))
        # pad arrays to total if needed
        if len(self.cx) < self.total:
            self.cx += [0.0] * (self.total - len(self.cx))
        if len(self.cy) < self.total:
            self.cy += [0.0] * (self.total - len(self.cy))
        if len(self.isCiliated) < self.total:
            self.isCiliated += [True] * (self.total - len(self.isCiliated))
        # sanitize coords to real floats
        self.cx = [ _realf(v, 0.0) for v in self.cx[:self.total] ]
        self.cy = [ _realf(v, 0.0) for v in self.cy[:self.total] ]
        # fallback sizes from grid counts if not provided
        try:
            if (self.xSize == 0.0 or self.ySize == 0.0):
                gnx = self.grid.get('nX')
                gny = self.grid.get('nY')
                if isinstance(gnx, int) and self.xSize == 0.0:
                    self.xSize = float(max(1, gnx))
                if isinstance(gny, int) and self.ySize == 0.0:
                    self.ySize = float(max(1, gny))
        except Exception:
            pass

        # fields and seeds
        if self.has_curves:
            f = data.get('fields', {})
            def _to_real_list(arr, dv=0.0):
                out=[]
                for v in arr or []:
                    try:
                        out.append(float(v))
                    except Exception:
                        try:
                            out.append(float(abs(v)))
                        except Exception:
                            out.append(float(dv))
                return out
            self.ciliaLen = _to_real_list(f.get('ciliaLen', []), 1.0)
            self.ampScale = _to_real_list(f.get('ampScale', []), 1.0)
            self.ciliaFreq = _to_real_list(f.get('ciliaFreq', []), 8.0)
            self.beatAngle = _to_real_list(f.get('beatAngle', []), 0.0)
            self.initPhase = _to_real_list(f.get('initPhase', []), 0.0)
            self.seeds = data.get('seeds', [])
            # sanitize seeds' rho if present
            if isinstance(self.seeds, list):
                for i in range(min(len(self.seeds), self.total)):
                    arr = self.seeds[i]
                    if not isinstance(arr, list):
                        continue
                    for sd in arr:
                        if not isinstance(sd, dict):
                            continue
                        if 'rho' in sd:
                            try:
                                sd['rho'] = float(sd['rho'])
                            except Exception:
                                try:
                                    sd['rho'] = float(abs(sd['rho']))
                                except Exception:
                                    sd['rho'] = 0.0
        else:
            # reconstruct from state JSON
            self._reconstruct_fields_and_seeds()

        self.cilia = []  # list of dicts: {spline, consts}

    def _prof_eval(self, s):
        cps = self.cps
        if not cps:
            return 1.0
        if s <= cps[0]['s']:
            return float(cps[0]['v'])
        if s >= cps[-1]['s']:
            return float(cps[-1]['v'])
        for i in range(len(cps) - 1):
            a, b = cps[i], cps[i + 1]
            if s >= a['s'] and s <= b['s']:
                t = (s - a['s']) / max(1e-6, (b['s'] - a['s']))
                return float(a['v'] * (1 - t) + b['v'] * t)
        return 1.0

    def _centerline(self, tFrac, A0scale, L):
        N = self.nseg
        ds = 1.0 / (N - 1)
        k0 = self.k0
        aK = self.aK
        twoPiT = 2 * pi * tFrac
        x = [0.0] * N
        z = [0.0] * N
        theta_prev = 0.0
        kappa_prev = k0 + A0scale * aK * aK * self._prof_eval(0.0) * math.cos(aK * 2 * pi * 0.0 - twoPiT)
        for i in range(1, N):
            s = i / (N - 1)
            kappa = k0 + A0scale * aK * aK * self._prof_eval(s) * math.cos(aK * 2 * pi * s - twoPiT)
            theta = theta_prev + 0.5 * (kappa_prev + kappa) * ds
            sx_prev = math.sin(theta_prev)
            sz_prev = math.cos(theta_prev)
            sx = math.sin(theta)
            sz = math.cos(theta)
            x[i] = (x[i - 1] + 0.5 * (sx_prev + sx) * ds) * L
            z[i] = (z[i - 1] + 0.5 * (sz_prev + sz) * ds) * L
            theta_prev = theta
            kappa_prev = kappa
        return x, z

    def _reconstruct_fields_and_seeds(self):
        p = self.params
        # means/stds
        Lm = float(p.get('lengthMean', 1.0))
        Ls = float(p.get('lengthStd', 0.1))
        Am = float(p.get('ampMean', 5.0))
        As = float(p.get('ampStd', 0.0))
        Fm = float(p.get('cbfMean', 8.0))
        Fs = float(p.get('cbfStd', 0.1))
        wAmp = float(p.get('waveAmp', 0.25))
        wAng = float(p.get('waveAngle', -pi / 2.0))
        angStdDeg = float(p.get('angleStd', 2.0))

        n = self.total
        self.ciliaLen = [max(0.5, _realf(Lm + Ls * _randn(), 1.0)) for _ in range(n)]
        self.ampScale = [max(0.0, _realf(Am + As * _randn(), 1.0)) for _ in range(n)]
        self.ciliaFreq = [max(0.0, _realf(Fm + Fs * _randn(), 8.0)) for _ in range(n)]
        # init phase uses wave + noise component similar to app
        self.initPhase = []
        for i in range(n):
            base = _wave_phase_at(self.cx[i], self.cy[i], self.xSize, self.ySize, wAmp, wAng)
            self.initPhase.append(_realf((1.0 - self.waveNoise) * base + self.waveNoise * random.random(), 0.0))
        # beat angle: if present in grid use it (radians), else sample from std
        g_ang = self.grid.get('ang') or []
        if g_ang and len(g_ang) == n:
            self.beatAngle = list(map(float, g_ang))
        else:
            std_rad = _realf(angStdDeg * pi / 180.0, 0.0)
            self.beatAngle = [_realf(std_rad * _randn(), 0.0) for _ in range(n)]

        # seeds per cell (~100..150), in disk around cell center with radius from cell area
        self.seeds = [[] for _ in range(n)]
        # derive approximate cell radius from domain extents and grid shape if available
        nX = int(_realf(self.grid.get('nX') or self.params.get('nX') or max(1, int(self.total ** 0.5)), 1))
        nY = int(_realf(self.grid.get('nY') or self.params.get('nY') or max(1, int(self.total / max(1, nX))), 1))
        dx = max(0.0, _realf(self.xSize, 0.0) / max(1, int(nX)))
        dy = max(0.0, _realf(self.ySize, 0.0) / max(1, int(nY)))
        # avoid complex due to negative area; clamp to non-negative before sqrt
        area = max(0.0, dx) * max(0.0, dy)
        try:
            R = math.sqrt(area / math.pi) if (dx > 0.0 and dy > 0.0) else 0.5
        except Exception:
            R = 0.5
        for i in range(n):
            if not (0 <= i < len(self.isCiliated)) or not self.isCiliated[i]:
                continue
            want = 100 + int(random.random() * 51)
            arr = []
            for _ in range(want):
                th = random.random() * 2 * pi
                rr = (random.random() ** 0.5) * R  # uniform in disk
                rx = _realf(self.cx[i], 0.0) + rr * math.cos(th)
                ry = _realf(self.cy[i], 0.0) + rr * math.sin(th)
                rho = rr / float(R if (R and _realf(R, 0.0) > 1e-6) else 1e-6)
                arr.append({
                    'x': rx, 'y': ry, 'rho': rho,
                    'dphi': (random.random() - 0.5) * 0.1,
                    'damp': (random.random() * 0.2 - 0.1),
                    'dang': (random.random() * 10.0 - 5.0) * pi / 180.0,
                    'wj': random.random(),
                })
            self.seeds[i] = arr

    def build(self, bevel_depth=DEFAULT_BEVEL, ignore_area=False):
        # Remove existing objects with our prefix
        for obj in list(bpy.data.objects):
            if obj.name.startswith(NAME_PREFIX):
                bpy.data.objects.remove(obj, do_unlink=True)
        self.cilia.clear()
        nseg = self.nseg
        # Visibility cutoff from ciliaArea
        cutoff = -1.0 if ignore_area else self.cutoff
        for cell in range(self.total):
            if not (0 <= cell < len(self.isCiliated)) or not self.isCiliated[cell]:
                continue
            seeds = self.seeds[cell] if cell < len(self.seeds) else []
            for si, sd in enumerate(seeds):
                # coerce rho to real float; handle accidental complex inputs
                val = sd.get('rho', 0.0)
                try:
                    rho = _realf(val, 0.0)
                except Exception:
                    rho = _realf(val, 0.0)
                # ensure both are real floats before compare
                if (cutoff >= 0.0) and (_realf(rho, 0.0) > _realf(cutoff, 0.0)):
                    continue
                # Create curve object
                crv = bpy.data.curves.new(f"{NAME_PREFIX}_{cell}_{si}", type='CURVE')
                crv.dimensions = '3D'
                crv.resolution_u = 1
                crv.bevel_depth = float(bevel_depth)
                spl = crv.splines.new('POLY')
                spl.points.add(nseg - 1)
                for j in range(nseg):
                    spl.points[j].co = (0.0, 0.0, 0.0, 1.0)
                obj = bpy.data.objects.new(crv.name, crv)
                bpy.context.scene.collection.objects.link(obj)
                # per-cilium constants
                consts = dict(
                    L=float(self.ciliaLen[cell]) if cell < len(self.ciliaLen) else 1.0,
                    A=float(self.ampScale[cell]) if cell < len(self.ampScale) else 1.0,
                    f=float(self.ciliaFreq[cell]) if cell < len(self.ciliaFreq) else 8.0,
                    ang=float(self.beatAngle[cell]) if cell < len(self.beatAngle) else 0.0,
                    base=float(self.initPhase[cell]) if cell < len(self.initPhase) else 0.0,
                    sd_x=float(sd.get('x', 0.0)), sd_y=float(sd.get('y', 0.0)),
                    dphi=float(sd.get('dphi', 0.0)), damp=float(sd.get('damp', 0.0)),
                    dang=float(sd.get('dang', 0.0)), wj=float(sd.get('wj', 0.0)),
                )
                self.cilia.append(dict(spline=spl, consts=consts))

    def update(self, t):
        nseg = self.nseg
        for rec in self.cilia:
            spl = rec['spline']
            C = rec['consts']
            tRoot = t * C['f']
            wNoise = self.waveNoise
            tFrac = (tRoot + (1.0 - wNoise) * C['base'] + wNoise * C['wj'] + C['dphi']) % 1.0
            A0scale = C['A'] * (1.0 + C['damp'])
            x, z = self._centerline(tFrac, A0scale, C['L'])
            a = C['ang'] + C['dang']
            ss = math.sin(a)
            cc = math.cos(a)
            for i in range(nseg):
                xp = x[i]
                zp = z[i]
                xc = xp * cc + C['sd_x']
                yc = xp * ss + C['sd_y']
                spl.points[i].co = (xc, yc, zp, 1.0)
            # tag owning Curve datablock for update so viewport refreshes reliably
            try:
                spl.id_data.update_tag()
            except Exception:
                pass


_HANDLER_NAME = "cc_frame_handler"


def _install_handler(cs: CiliaSet, fps_override=None):
    fps = fps_override or bpy.context.scene.render.fps

    def _update(scene):
        t = scene.frame_current / float(fps)
        cs.update(t)

    # remove existing
    to_del = []
    for h in bpy.app.handlers.frame_change_post:
        if getattr(h, "__name__", "") == _HANDLER_NAME:
            to_del.append(h)
    for h in to_del:
        bpy.app.handlers.frame_change_post.remove(h)

    def wrapper(scene):
        return _update(scene)

    wrapper.__name__ = _HANDLER_NAME
    bpy.app.handlers.frame_change_post.append(wrapper)


class CC_OT_ImportCurves(Operator, ImportHelper):
    bl_idname = "cc.import_cilia_curves"
    bl_label = "Import Ciliary Curves (JSON)"
    bl_options = {'REGISTER', 'UNDO'}

    filename_ext = ".json"
    # Accept both lower/upper-case JSON extensions
    filter_glob: StringProperty(default="*.json;*.JSON", options={'HIDDEN'})

    bevel_depth: FloatProperty(
        name="Bevel Depth",
        description="Curve thickness for visibility (×L0 units)",
        default=DEFAULT_BEVEL, min=0.0, soft_max=0.1,
    )
    ignore_cilia_area: BoolProperty(
        name="Ignore Cilia Area",
        description="Import all seeded cilia (do not gate by area fraction)",
        default=False,
    )
    fps_override: IntProperty(
        name="FPS Override",
        description="Set animation FPS (0 = use scene FPS)",
        default=0, min=0, max=240,
    )

    def execute(self, context):
        try:
            with open(self.filepath, 'r') as f:
                data = json.load(f)
        except Exception as e:
            self.report({'ERROR'}, f"Failed to read JSON: {e}")
            return {'CANCELLED'}

        try:
            import os
            cs = CiliaSet(data)
            cs.build(self.bevel_depth, ignore_area=self.ignore_cilia_area)
            _install_handler(cs, None if self.fps_override <= 0 else self.fps_override)
            # initial update
            sc = bpy.context.scene
            fps = sc.render.fps if self.fps_override <= 0 else self.fps_override
            t = sc.frame_current / float(fps)
            cs.update(t)
            self.report({'INFO'}, f"Imported {len(cs.cilia)} cilia curves from '{os.path.basename(self.filepath)}'. Animation handler installed.")
        except Exception as e:
            self.report({'ERROR'}, f"Import failed: {e}")
            return {'CANCELLED'}

        return {'FINISHED'}


def menu_func_import(self, context):
    self.layout.operator(CC_OT_ImportCurves.bl_idname, text="Ciliary Curves (JSON)")


def register():
    bpy.utils.register_class(CC_OT_ImportCurves)
    bpy.types.TOPBAR_MT_file_import.append(menu_func_import)


def unregister():
    try:
        bpy.types.TOPBAR_MT_file_import.remove(menu_func_import)
    except Exception:
        pass
    try:
        bpy.utils.unregister_class(CC_OT_ImportCurves)
    except Exception:
        pass


if __name__ == "__main__":
    register()
    # If run from Text Editor, open file browser
    try:
        bpy.ops.cc.import_cilia_curves('INVOKE_DEFAULT')
    except Exception:
        # may fail if context not ready; user can run from F3 search
        pass
