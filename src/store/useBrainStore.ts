import { create } from 'zustand'
import { curriculumOrder } from '../data/regions'

interface BrainState {
  hoveredRegionId: string | null
  selectedRegionId: string | null
  visitedRegionIds: Set<string>
  cameraFromCurriculum: boolean
  setHovered: (id: string | null) => void
  setSelected: (id: string | null, fromCurriculum?: boolean) => void
  next: () => void
  prev: () => void
}

const VISITED_KEY = 'brain-tutor:visited'

function loadVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(VISITED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {}
  return new Set()
}

function saveVisited(ids: Set<string>) {
  localStorage.setItem(VISITED_KEY, JSON.stringify([...ids]))
}

export const useBrainStore = create<BrainState>((set, get) => ({
  hoveredRegionId: null,
  selectedRegionId: null,
  visitedRegionIds: loadVisited(),
  cameraFromCurriculum: false,

  setHovered: (id) => set({ hoveredRegionId: id }),

  setSelected: (id, fromCurriculum = false) => {
    set({ selectedRegionId: id, cameraFromCurriculum: fromCurriculum })
    if (id) {
      const next = new Set(get().visitedRegionIds)
      next.add(id)
      saveVisited(next)
      set({ visitedRegionIds: next })
    }
  },

  next: () => {
    const { selectedRegionId } = get()
    const idx = curriculumOrder.findIndex((r) => r.id === selectedRegionId)
    const nextIdx = idx === -1 ? 0 : (idx + 1) % curriculumOrder.length
    get().setSelected(curriculumOrder[nextIdx].id, true)
  },

  prev: () => {
    const { selectedRegionId } = get()
    const idx = curriculumOrder.findIndex((r) => r.id === selectedRegionId)
    const prevIdx =
      idx <= 0 ? curriculumOrder.length - 1 : idx - 1
    get().setSelected(curriculumOrder[prevIdx].id, true)
  },
}))
