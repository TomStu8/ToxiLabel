import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import IAADashboard from './IAADashboard'

// ── Shared classes ────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow'
const btnPrimary = 'px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors shadow-sm'
const btnSecondary = 'px-4 py-2 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-sm font-medium rounded-xl transition-colors'

// ── Avatar helpers ────────────────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function userAvatarGradient(name) {
  if (!name) return 'linear-gradient(135deg,#4f46e5,#6d28d9)'
  const code = name.toUpperCase().charCodeAt(0) - 65
  if (code < 9) return 'linear-gradient(135deg,#4f46e5,#6d28d9)'
  if (code < 18) return 'linear-gradient(135deg,#7c3aed,#a855f7)'
  return 'linear-gradient(135deg,#0ea5e9,#6366f1)'
}

// ── API hook ──────────────────────────────────────────────────────────────────

function useApi(token) {
  return useCallback(
    async (path, options = {}) => {
      const res = await fetch(`/api${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || `HTTP ${res.status}`)
      }
      if (res.status === 204) return null
      return res.json()
    },
    [token],
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      {action}
    </div>
  )
}

// ── Form panel ────────────────────────────────────────────────────────────────

function FormPanel({ title, error, children }) {
  return (
    <div
      className="p-5 space-y-3 animate-fade-in"
      style={{ background: '#eef2ff', border: '1.5px solid #e0e7ff', borderRadius: '16px' }}
    >
      <h3 className="font-semibold text-indigo-900 text-sm">{title}</h3>
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
      )}
      {children}
    </div>
  )
}

// ── Projects tab ──────────────────────────────────────────────────────────────

const typeBadge = {
  text:  'bg-indigo-100 text-indigo-700',
  image: 'bg-violet-100 text-violet-700',
  video: 'bg-purple-100 text-purple-700',
}

const typeLabel = { text: 'Text', image: 'Obrázok', video: 'Video' }

function ProjectsTab({ api, token }) {
  const [projects, setProjects] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', type: 'text' })
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(null)
  // downloading: null | { id, label }
  const [downloading, setDownloading] = useState(null)
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(null)

  const load = useCallback(() => api('/projects').then(setProjects).catch(() => {}), [api])
  useEffect(() => { load() }, [load])

  async function handleDeleteProject(project) {
    try {
      await api(`/projects/${project.id}`, { method: 'DELETE' })
      setConfirmDeleteProject(null)
      load()
    } catch (err) {
      setError(`Vymazanie zlyhalo: ${err.message}`)
      setConfirmDeleteProject(null)
    }
  }

  async function handleExport(project, fmt) {
    setExporting({ id: project.id, fmt })
    try {
      const url = fmt === 'csv'
        ? `/api/annotations/export/${project.id}/csv`
        : `/api/annotations/export/${project.id}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `export_${project.id}.${fmt}`
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      setError(`Export zlyhal: ${err.message}`)
    } finally {
      setExporting(null)
    }
  }

  async function handleDownload(project) {
    setDownloading({ id: project.id, label: 'Pripravujem…' })
    const t1 = setTimeout(() => setDownloading(d => d?.id === project.id ? { id: project.id, label: 'Sťahujem veľký súbor…' } : d), 3000)
    const t2 = setTimeout(() => setDownloading(d => d?.id === project.id ? { id: project.id, label: 'Môže trvať dlhšie pre videá…' } : d), 10000)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000)
    try {
      const res = await fetch(`/api/projects/${project.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `project_${project.id}_data.zip`
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      setError(`Sťahovanie zlyhalo: ${err.name === 'AbortError' ? 'Časový limit vypršal' : err.message}`)
    } finally {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(timeout)
      setDownloading(null)
    }
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      await api('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setForm({ name: '', description: '', type: 'text' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Projekty"
        action={
          <button onClick={() => setShowForm(s => !s)} className={btnPrimary}>
            + Nový projekt
          </button>
        }
      />

      {showForm && (
        <FormPanel title="Vytvoriť projekt" error={error}>
          <form onSubmit={submit} className="space-y-3">
            <input required placeholder="Názov projektu" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
            <input placeholder="Popis (voliteľné)" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={inputCls} />
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
              <option value="text">Text</option>
              <option value="image">Obrázok</option>
              <option value="video">Video</option>
            </select>
            <div className="flex gap-2 pt-1">
              <button type="submit" className={btnPrimary}>Vytvoriť</button>
              <button type="button" onClick={() => setShowForm(false)} className={btnSecondary}>Zrušiť</button>
            </div>
          </form>
        </FormPanel>
      )}

      {confirmDeleteProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(3px)' }}
        >
          <div
            className="bg-white p-6 max-w-sm w-full space-y-4 animate-scale-in"
            style={{ borderRadius: '20px', boxShadow: '0 24px 48px rgba(79,70,229,0.2)' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Vymazať projekt?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="font-medium text-gray-700">„{confirmDeleteProject.name}"</span> a všetky jeho úlohy, priradenia a anotácie budú natrvalo vymazané.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteProject(null)} className={btnSecondary}>Zrušiť</button>
              <button
                onClick={() => handleDeleteProject(confirmDeleteProject)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Vymazať projekt
              </button>
            </div>
          </div>
        </div>
      )}

      {error && !showForm && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {projects.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Zatiaľ žiadne projekty. Vytvorte jeden vyššie.</p>
        )}
        {projects.map(p => (
          <div
            key={p.id}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white px-4 py-3.5 transition-all"
            style={{
              border: '1.5px solid #ece9fd',
              borderRadius: '18px',
              boxShadow: '0 1px 4px rgba(79,70,229,0.06)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#c7d2fe'
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(79,70,229,0.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#ece9fd'
              e.currentTarget.style.boxShadow = '0 1px 4px rgba(79,70,229,0.06)'
            }}
          >
            <div className="min-w-0 sm:mr-3">
              <p className="font-medium text-gray-900 truncate">{p.name}</p>
              {p.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{p.description}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${typeBadge[p.type] ?? 'bg-gray-100 text-gray-600'}`}>
                {typeLabel[p.type] ?? p.type}
              </span>
              <button
                onClick={() => handleExport(p, 'json')}
                disabled={!!exporting}
                className="px-3 py-1.5 bg-white hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                style={{ border: '1px solid #e0e7ff', color: '#4338ca', borderRadius: '9px', fontSize: '11px', fontWeight: 600, minWidth: '72px' }}
              >
                {exporting?.id === p.id && exporting?.fmt === 'json' ? 'Exportuje sa…' : '↓ JSON'}
              </button>
              <button
                onClick={() => handleExport(p, 'csv')}
                disabled={!!exporting}
                className="px-3 py-1.5 bg-white hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                style={{ border: '1px solid #a7f3d0', color: '#065f46', borderRadius: '9px', fontSize: '11px', fontWeight: 600, minWidth: '72px' }}
              >
                {exporting?.id === p.id && exporting?.fmt === 'csv' ? 'Exportuje sa…' : '↓ CSV'}
              </button>
              <button
                onClick={() => handleDownload(p)}
                disabled={downloading?.id === p.id}
                className="px-3 py-1.5 hover:opacity-80 disabled:opacity-50 transition-opacity"
                style={{ border: '1px solid #e5dcc8', color: '#7c6a3f', background: '#fdf8f0', borderRadius: '9px', fontSize: '11px', fontWeight: 600, minWidth: '72px' }}
              >
                {downloading?.id === p.id ? downloading.label : '↓ Dáta'}
              </button>
              <button
                onClick={() => setConfirmDeleteProject(p)}
                className="text-xs px-2.5 py-1.5 rounded-xl border border-red-200 text-red-600 bg-white hover:bg-red-50 font-medium transition-colors"
                style={{ minWidth: '72px' }}
              >
                Vymazať
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Users tab ─────────────────────────────────────────────────────────────────

const roleBadge = {
  admin:     'bg-indigo-100 text-indigo-700',
  annotator: 'bg-violet-100 text-violet-700',
}
const roleLabel = { admin: 'Administrátor', annotator: 'Anotátor' }

function UsersTab({ api }) {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'annotator' })
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = useCallback(() => api('/users').then(setUsers).catch(() => {}), [api])
  useEffect(() => { load() }, [load])

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      await api('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setForm({ email: '', password: '', full_name: '', role: 'annotator' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleActive(user) {
    try {
      await api(`/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !user.is_active }),
      })
      load()
    } catch {}
  }

  async function deleteUser(user) {
    try {
      await api(`/users/${user.id}`, { method: 'DELETE' })
      setConfirmDelete(null)
      load()
    } catch (err) {
      setError(err.message)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="space-y-4">
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(30,27,75,0.45)', backdropFilter: 'blur(3px)' }}
        >
          <div
            className="bg-white p-6 max-w-sm w-full space-y-4 animate-scale-in"
            style={{ borderRadius: '20px', boxShadow: '0 24px 48px rgba(79,70,229,0.2)' }}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.293 4.293a1 1 0 011.414 0l7 7a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7a1 1 0 010-1.414l7-7z"/>
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Vymazať používateľa?</h3>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="font-medium text-gray-700">{confirmDelete.full_name}</span> ({confirmDelete.email}) bude natrvalo vymazaný. Túto akciu nie je možné vrátiť späť.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className={btnSecondary}>Zrušiť</button>
              <button
                onClick={() => deleteUser(confirmDelete)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Vymazať
              </button>
            </div>
          </div>
        </div>
      )}

      <SectionHeader
        title="Používatelia"
        action={
          <button onClick={() => setShowForm(s => !s)} className={btnPrimary}>
            + Nový používateľ
          </button>
        }
      />

      {showForm && (
        <FormPanel title="Vytvoriť používateľa" error={error}>
          <form onSubmit={submit} className="space-y-3">
            <input required placeholder="Celé meno" value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} />
            <input required type="email" placeholder="Email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
            <input required type="password" placeholder="Heslo" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={inputCls} />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className={inputCls}>
              <option value="annotator">Anotátor</option>
              <option value="admin">Administrátor</option>
            </select>
            <div className="flex gap-2 pt-1">
              <button type="submit" className={btnPrimary}>Vytvoriť</button>
              <button type="button" onClick={() => setShowForm(false)} className={btnSecondary}>Zrušiť</button>
            </div>
          </form>
        </FormPanel>
      )}

      {error && !showForm && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {users.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Zatiaľ žiadni používatelia.</p>}
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-2xl px-4 py-3.5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 min-w-0 flex-1 mr-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs shrink-0"
                style={{ background: userAvatarGradient(u.full_name), fontWeight: 700 }}
              >
                {getInitials(u.full_name)}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{u.full_name}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{u.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${roleBadge[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                {roleLabel[u.role] ?? u.role}
              </span>
              <button
                onClick={() => toggleActive(u)}
                className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer"
                style={u.is_active
                  ? { background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }
                  : { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
                }
              >
                {u.is_active ? '● Aktívny' : '○ Neaktívny'}
              </button>
              {u.id !== me?.id && (
                <button
                  onClick={() => setConfirmDelete(u)}
                  className="text-xs px-2.5 py-1 rounded-full border border-red-200 text-red-600 bg-white hover:bg-red-50 font-medium transition-colors"
                >
                  Vymazať
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tasks tab ─────────────────────────────────────────────────────────────────

const statusBadge = {
  pending:     'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  done:        'bg-emerald-100 text-emerald-700',
}
const statusLabel = { pending: 'Čaká', in_progress: 'Prebieha', done: 'Hotovo' }

function TasksTab({ api }) {
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [assigningId, setAssigningId] = useState(null)
  const [selectedAnnotator, setSelectedAnnotator] = useState('')
  const [uploadProjectId, setUploadProjectId] = useState('')
  const [uploadFiles, setUploadFiles] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [bulkProjectId, setBulkProjectId] = useState('')
  const [bulkAnnotatorId, setBulkAnnotatorId] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)

  const { token } = useAuth()

  const load = useCallback(async () => {
    const [t, u, p] = await Promise.all([
      api('/tasks').catch(() => []),
      api('/users').catch(() => []),
      api('/projects').catch(() => []),
    ])
    setTasks(Array.isArray(t) ? t : [])
    setUsers(Array.isArray(u) ? u.filter(u => u.role === 'annotator' && u.is_active) : [])
    setProjects(Array.isArray(p) ? p : [])
  }, [api])

  useEffect(() => { load() }, [load])

  async function handleUpload(e) {
    e.preventDefault()
    if (!uploadProjectId || !uploadFiles?.length) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('project_id', uploadProjectId)
      for (const f of uploadFiles) fd.append('files', f)
      const res = await fetch('/api/tasks/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || `HTTP ${res.status}`)
      }
      setUploadFiles(null)
      setUploadProjectId('')
      e.target.reset()
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleBulkAssign(e) {
    e.preventDefault()
    if (!bulkProjectId || !bulkAnnotatorId) return
    setBulkLoading(true)
    setBulkResult(null)
    try {
      const result = await api(`/projects/${bulkProjectId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotator_id: Number(bulkAnnotatorId) }),
      })
      setBulkResult(result)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBulkLoading(false)
    }
  }

  async function assign(taskId) {
    if (!selectedAnnotator) return
    try {
      await api(`/tasks/${taskId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotator_id: Number(selectedAnnotator) }),
      })
      setAssigningId(null)
      setSelectedAnnotator('')
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const projectName = id => projects.find(p => p.id === id)?.name ?? `#${id}`

  return (
    <div className="space-y-4">
      <SectionHeader title="Úlohy" />

      {/* Bulk Assign */}
      <div
        className="p-5"
        style={{ background: '#f5f3ff', border: '1.5px solid #ede9fe', borderRadius: '16px' }}
      >
        <h3 className="font-semibold text-sm mb-3" style={{ color: '#4c1d95' }}>Hromadne priradiť projekt anotátorovi</h3>
        {bulkResult && (
          <div className="mb-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
            {bulkResult.assigned} úloh priradených
            {bulkResult.skipped > 0 && `, ${bulkResult.skipped} už malo priradenie`}
          </div>
        )}
        <form onSubmit={handleBulkAssign} className="space-y-3">
          <select required value={bulkProjectId} onChange={e => { setBulkProjectId(e.target.value); setBulkResult(null) }} className={inputCls}>
            <option value="">Vyberte projekt…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select required value={bulkAnnotatorId} onChange={e => { setBulkAnnotatorId(e.target.value); setBulkResult(null) }} className={inputCls}>
            <option value="">Vyberte anotátora…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <button type="submit" disabled={bulkLoading} className={btnPrimary + ' disabled:opacity-50'}>
            {bulkLoading ? 'Priraďuje sa…' : 'Priradiť všetky úlohy projektu anotátorovi'}
          </button>
        </form>
      </div>

      {/* Upload */}
      <div
        className="p-5"
        style={{ background: '#eef2ff', border: '1.5px solid #e0e7ff', borderRadius: '16px' }}
      >
        <h3 className="font-semibold text-indigo-900 text-sm mb-3">Nahrať súbory</h3>
        {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
        <form onSubmit={handleUpload} className="space-y-3">
          <select required value={uploadProjectId} onChange={e => setUploadProjectId(e.target.value)} className={inputCls}>
            <option value="">Vyberte projekt…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            required type="file" multiple
            onChange={e => setUploadFiles(e.target.files)}
            className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-sm file:font-medium hover:file:bg-indigo-700 file:cursor-pointer"
          />
          <button type="submit" disabled={uploading} className={btnPrimary + ' disabled:opacity-50'}>
            {uploading ? 'Nahráva sa…' : 'Nahrať súbory'}
          </button>
        </form>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Zatiaľ žiadne úlohy.</p>}
        {tasks.map(t => (
          <div key={t.id} className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0 mr-3">
                <p className="font-medium text-gray-900 text-sm truncate">{t.original_filename}</p>
                <p className="text-xs text-gray-400 mt-0.5">{projectName(t.project_id)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusBadge[t.status]}`}>
                  {statusLabel[t.status] ?? t.status}
                </span>
                {assigningId !== t.id && (
                  <button
                    onClick={() => { setAssigningId(t.id); setSelectedAnnotator('') }}
                    className="text-xs px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 font-medium transition-colors"
                  >
                    Priradiť
                  </button>
                )}
              </div>
            </div>

            {assigningId === t.id && (
              <div className="flex gap-2 items-center pt-2 border-t border-gray-100">
                <select
                  value={selectedAnnotator}
                  onChange={e => setSelectedAnnotator(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Vyberte anotátora…</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
                <button onClick={() => assign(t.id)} className={btnPrimary}>Priradiť</button>
                <button onClick={() => setAssigningId(null)} className={btnSecondary}>Zrušiť</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── IAA tab — merged supervisor overview + kappa ──────────────────────────────

function StatCard({ label, value, color = 'text-indigo-600' }) {
  return (
    <div
      className="rounded-2xl shadow-sm px-4 py-3.5"
      style={{ background: 'linear-gradient(135deg, white 0%, rgba(79,70,229,0.03) 100%)' }}
    >
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p
        className={`tabular-nums ${color}`}
        style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.04em' }}
      >
        {value}
      </p>
    </div>
  )
}

function MiniProgress({ done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{done} / {total}</span>
        <span className="font-semibold">{pct}%</span>
      </div>
      <div className="w-full rounded-full" style={{ height: '5px', background: '#ece9fd' }}>
        <div
          className="rounded-full transition-all duration-500"
          style={{
            height: '5px',
            width: `${pct}%`,
            background: pct === 100
              ? 'linear-gradient(90deg, #10b981, #34d399)'
              : 'linear-gradient(90deg, #818cf8, #a78bfa)',
          }}
        />
      </div>
    </div>
  )
}

function AnnotatorCard({ annotator }) {
  const isDone = annotator.total_assigned > 0 && annotator.total_completed === annotator.total_assigned
  return (
    <div className={`bg-white border rounded-2xl shadow-sm p-4 space-y-2.5 ${isDone ? 'border-emerald-100' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs shrink-0"
            style={{ background: userAvatarGradient(annotator.full_name), fontWeight: 700 }}
          >
            {getInitials(annotator.full_name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{annotator.full_name}</p>
            <p className="text-xs text-gray-400 truncate mt-0.5">{annotator.email}</p>
          </div>
        </div>
        {isDone && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
            Hotovo ✓
          </span>
        )}
      </div>
      <MiniProgress done={annotator.total_completed} total={annotator.total_assigned} />
      {annotator.projects.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {annotator.projects.map(p => (
            <span
              key={p.id}
              className="px-2 py-0.5 rounded-full"
              style={{ background: '#eef2ff', color: '#4338ca', fontWeight: 600, fontSize: '10px' }}
            >
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectIAACard({ project, api, expanded, onToggle }) {
  const pct = project.total_tasks > 0
    ? Math.round((project.total_annotated / project.total_tasks) * 100)
    : 0
  const isDone = project.total_tasks > 0 && project.total_annotated >= project.total_tasks

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden transition-all"
      style={expanded ? {
        border: '1.5px solid #a5b4fc',
        boxShadow: '0 0 0 3px #eef2ff',
      } : {
        border: '1.5px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
      onMouseEnter={!expanded ? e => {
        e.currentTarget.style.borderColor = '#c7d2fe'
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(79,70,229,0.1)'
      } : undefined}
      onMouseLeave={!expanded ? e => {
        e.currentTarget.style.borderColor = '#e5e7eb'
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
      } : undefined}
    >
      <button className="w-full text-left px-5 py-4" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
            {project.description && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${typeBadge[project.type] ?? 'bg-gray-100 text-gray-600'}`}>
              {typeLabel[project.type] ?? project.type}
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
            <span>Pokrok anotácie</span>
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
          <span className="text-gray-500">{project.total_tasks} úloh</span>
          <span className="text-emerald-600 font-medium">{project.total_annotated} anotovaných</span>
          {project.annotators.length > 0 && (
            <span className="text-gray-400">
              {project.annotators.length} anotátor{project.annotators.length !== 1 ? 'i' : ''}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-5 space-y-6">
          {project.annotators.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Anotátori</p>
              <div className="space-y-2.5">
                {project.annotators.map(a => {
                  const apct = a.assigned > 0 ? Math.round((a.completed / a.assigned) * 100) : 0
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-gray-700 truncate">{a.full_name}</span>
                          <span className="text-gray-400 shrink-0 ml-2 tabular-nums">{a.completed}/{a.assigned}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${apct === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}`}
                            style={{ width: `${apct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-gray-500 w-9 text-right shrink-0 tabular-nums">{apct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              IAA — Cohenova κ
            </p>
            <IAADashboard projectId={project.id} api={api} />
          </div>
        </div>
      )}
    </div>
  )
}

function IAATab({ api }) {
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedProject, setExpanded] = useState(null)

  useEffect(() => {
    api('/supervisor/overview')
      .then(setOverview)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [api])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!overview) {
    return <p className="text-sm text-gray-400 text-center py-12">Nepodarilo sa načítať dáta IAA.</p>
  }

  const { totals, annotators, projects } = overview

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Celkové úlohy"  value={totals.tasks} />
        <StatCard label="Anotácie"       value={totals.annotations}    color="text-violet-600" />
        <StatCard label="Anotátori"      value={totals.annotators}     color="text-emerald-600" />
        <StatCard label="Dokončenie"     value={`${totals.completion_pct}%`} color="text-amber-600" />
      </div>

      {/* Annotators */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Anotátori</h3>
        {annotators.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Žiadni anotátori.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {annotators.map(a => <AnnotatorCard key={a.id} annotator={a} />)}
          </div>
        )}
      </section>

      {/* Projects with IAA */}
      <section>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Projekty — kliknite pre IAA &amp; detail anotátorov
        </h3>
        {projects.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Žiadne projekty.</p>
        ) : (
          <div className="space-y-3">
            {projects.map(p => (
              <ProjectIAACard
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
    </div>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

const TABS = [
  { id: 'Projects', label: 'Projekty' },
  { id: 'Users',    label: 'Používatelia' },
  { id: 'Tasks',    label: 'Úlohy' },
  { id: 'IAA',      label: 'IAA' },
]

export default function AdminDashboard() {
  const { user, logout, token } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('Projects')
  const api = useApi(token)

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen" style={{ background: '#f0effe' }}>
      <header className="bg-white border-b border-gray-100 px-6 py-0 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 py-3">
          <span className="text-lg font-bold text-indigo-600 tracking-tight">ToxiLabel</span>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Admin</span>
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
      </header>

      <div className="bg-white border-b border-gray-100 px-6">
        <div className="flex">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3.5 text-sm border-b-2 transition-colors ${
                tab === t.id
                  ? 'font-semibold'
                  : 'border-transparent font-medium text-gray-400 hover:text-gray-700 hover:border-gray-200'
              }`}
              style={tab === t.id
                ? { borderBottomColor: '#4f46e5', borderBottomWidth: '2.5px', color: '#4f46e5' }
                : {}}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-6">
        {tab === 'Projects' && <ProjectsTab api={api} token={token} />}
        {tab === 'Users'    && <UsersTab api={api} />}
        {tab === 'Tasks'    && <TasksTab api={api} />}
        {tab === 'IAA'      && <IAATab api={api} />}
      </main>
    </div>
  )
}
