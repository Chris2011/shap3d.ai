"""
SketchUp .skp -> glTF binary (.glb), using Trimble's official SketchUp C SDK through ctypes.

    python skp2glb.py input.skp output.glb

The SDK library (SketchUpAPI.dll / .dylib) is located through the SKETCHUP_API environment variable
(set by tools/convertBridge.ts). Only the Python standard library is used.

Output: one glTF node per group / component instance (with its transform), geometry in metres,
Z axis up (as in SketchUp), materials with base colour and opacity (front material, else the material
inherited from the enclosing group/instance).
"""
import ctypes as C
import json
import os
import struct
import sys

INCH = 0.0254

# ------------------------------------------------------------------ SDK binding
class Ref(C.Structure):
    """All SketchUp object references are a struct holding one pointer, passed by value."""
    _fields_ = [('ptr', C.c_void_p)]

class Point3D(C.Structure):
    _fields_ = [('x', C.c_double), ('y', C.c_double), ('z', C.c_double)]

class Transform(C.Structure):
    _fields_ = [('values', C.c_double * 16)]  # column-major, inches

class Color(C.Structure):
    _fields_ = [('red', C.c_ubyte), ('green', C.c_ubyte), ('blue', C.c_ubyte), ('alpha', C.c_ubyte)]


def load_sdk():
    path = os.environ.get('SKETCHUP_API')
    if not path or not os.path.exists(path):
        sys.exit('SketchUpAPI library not found (SKETCHUP_API)')
    folder = os.path.dirname(path)
    if hasattr(os, 'add_dll_directory'):
        os.add_dll_directory(folder)  # dependent DLLs live next to SketchUpAPI.dll
    os.environ['PATH'] = folder + os.pathsep + os.environ.get('PATH', '')
    return C.CDLL(path)


su = load_sdk()
size_t = C.c_size_t


def call(name, *args):
    fn = getattr(su, name)
    fn.restype = C.c_int
    return fn(*args)


def ok(name, *args):
    r = call(name, *args)
    if r != 0:
        raise RuntimeError(f'{name} failed ({r})')


def has(name):
    return hasattr(su, name)


def get_string(getter, ref):
    s = Ref()
    ok('SUStringCreate', C.byref(s))
    try:
        if call(getter, ref, C.byref(s)) != 0:
            return ''
        n = size_t()
        ok('SUStringGetUTF8Length', s, C.byref(n))
        buf = C.create_string_buffer(n.value + 1)
        got = size_t()
        ok('SUStringGetUTF8', s, size_t(n.value + 1), buf, C.byref(got))
        return buf.value.decode('utf-8', 'replace')
    finally:
        call('SUStringRelease', C.byref(s))


def get_list(count_fn, get_fn, owner):
    n = size_t()
    if call(count_fn, owner, C.byref(n)) != 0 or n.value == 0:
        return []
    arr = (Ref * n.value)()
    got = size_t()
    ok(get_fn, owner, n, arr, C.byref(got))
    return [arr[i] for i in range(got.value)]


# ------------------------------------------------------------------ materials
materials = []          # glTF materials
material_index = {}     # SketchUp material pointer -> glTF index


def material_of(mat_ref):
    if not mat_ref or not mat_ref.ptr:
        return None
    key = mat_ref.ptr
    if key in material_index:
        return material_index[key]
    name = get_string('SUMaterialGetName', mat_ref) or f'Material {len(materials) + 1}'
    col = Color()
    rgba = [0.8, 0.8, 0.8, 1.0]
    if call('SUMaterialGetColor', mat_ref, C.byref(col)) == 0:
        srgb = lambda v: (v / 255) / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4
        rgba = [srgb(col.red), srgb(col.green), srgb(col.blue), 1.0]
    opacity = C.c_double(1.0)
    if call('SUMaterialGetOpacity', mat_ref, C.byref(opacity)) == 0:
        rgba[3] = max(0.0, min(1.0, opacity.value))
    m = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': rgba, 'metallicFactor': 0, 'roughnessFactor': 0.9}, 'doubleSided': True}
    if rgba[3] < 0.999:
        m['alphaMode'] = 'BLEND'
    material_index[key] = len(materials)
    materials.append(m)
    return material_index[key]


def face_material(face, inherited):
    m = Ref()
    if call('SUFaceGetFrontMaterial', face, C.byref(m)) == 0 and m.ptr:
        return material_of(m)
    if call('SUFaceGetBackMaterial', face, C.byref(m)) == 0 and m.ptr:
        return material_of(m)
    return inherited


def element_material(to_element, ref, inherited):
    fn = getattr(su, to_element)
    fn.restype = Ref
    el = fn(ref)
    m = Ref()
    if el.ptr and call('SUDrawingElementGetMaterial', el, C.byref(m)) == 0 and m.ptr:
        return material_of(m)
    return inherited


def hidden(to_element, ref):
    fn = getattr(su, to_element)
    fn.restype = Ref
    el = fn(ref)
    h = C.c_bool(False)
    return bool(el.ptr) and call('SUDrawingElementGetHidden', el, C.byref(h)) == 0 and h.value


# ------------------------------------------------------------------ geometry
def faces_to_primitives(entities, inherited):
    """Triangulates all faces of one entities collection, grouped by material."""
    by_mat = {}
    for face in get_list('SUEntitiesGetNumFaces', 'SUEntitiesGetFaces', entities):
        if hidden('SUFaceToDrawingElement', face):
            continue
        helper = Ref()
        if call('SUMeshHelperCreate', C.byref(helper), face) != 0:
            continue
        try:
            nv, nt = size_t(), size_t()
            ok('SUMeshHelperGetNumVertices', helper, C.byref(nv))
            ok('SUMeshHelperGetNumTriangles', helper, C.byref(nt))
            if nv.value == 0 or nt.value == 0:
                continue
            pts = (Point3D * nv.value)()
            got = size_t()
            ok('SUMeshHelperGetVertices', helper, nv, pts, C.byref(got))
            idx = (size_t * (nt.value * 3))()
            ok('SUMeshHelperGetVertexIndices', helper, size_t(nt.value * 3), idx, C.byref(got))
            prim = by_mat.setdefault(face_material(face, inherited), ([], []))
            base = len(prim[0]) // 3
            for p in pts:
                prim[0].extend((p.x * INCH, p.y * INCH, p.z * INCH))
            prim[1].extend(base + idx[i] for i in range(got.value))
        finally:
            call('SUMeshHelperRelease', C.byref(helper))
    return by_mat


# ------------------------------------------------------------------ glTF assembly
binary = bytearray()
buffer_views, accessors, meshes, nodes = [], [], [], []


def add_view(data, target):
    while len(binary) % 4:
        binary.append(0)
    buffer_views.append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data), 'target': target})
    binary.extend(data)
    return len(buffer_views) - 1


def make_mesh(by_mat, name):
    prims = []
    for mat, (pos, ind) in by_mat.items():
        if not ind:
            continue
        xs, ys, zs = pos[0::3], pos[1::3], pos[2::3]
        pv = add_view(struct.pack(f'<{len(pos)}f', *pos), 34962)
        accessors.append({'bufferView': pv, 'componentType': 5126, 'count': len(pos) // 3, 'type': 'VEC3',
                          'min': [min(xs), min(ys), min(zs)], 'max': [max(xs), max(ys), max(zs)]})
        pa = len(accessors) - 1
        iv = add_view(struct.pack(f'<{len(ind)}I', *ind), 34963)
        accessors.append({'bufferView': iv, 'componentType': 5125, 'count': len(ind), 'type': 'SCALAR'})
        prim = {'attributes': {'POSITION': pa}, 'indices': len(accessors) - 1}
        if mat is not None:
            prim['material'] = mat
        prims.append(prim)
    if not prims:
        return None
    meshes.append({'name': name, 'primitives': prims})
    return len(meshes) - 1


def matrix(t):
    v = list(t.values)
    v[12] *= INCH; v[13] *= INCH; v[14] *= INCH  # translation inches -> metres
    return v


def walk(entities, inherited, name):
    """Returns a glTF node index for an entities collection (faces as mesh, groups/instances as children)."""
    node = {'name': name or 'Model', 'children': []}
    m = make_mesh(faces_to_primitives(entities, inherited), name)
    if m is not None:
        node['mesh'] = m
    for g in get_list('SUEntitiesGetNumGroups', 'SUEntitiesGetGroups', entities):
        if hidden('SUGroupToDrawingElement', g):
            continue
        sub = Ref(); ok('SUGroupGetEntities', g, C.byref(sub))
        t = Transform(); ok('SUGroupGetTransform', g, C.byref(t))
        child = walk(sub, element_material('SUGroupToDrawingElement', g, inherited), get_string('SUGroupGetName', g) or 'Gruppe')
        nodes[child]['matrix'] = matrix(t)
        node['children'].append(child)
    for inst in get_list('SUEntitiesGetNumInstances', 'SUEntitiesGetInstances', entities):
        if hidden('SUComponentInstanceToDrawingElement', inst):
            continue
        d = Ref(); ok('SUComponentInstanceGetDefinition', inst, C.byref(d))
        sub = Ref(); ok('SUComponentDefinitionGetEntities', d, C.byref(sub))
        t = Transform(); ok('SUComponentInstanceGetTransform', inst, C.byref(t))
        label = get_string('SUComponentInstanceGetName', inst) or get_string('SUComponentDefinitionGetName', d) or 'Komponente'
        child = walk(sub, element_material('SUComponentInstanceToDrawingElement', inst, inherited), label)
        nodes[child]['matrix'] = matrix(t)
        node['children'].append(child)
    if not node['children']:
        del node['children']
    nodes.append(node)
    return len(nodes) - 1


def main(src, dst):
    call('SUInitialize')
    model = Ref()
    try:
        if has('SUModelCreateFromFileWithStatus'):
            status = C.c_int(0)
            r = call('SUModelCreateFromFileWithStatus', C.byref(model), src.encode('utf-8'), C.byref(status))
        else:
            r = call('SUModelCreateFromFile', C.byref(model), src.encode('utf-8'))
        if r != 0:
            sys.exit(f'Die SKP-Datei konnte nicht geöffnet werden (Fehler {r}) – evtl. neuer als das SDK?')
        ents = Ref(); ok('SUModelGetEntities', model, C.byref(ents))
        root = walk(ents, None, os.path.splitext(os.path.basename(src))[0])
        gltf = {
            'asset': {'version': '2.0', 'generator': 'Shap3D.ai skp2glb (SketchUp SDK)'},
            'extras': {'upAxis': 'Z', 'unit': 'meter'},
            'scene': 0, 'scenes': [{'nodes': [root]}], 'nodes': nodes,
            'meshes': meshes, 'materials': materials, 'accessors': accessors, 'bufferViews': buffer_views,
            'buffers': [{'byteLength': len(binary)}],
        }
        if not materials:
            del gltf['materials']
        js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
        js += b' ' * ((4 - len(js) % 4) % 4)
        while len(binary) % 4:
            binary.append(0)
        with open(dst, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary)))
            f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack('<II', len(binary), 0x004E4942)); f.write(binary)
    finally:
        if model.ptr:
            call('SUModelRelease', C.byref(model))
        call('SUTerminate')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit('usage: skp2glb.py input.skp output.glb')
    main(sys.argv[1], sys.argv[2])
