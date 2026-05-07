import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const statusConfig = {
  pending:     { cls: 'bg-amber-100 text-amber-700',    label: 'Čaká' },
  in_progress: { cls: 'bg-blue-100 text-blue-700',      label: 'Prebieha' },
  done:        { cls: 'bg-emerald-100 text-emerald-700', label: 'Hotovo' },
}

export default function ProjectTaskList() {
  const { projectId } = useParams()
  const { token, user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [proj, taskList] = await Promise.all([
        fetch(`/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch(`/api/tasks?project_id=${projectId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ])
      setProject(proj)
      setTasks(taskList)
    } catch {}
    setLoading(false)
  }, [projectId, token])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [load])

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const done  = tasks.filter(t => t.annotated_by_me).length
  const total = tasks.length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="min-h-screen" style={{ background: '#f0effe' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
              Projekty
            </button>
            {project && (
              <>
                <div className="h-4 w-px bg-gray-200" />
                <span className="text-sm font-semibold text-gray-900 truncate max-w-xs">{project.name}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user?.full_name}</span>
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
        {/* All done banner */}
        {location.state?.allDone && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 animate-fade-in">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Hotovo!</p>
              <p className="text-xs text-emerald-600 mt-0.5">Anotovali ste každú úlohu v tomto projekte.</p>
            </div>
          </div>
        )}

        {/* Project progress */}
        {total > 0 && (
          <div className="bg-white rounded-2xl px-5 py-4 space-y-2 card-tinted">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-700">Pokrok projektu</span>
              <span className="text-indigo-600 font-semibold">{done} / {total} hotových</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">{pct}% dokončené</p>
          </div>
        )}

        {/* Continue / all done CTA */}
        {!loading && total > 0 && (
          done === total ? (
            <div className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
              Všetky úlohy dokončené!
            </div>
          ) : (
            <button
              onClick={() => {
                const next = tasks.find(t => !t.annotated_by_me)
                if (next) navigate(`/annotate/${next.id}`)
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm shadow-indigo-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
              </svg>
              Pokračovať kde som skončil
            </button>
          )
        )}

        <h2 className="text-base font-semibold text-gray-800">Úlohy</h2>

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl card-tinted">
            <p className="text-sm font-medium text-gray-500">V tomto projekte nie sú žiadne úlohy.</p>
          </div>
        )}

        {tasks.map(task => {
          const isDone = task.annotated_by_me
          // Show personal status: done only if this user annotated it
          const personalStatus = task.annotated_by_me ? 'done' : (task.status === 'done' ? 'in_progress' : task.status)
          const cfg = statusConfig[personalStatus] ?? statusConfig.pending
          return (
            <button
              key={task.id}
              onClick={() => navigate(`/annotate/${task.id}`)}
              className={`w-full text-left bg-white rounded-2xl px-5 py-4 transition-all group ${
                isDone
                  ? 'border border-emerald-100 opacity-75 hover:opacity-100 shadow-sm hover:shadow-md'
                  : 'card-tinted hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isDone && (
                      <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                      </svg>
                    )}
                    <p className={`font-medium truncate ${isDone ? 'text-gray-500' : 'text-gray-900'}`}>
                      {task.original_filename}
                    </p>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Úloha #{task.id}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                  {!isDone && (
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-indigo-600 text-white group-hover:bg-indigo-700 transition-colors">
                      Anotovať →
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </main>
    </div>
  )
}
