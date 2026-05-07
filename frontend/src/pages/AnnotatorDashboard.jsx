import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const typeBadge = {
  text:  { cls: 'bg-indigo-100 text-indigo-700',  label: 'Text' },
  image: { cls: 'bg-violet-100 text-violet-700',  label: 'Obrázok' },
  video: { cls: 'bg-purple-100 text-purple-700',  label: 'Video' },
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #4f46e5, #6d28d9)',
  'linear-gradient(135deg, #0891b2, #0e7490)',
  'linear-gradient(135deg, #059669, #047857)',
  'linear-gradient(135deg, #dc2626, #b91c1c)',
  'linear-gradient(135deg, #d97706, #b45309)',
  'linear-gradient(135deg, #7c3aed, #6d28d9)',
]

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function avatarGradient(name) {
  const idx = name ? name.charCodeAt(0) % AVATAR_GRADIENTS.length : 0
  return AVATAR_GRADIENTS[idx]
}

export default function AnnotatorDashboard() {
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [projects, setProjects] = useState([])
  const [tasksByProject, setTasksByProject] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [projsRes, tasksRes] = await Promise.allSettled([
        fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch('/api/tasks',    { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ])

      const projs = projsRes.status === 'fulfilled' && Array.isArray(projsRes.value) ? projsRes.value : []
      const tasks = tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value) ? tasksRes.value : []

      setProjects(projs)
      const byProject = {}
      for (const t of tasks) {
        if (!byProject[t.project_id]) byProject[t.project_id] = []
        byProject[t.project_id].push(t)
      }
      setTasksByProject(byProject)
    } catch {}
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const allTasks = Object.values(tasksByProject).flat()
  const totalDone = allTasks.filter(t => t.annotated_by_me).length
  const totalCount = allTasks.length
  const totalPct = totalCount > 0 ? Math.round((totalDone / totalCount) * 100) : 0

  return (
    <div className="min-h-screen" style={{ background: '#f0effe' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(140deg, #4f46e5 0%, #6d28d9 100%)', boxShadow: '0 2px 6px rgba(79,70,229,0.3)' }}
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="text-lg font-bold text-indigo-600 tracking-tight">ToxiLabel</span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 capitalize">
              {user?.role}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white font-semibold text-xs shrink-0"
                style={{ background: avatarGradient(user?.full_name) }}
              >
                {getInitials(user?.full_name)}
              </div>
              <span className="text-sm text-gray-600">{user?.full_name}</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors"
            >
              Odhlásiť sa
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-6 space-y-5">
        {/* Welcome strip */}
        <div className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 card-tinted">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ background: avatarGradient(user?.full_name) }}
          >
            {getInitials(user?.full_name)}
          </div>
          <div>
            <p className="font-extrabold" style={{ fontSize: '18px', color: '#1e1b4b' }}>
              Vitajte späť, {user?.full_name?.split(' ')[0] ?? user?.full_name}!
            </p>
            <p className="text-sm text-gray-500 mt-0.5">Tu sú vaše anotačné projekty</p>
          </div>
        </div>

        {/* All done banner */}
        {location.state?.allDone && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 animate-fade-in">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Projekt dokončený!</p>
              <p className="text-xs text-emerald-600 mt-0.5">Všetky úlohy v tomto projekte sú anotované.</p>
            </div>
          </div>
        )}

        {/* Overall progress */}
        {totalCount > 0 && (
          <div className="bg-white rounded-2xl px-5 py-4 space-y-3 card-tinted">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Celkový pokrok</p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-indigo-900 tabular-nums">{totalDone}</span>
                  <span className="text-sm text-gray-400 tabular-nums">/ {totalCount}</span>
                </p>
              </div>
              <span className="text-2xl font-bold text-indigo-600 tabular-nums">{totalPct}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${totalPct}%`,
                  background: totalPct === 100
                    ? 'linear-gradient(90deg, #10b981, #34d399)'
                    : 'linear-gradient(90deg, #4f46e5, #7c3aed)',
                }}
              />
            </div>
            <p className="text-xs text-gray-400">{totalPct}% dokončené naprieč všetkými projektmi</p>
          </div>
        )}

        <h2 className="text-base font-semibold text-gray-800">Moje projekty</h2>

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && projects.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl card-tinted">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-sm font-medium text-gray-500">Zatiaľ nie sú priradené žiadne projekty.</p>
            <p className="text-xs text-gray-400 mt-1">Skúste neskôr, keď vám administrátor priradí úlohy.</p>
          </div>
        )}

        {projects.map(p => {
          const tasks = tasksByProject[p.id] ?? []
          const done = tasks.filter(t => t.annotated_by_me).length
          const total = tasks.length
          const pct = total > 0 ? Math.round((done / total) * 100) : 0
          const allDone = total > 0 && done === total
          const badge = typeBadge[p.type] ?? { cls: 'bg-gray-100 text-gray-600', label: p.type }

          return (
            <button
              key={p.id}
              onClick={() => navigate(`/project/${p.id}/tasks`)}
              className={`w-full text-left bg-white rounded-2xl px-5 py-4 transition-all group ${
                allDone
                  ? 'border border-emerald-100 opacity-90 hover:opacity-100 shadow-sm hover:shadow-md'
                  : 'card-tinted'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className={`font-semibold truncate ${allDone ? 'text-gray-500' : 'text-gray-900'}`}>{p.name}</p>
                  {p.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{p.description}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${badge.cls}`}>
                    {badge.label}
                  </span>
                  {allDone ? (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-700">
                      ✓ Hotovo
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          const next = (tasksByProject[p.id] ?? []).find(t => !t.annotated_by_me)
                          if (next) navigate(`/annotate/${next.id}`)
                          else navigate(`/project/${p.id}/tasks`)
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1 shrink-0"
                        style={{ boxShadow: '0 2px 8px rgba(79,70,229,0.25)' }}
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
                        </svg>
                        Pokračovať
                      </button>
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-700 group-hover:bg-indigo-50 transition-colors shrink-0">
                        Otvoriť →
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{done} / {total} úloh hotových</span>
                  <span>{pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: allDone
                        ? 'linear-gradient(90deg, #10b981, #34d399)'
                        : 'linear-gradient(90deg, #818cf8, #a78bfa)',
                    }}
                  />
                </div>
              </div>
            </button>
          )
        })}
      </main>
    </div>
  )
}
