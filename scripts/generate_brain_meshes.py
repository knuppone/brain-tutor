"""
generate_brain_meshes.py

Downloads brain atlases via nilearn and extracts real anatomical surface meshes
for all 19 sub-structures used in Brain Tutor. Outputs normalized OBJ files to
public/models/.

Atlas sources (all from SSL-accessible servers):
  - Harvard-Oxford subcortical + cortical (fsl.fmrib.ox.ac.uk) — HO
  - Pauli 2017 (osf.io)                                          — hypothalamus
  - Juelich histological (nitrc.org)                             — corpus callosum
  - MNI152 brain mask (bundled with nilearn)                     — cerebellum

Coordinate system matches brain-cortex.obj:
  - Global brain bounding box from MNI152 brain mask
  - scale = 0.92 / max_dim,  center = bounding box midpoint
  - RAS -> Y-up: X' = -X,  Y' = Z,  Z' = Y

Usage:
    pip install nilearn nibabel scipy scikit-image trimesh numpy
    python3 scripts/generate_brain_meshes.py
"""

import os
import numpy as np

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'models')


# ── Coordinate helpers ────────────────────────────────────────────────────────

def ras_to_yup(verts: np.ndarray) -> np.ndarray:
    return np.stack([-verts[:, 0], verts[:, 2], verts[:, 1]], axis=1)


def compute_global_normalization(brain_mask_img):
    """Compute scale from MNI152 brain mask bounding box (center returned but not used)."""
    data = np.asarray(brain_mask_img.dataobj, dtype=bool)
    affine = brain_mask_img.affine
    ijk = np.argwhere(data).astype(np.float32)
    ones = np.ones((len(ijk), 1), dtype=np.float32)
    xyz_mm = (affine @ np.concatenate([ijk, ones], axis=1).T).T[:, :3]
    mins = xyz_mm.min(axis=0)
    maxs = xyz_mm.max(axis=0)
    center = (mins + maxs) / 2.0
    size = maxs - mins
    scale = 0.92 / float(size.max())
    print(f'  Brain bbox: {size.round(1)} mm, scale={scale:.6f}, center={center.round(1)}')
    return center, scale


def cortex_center_in_mm(obj_path: str, brain_max_dim_mm: float) -> np.ndarray:
    """Read brain-cortex.obj bbox center in OBJ units, convert to MNI mm.

    JS processCortexGeo centers on the cortex's own bbox, not the MNI mask center.
    We replicate that offset here so subcortical meshes register correctly.
    """
    verts = []
    with open(obj_path, encoding='latin-1', errors='ignore') as f:
        for line in f:
            if line.startswith('v ') and len(line) < 80:
                parts = line.split()
                if len(parts) == 4:
                    try:
                        verts.append([float(parts[1]), float(parts[2]), float(parts[3])])
                    except ValueError:
                        continue
    if not verts:
        raise ValueError(f'No vertices found in {obj_path}')
    v = np.array(verts, dtype=np.float32)
    lo, hi = v.min(axis=0), v.max(axis=0)
    center_obj = (lo + hi) / 2.0
    max_dim_obj = float((hi - lo).max())
    mm_per_unit = brain_max_dim_mm / max_dim_obj
    center_mm = center_obj * mm_per_unit
    print(f'  Cortex bbox center: {center_obj.round(3)} OBJ units → {center_mm.round(1)} mm')
    return center_mm


# ── Mesh extraction ───────────────────────────────────────────────────────────

def label_mask_to_mesh(mask, affine, center_mm, scale,
                       smooth_sigma=1.5, target_faces=5000):
    """Binary mask → normalized Three.js-space OBJ geometry."""
    from scipy.ndimage import gaussian_filter, binary_fill_holes
    from skimage.measure import marching_cubes
    import trimesh

    if not mask.any():
        raise ValueError('Empty mask')

    filled = binary_fill_holes(mask)
    smoothed = gaussian_filter(filled.astype(np.float32), sigma=smooth_sigma)
    if smoothed.max() < 0.5:
        raise ValueError('Smoothed mask below iso-level — structure may be too small for resolution')

    verts_vox, faces, _, _ = marching_cubes(smoothed, level=0.5, allow_degenerate=False)

    ones = np.ones((len(verts_vox), 1), dtype=np.float32)
    verts_mm = (affine @ np.concatenate([verts_vox.astype(np.float32), ones], axis=1).T).T[:, :3]
    verts_norm = (verts_mm - center_mm) * scale
    verts_final = ras_to_yup(verts_norm)

    mesh = trimesh.Trimesh(vertices=verts_final, faces=faces, process=False)
    if len(mesh.faces) > target_faces:
        mesh = mesh.simplify_quadric_decimation(face_count=target_faces)
    mesh.fix_normals()
    return np.asarray(mesh.vertices, dtype=np.float32), np.asarray(mesh.faces, dtype=np.int32)


def sphere_at_mni(center_mni, radius_mm, center_norm, scale, subdivisions=3):
    """Icosphere at a known MNI coordinate, normalized to Three.js space."""
    import trimesh
    mesh = trimesh.creation.icosphere(subdivisions=subdivisions, radius=radius_mm)
    verts_mm = np.asarray(mesh.vertices, dtype=np.float32) + center_mni
    verts_norm = (verts_mm - center_norm) * scale
    return ras_to_yup(verts_norm), np.asarray(mesh.faces, dtype=np.int32)


def write_obj(path, verts, faces, name):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(f'# Brain Tutor: {name}\n')
        f.write(f'o {name}\n')
        for v in verts:
            f.write(f'v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n')
        for face in faces:
            f.write(f'f {face[0]+1} {face[1]+1} {face[2]+1}\n')
    size_kb = os.path.getsize(path) / 1024
    print(f'  -> {os.path.basename(path)}: {len(verts):5d} verts, {len(faces):5d} faces  ({size_kb:.0f} KB)')


def safe_extract(name, fn, *args, **kwargs):
    """Run extraction, return result or None on error."""
    try:
        result = fn(*args, **kwargs)
        return result
    except Exception as e:
        print(f'  WARNING: {name} failed: {e}')
        return None


# ── Atlas-specific extractors ─────────────────────────────────────────────────

def ho_sub_structures(ho_sub_img, center_mm, scale):
    """Extract structures from Harvard-Oxford subcortical atlas."""
    data = np.asarray(ho_sub_img.dataobj, dtype=np.int16)
    affine = ho_sub_img.affine
    # Label map (from fetch_atlas_harvard_oxford('sub-maxprob-thr25-1mm')):
    # 4=Thal-L  15=Thal-R  9=Hipp-L  19=Hipp-R  10=Amyg-L  20=Amyg-R
    # 8=Brain-Stem  3=Vent-L  14=Vent-R
    # 5=Caud-L  6=Put-L  7=Pall-L  16=Caud-R  17=Put-R  18=Pall-R
    DEFS = [
        ('thalamus-l',      [4],           1.5, 5000),
        ('thalamus-r',      [15],          1.5, 5000),
        ('hippocampus-l',   [9],           1.5, 5000),
        ('hippocampus-r',   [19],          1.5, 5000),
        ('amygdala-l',      [10],          1.5, 3000),
        ('amygdala-r',      [20],          1.5, 3000),
        ('brainstem',       [8],           2.0, 8000),
        ('ventricles',      [3, 14],       1.0, 5000),
        ('basal-ganglia-l', [5, 6, 7],     1.5, 6000),
        ('basal-ganglia-r', [16, 17, 18],  1.5, 6000),
    ]
    results = {}
    for name, labels, sigma, nf in DEFS:
        mask = np.isin(data, labels)
        results[name] = safe_extract(name, label_mask_to_mesh,
                                     mask, affine, center_mm, scale, sigma, nf)
    return results


def ho_insular_cortex(ho_cort_img, center_mm, scale):
    """Split HO cortical Insular Cortex (label 2) into left/right halves."""
    from nilearn import image
    data = np.asarray(ho_cort_img.dataobj, dtype=np.int16)
    affine = ho_cort_img.affine
    insula_mask = data == 2

    # Compute MNI x-coordinates for every voxel
    shape = data.shape
    i_idx = np.arange(shape[0])
    mni_x = affine[0, 0] * i_idx + affine[0, 3]  # simplified: assumes no shear
    x_vol = np.broadcast_to(mni_x[:, None, None], shape)

    results = {}
    for side, sign in [('insular-cortex-l', -1), ('insular-cortex-r', 1)]:
        mask = insula_mask & (sign * x_vol > 0)
        results[side] = safe_extract(side, label_mask_to_mesh,
                                     mask, affine, center_mm, scale, 1.5, 4000)
    return results


def juelich_corpus_callosum(ju_img, ref_img, center_mm, scale):
    """Corpus callosum from Juelich 'WM Callosal body' (label 54)."""
    from nilearn import image
    ju_r = image.resample_to_img(ju_img, ref_img, interpolation='nearest')
    data = np.asarray(ju_r.dataobj, dtype=np.int16)
    affine = ref_img.affine
    mask = data == 54
    return safe_extract('corpus-callosum', label_mask_to_mesh,
                        mask, affine, center_mm, scale, 1.5, 5000)


def pauli_hypothalamus(pauli_img, ref_img, center_mm, scale):
    """Hypothalamus from Pauli 2017 probability atlas (HTH = volume 13)."""
    from nilearn import image
    import nibabel as nib
    # Pauli atlas is 4D: shape (x,y,z,n_labels)
    pauli_r = image.resample_to_img(pauli_img, ref_img, interpolation='continuous')
    data4d = np.asarray(pauli_r.dataobj, dtype=np.float32)
    # HTH is the 13th label (0-indexed)
    hth_prob = data4d[..., 13]
    affine = ref_img.affine
    # Threshold at 0.3 probability
    mask = hth_prob > 0.3
    if not mask.any():
        mask = hth_prob > 0.1  # fallback lower threshold
    return safe_extract('hypothalamus', label_mask_to_mesh,
                        mask, affine, center_mm, scale, 1.5, 2000)


def extract_cerebellum(ho_sub_img, brain_mask_img, center_mm, scale):
    """
    Cerebellum = brain_mask AND posterior-inferior region
    minus cerebral hemispheres and brainstem (from HO atlas).
    """
    from nilearn import image
    bm_r = image.resample_to_img(brain_mask_img, ho_sub_img, interpolation='nearest')
    bm = np.asarray(bm_r.dataobj, dtype=bool)
    ho = np.asarray(ho_sub_img.dataobj, dtype=np.int16)
    affine = ho_sub_img.affine

    # Exclude cerebral hemispheres (WM + Cortex) and brainstem from HO
    cerebral_ids = [1, 2, 12, 13]   # L/R WM and Cortex
    brainstem_id = 8
    other_ids    = [3, 4, 5, 6, 7, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21]
    exclude = np.isin(ho, cerebral_ids + [brainstem_id] + other_ids)

    # Spatial posterior-inferior mask (cerebellum territory in MNI)
    shape = ho.shape
    i_idx = np.arange(shape[0])
    j_idx = np.arange(shape[1])
    k_idx = np.arange(shape[2])
    I, J, K = np.meshgrid(i_idx, j_idx, k_idx, indexing='ij')
    ones = np.ones_like(I)
    ijk_h = np.stack([I, J, K, ones], axis=-1).reshape(-1, 4).T.astype(np.float32)
    xyz_mm = (affine @ ijk_h)[:3].T.reshape(shape + (3,))
    mni_y = xyz_mm[..., 1]
    mni_z = xyz_mm[..., 2]

    posterior_inferior = (mni_y < -38) & (mni_z < 8)
    cerebellum_mask = bm & posterior_inferior & ~exclude

    return safe_extract('cerebellum', label_mask_to_mesh,
                        cerebellum_mask, affine, center_mm, scale, 2.0, 12000)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    from nilearn import datasets
    import nibabel as nib

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f'Output: {os.path.abspath(OUTPUT_DIR)}\n')

    # ── Load atlases ────────────────────────────────────────────────────────
    print('Loading atlases...')
    def as_img(obj):
        """Return NIfTI image whether nilearn gave us an image or a path."""
        if isinstance(obj, str):
            return nib.load(obj)
        return obj  # already a NIfTI image (newer nilearn)

    print('  Harvard-Oxford subcortical...')
    ho_sub = datasets.fetch_atlas_harvard_oxford('sub-maxprob-thr25-1mm')
    ho_sub_img = as_img(ho_sub.maps)

    print('  Harvard-Oxford cortical...')
    ho_cort = datasets.fetch_atlas_harvard_oxford('cort-maxprob-thr25-1mm')
    ho_cort_img = as_img(ho_cort.maps)

    print('  Juelich histological...')
    ju = datasets.fetch_atlas_juelich('maxprob-thr25-1mm')
    ju_img = as_img(ju.maps)

    print('  Pauli 2017 subcortical...')
    pauli = datasets.fetch_atlas_pauli_2017()
    pauli_img = as_img(pauli.maps)

    print('  MNI152 brain mask...')
    bm_img = datasets.load_mni152_brain_mask(resolution=1)

    # ── Global normalization ────────────────────────────────────────────────
    print('\nComputing global normalization...')
    _, scale = compute_global_normalization(bm_img)
    brain_max_dim_mm = 0.92 / scale
    cortex_obj_path = os.path.join(OUTPUT_DIR, 'brain-cortex.obj')
    center_mm = cortex_center_in_mm(cortex_obj_path, brain_max_dim_mm)

    # ── Harvard-Oxford subcortical structures ───────────────────────────────
    print('\nExtracting HO subcortical structures...')
    ho_sub_results = ho_sub_structures(ho_sub_img, center_mm, scale)
    for name, result in ho_sub_results.items():
        if result:
            write_obj(os.path.join(OUTPUT_DIR, f'{name}.obj'), result[0], result[1], name)

    # ── Insular cortex (bilateral split from HO cortical) ───────────────────
    print('\nExtracting insular cortex...')
    insula = ho_insular_cortex(ho_cort_img, center_mm, scale)
    for name, result in insula.items():
        if result:
            write_obj(os.path.join(OUTPUT_DIR, f'{name}.obj'), result[0], result[1], name)

    # ── Corpus callosum (Juelich WM Callosal body) ──────────────────────────
    print('\nExtracting corpus callosum...')
    result = juelich_corpus_callosum(ju_img, ho_sub_img, center_mm, scale)
    if result:
        write_obj(os.path.join(OUTPUT_DIR, 'corpus-callosum.obj'), result[0], result[1], 'corpus-callosum')

    # ── Hypothalamus (Pauli 2017) ───────────────────────────────────────────
    print('\nExtracting hypothalamus...')
    result = pauli_hypothalamus(pauli_img, ho_sub_img, center_mm, scale)
    if result:
        write_obj(os.path.join(OUTPUT_DIR, 'hypothalamus.obj'), result[0], result[1], 'hypothalamus')
    else:
        print('  Falling back to sphere at MNI (0,-4,-10)')
        v, f = sphere_at_mni(np.array([0.0, -4.0, -10.0]), 7.0, center_mm, scale)
        write_obj(os.path.join(OUTPUT_DIR, 'hypothalamus.obj'), v, f, 'hypothalamus')

    # ── Cerebellum (brain mask - cerebral structures, posterior-inferior) ───
    print('\nExtracting cerebellum...')
    result = extract_cerebellum(ho_sub_img, bm_img, center_mm, scale)
    if result:
        write_obj(os.path.join(OUTPUT_DIR, 'cerebellum.obj'), result[0], result[1], 'cerebellum')

    # ── Small structures as icospheres at known MNI coordinates ─────────────
    print('\nGenerating small structures as icospheres...')
    GLANDS = [
        ('pituitary',        np.array([0.0,   -4.0, -30.0]), 4.0, 3),
        ('pineal-gland',     np.array([0.0,  -30.0,   0.0]), 3.0, 3),
        # Olfactory bulbs: inferior surface of frontal lobe, MNI Y≈+40 (anterior)
        ('olfactory-bulb-l', np.array([-10.0, 40.0, -30.0]), 5.0, 3),
        ('olfactory-bulb-r', np.array([ 10.0, 40.0, -30.0]), 5.0, 3),
    ]
    for name, mni_center, radius, subdiv in GLANDS:
        v, f = sphere_at_mni(mni_center, radius, center_mm, scale, subdiv)
        write_obj(os.path.join(OUTPUT_DIR, f'{name}.obj'), v, f, name)

    # ── Summary ─────────────────────────────────────────────────────────────
    print('\n=== Done ===')
    new_files = sorted(f for f in os.listdir(OUTPUT_DIR)
                       if f.endswith('.obj') and f != 'brain-cortex.obj')
    print(f'Generated {len(new_files)} OBJ files')
    missing = [n for n in [
        'brainstem', 'cerebellum', 'hippocampus-l', 'hippocampus-r',
        'amygdala-l', 'amygdala-r', 'thalamus-l', 'thalamus-r',
        'hypothalamus', 'basal-ganglia-l', 'basal-ganglia-r',
        'corpus-callosum', 'insular-cortex-l', 'insular-cortex-r',
        'pituitary', 'pineal-gland', 'ventricles',
        'olfactory-bulb-l', 'olfactory-bulb-r',
    ] if not os.path.exists(os.path.join(OUTPUT_DIR, f'{n}.obj'))]
    if missing:
        print(f'MISSING: {missing}')


if __name__ == '__main__':
    main()
