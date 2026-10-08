import { animate } from 'animejs'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getTrendingPosters, loginUser } from '../../services/api'
import styles from './Landing.module.css'

type AuthMode = 'login' | 'register'
type FormErrors = Partial<Record<'email' | 'password' | 'name', string>>

export function LandingPage() {
  const [posters, setPosters] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [formValues, setFormValues] = useState({
    email: '',
    password: '',
    name: '',
  })
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const floatingCardRef = useRef<HTMLDivElement | null>(null)
  const modalOverlayRef = useRef<HTMLDivElement | null>(null)
  const modalCardRef = useRef<HTMLDivElement | null>(null)
  const modalFormRef = useRef<HTMLFormElement | null>(null)
  const submitButtonRef = useRef<HTMLButtonElement | null>(null)
  const posterWallRef = useRef<HTMLDivElement | null>(null)
  const modeSwitchRef = useRef<{ height: number; direction: number } | null>(null)
  const isModeSwitchingRef = useRef(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    const floatingCard = floatingCardRef.current

    if (!floatingCard) {
      return
    }

    animate(floatingCard, {
      opacity: [0, 1],
      scale: [0.7, 1],
      translateY: [-350, 0],
      filter: ['blur(8px)', 'blur(0px)'],
      duration: 350,
      easing: 'easeOutCubic',
    })
  }, [])

  useEffect(() => {
    if (loading || !posterWallRef.current) {
      return
    }

    const posterCards = posterWallRef.current.querySelectorAll(`.${styles.posterCard}`)

    if (!posterCards.length) {
      return
    }

    const columns = getComputedStyle(posterWallRef.current).gridTemplateColumns.split(' ').length

    animate(posterCards, {
      opacity: [0, 1],
      translateY: [24, 0],
      scale: [0.98, 1],
      duration: 700,
      delay: (_element, index) => Math.floor((index ?? 0) / columns) * 18,
      easing: 'easeOutCubic',
    })
  }, [loading])

  useEffect(() => {
    const modalOverlay = modalOverlayRef.current
    const modalCard = modalCardRef.current
    const floatingCard = floatingCardRef.current

    if (!modalOverlay || !modalCard || !isAuthOpen || isClosing) {
      return
    }

    if (floatingCard) {
      animate(floatingCard, {
        opacity: [1, 0],
        translateY: [0, 12],
        duration: 180,
        easing: 'easeInCubic',
      })
    }

    animate(modalOverlay, {
      opacity: [0, 1],
      duration: 260,
      easing: 'easeOutCubic',
    })

    animate(modalCard, {
      opacity: [0, 1],
      translateY: [24, 0],
      scale: [0.94, 1],
      duration: 450,
      easing: 'easeOutCubic',
    })
  }, [isAuthOpen, isClosing])

  const switchAuthMode = (nextMode: AuthMode) => {
    if (nextMode === authMode || isModeSwitchingRef.current) {
      return
    }

    setAuthError(null)
    setFormErrors({})
    setShowPassword(false)

    const modalCard = modalCardRef.current
    const modalForm = modalFormRef.current

    if (!modalCard || !modalForm) {
      setAuthMode(nextMode)
      return
    }

    isModeSwitchingRef.current = true
    const direction = nextMode === 'register' ? 1 : -1
    const height = modalCard.getBoundingClientRect().height

    modalCard.style.height = `${height}px`
    modeSwitchRef.current = { height, direction }

    animate(modalForm, {
      opacity: [1, 0],
      translateX: [0, direction * 14],
      duration: 120,
      easing: 'easeInCubic',
      complete: () => setAuthMode(nextMode),
    })
  }

  useLayoutEffect(() => {
    const pendingSwitch = modeSwitchRef.current

    if (!pendingSwitch) {
      return
    }

    modeSwitchRef.current = null

    const modalCard = modalCardRef.current
    const modalForm = modalFormRef.current

    if (!modalCard || !modalForm) {
      isModeSwitchingRef.current = false
      return
    }

    modalCard.style.height = 'auto'
    const nextHeight = modalCard.getBoundingClientRect().height
    modalCard.style.height = `${pendingSwitch.height}px`

    animate(modalCard, {
      height: [pendingSwitch.height, nextHeight],
      duration: 260,
      easing: 'easeInOutCubic',
      complete: () => {
        modalCard.style.height = 'auto'
      },
    })

    animate(modalForm, {
      opacity: [0, 1],
      translateX: [-pendingSwitch.direction * 14, 0],
      duration: 650,
      easing: 'easeOutCubic',
      complete: () => {
        isModeSwitchingRef.current = false
      },
    })
  }, [authMode])

  useEffect(() => {
    if (!authError || !submitButtonRef.current) {
      return
    }

    if (modalCardRef.current) {
      modalCardRef.current.style.height = 'auto'
    }

    submitButtonRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [authError])

  const closeModal = () => {
    if (!isAuthOpen || isClosing || isModeSwitchingRef.current) {
      return
    }

    const modalOverlay = modalOverlayRef.current
    const modalCard = modalCardRef.current
    const floatingCard = floatingCardRef.current

    setIsClosing(true)

    if (floatingCard) {
      animate(floatingCard, {
        opacity: [0, 1],
        translateY: [12, 0],
        scale: [0.96, 1],
        duration: 220,
        easing: 'easeOutCubic',
      })
    }

    if (!modalOverlay && !modalCard) {
      setIsAuthOpen(false)
      setIsClosing(false)
      return
    }

    let remainingAnimations = 0

    const finishClose = () => {
      remainingAnimations -= 1

      if (remainingAnimations <= 0) {
        resetAuthState()
        setIsAuthOpen(false)
        setIsClosing(false)
      }
    }

    if (modalOverlay) {
      remainingAnimations += 1
      animate(modalOverlay, {
        opacity: [1, 0],
        duration: 220,
        easing: 'easeInCubic',
        complete: finishClose,
      })
    }

    if (modalCard) {
      remainingAnimations += 1
      animate(modalCard, {
        opacity: [1, 0],
        translateY: [0, 22],
        scale: [1, 0.96],
        duration: 220,
        easing: 'easeInCubic',
        complete: finishClose,
      })
    }
  }

  useEffect(() => {
    let isMounted = true

    const loadPosters = async () => {
      try {
        const data = await getTrendingPosters(60)

        if (!isMounted) {
          return
        }

        setPosters(data)
        setError(null)
      } catch (err) {
        console.error('Error fetching trending posters:', err)

        if (isMounted) {
          setError('No se pudieron cargar los posters del backend.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadPosters()

    return () => {
      isMounted = false
    }
  }, [])

  const resetAuthState = () => {
    setAuthMode('login')
    setAuthError(null)
    setFormErrors({})
    setFormValues({ email: '', password: '', name: '' })
    setShowPassword(false)
    setIsSubmitting(false)
  }

  const validateForm = () => {
    const nextErrors: FormErrors = {}

    if (!formValues.email.trim()) {
      nextErrors.email = 'El email es requerido.'
    } else if (!/\S+@\S+\.\S+/.test(formValues.email)) {
      nextErrors.email = 'Formato de email inválido.'
    }

    if (!formValues.password) {
      nextErrors.password = 'La contraseña es requerida.'
    } else if (formValues.password.length < 8) {
      nextErrors.password = 'Debe tener al menos 8 caracteres.'
    }

    if (authMode === 'register' && !formValues.name.trim()) {
      nextErrors.name = 'El nombre es obligatorio.'
    }

    setFormErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleChange = (field: keyof typeof formValues, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }))
    setFormErrors((current) => ({ ...current, [field]: undefined }))
    setAuthError(null)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validateForm()) {
      return
    }

    setAuthError(null)

    if (authMode === 'login') {
      setIsSubmitting(true)
      try {
        const response = await loginUser(formValues.email, formValues.password)
        console.log('Login response:', response)
        // TODO (Hito 3): guardar response.token y redirigir a /watchlist
      } catch {
        setAuthError('Credenciales inválidas.')
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    console.log('Registro listo para enviar (modo):', authMode)
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div ref={posterWallRef} className={styles.posterWall} aria-label="Trending posters">
          {loading && Array.from({ length: 12 }).map((_, index) => (
            <div key={`skeleton-${index}`} className={styles.posterCard} />
          ))}

          {!loading && posters.map((poster, index) => (
            <div key={`${poster}-${index}`} className={styles.posterCard}>
              <img src={poster} alt="Poster en tendencia" className={styles.posterImage} loading="lazy" />
            </div>
          ))}
        </div>

        <div
          ref={floatingCardRef}
          className={`${styles.floatingCard} ${isAuthOpen ? styles.floatingCardHidden : ''}`}
        >
          <h2>WatchList</h2>
          <p className={styles.floatingText}>
            Guarda las películas y series que quieres ver, y lleva el registro de lo que ya viste.
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              setAuthMode('login')
              setIsAuthOpen(true)
            }}
          >
            Acceder
          </button>
        </div>
      </section>

      {isAuthOpen && (
        <div ref={modalOverlayRef} className={styles.modalOverlay} onClick={closeModal}>
          <div ref={modalCardRef} className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={styles.closeButton}
              onClick={closeModal}
              aria-label="Cerrar modal"
            >
              ×
            </button>

            <div className={styles.modalHeader}>
              <button
                type="button"
                className={authMode === 'login' ? styles.tabButtonActive : styles.tabButton}
                onClick={() => switchAuthMode('login')}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                className={authMode === 'register' ? styles.tabButtonActive : styles.tabButton}
                onClick={() => switchAuthMode('register')}
              >
                Registrarse
              </button>
            </div>

            <form ref={modalFormRef} className={styles.form} onSubmit={handleSubmit} noValidate>
              {authMode === 'register' && (
                <div className={styles.fieldGroup}>
                  <label htmlFor="name">Nombre</label>
                  <input
                    id="name"
                    type="text"
                    value={formValues.name}
                    onChange={(event) => handleChange('name', event.target.value)}
                    placeholder="Nombre"
                    className={formErrors.name ? styles.inputError : ''}
                  />
                  {formErrors.name && <span className={styles.inlineError}>{formErrors.name}</span>}
                </div>
              )}

              <div className={styles.fieldGroup}>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={formValues.email}
                  onChange={(event) => handleChange('email', event.target.value)}
                  placeholder="Email"
                  className={formErrors.email ? styles.inputError : ''}
                />
                {formErrors.email && <span className={styles.inlineError}>{formErrors.email}</span>}
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="password">Password</label>
                <div className={styles.passwordField}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formValues.password}
                    onChange={(event) => handleChange('password', event.target.value)}
                    placeholder="Password"
                    className={formErrors.password ? styles.inputError : ''}
                  />
                  <button
                    type="button"
                    className={styles.togglePassword}
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.6A2 2 0 0 0 13.4 13.4" />
                        <path d="M9.1 5.5A11.8 11.8 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-4.2 5.2" />
                        <path d="M6.2 6.2A18.2 18.2 0 0 0 2 12s3.5 7 10 7a11.9 11.9 0 0 0 5.8-1.7" />
                      </svg>
                    )}
                  </button>
                </div>
                {formErrors.password && <span className={styles.inlineError}>{formErrors.password}</span>}
              </div>
              
              {authError && <p className={styles.formError}>{authError}</p>}
              
              <button
                ref={submitButtonRef}
                type="submit"
                className={styles.submitButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Ingresando...' : authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              </button>
            </form>
          </div>
        </div>
      )}

      {error && <div className={styles.errorBanner}>{error}</div>}
    </main>
  )
}
