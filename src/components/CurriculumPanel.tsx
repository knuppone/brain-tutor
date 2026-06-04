import { useBrainStore } from '../store/useBrainStore'
import { curriculumOrder } from '../data/regions'

export function CurriculumPanel() {
  const selectedId = useBrainStore((s) => s.selectedRegionId)
  const visitedIds = useBrainStore((s) => s.visitedRegionIds)
  const setSelected = useBrainStore((s) => s.setSelected)

  const visitedCount = visitedIds.size
  const total = curriculumOrder.length

  return (
    <div className="fixed left-0 top-0 h-full w-64 z-20 flex flex-col bg-zinc-900/80 backdrop-blur-xl border-r border-zinc-800/60">
      {/* Header */}
      <div className="p-5 pb-4 border-b border-zinc-800/50">
        <h1 className="text-base font-semibold text-zinc-100 tracking-tight">
          Brain Tutor
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          {visitedCount} / {total} explored
        </p>
        {/* Progress bar */}
        <div className="mt-3 h-1 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-500"
            style={{ width: `${(visitedCount / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Region list */}
      <div className="flex-1 overflow-y-auto py-2">
        {curriculumOrder.map((region, index) => {
          const isSelected = selectedId === region.id
          const isVisited = visitedIds.has(region.id)
          return (
            <button
              key={region.id}
              onClick={() => setSelected(region.id, true)}
              className={`
                w-full text-left px-4 py-2.5 flex items-center gap-3
                transition-colors duration-150
                ${isSelected
                  ? 'bg-violet-950/50 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                }
              `}
            >
              <span className={`text-xs w-5 flex-shrink-0 font-mono ${isSelected ? 'text-violet-400' : 'text-zinc-600'}`}>
                {String(index + 1).padStart(2, '0')}
              </span>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: region.color, opacity: isVisited || isSelected ? 1 : 0.35 }}
              />
              <span className={`text-sm truncate font-medium ${isSelected ? 'text-zinc-100' : ''}`}>
                {region.displayName}
              </span>
              {isVisited && !isSelected && (
                <span className="ml-auto flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          )
        })}
      </div>

      {/* Footer hint */}
      <div className="p-4 border-t border-zinc-800/50">
        <p className="text-xs text-zinc-700 text-center leading-relaxed">
          Click a structure to fly to it.<br />
          Hover the brain to explore.
        </p>
      </div>
    </div>
  )
}
