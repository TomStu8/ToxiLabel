import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const CATEGORIES = [
  'urážka', 'nenávisť', 'výhražka', 'dezinformácia',
  'rasa a etnicita', 'náboženstvo', 'sexuálna orientácia', 'migranti',
  'hendikep', 'vzhľad', 'ideológia', 'iné',
]

function mediaUrl(task) {
  return `/uploads/${task.project_id}/${task.file_name}`
}

function textFileUrl(filePath) {
  const parts = filePath.split('/uploads/')
  return parts.length > 1 ? `/uploads/${parts[1]}` : filePath
}

function ContentHeader({ icon, label }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
      {icon}
      <span className="text-xs font-medium text-gray-500">{label}</span>
    </div>
  )
}

function InlineTextContent({ text }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden card-tinted">
      <ContentHeader
        label="Textový obsah"
        icon={<svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
      />
      <div className="p-5 max-h-72 overflow-y-auto">
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  )
}

function TextFileContent({ filePath }) {
  const [text, setText] = useState(null)
  useEffect(() => {
    fetch(textFileUrl(filePath))
      .then(r => r.text())
      .then(setText)
      .catch(() => setText('(Obsah súboru sa nepodarilo načítať)'))
  }, [filePath])
  return (
    <div className="bg-white rounded-2xl overflow-hidden card-tinted">
      <ContentHeader
        label="Textový obsah"
        icon={<svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
      />
      <div className="p-5 max-h-72 overflow-y-auto">
        <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
          {text ?? <span className="text-gray-400 animate-pulse">Načítava sa…</span>}
        </pre>
      </div>
    </div>
  )
}

function ImageContent({ task }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div className="bg-white rounded-2xl overflow-hidden card-tinted">
      <ContentHeader
        label="Obrazový obsah"
        icon={<svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>}
      />
      <div className="flex justify-center p-4 min-h-24">
        {imgError ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-gray-400">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
            </svg>
            <p className="text-sm">Obrázok sa nepodarilo načítať.</p>
          </div>
        ) : (
          <img
            src={mediaUrl(task)}
            alt="Task content"
            onError={() => setImgError(true)}
            className="max-h-96 object-contain rounded-xl"
          />
        )}
      </div>
    </div>
  )
}

function VideoContent({ task }) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden card-tinted">
      <ContentHeader
        label="Video obsah"
        icon={<svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>}
      />
      <div className="bg-black">
        <video controls className="w-full max-h-96">
          <source src={mediaUrl(task)} />
          Váš prehliadač nepodporuje video tag.
        </video>
      </div>
    </div>
  )
}

function TaskContent({ task, projectType }) {
  if (task.content) return <InlineTextContent text={task.content} />
  if (!task.file_path) return null
  if (projectType === 'image') return <ImageContent task={task} />
  if (projectType === 'video') return <VideoContent task={task} />
  return <TextFileContent filePath={task.file_path} />
}

export default function AnnotationView() {
  const { taskId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [task, setTask] = useState(null)
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)

  const [isToxic, setIsToxic] = useState(null)
  const [categories, setCategories] = useState([])
  const [notes, setNotes] = useState('')
  const [transcriptCorrection, setTranscriptCorrection] = useState('')
  const [transcriptState, setTranscriptState] = useState('idle')
  const [transcriptError, setTranscriptError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setIsToxic(null)
    setCategories([])
    setNotes('')
    setTranscriptCorrection('')
    setTranscriptState('idle')
    setTranscriptError('')
    setSubmitting(false)
    setError('')
    setLoading(true)
  }, [taskId])

  useEffect(() => {
    async function load() {
      try {
        const [t, existing] = await Promise.all([
          fetch(`/api/tasks/${taskId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
          fetch(`/api/annotations/my/${taskId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null).catch(() => null),
        ])
        setTask(t)
        const p = await fetch(`/api/projects/${t.project_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json())
        setProject(p)
        if (existing) {
          setIsToxic(existing.is_toxic)
          setCategories(existing.categories ?? [])
          setNotes(existing.notes ?? '')
          if (existing.transcript_correction) {
            setTranscriptCorrection(existing.transcript_correction)
            setTranscriptState('done')
          }
        }

        if (t.transcript && !existing?.transcript_correction) {
          setTranscriptCorrection(t.transcript)
          setTranscriptState('done')
        }
      } catch {
        // task not found
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [taskId, token])

  function toggleCategory(cat) {
    setCategories(cs => cs.includes(cat) ? cs.filter(c => c !== cat) : [...cs, cat])
  }

  const submitAnnotation = useCallback(async () => {
    if (isToxic === null) { setError('Vyberte prosím Netoxické alebo Toxické.'); return }
    if (submitting) return
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/annotations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: Number(taskId),
          is_toxic: isToxic,
          categories: isToxic ? categories : [],
          notes: notes || null,
          transcript_correction: transcriptCorrection || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.detail || `HTTP ${res.status}`)
      }
      const projectId = task?.project_id
      const allTasks = await fetch(`/api/tasks?project_id=${projectId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).catch(() => [])
      const next = allTasks.find(t => !t.annotated_by_me && t.id !== Number(taskId))
      if (next) {
        navigate(`/annotate/${next.id}`)
      } else {
        navigate(`/project/${projectId}/tasks`, { state: { allDone: true } })
      }
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }, [isToxic, submitting, categories, notes, transcriptCorrection, taskId, token, navigate, task])

  async function handleTranscribe() {
    setTranscriptState('generating')
    setTranscriptError('')
    try {
      const res = await fetch(`/api/tasks/${taskId}/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      let data
      try {
        data = await res.json()
      } catch {
        throw new Error('Server neodpovedal včas. Pre videá môže prepis trvať dlhšie — skúste znova.')
      }
      if (!res.ok) {
        const msg = data.detail || `HTTP ${res.status}`
        if (res.status === 503) {
          throw new Error('Prepis inej úlohy práve prebieha. Skúste znova o chvíľu.')
        }
        throw new Error(msg)
      }
      setTranscriptCorrection(data.transcript || '')
      setTranscriptState('done')
    } catch (err) {
      setTranscriptError(err.message)
      setTranscriptState('error')
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    submitAnnotation()
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== 'Enter') return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (isToxic === null) return
      if (isToxic === true && categories.length === 0) return
      submitAnnotation()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isToxic, categories, submitAnnotation])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0effe' }}>
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f0effe' }}>
        <p className="text-gray-400 text-sm">Úloha nenájdená.</p>
      </div>
    )
  }

  const projectType = project?.type ?? 'text'

  return (
    <div className="min-h-screen" style={{ background: '#f0effe' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center gap-4">
          <button
            onClick={() => navigate(`/project/${task.project_id}/tasks`)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
            Späť
          </button>
          <div className="h-4 w-px bg-gray-200" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 truncate">{task.original_filename}</h1>
            <p className="text-xs text-gray-400">{project?.name ?? ''} · Úloha #{task.id}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-6 space-y-5">
        {/* Content viewer */}
        <TaskContent task={task} projectType={projectType} />

        {/* Transcript section — only for image/video tasks */}
        {(projectType === 'image' || projectType === 'video') && (
          <div className="bg-white rounded-2xl overflow-hidden card-tinted">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
              </svg>
              <span className="text-xs font-medium text-gray-500">Prepis</span>
              {transcriptState === 'done' && (
                <button
                  type="button"
                  onClick={handleTranscribe}
                  className="ml-auto text-xs text-gray-400 hover:text-indigo-600 transition-colors flex items-center gap-1"
                  title="Re-generate transcript"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                  Znova prepísať
                </button>
              )}
            </div>

            <div className="p-4">
              {transcriptState === 'generating' && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-medium text-indigo-600">
                    {projectType === 'image' ? 'Spúšťa sa OCR…' : 'Prepisuje sa zvuk…'}
                  </p>
                  <p className="text-xs text-gray-400">Môže to chvíľu trvať.</p>
                </div>
              )}

              {transcriptState === 'error' && (
                <div className="space-y-3">
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {transcriptError}
                  </p>
                  <button
                    type="button"
                    onClick={handleTranscribe}
                    className="text-xs px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 font-medium transition-colors"
                  >
                    Skúsiť znova
                  </button>
                </div>
              )}

              {transcriptState === 'idle' && (
                <div className="flex flex-col items-center gap-3 py-5">
                  <p className="text-sm text-gray-400">Prepis zatiaľ nebol vygenerovaný.</p>
                  <button
                    type="button"
                    onClick={handleTranscribe}
                    className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-xl transition-opacity"
                    style={{ background: 'linear-gradient(135deg, #4f46e5, #6d28d9)', boxShadow: '0 2px 8px rgba(79,70,229,0.25)' }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {projectType === 'image'
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                        : <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
                      }
                    </svg>
                    {projectType === 'image' ? 'Generovať prepis (OCR)' : 'Generovať prepis (Whisper)'}
                  </button>
                </div>
              )}

              {transcriptState === 'done' && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-500">
                    Automaticky generovaný prepis — opravte ak je potrebné
                  </label>
                  <textarea
                    rows={4}
                    value={transcriptCorrection}
                    onChange={e => setTranscriptCorrection(e.target.value)}
                    placeholder="Prepis je prázdny — zadajte manuálne ak je potrebné."
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-shadow font-mono"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Label form */}
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Step 1 */}
          <div className="bg-white rounded-2xl p-5 card-tinted">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Krok 1 — Je tento obsah toxický?
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* Non-toxic */}
              <button
                type="button"
                onClick={() => { setIsToxic(false); setCategories([]) }}
                className={`relative py-5 rounded-xl text-base font-bold border-2 btn-annotation-nontoxic ${
                  isToxic === false
                    ? 'selected border-emerald-500 text-white'
                    : 'border-emerald-200 bg-white text-emerald-700'
                }`}
              >
                {isToxic === false && (
                  <span className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center text-emerald-600 text-xs font-bold leading-none">✓</span>
                )}
                <span className="text-xl block mb-1">✓</span>
                Netoxické
              </button>

              {/* Toxic */}
              <button
                type="button"
                onClick={() => setIsToxic(true)}
                className={`relative py-5 rounded-xl text-base font-bold border-2 btn-annotation-toxic ${
                  isToxic === true
                    ? 'selected border-red-500 text-white'
                    : 'border-red-200 bg-white text-red-700'
                }`}
              >
                {isToxic === true && (
                  <span className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center text-red-600 text-xs font-bold leading-none">✓</span>
                )}
                <span className="text-xl block mb-1">✕</span>
                Toxické
              </button>
            </div>
          </div>

          {/* Step 2 — categories */}
          {isToxic === true && (
            <div className="bg-white rounded-2xl p-5 card-tinted animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Krok 2 — Vyberte kategórie
                </p>
                {categories.length > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                    {categories.length} vybraných
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-full text-sm border-2 font-medium chip-category ${
                      categories.includes(cat)
                        ? 'selected border-indigo-500 text-white'
                        : 'border-indigo-100 bg-white text-indigo-700'
                    }`}
                  >
                    {categories.includes(cat) && (
                      <span className="inline-flex items-center justify-center w-4 h-4 bg-white rounded-full text-indigo-600 text-xs font-bold leading-none mr-1">✓</span>
                    )}
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white rounded-2xl p-5 card-tinted">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Poznámky <span className="normal-case font-normal text-gray-400">(voliteľné)</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Pridajte poznámky k tomuto obsahu…"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-shadow"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || isToxic === null}
            className="w-full py-3.5 disabled:opacity-40 text-white font-semibold rounded-xl text-sm transition-opacity"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #6d28d9)', boxShadow: '0 4px 16px rgba(79,70,229,0.3)' }}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Odosiela sa…
              </span>
            ) : 'Odoslať anotáciu'}
          </button>
        </form>
      </main>
    </div>
  )
}
