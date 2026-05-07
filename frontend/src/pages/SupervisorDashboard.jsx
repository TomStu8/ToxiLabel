import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import IAADashboard from './IAADashboard'

function useApi(token) {
  return useCallback(
    async (path, options = {}) => {
      const res = await fetch(`/api${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || `HTTP ${res.status}`)
      }
      if (res.status === 204) return null
      return res.json()
    },
    [token],
  )
}

const typeBadge = {
  text:  'bg-indigo-100 text-indigo-700',
  image: 'bg-violet-100 text-violet-700',
  video: 'bg-purple-100 text-purple-700',
}

function StatCard({ label, value, color = 'text-indigo-600' }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-5 py-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function MiniProgress({ done, total, colorDone = 'bg-emerald-500', colorPending = 'bg-indigo-400' }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const color = pct === 100 ? colorDone : colorPending
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{done} / {total}</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function AnnotatorCard({ annotator }) {
  const isDone = annotator.total_assigned > 0 && annotator.total_completed === annotator.total_assigned
  return (
    <div className={`bg-white border rounded-2xl shadow-sm p-5 space-y-3 ${isDone ? 'border-emerald-100' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{annotator.full_name}</p>
          <p className="text-xs text-gray-400 truncate mt-0.5">{annotator.email}</p>
        </div>
        {isDone && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
            Done ✓
          </span>
        )}
      </div>

      <MiniProgress done={annotator.total_completed} total={annotator.total_assigned} />

      {annotator.projects.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {annotator.projects.map(p => (
            <span key={p.id} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project, api, expanded, onToggle }) {
  const pct = project.total_tasks > 0
    ? Math.round((project.total_annotated / project.total_tasks) * 100)
    : 0
  const isDone = project.total_tasks > 0 && project.total_annotated >= project.total_tasks

  return (
    <div
      className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-shadow ${
        expanded ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-gray-100 hover:shadow-md hover:border-indigo-200'
      }`}
    >
      {/* Clickable header */}
      <button className="w-full text-left px-5 py-4" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
            {project.description && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize ${typeBadge[project.type] ?? 'bg-gray-100 text-gray-600'}`}>
              {project.type}
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </div>
        </div>

        <div className="space-y-1 mb-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Annotation progress</span>
            <span className="font-semibold text-indigo-600">{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${isDone ? 'bg-emerald-500' : 'bg-indigo-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="flex gap-4 text-xs">
          <span className="text-gray-500">{project.total_tasks} tasks</span>
          <span className="text-emerald-600 font-medium">{project.total_annotated} annotated</span>
          {project.annotators.length > 0 && (
            <span className="text-gray-400">
              {project.annotators.length} annotator{project.annotators.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-6">

          {/* Per-annotator breakdown */}
          {project.annotators.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Annotator breakdown
              </p>
              <div className="space-y-2.5">
                {project.annotators.map(a => {
                  const apct = a.assigned > 0 ? Math.round((a.completed / a.assigned) * 100) : 0
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-gray-700 truncate">{a.full_name}</span>
                          <span className="text-gray-400 shrink-0 ml-2 tabular-nums">
                            {a.completed}/{a.assigned}
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${apct === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`}
                            style={{ width: `${apct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-gray-500 w-9 text-right shrink-0 tabular-nums">
                        {apct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* IAA */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              IAA — Cohen's κ
            </p>
            <IAADashboard projectId={project.id} api={api} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function SupervisorDashboard() {
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const api = useApi(token)

  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [expandedProject, setExpanded] = useState(null)

  useEffect(() => {
    api('/supervisor/overview')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [api])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const totals = data?.totals ?? { tasks: 0, annotations: 0, annotators: 0, completion_pct: 0 }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-indigo-600 tracking-tight">ToxiLabel</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
              Supervisor
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user?.full_name}</span>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6 space-y-8">

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data ? (
          <div className="text-center py-20 text-sm text-gray-400">
            Failed to load dashboard data.
          </div>
        ) : (
          <>
            {/* ── Stats ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Tasks"   value={totals.tasks} />
              <StatCard label="Annotations"   value={totals.annotations}    color="text-violet-600" />
              <StatCard label="Annotators"    value={totals.annotators}     color="text-emerald-600" />
              <StatCard label="Completion"    value={`${totals.completion_pct}%`} color="text-amber-600" />
            </div>

            {/* ── Annotators ── */}
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Annotators
              </h2>
              {data.annotators.length === 0 ? (
                <div className="text-center py-10 bg-white border border-gray-100 rounded-2xl text-sm text-gray-400">
                  No annotators found.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.annotators.map(a => (
                    <AnnotatorCard key={a.id} annotator={a} />
                  ))}
                </div>
              )}
            </section>

            {/* ── Projects ── */}
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Projects — click to expand IAA &amp; annotator details
              </h2>
              {data.projects.length === 0 ? (
                <div className="text-center py-10 bg-white border border-gray-100 rounded-2xl text-sm text-gray-400">
                  No projects yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.projects.map(p => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      api={api}
                      expanded={expandedProject === p.id}
                      onToggle={() => setExpanded(cur => cur === p.id ? null : p.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
