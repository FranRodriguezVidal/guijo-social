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
  const age = '18'
  const [acceptPolicies, setAcceptPolicies] = useState(false)
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [feed, setFeed] = useState<FeedPost[]>([])
  const [error, setError] = useState('')
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [infoSection, setInfoSection] = useState<'privacy' | 'policies' | 'copyright'>('privacy')
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
      <main className="page auth-page">
        <div className="auth-bg" aria-hidden="true">
          <img src="/escudo.webp" alt="" className="auth-shield" />
        </div>

        <div className="auth-overlay">
          <section className="auth-panel">
            <header className="auth-header">
              <h1>Guijo Social</h1>
            </header>

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
                <div className="number-input-row">
                  <span className="number-prefix">ANONYM-</span>
                  <input
                    value={anonymousNumber}
                    onChange={(event) => setAnonymousNumber(event.target.value.replace(/\D/g, ''))}
                    placeholder="93"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="number-only-input"
                  />
                </div>
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
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={acceptPolicies && acceptPrivacy}
                      onChange={(event) => {
                        setAcceptPolicies(event.target.checked)
                        setAcceptPrivacy(event.target.checked)
                      }}
                    />
                    <span>
                      Aceptas politicas, privacidad, recopilacion basica del dispositivo, uso y mas medidas de seguridad
                      de Guijo Social.
                    </span>
                  </label>
                </>
              ) : null}

              {error ? <p className="error">{error}</p> : null}

              <button type="submit" className="primary">
                {mode === 'register' ? 'Registrar perfil' : 'Entrar'}
              </button>

              <button
                type="button"
                className="info-button"
                onClick={() => {
                  setInfoSection('privacy')
                  setShowInfoModal(true)
                }}
              >
                <span className="info-icon" aria-hidden="true">i</span>
                <span>Informacion</span>
              </button>
            </form>
          </section>
        </div>

        {showInfoModal ? (
          <div className="info-modal-backdrop" role="presentation" onClick={() => setShowInfoModal(false)}>
            <section
              className="info-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Informacion legal"
              onClick={(event) => event.stopPropagation()}
            >
              <h2>Informacion</h2>
              <div className="info-tabs" role="tablist" aria-label="Informacion legal">
                <button
                  type="button"
                  role="tab"
                  aria-selected={infoSection === 'privacy'}
                  className={infoSection === 'privacy' ? 'active' : ''}
                  onClick={() => setInfoSection('privacy')}
                >
                  Privacidad
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={infoSection === 'policies'}
                  className={infoSection === 'policies' ? 'active' : ''}
                  onClick={() => setInfoSection('policies')}
                >
                  Politicas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={infoSection === 'copyright'}
                  className={infoSection === 'copyright' ? 'active' : ''}
                  onClick={() => setInfoSection('copyright')}
                >
                  Derechos de autor
                </button>
              </div>

              {infoSection === 'privacy' ? (
                <div className="info-section" role="tabpanel">
                  <h3>Privacidad</h3>
                  <p>404 ficticio</p>
                </div>
              ) : null}

              {infoSection === 'policies' ? (
                <div className="info-section" role="tabpanel">
                  <h3>Politicas</h3>
                  <p>404 ficticio</p>
                </div>
              ) : null}

              {infoSection === 'copyright' ? (
                <div className="info-section" role="tabpanel">
                  <h3>Creditos</h3>
                  <p>
                    El escudo utilizado en esta web pertenece a su autor o titular correspondiente y se utiliza sin
                    modificaciones, de acuerdo con los terminos de la licencia Creative Commons Attribution-ShareAlike
                    (CC BY-SA).
                  </p>
                  <p>No se han realizado cambios sobre la imagen original.</p>
                  <p>
                    Licencia:{' '}
                    <a
                      href="https://creativecommons.org/licenses/by-sa/4.0/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      https://creativecommons.org/licenses/by-sa/4.0/
                    </a>
                  </p>
                </div>
              ) : null}

              <button type="button" className="primary" onClick={() => setShowInfoModal(false)}>
                Cerrar
              </button>
            </section>
          </div>
        ) : null}
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
