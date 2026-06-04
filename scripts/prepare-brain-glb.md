# Preparing the Brain GLB from Z-Anatomy

This document describes how to obtain and prepare a real brain mesh for use in Brain Tutor.

## Source

Z-Anatomy is an open-source human anatomy atlas (CC BY 4.0) that includes high-quality brain meshes with anatomically labelled structures.

- Repository: https://github.com/LluisV/Z-Anatomy
- Releases page: https://github.com/LluisV/Z-Anatomy/releases

## Steps

### 1. Download the Z-Anatomy release

Download the latest release ZIP from the GitHub releases page. Extract it to get the `.blend` file or FBX exports.

### 2. Open in Blender

Open the `.blend` file in Blender 3.x or later. The brain structures are organised as separate mesh objects with anatomically meaningful names.

### 3. Identify brain meshes

In the Outliner, locate objects belonging to the central nervous system. Key objects to keep:

| Z-Anatomy object name | Brain Tutor region ID |
|---|---|
| `Cerebral_cortex` / outer brain shell | `cerebral-cortex` |
| `Frontal_lobe` | `frontal-lobe` |
| `Parietal_lobe` | `parietal-lobe` |
| `Temporal_lobe` | `temporal-lobe` |
| `Occipital_lobe` | `occipital-lobe` |
| `Cerebellum` | `cerebellum` |
| `Brainstem` / `Medulla_oblongata` + `Pons` + `Midbrain` | `brainstem` |
| `Hippocampus_L` + `Hippocampus_R` | `hippocampus` |
| `Amygdala_L` + `Amygdala_R` | `amygdala` |
| `Thalamus` | `thalamus` |
| `Hypothalamus` | `hypothalamus` |
| `Caudate_nucleus` + `Putamen` | `basal-ganglia` |
| `Corpus_callosum` | `corpus-callosum` |
| `Insula` | `insular-cortex` |
| `Pituitary_gland` | `pituitary` |
| `Pineal_gland` | `pineal-gland` |
| `Lateral_ventricle_L` + `Lateral_ventricle_R` + `Third_ventricle` + `Fourth_ventricle` | `ventricles` |
| `Olfactory_bulb_L` + `Olfactory_bulb_R` | `olfactory-bulb` |

### 4. Rename meshes

Rename each Blender object so the name matches one of the `meshNames` entries in `src/data/regions.ts`. For example:

- Rename `Cerebral_cortex` → `CerebralCortex`
- Rename `Hippocampus_L` → keep as `Hippocampus_L` (already listed in meshNames)
- Join left+right pairs with Ctrl+J if you want a single mesh, then rename to the primary meshName

### 5. Optimise geometry

- Apply modifiers, remove doubles (Merge by Distance)
- Reduce poly count with the Decimate modifier: target ~50k triangles total for web
- Apply transforms (Ctrl+A → All Transforms)
- Centre the brain at the world origin with the superior/inferior axis along Y

### 6. Export as GLB

File → Export → glTF 2.0 (.glb/.gltf)

Settings:
- Format: GLB
- Include: Selected Objects (or all brain objects)
- Geometry: Apply Modifiers ✓, UVs ✓, Normals ✓
- Compression: Draco compression recommended (reduces file size ~70%)

Save as `public/brain.glb`.

### 7. Update BrainModel.tsx

Once `public/brain.glb` is in place, replace the procedural geometry in `BrainModel.tsx` with a GLTF loader:

```tsx
import { useGLTF } from '@react-three/drei'
import { buildMeshLookup } from '../data/regions'

const meshLookup = buildMeshLookup()

export function BrainModel() {
  const { nodes } = useGLTF('/brain.glb')
  // Iterate nodes, match meshLookup to get regionId, render with region color/highlight
}
```

Use `useGLTF.preload('/brain.glb')` at the bottom of the file for preloading.

### 8. Verify

Run `npm run dev` and confirm all 18 regions are clickable and render with the correct colours.
