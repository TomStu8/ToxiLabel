import { useState, useEffect, useMemo } from 'react'

function shortName(email) {
  return email.split('@')[0]
}

function kappaThreshold(k) {
  if (k === null || k === undefined) return null
  if (k < 0.2) return { color: 'text-red-500',    hexColor: '#ef4444', bg: 'bg-red-500',    track: 'bg-red-100',    badge: 'bg-red-50 border-red-200 text-red-700',    label: 'Slabá' }
  if (k < 0.4) return { color: 'text-orange-500',  hexColor: '#f97316', bg: 'bg-orange-400', track: 'bg-orange-100', badge: 'bg-orange-50 border-orange-200 text-orange-700', label: 'Prijateľná' }
  if (k < 0.6) return { color: 'text-amber-500',   hexColor: '#f59e0b', bg: 'bg-amber-400',  track: 'bg-amber-100',  badge: 'bg-amber-50 border-amber-200 text-amber-700',   label: 'Stredná' }
  if (k < 0.8) return { color: 'text-green-500',   hexColor: '#22c55e', bg: 'bg-emerald-500',track: 'bg-emerald-100',badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', label: 'Výrazná' }
  return         { color: 'text-green-600',    hexColor: '#16a34a', bg: 'bg-green-600',  track: 'bg-green-100',  badge: 'bg-green-50 border-green-300 text-green-800',   label: 'Takmer dokonalá' }
}

function avg(vals) {
  const v = vals.filter(x => x !== null && x !== undefined)
  return v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : null
}

function GroupCard({ selectedList, allPossiblePairs }) {
  const pairsWithData = allPossiblePairs.filter(p => p.total_compared > 0)
  const avgToxic = avg(allPossiblePairs.map(p => p.kappa_toxic))
  const avgCat   = avg(allPossiblePairs.map(p => p.kappa_categories))
  const agreementVals = pairsWithData.map(p => p.agreed_tasks / p.total_compared)
  const avgAgreement  = avg(agreementVals)
  // Conservative estimate of "tasks compared by all": min across pairs
  const totalTasks = pairsWithData.length > 0 ? Math.min(...pairsWithData.map(p => p.total_compared)) : 0
  const tt = kappaThreshold(avgToxic)
  const ct = kappaThreshold(avgCat)

  return (
    <div className="bg-indigo-600 rounded-2xl shadow-md p-5 text-white">
      <p className="text-xs font-semibold text-indigo-300 uppercase tracking-wider mb-1">Skupinové porovnanie</p>
      <p className="text-sm font-bold text-white mb-4 truncate">
        {selectedList.map(shortName).join(' vs ')}
      </p>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-white/10 rounded-xl px-3 py-3">
          <p className="text-xs text-indigo-300 font-medium mb-1">Priem. κ toxicita</p>
          <p className="text-2xl font-bold tabular-nums">{avgToxic === null ? '—' : avgToxic.toFixed(3)}</p>
          {tt && <p className="text-xs text-indigo-200 mt-0.5">{tt.label}</p>}
        </div>
        <div className="bg-white/10 rounded-xl px-3 py-3">
          <p className="text-xs text-indigo-300 font-medium mb-1">Priem. κ kategórie</p>
          <p className="text-2xl font-bold tabular-nums">{avgCat === null ? '—' : avgCat.toFixed(3)}</p>
          {ct && <p className="text-xs text-indigo-200 mt-0.5">{ct.label}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2.5">
        <span className="text-xs text-indigo-200 font-medium">Všetci súhlasili (toxicita)</span>
        <span className="text-sm font-bold tabular-nums">
          {avgAgreement === null ? '—' : `${Math.round(avgAgreement * 100)}%`}
          {totalTasks > 0 && (
            <span className="text-xs text-indigo-300 font-normal ml-1">· {totalTasks} úloh</span>
          )}
        </span>
      </div>
    </div>
  )
}

function PairCard({ pair }) {
  const tt = kappaThreshold(pair.kappa_toxic)
  const ct = kappaThreshold(pair.kappa_categories)
  const agrPct = pair.total_compared > 0
    ? Math.round((pair.agreed_tasks / pair.total_compared) * 100)
    : 0

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 space-y-3">
      {/* VS header */}
      <div className="flex items-center gap-2">
        <span className="flex-1 text-right text-sm font-bold text-gray-800 truncate" title={pair.annotator_1}>
          {shortName(pair.annotator_1)}
        </span>
        <span className="text-xs font-black text-indigo-500 px-1.5 shrink-0">VS</span>
        <span className="flex-1 text-left text-sm font-bold text-gray-800 truncate" title={pair.annotator_2}>
          {shortName(pair.annotator_2)}
        </span>
      </div>

      {/* Kappa bars */}
      <div className="space-y-2">
        {[
          { label: 'κ toxicita',   t: tt, value: pair.kappa_toxic },
          { label: 'κ kategórie',  t: ct, value: pair.kappa_categories },
        ].map(({ label, t: th, value }) => {
          const pct = value === null ? 0 : Math.max(0, Math.min(100, ((value + 1) / 2) * 100))
          return (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 font-medium">{label}</span>
                <div className="flex items-center gap-1.5">
                  {th && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${th.badge}`}>
                      {th.label}
                    </span>
                  )}
                  <span className={`font-bold tabular-nums ${th?.color ?? 'text-gray-300'}`}>
                    {value === null ? '—' : value.toFixed(3)}
                  </span>
                </div>
              </div>
              <div className={`w-full h-1.5 rounded-full ${th?.track ?? 'bg-gray-100'}`}>
                <div
                  className={`h-1.5 rounded-full transition-all duration-700 ${th?.bg ?? 'bg-gray-200'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Agreement footer */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50">
        <span className="text-xs text-gray-400">
          {pair.total_compared} úloh · zhoda toxicity
        </span>
        <span className="text-xs font-semibold text-gray-700 tabular-nums">
          {pair.agreed_tasks}/{pair.total_compared} ({agrPct}%)
        </span>
      </div>
    </div>
  )
}

function KappaGauge({ label, value }) {
  const t = kappaThreshold(value)
  const pct = value === null ? 0 : Math.max(0, Math.min(100, ((value + 1) / 2) * 100))
  const display = value === null || value === undefined ? '—' : value.toFixed(3)

  return (
    <div className="space-y-3" style={{ background: '#f0effe', borderRadius: '10px', padding: '10px 12px' }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
          <p
            className="tabular-nums mt-1"
            style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.04em', color: t?.hexColor ?? '#d1d5db' }}
          >
            {display}
          </p>
        </div>
        {t && (
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${t.badge}`}>
            {t.label}
          </span>
        )}
      </div>
      <div className="space-y-1">
        <div className={`w-full h-2 rounded-full ${t?.track ?? 'bg-gray-100'}`}>
          <div
            className={`h-2 rounded-full transition-all duration-700 ${t?.bg ?? 'bg-gray-300'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-300 font-medium">
          <span>–1</span><span>0</span><span>+1</span>
        </div>
      </div>
    </div>
  )
}

const SCALE = [
  { range: '< 0.2',   label: 'Slabá',           color: 'bg-red-500' },
  { range: '0.2–0.4', label: 'Prijateľná',       color: 'bg-orange-400' },
  { range: '0.4–0.6', label: 'Stredná',          color: 'bg-amber-400' },
  { range: '0.6–0.8', label: 'Výrazná',          color: 'bg-emerald-500' },
  { range: '> 0.8',   label: 'Takmer dokonalá',  color: 'bg-green-600' },
]

export default function IAADashboard({ projectId, api }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedAnnotators, setSelectedAnnotators] = useState(null)

  useEffect(() => {
    if (!projectId) { setLoading(false); return }
    setLoading(true)
    setError('')
    setSelectedAnnotators(null)
    api(`/iaa/${projectId}`)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [projectId, api])

  const allAnnotators = useMemo(() => {
    if (!data) return []
    const names = new Set()
    for (const p of data.annotator_pairs) {
      names.add(p.annotator_1)
      names.add(p.annotator_2)
    }
    return [...names].sort()
  }, [data])

  const effectiveSelection = selectedAnnotators ?? new Set(allAnnotators)

  function toggleAnnotator(email) {
    setSelectedAnnotators(prev => {
      const current = prev ?? new Set(allAnnotators)
      const next = new Set(current)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      if (next.size === allAnnotators.length) return null
      return next
    })
  }

  function selectAll() { setSelectedAnnotators(null) }

  const pairLookup = useMemo(() => {
    if (!data) return {}
    const map = {}
    for (const p of data.annotator_pairs) {
      map[`${p.annotator_1}||${p.annotator_2}`] = p
      map[`${p.annotator_2}||${p.annotator_1}`] = p
    }
    return map
  }, [data])

  const selectedList = useMemo(() => [...effectiveSelection].sort(), [effectiveSelection])

  const allPossiblePairs = useMemo(() => {
    const pairs = []
    for (let i = 0; i < selectedList.length; i++) {
      for (let j = i + 1; j < selectedList.length; j++) {
        const a1 = selectedList[i]
        const a2 = selectedList[j]
        const found = pairLookup[`${a1}||${a2}`]
        pairs.push(found ?? {
          annotator_1: a1,
          annotator_2: a2,
          kappa_toxic: null,
          kappa_categories: null,
          total_compared: 0,
          agreed_tasks: 0,
        })
      }
    }
    return pairs
  }, [selectedList, pairLookup])

  if (!projectId) {
    return (
      <div className="text-center py-20 text-gray-300">
        <svg className="w-12 h-12 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
        <p className="text-sm font-medium text-gray-400">Vyberte projekt pre zobrazenie štatistík IAA</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-10 text-red-500 text-sm bg-red-50 border border-red-100 rounded-2xl">{error}</div>
    )
  }

  if (!data) return null

  const coverage = data.total_tasks > 0
    ? Math.round((data.double_annotated_tasks / data.total_tasks) * 100)
    : 0

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Coverage */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pokrytie dvojitou anotáciou</p>
            <p className="text-sm font-semibold text-gray-700 mt-0.5">
              {data.double_annotated_tasks} z {data.total_tasks} úloh anotovaných 2+ anotátormi
            </p>
          </div>
          <span className="text-2xl font-bold text-indigo-600">{coverage}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div
            className="bg-indigo-600 h-2.5 rounded-full transition-all duration-700"
            style={{ width: `${coverage}%` }}
          />
        </div>
      </div>

      {/* Overall kappa */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Celková Cohenova κ
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <KappaGauge label="Toxicita (is_toxic)" value={data.overall_kappa_toxic} />
          <KappaGauge label="Kategórie" value={data.overall_kappa_categories} />
        </div>
      </div>

      {/* Scale legend */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Interpretačná škála</p>
        <div className="space-y-2">
          {SCALE.map(s => (
            <div key={s.range} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full shrink-0 ${s.color}`} />
              <span className="text-xs font-semibold text-gray-500 w-16">{s.range}</span>
              <span className="text-xs text-gray-700">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Annotator filter */}
      {allAnnotators.length >= 2 && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Vyberte anotátorov na porovnanie
            </p>
            {selectedAnnotators !== null && (
              <button
                onClick={selectAll}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
              >
                Vybrať všetkých
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {allAnnotators.map(email => {
              const checked = effectiveSelection.has(email)
              return (
                <button
                  key={email}
                  onClick={() => toggleAnnotator(email)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    checked
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                    checked ? 'bg-white/30 border-white/50' : 'border-gray-300'
                  }`}>
                    {checked && (
                      <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                    )}
                  </span>
                  {email}
                </button>
              )
            })}
          </div>
          {selectedAnnotators !== null && effectiveSelection.size < 2 && (
            <p className="text-xs text-amber-600 mt-2">Vyberte aspoň 2 anotátorov pre porovnanie párov.</p>
          )}
        </div>
      )}

      {/* Group card — shown when 2+ selected */}
      {effectiveSelection.size >= 2 && (
        <GroupCard selectedList={selectedList} allPossiblePairs={allPossiblePairs} />
      )}

      {/* Pair cards */}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Páry anotátorov
        </h3>

        {allPossiblePairs.length === 0 ? (
          <div className="text-center py-10 bg-white border border-gray-100 rounded-2xl shadow-sm">
            <p className="text-sm text-gray-400">
              {data.annotator_pairs.length === 0
                ? 'Žiadne úlohy zatiaľ neanotované 2+ anotátormi.'
                : 'Žiadne páry nezodpovedajú výberu.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allPossiblePairs.map((pair, i) => (
              <PairCard key={i} pair={pair} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
