import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Session = {
  token: string
  profile: {
    id: string
    anonymousNumber: string
    age: number
  }
}

type FeedPost = {
  id: string
  author_anonymous_number: string
  parent_post_id: string | null
  content: string
  created_at: string
  likes_count: number
  comments_count: number
}

type NumberCheckResponse = {
  available: boolean
  status: 'available' | 'occupied' | 'not_reserved' | 'invalid'
  message: string
}

type AuthResponse = {
  token?: string
  profile?: Session['profile']
  error?: string
  message?: string
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8789'

function App() {
  const [screen, setScreen] = useState<'home' | 'feed'>('home')
  const [mode, setMode] = useState<'register' | 'login'>('login')
  const [anonymousNumber, setAnonymousNumber] = useState('')
  const [password, setPassword] = useState('')
  const [age, setAge] = useState('18')
  const [acceptPolicies, setAcceptPolicies] = useState(false)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [feed, setFeed] = useState<FeedPost[]>([])
  const [error, setError] = useState('')
  const [numberState, setNumberState] = useState<'idle' | 'checking' | 'available' | 'occupied' | 'not_reserved' | 'invalid'>('idle')
  const [numberMessage, setNumberMessage] = useState('')

  useEffect(() => {
    if (screen !== 'feed') {
      return
    }

    void loadFeed(session?.token)
  }, [screen, session?.token])

  useEffect(() => {
    if (mode !== 'register') {
      setNumberState('idle')
      setNumberMessage('')
      return
    }

    const cleaned = anonymousNumber.replace(/\D/g, '')
    if (!cleaned) {
      setNumberState('idle')
      setNumberMessage('')
      return
    }

    setNumberState('checking')
    const timeoutId = setTimeout(() => {
      void checkNumberAvailability(cleaned)
    }, 250)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [anonymousNumber, mode])

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (mode === 'register' && (numberState === 'occupied' || numberState === 'not_reserved' || numberState === 'invalid')) {
      setError(numberMessage || 'Numero no disponible.')
      return
    }

    const payload =
      mode === 'register'
        ? {
            anonymousNumber,
            password,
            age: Number(age),
            acceptedPolicies: acceptPolicies,
            acceptedPrivacy: acceptPrivacy,
          }
        : {
            anonymousNumber,
            password,
          }

    const response = await fetch(`${API_URL}/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await readResponseBody(response)

    if (!response.ok) {
      setError(data.error ?? data.message ?? 'No se pudo iniciar sesion o registrar.')
      return
    }

    if (!data.token || !data.profile) {
      setError('La respuesta del servidor no fue valida.')
      return
    }

    setSession({ token: data.token, profile: data.profile })
    setScreen('feed')
  }

  async function checkNumberAvailability(cleanedNumber: string) {
    try {
      const response = await fetch(`${API_URL}/auth/check-number?number=${encodeURIComponent(cleanedNumber)}`)
      const data = (await response.json()) as NumberCheckResponse | { error?: string }

      if (!response.ok) {
        setNumberState('invalid')
        setNumberMessage('Numero invalido.')
        return
      }

      if (!('status' in data) || !('message' in data)) {
        setNumberState('invalid')
        setNumberMessage('No se pudo validar el numero ahora.')
        return
      }

      setNumberState(data.status)
      setNumberMessage(data.message)
    } catch {
      setNumberState('invalid')
      setNumberMessage('No se pudo validar el numero ahora.')
    }
  }

  async function loadFeed(token?: string) {
    const response = await fetch(`${API_URL}/posts/feed`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    if (!response.ok) {
      setFeed([])
      return
    }

    const data = (await response.json()) as { items: FeedPost[] }
    setFeed(data.items)
  }

  async function readResponseBody(response: Response): Promise<AuthResponse> {
    const rawBody = await response.text()

    if (!rawBody) {
      return {}
    }

    try {
      return JSON.parse(rawBody) as AuthResponse
    } catch {
      return { message: rawBody }
    }
  }

  if (screen === 'home') {
    return (
      <main className="page">
        <div className="home-shell">
          <section className="hero">
            <h1>Guijo Social</h1>
            <p>Tu red social local. Inicio de toda la vida: iniciar sesion o registrar.</p>
          </section>

          <section className="card">
            <div className="mode-switch">
              <button
                type="button"
                className={mode === 'login' ? 'active' : ''}
                onClick={() => setMode('login')}
              >
                Iniciar sesion
              </button>
              <button
                type="button"
                className={mode === 'register' ? 'active' : ''}
                onClick={() => setMode('register')}
              >
                Registrar
              </button>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label>
                Numero anonym
                <input
                  value={anonymousNumber}
                  onChange={(event) => setAnonymousNumber(event.target.value.replace(/\D/g, ''))}
                  placeholder="Ejemplo: 7"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
              </label>

              {mode === 'register' ? (
                <p
                  className={`status-note ${numberState}`}
                  aria-live="polite"
                >
                  {anonymousNumber ? `ANONYM-${anonymousNumber} · ` : ''}
                  {numberState === 'checking' ? 'Comprobando numero...' : numberMessage}
                </p>
              ) : null}

              <label>
                Contrasena
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimo 8 caracteres"
                />
              </label>

              {mode === 'register' ? (
                <>
                  <label>
                    Edad
                    <input
                      value={age}
                      onChange={(event) => setAge(event.target.value)}
                      inputMode="numeric"
                    />
                  </label>

                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={acceptPolicies}
                      onChange={(event) => setAcceptPolicies(event.target.checked)}
                    />
                    <span>Acepto las politicas.</span>
                  </label>

                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={acceptPrivacy}
                      onChange={(event) => setAcceptPrivacy(event.target.checked)}
                    />
                    <span>
                      Acepto privacidad y recopilacion de dispositivo/uso para seguridad.
                    </span>
                  </label>
                </>
              ) : null}

              {error ? <p className="error">{error}</p> : null}

              <button type="submit" className="primary">
                {mode === 'register' ? 'Registrar perfil' : 'Entrar'}
              </button>
            </form>
          </section>

          <section className="card">
            <h2>Politicas y privacidad</h2>
            <p>
              Para mantener segura la red, se guarda edad, dispositivo y contexto basico de uso.
            </p>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="feed-shell">
        <header className="feed-title">
          <h1>Guijo Social</h1>
          <p>{session?.profile.anonymousNumber ?? 'ANONYM'}</p>
        </header>

        <section className="feed-list">
          {feed.length === 0 ? (
            <article className="post">
              <p>Todavia no hay publicaciones.</p>
            </article>
          ) : (
            feed.map((post) => (
              <article key={post.id} className="post">
                <div className="post-head">
                  <strong>{post.author_anonymous_number}</strong>
                  <span>{new Date(post.created_at).toLocaleString()}</span>
                </div>
                <p>{post.content}</p>
                <div className="meta">
                  {post.likes_count} likes · {post.comments_count} comentarios
                </div>
              </article>
            ))
          )}
        </section>
      </div>

      <button
        type="button"
        className="profile-fab"
        title="Perfil"
        onClick={() => setScreen('home')}
      >
        PERFIL
      </button>
    </main>
  )
}

export default App
