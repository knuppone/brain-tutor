import { useEffect } from 'react'
import { useBrainStore } from '../store/useBrainStore'
import { regionsById, curriculumOrder } from '../data/regions'

export function InfoPanel() {
  const selectedId = useBrainStore((s) => s.selectedRegionId)
  const setSelected = useBrainStore((s) => s.setSelected)
  const next = useBrainStore((s) => s.next)
  const prev = useBrainStore((s) => s.prev)

  const region = selectedId ? regionsById[selectedId] : null

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setSelected, next, prev])

  const curriculumIndex = selectedId
    ? curriculumOrder.findIndex((r) => r.id === selectedId)
    : -1

  return (
    <div
      className={`
        fixed right-0 top-0 h-full w-96 z-20
        flex flex-col
        bg-zinc-900/85 backdrop-blur-xl
        border-l border-zinc-800/60
        transition-transform duration-300 ease-out
        ${region ? 'translate-x-0' : 'translate-x-full'}
      `}
      style={{ willChange: 'transform' }}
    >
      {region && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4 border-b border-zinc-800/50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: region.color }}
                />
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">
                  {region.category.replace('-', ' ')}
                </span>
              </div>
              <h2 className="text-xl font-semibold text-zinc-100 leading-tight">
                {region.displayName}
              </h2>
              {curriculumIndex !== -1 && (
                <p className="text-xs text-violet-400 mt-1 font-medium">
                  #{curriculumIndex + 1} of {curriculumOrder.length} in curriculum
                </p>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="ml-3 flex-shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.2 3.8a.75.75 0 0 0-1.06 0L8 6.94 4.86 3.8A.75.75 0 1 0 3.8 4.86L6.94 8l-3.14 3.14a.75.75 0 1 0 1.06 1.06L8 9.06l3.14 3.14a.75.75 0 1 0 1.06-1.06L9.06 8l3.14-3.14a.75.75 0 0 0 0-1.06z" />
              </svg>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Summary */}
            <p className="text-zinc-300 text-sm leading-relaxed font-medium">
              {region.summary}
            </p>

            {/* Function */}
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                Function
              </h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {region.function}
              </p>
            </div>

            {/* Fun fact */}
            {region.funFact && (
              <div className="rounded-lg bg-violet-950/40 border border-violet-800/30 p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-violet-400 text-xs">✦</span>
                  <h3 className="text-xs font-semibold text-violet-400 uppercase tracking-widest">
                    Did you know
                  </h3>
                </div>
                <p className="text-violet-200/80 text-sm leading-relaxed">
                  {region.funFact}
                </p>
              </div>
            )}

            {/* Related regions */}
            {region.relatedRegions && region.relatedRegions.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2.5">
                  Related Structures
                </h3>
                <div className="flex flex-wrap gap-2">
                  {region.relatedRegions.map((id) => {
                    const r = regionsById[id]
                    if (!r) return null
                    return (
                      <button
                        key={id}
                        onClick={() => setSelected(id, false)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 text-xs text-zinc-300 hover:text-zinc-100 transition-colors"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: r.color }}
                        />
                        {r.displayName}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer nav */}
          <div className="p-4 border-t border-zinc-800/50 flex items-center justify-between gap-2">
            <button
              onClick={() => prev()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 transition-colors font-medium"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.78 3.22a.75.75 0 0 1 0 1.06L6.56 7.5l3.22 3.22a.75.75 0 1 1-1.06 1.06l-3.75-3.75a.75.75 0 0 1 0-1.06l3.75-3.75a.75.75 0 0 1 1.06 0z" />
              </svg>
              Prev
            </button>
            <span className="text-xs text-zinc-600 px-2">
              {curriculumIndex + 1} / {curriculumOrder.length}
            </span>
            <button
              onClick={() => next()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 transition-colors font-medium"
            >
              Next
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.22 3.22a.75.75 0 0 0 0 1.06l3.22 3.22-3.22 3.22a.75.75 0 1 0 1.06 1.06l3.75-3.75a.75.75 0 0 0 0-1.06L7.28 3.22a.75.75 0 0 0-1.06 0z" />
              </svg>
            </button>
          </div>

          <div className="px-4 pb-4">
            <p className="text-center text-xs text-zinc-700">← → navigate • Esc close</p>
          </div>
        </>
      )}
    </div>
  )
}
