import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const BG_CHIPS = [
  { label: 'urážka',        cls: 'bg-indigo-50 text-indigo-700',  style: { top: '12%',    left: '6%',   transform: 'rotate(-8deg)' } },
  { label: 'nenávisť',      cls: 'bg-red-50 text-red-700',        style: { top: '22%',    right: '7%',  transform: 'rotate(6deg)'  } },
  { label: 'dezinformácia', cls: 'bg-indigo-50 text-indigo-700',  style: { top: '55%',    left: '3%',   transform: 'rotate(-4deg)' } },
  { label: 'výhražka',      cls: 'bg-red-50 text-red-700',        style: { bottom: '22%', right: '6%',  transform: 'rotate(10deg)' } },
  { label: 'rasa a etnicita', cls: 'bg-violet-100 text-violet-700', style: { top: '38%',  left: '2%',   transform: 'rotate(5deg)'  } },
  { label: 'náboženstvo',   cls: 'bg-amber-100 text-amber-700',   style: { bottom: '35%',right: '9%',  transform: 'rotate(-6deg)' } },
  { label: 'ideológia',     cls: 'bg-indigo-50 text-indigo-700',  style: { top: '8%',     right: '14%', transform: 'rotate(8deg)'  } },
  { label: 'hendikep',      cls: 'bg-amber-100 text-amber-700',   style: { bottom: '28%',left: '7%',   transform: 'rotate(-10deg)'} },
  { label: 'vzhľad',        cls: 'bg-indigo-50 text-indigo-700',  style: { bottom: '12%',left: '18%',  transform: 'rotate(4deg)'  } },
  { label: 'migranti',      cls: 'bg-red-50 text-red-700',        style: { top: '48%',    right: '3%',  transform: 'rotate(-5deg)' } },
]

const BG_SNIPPETS = [
  '"Toto je hanebné správanie..."',
  '"Obsah porušuje komunitné pravidlá..."',
  '"Nenávisť voči menšinám nás oslabuje."',
]

function MailIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}

function EyeIcon({ open }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  )
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Login failed')
      }
      const { access_token } = await res.json()
      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      const userInfo = await meRes.json()
      login(access_token, userInfo)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden" style={{ background: '#f0effe' }}>
      {/* Radial glows */}
      <div
        className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #818cf8 0%, transparent 70%)', opacity: 0.4, transform: 'translate(30%, -30%)' }}
      />
      <div
        className="absolute bottom-0 left-0 w-80 h-80 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, #a78bfa 0%, transparent 70%)', opacity: 0.3, transform: 'translate(-30%, 30%)' }}
      />

      {/* Floating category chips */}
      {BG_CHIPS.map(chip => (
        <span
          key={chip.label}
          className={`absolute hidden sm:inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold select-none pointer-events-none ${chip.cls}`}
          style={{ opacity: 0.55, ...chip.style }}
        >
          {chip.label}
        </span>
      ))}

      {/* Faint italic text snippets */}
      {BG_SNIPPETS.map((s, i) => (
        <p
          key={i}
          className="absolute hidden sm:block text-xs italic text-indigo-400 select-none pointer-events-none max-w-xs"
          style={{
            opacity: 0.35,
            bottom: `${20 + i * 18}%`,
            left: i % 2 === 0 ? '5%' : 'auto',
            right: i % 2 === 1 ? '5%' : 'auto',
          }}
        >
          {s}
        </p>
      ))}

      <div className="w-full max-w-sm animate-fade-in relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(140deg, #4f46e5 0%, #6d28d9 100%)', boxShadow: '0 4px 12px rgba(79,70,229,0.35)' }}
          >
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-indigo-600 tracking-tight">ToxiLabel</h1>
          <p className="text-sm text-gray-500 mt-1">Multimodálna anotačná platforma</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 card-tinted">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Prihláste sa do svojho účtu</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email with icon */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <MailIcon />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Password with icon + eye toggle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Heslo</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <LockIcon />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl text-sm mt-2 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #6d28d9)', boxShadow: '0 4px 16px rgba(79,70,229,0.3)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Prihlasuje sa…
                </span>
              ) : 'Prihlásiť sa'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
