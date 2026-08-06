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

    const validationError = validateAuthForm({
      mode,
      anonymousNumber,
      password,
      acceptPolicies,
      acceptPrivacy,
      numberState,
      numberMessage,
    })

    if (validationError) {
      setError(validationError)
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
      setError(normalizeAuthError(data.error ?? data.message, mode))
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

  function validateAuthForm(input: {
    mode: 'register' | 'login'
    anonymousNumber: string
    password: string
    acceptPolicies: boolean
    acceptPrivacy: boolean
    numberState: 'idle' | 'checking' | 'available' | 'occupied' | 'not_reserved' | 'invalid'
    numberMessage: string
  }) {
    const cleanedNumber = input.anonymousNumber.trim()
    const trimmedPassword = input.password.trim()

    if (!cleanedNumber) {
      return 'Falta escribir el numero.'
    }

    if (!/^\d+$/.test(cleanedNumber)) {
      return 'Escribe solo numeros.'
    }

    if (!trimmedPassword) {
      return 'Falta escribir la contrasena.'
    }

    if (input.mode === 'register') {
      if (trimmedPassword.length < 8) {
        return 'Contrasena corta.'
      }

      if (!input.acceptPolicies || !input.acceptPrivacy) {
        return 'Tienes que aceptar las politicas.'
      }

      if (input.numberState === 'checking') {
        return 'Espera, estamos comprobando el numero.'
      }

      if (input.numberState === 'occupied' || input.numberState === 'not_reserved' || input.numberState === 'invalid') {
        return normalizeNumberMessage(input.numberMessage, input.numberState)
      }
    }

    return ''
  }

  function normalizeNumberMessage(
    message: string,
    state: 'idle' | 'checking' | 'available' | 'occupied' | 'not_reserved' | 'invalid',
  ) {
    if (state === 'occupied') {
      return 'Numero ocupado.'
    }

    if (state === 'not_reserved') {
      return 'Numero no disponible.'
    }

    if (state === 'invalid') {
      if (!message) {
        return 'Numero invalido.'
      }

      const lowered = message.toLowerCase()
      if (lowered.includes('solo numeros')) {
        return 'Escribe solo numeros.'
      }

      return 'Numero invalido.'
    }

    return message || 'Numero no disponible.'
  }

  function normalizeAuthError(message: string | undefined, currentMode: 'register' | 'login') {
    if (!message) {
      return currentMode === 'register' ? 'No se pudo completar el registro.' : 'No se pudo iniciar sesion.'
    }

    const lowered = message.toLowerCase()

    if (lowered.includes('missing registration fields')) {
      return 'Faltan datos por escribir.'
    }

    if (lowered.includes('anonymous number and password are required')) {
      return 'Falta numero o contrasena.'
    }

    if (lowered.includes('policies and privacy must be accepted')) {
      return 'Tienes que aceptar las politicas.'
    }

    if (lowered.includes('password must have at least 8 characters')) {
      return 'Contrasena corta.'
    }

    if (lowered.includes('invalid credentials')) {
      return 'Numero o contrasena incorrectos.'
    }

    if (lowered.includes('anonymous number is not available') || lowered.includes('numero ocupado')) {
      return 'Numero ocupado.'
    }

    if (lowered.includes('invalid json body')) {
      return 'Error al enviar los datos.'
    }

    if (lowered.includes('internal server error')) {
      return 'Error interno del servidor.'
    }

    if (lowered.includes('failed to fetch')) {
      return 'No se pudo conectar con el servidor.'
    }

    return message
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
                  <p>
                    Guijo Social recopila la informacion minima necesaria para prestar el servicio, proteger cuentas,
                    prevenir abusos y mantener la seguridad general de la plataforma.
                  </p>
                  <p>
                    Entre esos datos pueden incluirse identificadores tecnicos del dispositivo, datos basicos de uso,
                    registros de acceso, direccion IP, informacion del navegador o movil y otros elementos tecnicos
                    necesarios para el funcionamiento, soporte y moderacion del servicio.
                  </p>
                  <p>
                    La edad de acceso es abierta y la plataforma puede ser utilizada tambien por menores. El uso del
                    servicio implica la aceptacion de estas condiciones informativas y del tratamiento basico de datos
                    relacionado con seguridad, acceso y funcionamiento de la red social.
                  </p>
                  <p>
                    Esta informacion podra ampliarse o actualizarse en el futuro cuando la plataforma incorpore nuevas
                    funciones, incluyendo publicaciones con imagen, video u otros formatos multimedia.
                  </p>
                </div>
              ) : null}

              {infoSection === 'policies' ? (
                <div className="info-section" role="tabpanel">
                  <h3>Politicas</h3>
                  <p>
                    Cada usuario es responsable de los textos, publicaciones, comentarios y cualquier otro contenido que
                    comparta dentro de Guijo Social.
                  </p>
                  <p>
                    Guijo Social puede revisar, ocultar o eliminar publicaciones por decision administrativa cuando se
                    detecten posibles incumplimientos, pero esa revision puede requerir tiempo y no siempre sera
                    inmediata.
                  </p>
                  <p>
                    El hecho de que una publicacion permanezca visible durante un tiempo no supone aprobacion,
                    supervision previa ni asuncion de responsabilidad por parte del administrador de la plataforma.
                  </p>
                  <p>
                    Al utilizar el servicio y aceptar estas condiciones, el usuario reconoce que actua bajo su propia
                    responsabilidad y que el titular de la plataforma no responde por el contenido publicado por terceros,
                    salvo en los casos en los que la normativa aplicable exija una actuacion concreta.
                  </p>
                  <p>
                    Estas condiciones podran actualizarse conforme evolucione la plataforma, especialmente cuando se
                    habiliten nuevas funciones como imagenes, videos u otros formatos de contenido.
                  </p>
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
