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
  const [showProfileMenuModal, setShowProfileMenuModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showStylesModal, setShowStylesModal] = useState(false)
  const [showComposerModal, setShowComposerModal] = useState(false)
  const [infoOrigin, setInfoOrigin] = useState<'home' | 'profile-menu'>('home')
  const [infoSection, setInfoSection] = useState<'privacy' | 'policies' | 'copyright'>('privacy')
  const [numberState, setNumberState] = useState<'idle' | 'checking' | 'available' | 'occupied' | 'not_reserved' | 'invalid'>('idle')
  const [numberMessage, setNumberMessage] = useState('')
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [composerText, setComposerText] = useState('')
  const [composerError, setComposerError] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)

  function renderProfileFallbackIcon() {
    return (
      <span className="profile-placeholder-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      </span>
    )
  }

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

  useEffect(() => {
    return () => {
      if (profileImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(profileImageUrl)
      }
    }
  }, [profileImageUrl])

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

  async function handleCreatePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setComposerError('')

    const trimmedContent = composerText.trim()

    if (!trimmedContent) {
      setComposerError('Falta escribir la publicacion.')
      return
    }

    if (trimmedContent.length < 2) {
      setComposerError('Publicacion demasiado corta.')
      return
    }

    if (trimmedContent.length > 280) {
      setComposerError('Publicacion demasiado larga.')
      return
    }

    if (!session?.token) {
      setComposerError('Tu sesion ha caducado.')
      return
    }

    setIsPublishing(true)

    try {
      const response = await fetch(`${API_URL}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ content: trimmedContent }),
      })

      const data = await readResponseBody(response)

      if (!response.ok) {
        setComposerError(normalizePostError(data.error ?? data.message))
        return
      }

      setComposerText('')
      setShowComposerModal(false)
      await loadFeed(session.token)
    } catch {
      setComposerError('No se pudo publicar ahora.')
    } finally {
      setIsPublishing(false)
    }
  }

  function handleLogout() {
    const confirmed = window.confirm('¿Estas seguro de cerrar la sesion?')
    if (!confirmed) {
      return
    }

    setSession(null)
    setFeed([])
    setPassword('')
    setComposerText('')
    setComposerError('')
    setShowComposerModal(false)
    setShowProfileMenuModal(false)
    setShowProfileModal(false)
    setShowSettingsModal(false)
    setShowStylesModal(false)
    setShowInfoModal(false)
    setInfoOrigin('home')
    setInfoSection('privacy')
    setScreen('home')
  }

  function handleProfileImageChange(file: File | undefined) {
    if (!file) {
      return
    }

    const nextUrl = URL.createObjectURL(file)
    setProfileImageUrl((currentUrl) => {
      if (currentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl)
      }

      return nextUrl
    })
  }

  function clearProfileImage() {
    setProfileImageUrl((currentUrl) => {
      if (currentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl)
      }

      return ''
    })
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
      return 'Falta escribir la contraseña.'
    }

    if (input.mode === 'register') {
      if (trimmedPassword.length < 8) {
        return 'Contraseña corta.'
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
      return 'Falta numero o contraseña.'
    }

    if (lowered.includes('policies and privacy must be accepted')) {
      return 'Tienes que aceptar las politicas.'
    }

    if (lowered.includes('password must have at least 8 characters')) {
      return 'Contraseña corta.'
    }

    if (lowered.includes('invalid credentials')) {
      return 'Numero o contraseña incorrectos.'
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

  function normalizePostError(message: string | undefined) {
    if (!message) {
      return 'No se pudo publicar ahora.'
    }

    const lowered = message.toLowerCase()

    if (lowered.includes('between 2 and 280 characters')) {
      return 'La publicacion debe tener entre 2 y 280 caracteres.'
    }

    if (lowered.includes('invalid json body')) {
      return 'Error al enviar la publicacion.'
    }

    if (lowered.includes('internal server error')) {
      return 'Error interno del servidor.'
    }

    return message
  }

  function renderInfoTabs() {
    return (
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
    )
  }

  function renderInfoSection() {
    if (infoSection === 'privacy') {
      return (
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
      )
    }

    if (infoSection === 'policies') {
      return (
        <div className="info-section" role="tabpanel">
          <h3>Politicas</h3>
          <p>
            Cada usuario es responsable de los textos, publicaciones, comentarios y cualquier otro contenido que
            comparta dentro de Guijo Social.
          </p>
          <p>
            Guijo Social puede revisar, ocultar o eliminar publicaciones por decision administrativa cuando se
            detecten posibles incumplimientos, pero esa revision puede requerir tiempo y no siempre sera inmediata.
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
      )
    }

    return (
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
    )
  }

  function renderSharedInfoModal() {
    if (!showInfoModal) {
      return null
    }

    return (
      <div className="info-modal-backdrop" role="presentation" onClick={() => setShowInfoModal(false)}>
        <section
          className="info-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Informacion legal"
          onClick={(event) => event.stopPropagation()}
        >
          <h2>Informacion</h2>
          {renderInfoTabs()}
          {renderInfoSection()}

          {infoOrigin === 'home' ? (
            <button
              type="button"
              className="secondary-button secondary-button-danger info-modal-close-button"
              onClick={() => setShowInfoModal(false)}
            >
              Cerrar
            </button>
          ) : null}

          {infoOrigin === 'profile-menu' ? (
            <button
              type="button"
              className="secondary-button secondary-button-back"
              onClick={() => {
                setShowInfoModal(false)
                setShowProfileMenuModal(true)
              }}
            >
              Atras
            </button>
          ) : null}
        </section>
      </div>
    )
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
                Contraseña
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
                  setInfoOrigin('home')
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

        {renderSharedInfoModal()}
      </main>
    )
  }

  return (
    <main className="page">
      <div className="feed-shell">
        <header className="feed-topbar">
          <div className="feed-brandbar">
            <button
              type="button"
              className="profile-corner-button"
              title="Abrir perfil"
              onClick={() => setShowProfileMenuModal(true)}
            >
              <span className="profile-trigger-ring profile-corner-ring">
                {profileImageUrl ? (
                  <img src={profileImageUrl} alt="Foto de perfil" className="profile-trigger-image" />
                ) : (
                  renderProfileFallbackIcon()
                )}
              </span>
            </button>

            <div className="feed-brand">
              <img src="/escudo.webp" alt="Escudo Guijo" className="feed-brand-shield" />
              <div className="feed-title">
                <h1>Guijo Social</h1>
                <p>{session?.profile.anonymousNumber ?? 'ANONYM'}</p>
              </div>
            </div>
          </div>
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
        className="compose-dock-button"
        title="Publicar"
        aria-label="Publicar"
        onClick={() => {
          setComposerError('')
          setShowComposerModal(true)
        }}
      >
        <span className="compose-dock-icon" aria-hidden="true">+</span>
      </button>

      {showComposerModal ? (
        <div className="info-modal-backdrop" role="presentation" onClick={() => setShowComposerModal(false)}>
          <section
            className="info-modal compose-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Nueva publicacion"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Nueva publicacion</h2>
            <p className="modal-copy">Escribe un texto corto para compartirlo en Guijo Social.</p>
            <form className="compose-form" onSubmit={handleCreatePost}>
              <label>
                Tu texto
                <textarea
                  value={composerText}
                  onChange={(event) => setComposerText(event.target.value)}
                  placeholder="Que quieres publicar?"
                  maxLength={280}
                />
              </label>
              <p className="composer-count">{composerText.trim().length}/280</p>
              {composerError ? <p className="error">{composerError}</p> : null}
              <button type="submit" className="primary" disabled={isPublishing}>
                {isPublishing ? 'Publicando...' : 'Publicar'}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {showProfileMenuModal ? (
        <div className="info-modal-backdrop" role="presentation" onClick={() => setShowProfileMenuModal(false)}>
          <section
            className="info-modal profile-menu-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de perfil"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Perfil</h2>
            <div className="profile-modal-card">
              <div className="profile-avatar">
                {profileImageUrl ? (
                  <img src={profileImageUrl} alt="Foto de perfil" className="profile-avatar-image" />
                ) : (
                  renderProfileFallbackIcon()
                )}
              </div>
              <div className="profile-modal-copy">
                <strong>{session?.profile.anonymousNumber ?? 'ANONYM'}</strong>
                <p>Accesos rapidos de tu cuenta.</p>
              </div>
            </div>

            <div className="profile-menu-grid">
              <button
                type="button"
                className="profile-menu-button profile-menu-button-profile"
                onClick={() => {
                  setShowProfileMenuModal(false)
                  setShowProfileModal(true)
                }}
              >
                <span className="profile-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
                  </svg>
                </span>
                <span>
                  <strong>Perfil</strong>
                  <small>Foto y vista de cuenta</small>
                </span>
              </button>

              <button
                type="button"
                className="profile-menu-button profile-menu-button-settings"
                onClick={() => {
                  setShowProfileMenuModal(false)
                  setShowSettingsModal(true)
                }}
              >
                <span className="profile-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.3 7.3 0 0 0-1.8-1l-.3-2.6h-4l-.3 2.6a7.3 7.3 0 0 0-1.8 1l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.3 7.3 0 0 0 1.8 1l.3 2.6h4l.3-2.6a7.3 7.3 0 0 0 1.8-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1z" />
                  </svg>
                </span>
                <span>
                  <strong>Configuracion</strong>
                  <small>Sesion y controles</small>
                </span>
              </button>

              <button
                type="button"
                className="profile-menu-button profile-menu-button-info"
                onClick={() => {
                  setInfoOrigin('profile-menu')
                  setInfoSection('privacy')
                  setShowProfileMenuModal(false)
                  setShowInfoModal(true)
                }}
              >
                <span className="profile-menu-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 10v6" />
                    <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span>
                  <strong>Informacion</strong>
                  <small>Politicas y privacidad</small>
                </span>
              </button>
            </div>

            <button
              type="button"
              className="secondary-button secondary-button-danger profile-menu-close-button"
              onClick={() => setShowProfileMenuModal(false)}
            >
              Cerrar
            </button>

          </section>
        </div>
      ) : null}

      {showProfileModal ? (
        <div className="info-modal-backdrop" role="presentation" onClick={() => setShowProfileModal(false)}>
          <section
            className="info-modal profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Perfil"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Perfil</h2>
            <div className="profile-modal-card">
              <div className="profile-avatar">
                {profileImageUrl ? (
                  <img src={profileImageUrl} alt="Foto de perfil" className="profile-avatar-image" />
                ) : (
                  renderProfileFallbackIcon()
                )}
              </div>
              <div className="profile-modal-copy">
                <strong>{session?.profile.anonymousNumber ?? 'ANONYM'}</strong>
                <p>Tu identidad visual dentro de Guijo Social.</p>
              </div>
            </div>

            <label className="profile-upload">
              <span>Foto de perfil</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => handleProfileImageChange(event.target.files?.[0])}
              />
            </label>

            <div className="profile-modal-actions">
              <button type="button" className="secondary-button secondary-button-danger" onClick={clearProfileImage}>
                Borrar foto
              </button>
              <button
                type="button"
                className="secondary-button secondary-button-back"
                onClick={() => {
                  setShowProfileModal(false)
                  setShowProfileMenuModal(true)
                }}
              >
                Atras
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showSettingsModal ? (
        <div className="info-modal-backdrop" role="presentation" onClick={() => setShowSettingsModal(false)}>
          <section
            className="info-modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Configuracion"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Configuracion</h2>
            <div className="settings-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowSettingsModal(false)
                  setShowStylesModal(true)
                }}
              >
                Estilos de tweguijo
              </button>
              <button type="button" className="primary primary-danger" onClick={handleLogout}>
                Cerrar sesion
              </button>
              <button
                type="button"
                className="secondary-button secondary-button-back"
                onClick={() => {
                  setShowSettingsModal(false)
                  setShowProfileMenuModal(true)
                }}
              >
                Atras
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showStylesModal ? (
        <div className="info-modal-backdrop" role="presentation" onClick={() => setShowStylesModal(false)}>
          <section
            className="info-modal settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Estilos"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Estilos</h2>
            <p className="modal-copy">Estilos de tweguijo (proximamente).</p>
            <div className="settings-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setShowStylesModal(false)
                  setShowSettingsModal(true)
                }}
              >
                Atras
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {renderSharedInfoModal()}
    </main>
  )
}

export default App
