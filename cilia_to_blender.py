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
from bpy.app.handlers import persistent
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
                try:
                    crv.use_fill_caps = True
                except Exception:
                    pass
                spl = crv.splines.new('POLY')
                spl.points.add(nseg - 1)
                for j in range(nseg):
                    spl.points[j].co = (0.0, 0.0, 0.0, 1.0)
                obj = bpy.data.objects.new(crv.name, crv)
                bpy.context.scene.collection.objects.link(obj)
                # assign rough cilia material
                try:
                    _assign_cilia_material(obj)
                except Exception:
                    pass
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
                # persist per-cilium constants for reload
                try:
                    for k,v in consts.items():
                        obj["cc_"+k] = float(v)
                except Exception:
                    pass
        # persist global params for reload
        try:
            sc = bpy.context.scene
            sc["cc_nseg"] = int(self.nseg)
            sc["cc_k0"] = float(self.k0)
            sc["cc_aK"] = float(self.aK)
            sc["cc_waveNoise"] = float(self.waveNoise)
            sc["cc_cps_json"] = json.dumps(self.cps)
        except Exception:
            pass

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
    build_cell_volumes: BoolProperty(
        name="Build Cell Volumes",
        description="Import Voronoi cell volumes if polygons are present in JSON",
        default=True,
    )
    volume_depth: FloatProperty(
        name="Volume Depth (×L0)",
        description="Extrude polygons downward by this depth",
        default=1.2, min=0.0, soft_max=5.0,
    )
    jitter_amp: FloatProperty(
        name="Bottom XY Jitter",
        description="Small random jitter applied to bottom polygon",
        default=0.08, min=0.0, soft_max=0.5,
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
            # volumes: prefer precomputed rings from JSON, else fallback to polys
            try:
                grid = data.get('grid') or {}
                vols = data.get('volumes') or {}
                rings_by_cell = vols.get('rings')
                isCil = grid.get('isCiliated')
                if self.build_cell_volumes and rings_by_cell:
                    _build_cell_volumes_from_rings(rings_by_cell, is_ciliated=isCil)
                elif self.build_cell_volumes and grid.get('polys'):
                    _build_cell_volumes(grid.get('polys'), depth=float(self.volume_depth), jitter=float(self.jitter_amp), is_ciliated=isCil)
            except Exception as e:
                self.report({'WARNING'}, f"Cell volumes skipped: {e}")
        except Exception as e:
            self.report({'ERROR'}, f"Import failed: {e}")
            return {'CANCELLED'}

        return {'FINISHED'}


def menu_func_import(self, context):
    self.layout.operator(CC_OT_ImportCurves.bl_idname, text="Ciliary Curves (JSON)")


def register():
    bpy.utils.register_class(CC_OT_ImportCurves)
    bpy.types.TOPBAR_MT_file_import.append(menu_func_import)
    # install persistent handlers
    try:
        if cc_frame_handler not in bpy.app.handlers.frame_change_post:
            bpy.app.handlers.frame_change_post.append(cc_frame_handler)
    except Exception:
        pass
    try:
        if cc_load_post not in bpy.app.handlers.load_post:
            bpy.app.handlers.load_post.append(cc_load_post)
    except Exception:
        pass


def unregister():
    try:
        bpy.types.TOPBAR_MT_file_import.remove(menu_func_import)
    except Exception:
        pass
    try:
        bpy.utils.unregister_class(CC_OT_ImportCurves)
    except Exception:
        pass
    try:
        bpy.app.handlers.frame_change_post.remove(cc_frame_handler)
    except Exception:
        pass
    try:
        bpy.app.handlers.load_post.remove(cc_load_post)
    except Exception:
        pass


# ===== Materials, volumes, and persistent handlers =====

def _get_or_make_material(name, make_fn):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        try:
            mat.use_nodes = True
            # clear
            nt = mat.node_tree
            for n in list(nt.nodes):
                nt.nodes.remove(n)
            make_fn(mat)
        except Exception:
            pass
    return mat

def _assign_cilia_material(obj):
    def _build(mat):
        nt = mat.node_tree
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.inputs['Base Color'].default_value = (0.8, 0.8, 0.82, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.9
        bsdf.inputs['Specular'].default_value = 0.1
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    mat = _get_or_make_material('CiliaMaterial', _build)
    try:
        if len(obj.data.materials) == 0:
            obj.data.materials.append(mat)
        else:
            obj.data.materials[0] = mat
    except Exception:
        pass

def _assign_volume_material(obj, ciliated=False):
    def _build_cil(mat):
        nt = mat.node_tree
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.inputs['Base Color'].default_value = (0.2, 0.6, 0.9, 0.35)
        bsdf.inputs['Roughness'].default_value = 0.7
        bsdf.inputs['Specular'].default_value = 0.1
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        try:
            mat.blend_method = 'BLEND'
            mat.shadow_method = 'NONE'
        except Exception:
            pass
    def _build_gray(mat):
        nt = mat.node_tree
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.inputs['Base Color'].default_value = (0.6, 0.6, 0.6, 0.25)
        bsdf.inputs['Roughness'].default_value = 0.8
        bsdf.inputs['Specular'].default_value = 0.05
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        try:
            mat.blend_method = 'BLEND'
            mat.shadow_method = 'NONE'
        except Exception:
            pass
    mat = _get_or_make_material('CellVolumeMaterialCiliated' if ciliated else 'CellVolumeMaterialGray', _build_cil if ciliated else _build_gray)
    try:
        if len(obj.data.materials) == 0:
            obj.data.materials.append(mat)
        else:
            obj.data.materials[0] = mat
    except Exception:
        pass

def _build_cell_volumes(polys, depth=1.2, jitter=0.02, is_ciliated=None):
    import bmesh
    for i, poly in enumerate(polys or []):
        if not poly or len(poly) < 3:
            continue
        top = [(float(p[0]), float(p[1]), 0.0) for p in poly]
        bot = []
        for p in poly:
            jx = (random.random()*2.0 - 1.0) * float(jitter)
            jy = (random.random()*2.0 - 1.0) * float(jitter)
            bot.append((float(p[0]) + jx, float(p[1]) + jy, -float(depth)))
        me = bpy.data.meshes.new(f"CellVol_{i}")
        bm = bmesh.new()
        vtop = [bm.verts.new(co) for co in top]
        vbot = [bm.verts.new(co) for co in bot]
        bm.verts.ensure_lookup_table()
        n = len(poly)
        # sides
        for k in range(n):
            a=vtop[k]; b=vtop[(k+1)%n]; c=vbot[(k+1)%n]; d=vbot[k]
            try:
                bm.faces.new([a,b,c,d])
            except Exception:
                pass
        # caps
        try:
            bm.faces.new(vtop)
        except Exception:
            pass
        try:
            bm.faces.new(list(reversed(vbot)))
        except Exception:
            pass
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        obj = bpy.data.objects.new(me.name, me)
        bpy.context.scene.collection.objects.link(obj)
        cil = False
        try:
            if isinstance(is_ciliated, list) and i < len(is_ciliated):
                cil = bool(is_ciliated[i])
        except Exception:
            cil = False
        _assign_volume_material(obj, ciliated=cil)

def _build_cell_volumes_from_rings(rings_by_cell, is_ciliated=None):
    import bpy
    import array
    for i, rings in enumerate(rings_by_cell or []):
        if not rings or any(r is None or len(r)<3 for r in rings):
            continue
        ringN = len(rings[0])
        slices = len(rings) - 1
        totalV = (slices+1)*ringN + 2
        pos = array.array('f', [0.0]*(totalV*3))
        v = 0
        for s in range(slices+1):
            for j in range(ringN):
                P = rings[s][j]
                pos[v] = float(P[0]); pos[v+1] = float(P[1]); pos[v+2] = float(P[2]); v += 3
        topCenterIdx = (slices+1)*ringN
        botCenterIdx = topCenterIdx + 1
        cxTop = sum(p[0] for p in rings[0]) / ringN
        cyTop = sum(p[1] for p in rings[0]) / ringN
        cxBot = sum(p[0] for p in rings[slices]) / ringN
        cyBot = sum(p[1] for p in rings[slices]) / ringN
        pos[v] = cxTop; pos[v+1] = cyTop; pos[v+2] = float(rings[0][0][2]); v += 3
        pos[v] = cxBot; pos[v+1] = cyBot; pos[v+2] = float(rings[slices][0][2])

        sideCount = slices*ringN*6
        capCount = ringN*3*2
        import array as _arr
        idx = _arr.array('I', [0]*(sideCount+capCount))
        t = 0
        for s in range(slices):
            for j in range(ringN):
                a = s*ringN + j
                b = s*ringN + ((j+1)%ringN)
                c = (s+1)*ringN + ((j+1)%ringN)
                d = (s+1)*ringN + j
                idx[t]=a; idx[t+1]=b; idx[t+2]=c; idx[t+3]=a; idx[t+4]=c; idx[t+5]=d; t+=6
        for j in range(ringN):
            idx[t]=topCenterIdx; idx[t+1]=j; idx[t+2]=(j+1)%ringN; t+=3
        base = slices*ringN
        for j in range(ringN):
            idx[t]=botCenterIdx; idx[t+1]=base+((j+1)%ringN); idx[t+2]=base+j; t+=3

        me = bpy.data.meshes.new(f"CellVol_{i}")
        me.from_pydata([(pos[k], pos[k+1], pos[k+2]) for k in range(0,len(pos),3)], [], [(idx[k], idx[k+1], idx[k+2]) for k in range(0,len(idx),3)])
        me.update()
        obj = bpy.data.objects.new(me.name, me)
        bpy.context.scene.collection.objects.link(obj)
        cil = False
        try:
            if isinstance(is_ciliated, list) and i < len(is_ciliated):
                cil = bool(is_ciliated[i])
        except Exception:
            cil = False
        _assign_volume_material(obj, ciliated=cil)

# Persistent animation across file reloads
_g_cs = None

def _rebuild_from_scene(scene):
    try:
        nseg = int(scene.get('cc_nseg', 0))
        k0 = float(scene.get('cc_k0', 0.0))
        aK = float(scene.get('cc_aK', 0.0))
        waveNoise = float(scene.get('cc_waveNoise', 0.0))
        cps = None
        if 'cc_cps_json' in scene:
            try:
                cps = json.loads(scene['cc_cps_json'])
            except Exception:
                cps = None
        if nseg < 2:
            return None
        data = {'nSeg': nseg, 'params': {'k0': k0, 'aK': aK, 'waveNoise': waveNoise, 'profile': {'cps': cps or [{'s':0,'v':0.2},{'s':1,'v':1.0}]}}}
        cs = CiliaSet(data)
        cs.cilia = []
        for obj in bpy.data.objects:
            if obj.type == 'CURVE' and obj.name.startswith(NAME_PREFIX):
                if not obj.data.splines:
                    continue
                spl = obj.data.splines[0]
                consts = {}
                for k in ['L','A','f','ang','base','sd_x','sd_y','dphi','damp','dang','wj']:
                    consts[k] = float(obj.get('cc_'+k, 0.0))
                cs.cilia.append({'spline': spl, 'consts': consts})
        return cs
    except Exception:
        return None

@persistent
def cc_frame_handler(scene):
    global _g_cs
    if _g_cs is None:
        _g_cs = _rebuild_from_scene(scene)
        if _g_cs is None:
            return
    try:
        fps = scene.get('cc_fps', scene.render.fps)
        t = scene.frame_current / float(fps if fps else scene.render.fps)
        _g_cs.update(t)
    except Exception:
        pass

@persistent
def cc_load_post(dummy):
    try:
        if cc_frame_handler not in bpy.app.handlers.frame_change_post:
            bpy.app.handlers.frame_change_post.append(cc_frame_handler)
    except Exception:
        pass
    global _g_cs
    _g_cs = None

if __name__ == "__main__":
    register()
    # If run from Text Editor, open file browser
    try:
        bpy.ops.cc.import_cilia_curves('INVOKE_DEFAULT')
    except Exception:
        # may fail if context not ready; user can run from F3 search
        pass
