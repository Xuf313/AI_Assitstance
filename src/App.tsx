import { CSSProperties, ReactNode, RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

type NotchState = 'idle' | 'summoned' | 'thinking' | 'file' | 'briefing' | 'error' | 'retracting'
type OrbVariant = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'
type Wallpaper = 'dark' | 'light'
type Query = 'file' | 'briefing'
type MenuAction = 'summon' | 'briefing' | 'settings' | 'quit'
type GlyphStatus = 'running' | 'offline' | 'off'
type Frame = { w: number; h: number; r: number; glow: number }
type Spring = { stiffness: number; damping: number; mass: number }
type IconName =
  | 'mic'
  | 'briefing'
  | 'settings'
  | 'power'
  | 'check'
  | 'play'
  | 'pause'
  | 'document'
  | 'folder'
  | 'retry'
  | 'volume'
  | 'alert'

const SCREEN = { w: 1512, h: 982 }
const DURATION_MS = 300
const SPRING_IN: Spring = { stiffness: 420, damping: 26, mass: 1 }
const SPRING_OUT: Spring = { stiffness: 300, damping: 30, mass: 1 }

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const lerp = (from: number, to: number, x: number) => from + (to - from) * x

/** Closed-form damped spring shared by the CSS easing, transition frames, and curve plot. */
function springAt(seconds: number, { stiffness, damping, mass }: Spring) {
  const omega = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  if (zeta >= 1) return 1 - Math.exp(-omega * seconds) * (1 + omega * seconds)
  const damped = omega * Math.sqrt(1 - zeta * zeta)
  return (
    1 -
    Math.exp(-zeta * omega * seconds) *
      (Math.cos(damped * seconds) + ((zeta * omega) / damped) * Math.sin(damped * seconds))
  )
}

const springLinear = (spring: Spring) =>
  `linear(${Array.from({ length: 41 }, (_, i) => (i === 40 ? 1 : springAt(((i / 40) * DURATION_MS) / 1000, spring)).toFixed(4)).join(', ')})`

const NOTCH: Frame = { w: 196, h: 36, r: 12, glow: 0 }
const PILL: Frame = { w: 420, h: 80, r: 30, glow: 1 }
const frameBetween = (from: Frame, to: Frame, x: number, glow: number): Frame => ({
  w: Math.max(NOTCH.w, lerp(from.w, to.w, x)),
  h: Math.max(NOTCH.h, lerp(from.h, to.h, x)),
  r: Math.max(NOTCH.r, lerp(from.r, to.r, x)),
  glow: clamp(glow),
})

const RETRACT_FINAL_MS = 220
const FRAMES: Record<NotchState, Frame> = {
  idle: NOTCH,
  summoned: PILL,
  thinking: PILL,
  error: PILL,
  file: { w: 420, h: 220, r: 32, glow: 1 },
  briefing: { w: 520, h: 360, r: 34, glow: 1 },
  retracting: frameBetween(PILL, NOTCH, springAt(RETRACT_FINAL_MS / 1000, SPRING_OUT), 1 - RETRACT_FINAL_MS / DURATION_MS),
}

const EXPAND_FRAMES = [0, 75, 150, 225, 300].map((ms) => {
  const x = ms === DURATION_MS ? 1 : springAt(ms / 1000, SPRING_IN)
  return { ms, frame: frameBetween(NOTCH, PILL, x, x), content: clamp((ms - 90) / 160) }
})

const RETRACT_FRAMES = [0, 80, 160, RETRACT_FINAL_MS, 300].map((ms) => {
  const x = ms === DURATION_MS ? 1 : springAt(ms / 1000, SPRING_OUT)
  return { ms, frame: frameBetween(PILL, NOTCH, x, 1 - ms / DURATION_MS), content: clamp(1 - ms / 80) }
})

const SUPPORTS_LINEAR_EASING = typeof CSS !== 'undefined' && CSS.supports('transition-timing-function', 'linear(0, 1)')
const MOTION_VARS = (
  SUPPORTS_LINEAR_EASING ? { '--spring-in': springLinear(SPRING_IN), '--spring-out': springLinear(SPRING_OUT) } : {}
) as CSSProperties

const STATE_META: Record<NotchState, { label: string; meta: string }> = {
  idle: { label: 'Idle', meta: 'Notch only · running ring' },
  summoned: { label: 'Summoned', meta: '420 × 80 · listening' },
  thinking: { label: 'Thinking', meta: '420 × 80 · processing' },
  file: { label: 'File result', meta: '420 × 220 · best match' },
  briefing: { label: 'Briefing', meta: '520 × 360 · audio briefing' },
  error: { label: 'Offline', meta: '420 × 80 · amber alert' },
  retracting: {
    label: 'Retract',
    meta: `${Math.round(FRAMES.retracting.w)} × ${Math.round(FRAMES.retracting.h)} · final shrink frame`,
  },
}
const STATE_ORDER: NotchState[] = ['idle', 'summoned', 'thinking', 'file', 'briefing', 'error', 'retracting']

const QUERIES: Record<Query, { said: string; process: string }> = {
  file: { said: 'Open my OS lecture notes', process: 'Searching 48,219 local files' },
  briefing: { said: 'Brief me on this morning', process: 'Curating 5 stories from WIRED' },
}

const FILE_RESULTS: { icon: IconName; name: string; path: string; meta: string; best?: boolean }[] = [
  { icon: 'document', name: 'OS_Lecture_Notes.pdf', path: '~/Documents/University/CS301', meta: '98% MATCH', best: true },
  { icon: 'document', name: 'OS — Week 8 Scheduling.pdf', path: '~/Library/Mobile Documents', meta: '81%' },
  { icon: 'folder', name: 'OS Lecture Resources', path: '~/Documents/University', meta: '74%' },
]

const HEADLINES = [
  { source: 'AI', title: 'The race to build a truly personal AI is heating up' },
  { source: 'SECURITY', title: 'Passkeys are about to get a lot more portable' },
  { source: 'GEAR', title: 'The best laptops for running local AI models' },
  { source: 'SCIENCE', title: 'A new map of the brain reveals hidden wiring' },
  { source: 'BUSINESS', title: 'Chipmakers bet big on on-device intelligence' },
]

const STATE_CARDS: { state: NotchState; wallpaper: Wallpaper; title: string; meta: string }[] = [
  ...STATE_ORDER.map((state) => ({ state, wallpaper: 'dark' as Wallpaper, title: STATE_META[state].label, meta: STATE_META[state].meta })),
  { state: 'summoned', wallpaper: 'light', title: 'Summoned · Light', meta: '420 × 80 · light wallpaper' },
]

const ORB_VARIANTS: { id: OrbVariant; label: string; spec: string }[] = [
  { id: 'idle', label: 'Idle', spec: '12 s orbit · 3 s breath' },
  { id: 'listening', label: 'Listening', spec: '3.6 s orbit · voice ripple' },
  { id: 'thinking', label: 'Thinking', spec: '1 s orbit · core flicker' },
  { id: 'speaking', label: 'Speaking', spec: '420 ms cadence pulse' },
  { id: 'error', label: 'Error', spec: 'Amber · slowed orbit' },
]

function Icon({ name, size = 16, stroke = 1.5 }: { name: IconName; size?: number; stroke?: number }) {
  const paths: Record<IconName, ReactNode> = {
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
    briefing: <><path d="M4 5h13v14H6a2 2 0 0 1-2-2z" /><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5M8 16h3" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7.5" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    power: <><path d="M12 3v8" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></>,
    check: <path d="m5 12.5 4.2 4L19 7" />,
    play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />,
    pause: <path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" />,
    document: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></>,
    folder: <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />,
    retry: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
    volume: <><path d="M4 9h3l5-4v14l-5-4H4z" /><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>,
    alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 9.5v4.5M12 17h.01" /></>,
  }
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  )
}

function Orb({ variant = 'idle', size = 42 }: { variant?: OrbVariant; size?: number }) {
  const voice = variant === 'listening' || variant === 'speaking'
  return (
    <span className={`orb orb-${variant}`} style={{ '--orb': `${size}px` } as CSSProperties} role="img" aria-label={`Assistant orb, ${variant}`}>
      <i className="orb-glow" />
      {voice && <><i className="orb-ripple" /><i className="orb-ripple delay" /></>}
      <i className="orb-r1" />
      <i className="orb-r2" />
      <i className="orb-r3" />
      <i className="orb-core" />
    </span>
  )
}

function Waveform({ bars = 22 }: { bars?: number }) {
  return (
    <span className="waveform" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        const envelope = Math.sin((Math.PI * (i + 0.5)) / bars)
        const peak = 0.22 + envelope * (0.42 + ((i * 37) % 34) / 100)
        return <i key={i} style={{ '--peak': peak.toFixed(2), '--delay': `${-((i * 97) % 700)}ms`, '--speed': `${520 + ((i * 53) % 320)}ms` } as CSSProperties} />
      })}
    </span>
  )
}

const Ellipsis = () => <span className="ellipsis" aria-hidden="true"><i /><i /><i /></span>
const IslandTags = ({ left, right }: { left: string; right: string }) => (
  <><span className="island-tag left">{left}</span><span className="island-tag right">{right}</span></>
)
const HudTicks = () => (
  <span className="hud-ticks" aria-hidden="true">
    <i className="tick-bl" />
    <i className="tick-br" />
    <span className="tick-ruler">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</span>
  </span>
)

function SummonedContent({ query }: { query: Query }) {
  const text = `“${QUERIES[query].said}”`
  return (
    <>
      <IslandTags left="Voice link · ⌥ Space" right="Local · 7B" />
      <div className="pill-row">
        <Orb variant="listening" size={42} />
        <div className="pill-copy">
          <span className="pill-label">Listening<Ellipsis /></span>
          <p className="pill-transcript"><span className="typed" style={{ '--chars': String(text.length) } as CSSProperties}>{text}</span><i className="caret" /></p>
        </div>
        <Waveform />
      </div>
      <HudTicks />
    </>
  )
}

function ThinkingContent({ query }: { query: Query }) {
  return (
    <>
      <IslandTags left="Reasoning · on-device" right="T+0.42 s" />
      <div className="pill-row">
        <Orb variant="thinking" size={42} />
        <div className="pill-copy">
          <span className="pill-label">Processing<Ellipsis /></span>
          <p className="pill-transcript muted">{QUERIES[query].process}</p>
        </div>
        <span className="scan-loader" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ '--i': String(i) } as CSSProperties} />)}</span>
      </div>
      <HudTicks />
    </>
  )
}

function ErrorContent({ onRetry }: { onRetry?: () => void }) {
  return (
    <>
      <IslandTags left="System alert" right="Code 503" />
      <div className="pill-row">
        <Orb variant="error" size={42} />
        <div className="pill-copy">
          <span className="pill-label amber"><Icon name="alert" size={11} />Model offline</span>
          <p className="pill-transcript">Can’t reach Ollama · retrying in 5s</p>
        </div>
        <button className="island-btn" onClick={onRetry}><Icon name="retry" size={12} />Retry</button>
      </div>
      <HudTicks />
    </>
  )
}

function FileContent() {
  return (
    <>
      <IslandTags left="File search · local index" right="03 results" />
      <div className="file-query">
        <Orb variant="speaking" size={28} />
        <div><small>You said</small><p>“Open my OS lecture notes”</p></div>
        <span>0.18 s</span>
      </div>
      <div className="nf-list">
        {FILE_RESULTS.map((file) => (
          <div className={`nf-row ${file.best ? 'best' : ''}`} key={file.name}>
            <span className="nf-icon"><Icon name={file.icon} size={14} /></span>
            <span className="nf-name"><b>{file.name}</b><small>{file.path}</small></span>
            <span className="nf-meta">{file.meta}</span>
          </div>
        ))}
      </div>
      <div className="nf-confirm">
        <span className="nf-check"><Icon name="check" size={10} stroke={2.4} /></span>
        <b>Opened</b>
        <span>in Preview · 48 pages</span>
        <kbd>esc</kbd>
      </div>
    </>
  )
}

function BriefingContent() {
  const [playing, setPlaying] = useState(true)
  const transcript = (
    <p>
      …models that once needed a data center now run quietly on a laptop. <mark>Next, security. Passkeys are about to get a lot more portable — a new standard lets you move them between password managers without starting over.</mark> That means fewer resets when you switch devices.
    </p>
  )
  return (
    <div className={`briefing ${playing ? 'playing' : 'paused'}`}>
      <IslandTags left="Daily intel · 08:45" right="Audio · 1.0×" />
      <div className="bf-head">
        <Orb variant={playing ? 'speaking' : 'idle'} size={34} />
        <div><b>WIRED BRIEFING</b><small>{playing ? 'Playing' : 'Paused'} · Thu 22 May · 5 stories</small></div>
        <button className="bf-play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause briefing' : 'Play briefing'}>
          <Icon name={playing ? 'pause' : 'play'} size={13} />
        </button>
      </div>
      <div className="bf-progress"><time>02:18</time><span className="bf-track"><i /></span><time>06:42</time></div>
      <ol className="bf-list">
        {HEADLINES.map((item, index) => (
          <li className={index === 1 ? 'active' : ''} key={item.title}>
            <span className="bf-index">0{index + 1}</span>
            <span className="bf-title">{item.title}</span>
            <span className="bf-source">{item.source}</span>
          </li>
        ))}
      </ol>
      <div className="bf-transcript">
        <span className="bf-transcript-label"><Icon name="volume" size={11} />Spoken transcript<i />Live</span>
        <div className="bf-transcript-window"><div className="bf-transcript-track">{transcript}{transcript}</div></div>
      </div>
    </div>
  )
}

function IslandContent({ state, query, onRetry }: { state: NotchState; query: Query; onRetry?: () => void }) {
  if (state === 'summoned') return <SummonedContent query={query} />
  if (state === 'thinking') return <ThinkingContent query={query} />
  if (state === 'file') return <FileContent />
  if (state === 'briefing') return <BriefingContent />
  if (state === 'error') return <ErrorContent onRetry={onRetry} />
  return null
}

function Island({
  state,
  query,
  frame,
  content = 1,
  still = false,
  interactive = false,
  onSummon,
  onRetry,
}: {
  state: NotchState
  query: Query
  frame?: Frame
  content?: number
  still?: boolean
  interactive?: boolean
  onSummon?: () => void
  onRetry?: () => void
}) {
  const lastExpanded = useRef<NotchState>('summoned')
  if (state !== 'idle' && state !== 'retracting') lastExpanded.current = state
  const f = frame ?? FRAMES[state]
  const collapsed = state === 'idle' || state === 'retracting'
  const showContent = !collapsed && content > 0
  const showLeaving = state === 'retracting' && !still
  const style = { '--w': `${f.w}px`, '--h': `${f.h}px`, '--r': `${f.r}px`, '--glow': String(f.glow), '--content': String(content) } as CSSProperties

  return (
    <div className={`notch-system ${state === 'error' ? 'is-error' : ''} ${collapsed ? 'is-collapsing' : ''} ${still ? 'still' : ''}`} style={style}>
      <div className="island-glow" />
      <div className="island" onClick={(event) => event.stopPropagation()}>
        <i className="shoulder left" />
        <i className="shoulder right" />
        <div className="island-clip">
          <i className="camera" />
          {showContent && <div className="island-content" key={`${state}-${query}`}><IslandContent state={state} query={query} onRetry={onRetry} /></div>}
          {showLeaving && <div className="island-content leaving" key="leaving"><IslandContent state={lastExpanded.current} query={query} /></div>}
        </div>
        <i className="island-edge" />
        {interactive && state === 'idle' && <button className="notch-hit" onClick={onSummon} aria-label="Summon JARVIS" />}
      </div>
    </div>
  )
}

function AppleLogo() {
  return (
    <svg width="14" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516s1.52.087 2.475-1.258.762-2.391.728-2.43m3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422s1.675-2.789 1.698-2.854-.597-.79-1.254-1.157a3.7 3.7 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56s.625 1.924 1.273 2.796c.576.984 1.34 1.667 1.659 1.899s1.219.386 1.843.067c.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758q.52-1.185.473-1.282" />
    </svg>
  )
}

function JarvisGlyph({ status = 'running', size = 16 }: { status?: GlyphStatus; size?: number }) {
  return (
    <svg className={`jarvis-glyph ${status}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3.1 1.5" />
      <circle cx="8" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle className="glyph-core" cx="8" cy="8" r="1.45" />
    </svg>
  )
}

function MenuDropdown({ running, onAction }: { running: boolean; onAction?: (action: MenuAction) => void }) {
  const items: ({ id: MenuAction; icon: IconName; label: string; keys: string } | 'separator')[] = [
    { id: 'summon', icon: 'mic', label: 'Summon', keys: '⌥ Space' },
    { id: 'briefing', icon: 'briefing', label: 'Briefing now', keys: '⌥ B' },
    'separator',
    { id: 'settings', icon: 'settings', label: 'Settings…', keys: '⌘ ,' },
    { id: 'quit', icon: 'power', label: 'Quit JARVIS', keys: '⌘ Q' },
  ]
  return (
    <div className="mb-menu" role="menu" aria-label="JARVIS">
      <div className="mb-menu-head">
        <Orb variant={running ? 'idle' : 'error'} size={24} />
        <div><b>JARVIS</b><span>{running ? 'Online · local model' : 'Not running'}</span></div>
        <em>v3.0</em>
      </div>
      <div className="mb-sep" />
      {items.map((item, index) =>
        item === 'separator' ? <div className="mb-sep" key={`sep-${index}`} /> : (
          <button className="mb-item" role="menuitem" key={item.id} onClick={() => onAction?.(item.id)}>
            <Icon name={item.icon} size={14} />
            <span>{item.label}</span>
            <kbd>{item.keys}</kbd>
          </button>
        ),
      )}
    </div>
  )
}

function MenuBar({ running, menuOpen, onMenuToggle, onMenuAction }: { running: boolean; menuOpen: boolean; onMenuToggle?: () => void; onMenuAction?: (action: MenuAction) => void }) {
  return (
    <div className="menubar" onClick={(event) => event.stopPropagation()}>
      <div className="mb-left">
        <AppleLogo />
        <b>Finder</b>
        {['File', 'Edit', 'View', 'Go', 'Window', 'Help'].map((item) => <span key={item}>{item}</span>)}
      </div>
      <div className="mb-right">
        <div className="mb-jarvis-wrap">
          <button className={`mb-jarvis ${menuOpen ? 'open' : ''}`} onClick={onMenuToggle} aria-label="JARVIS menu" aria-expanded={menuOpen}>
            <JarvisGlyph status={running ? 'running' : 'off'} />
          </button>
          {menuOpen && <MenuDropdown running={running} onAction={onMenuAction} />}
        </div>
        <svg width="17" height="13" viewBox="0 0 17 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M1.5 4.6a10 10 0 0 1 14 0M4 7.3a6.3 6.3 0 0 1 9 0M6.5 10a2.6 2.6 0 0 1 4 0" /></svg>
        <span className="battery" aria-hidden="true"><i /></span>
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="6.2" cy="6.2" r="4.7" /><path d="m9.8 9.8 3.7 3.7" /></svg>
        <svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="1" y="1" width="14" height="5" rx="2.5" /><rect x="1" y="8" width="14" height="5" rx="2.5" /><circle cx="12.5" cy="3.5" r="1.2" fill="currentColor" /><circle cx="3.5" cy="10.5" r="1.2" fill="currentColor" /></svg>
        <span className="mb-clock">Thu May 22&nbsp;&nbsp;9:41 AM</span>
      </div>
    </div>
  )
}

const WALLPAPERS: Record<Wallpaper, { sky: string[]; bloom: string; waves: [string, string][]; line: string }> = {
  dark: {
    sky: ['#02040a', '#061126', '#0b0a1f'],
    bloom: 'rgba(0, 150, 200, 0.24)',
    waves: [['#0b2342', '#161443'], ['#0b5470', '#34206e'], ['#050914', '#0f1a3b']],
    line: 'rgba(125, 249, 255, 0.24)',
  },
  light: {
    sky: ['#f0f5fc', '#d8e5f7', '#f0e1ec'],
    bloom: 'rgba(255, 255, 255, 0.78)',
    waves: [['#c7dbf5', '#ebd2ea'], ['#9cc0ef', '#c3b0ee'], ['#fbe9de', '#e9d3ee']],
    line: 'rgba(255, 255, 255, 0.82)',
  },
}

function WallpaperArt({ variant }: { variant: Wallpaper }) {
  const id = useId().replace(/:/g, '')
  const palette = WALLPAPERS[variant]
  const waves = [
    'M0 500C280 400 520 690 860 580S1330 410 1512 490V982H0Z',
    'M0 670C320 570 640 810 980 690S1380 590 1512 640V982H0Z',
    'M0 820C360 760 720 920 1080 830S1420 790 1512 810V982H0Z',
  ]
  return (
    <svg className="wallpaper-art" viewBox="0 0 1512 982" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0.35" y2="1">
          {palette.sky.map((color, index) => <stop key={color} offset={index / 2} stopColor={color} />)}
        </linearGradient>
        <radialGradient id={`${id}-bloom`} cx="0.5" cy="0.08" r="0.62">
          <stop offset="0" stopColor={palette.bloom} />
          <stop offset="1" stopColor={palette.bloom} stopOpacity="0" />
        </radialGradient>
        {palette.waves.map(([from, to], index) => (
          <linearGradient key={from} id={`${id}-wave-${index}`} x1="0" y1="0" x2="1" y2="0.45">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        ))}
      </defs>
      <rect width="1512" height="982" fill={`url(#${id}-sky)`} />
      <rect width="1512" height="982" fill={`url(#${id}-bloom)`} />
      {waves.map((path, index) => <path key={path} d={path} fill={`url(#${id}-wave-${index})`} opacity={index === 0 ? 0.9 : 1} />)}
      {waves.map((path) => <path key={`line-${path}`} d={path.split('V')[0]} fill="none" stroke={palette.line} strokeWidth="1.2" />)}
    </svg>
  )
}

function DesktopIcons() {
  return (
    <div className="desktop-icons" aria-hidden="true">
      {['CS301', 'Projects'].map((label) => <span className="desktop-icon" key={label}><i className="folder" />{label}</span>)}
    </div>
  )
}

function Dock() {
  return (
    <div className="dock" aria-hidden="true">
      <span className="dock-app app-finder"><svg viewBox="0 0 52 52"><path d="M18 18v7M34 18v7M15 34c7 5 15 5 22 0" fill="none" stroke="#08243d" strokeWidth="2.5" strokeLinecap="round" /></svg></span>
      <span className="dock-app app-safari"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="17" fill="none" stroke="rgba(255,255,255,.7)" /><path d="m33 19-5 9-9 5 5-9z" fill="#fff" /><path d="m33 19-9 5 4 4z" fill="#ff4a3d" /></svg></span>
      <span className="dock-app app-messages"><svg viewBox="0 0 52 52"><path d="M26 13c-9 0-15 5.5-15 12.5 0 4 2 7.5 5.5 9.8L15 40l6.6-3c1.4.4 2.9.5 4.4.5 9 0 15-5.6 15-12.5S35 13 26 13Z" fill="#fff" /></svg></span>
      <span className="dock-app app-notes"><i /></span>
      <span className="dock-app app-calendar"><small>MAY</small><b>22</b></span>
      <span className="dock-app app-terminal">&gt;_</span>
      <span className="dock-app app-preview"><svg viewBox="0 0 52 52"><rect x="13" y="15" width="26" height="22" rx="3" fill="rgba(255,255,255,.88)" /><path d="m16 33 7-8 5 5 3-3 5 6z" fill="#3c8cf6" /><circle cx="31" cy="21" r="2.5" fill="#ffc94d" /></svg></span>
      <span className="dock-app app-settings"><Icon name="settings" size={30} stroke={1.8} /></span>
      <span className="dock-sep" />
      <span className="dock-app app-trash"><i /></span>
    </div>
  )
}

type DesktopProps = {
  state: NotchState
  wallpaper: Wallpaper
  query?: Query
  frame?: Frame
  content?: number
  still?: boolean
  interactive?: boolean
  running?: boolean
  menuOpen?: boolean
  showIndicator?: boolean
  onSummon?: () => void
  onBackground?: () => void
  onMenuToggle?: () => void
  onMenuAction?: (action: MenuAction) => void
  onRetry?: () => void
}

function Desktop({ state, wallpaper, query = 'file', frame, content, still, interactive = false, running = true, menuOpen = false, showIndicator, onSummon, onBackground, onMenuToggle, onMenuAction, onRetry }: DesktopProps) {
  const indicator = showIndicator ?? state === 'idle'
  return (
    <div className={`desktop wp-${wallpaper}`} onClick={interactive ? onBackground : undefined} inert={!interactive}>
      <WallpaperArt variant={wallpaper} />
      <DesktopIcons />
      <MenuBar running={running} menuOpen={menuOpen} onMenuToggle={onMenuToggle} onMenuAction={onMenuAction} />
      <Island state={state} query={query} frame={frame} content={content} still={still} interactive={interactive} onSummon={onSummon} onRetry={onRetry} />
      {indicator && <span className={`idle-indicator ${running ? '' : 'off'}`} role="img" aria-label={running ? 'JARVIS running in background' : 'JARVIS not running'}><i /></span>}
      <Dock />
    </div>
  )
}

function ScaledFrame({ width, height, className = '', children }: { width: number; height: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const update = () => setScale(node.clientWidth / width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [width])
  return (
    <div ref={ref} className={`scaled-frame ${className}`} style={{ aspectRatio: `${width} / ${height}` }}>
      <div className="scaled-content" style={{ width, height, transform: `scale(${scale})`, visibility: scale ? 'visible' : 'hidden' }}>{children}</div>
    </div>
  )
}

function Crop({ width, height, offsetX = (SCREEN.w - width) / 2, children }: { width: number; height: number; offsetX?: number; children: ReactNode }) {
  return (
    <ScaledFrame width={width} height={height} className="crop">
      <div className="crop-shift" style={{ transform: `translateX(-${offsetX}px)` }}>{children}</div>
    </ScaledFrame>
  )
}

function usePrototype() {
  const [state, setState] = useState<NotchState>('idle')
  const [wallpaper, setWallpaper] = useState<Wallpaper>('dark')
  const [query, setQuery] = useState<Query>('file')
  const [running, setRunning] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const timers = useRef<number[]>([])
  const stateRef = useRef<NotchState>('idle')

  const setNotch = (next: NotchState) => {
    stateRef.current = next
    setState(next)
  }
  const clearTimers = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
  }
  const sequence = (steps: Array<[number, NotchState]>) => {
    clearTimers()
    setMenuOpen(false)
    steps.forEach(([ms, next]) => {
      if (ms === 0) setNotch(next)
      else timers.current.push(window.setTimeout(() => setNotch(next), ms))
    })
  }
  const retract = () => {
    if (stateRef.current === 'idle') {
      clearTimers()
      setMenuOpen(false)
      return
    }
    sequence([[0, 'retracting'], [240, 'idle']])
  }
  const summon = () => {
    setRunning(true)
    setQuery('file')
    sequence([[0, 'summoned'], [1700, 'thinking'], [2900, 'file'], [7600, 'retracting'], [7840, 'idle']])
  }
  const briefing = () => {
    setRunning(true)
    setQuery('briefing')
    sequence([[0, 'summoned'], [1700, 'thinking'], [2900, 'briefing']])
  }
  const retry = () => {
    setRunning(true)
    sequence([[0, 'thinking'], [1300, 'summoned']])
  }
  const select = (next: NotchState) => {
    setRunning(true)
    if (next === 'idle') return retract()
    if (next === 'retracting') {
      if (stateRef.current === 'idle') return sequence([[0, 'summoned'], [520, 'retracting'], [760, 'idle']])
      return retract()
    }
    if (next === 'file' || next === 'briefing') setQuery(next)
    sequence([[0, next]])
  }
  const menuAction = (action: MenuAction) => {
    if (action === 'summon') summon()
    else if (action === 'briefing') briefing()
    else if (action === 'quit') {
      setRunning(false)
      retract()
    } else setMenuOpen(false)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.code === 'Space') {
        event.preventDefault()
        if (stateRef.current === 'idle') summon()
        else retract()
      } else if (event.altKey && event.code === 'KeyB') {
        event.preventDefault()
        briefing()
      } else if (event.key === 'Escape') {
        setMenuOpen(false)
        retract()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  useEffect(() => clearTimers, [])

  return {
    state,
    wallpaper,
    setWallpaper,
    query,
    running,
    menuOpen,
    summon,
    briefing,
    retract,
    retry,
    select,
    menuAction,
    toggleMenu: () => setMenuOpen((open) => !open),
    background: () => (menuOpen ? setMenuOpen(false) : retract()),
    load: (next: NotchState, nextWallpaper: Wallpaper) => {
      setWallpaper(nextWallpaper)
      select(next)
    },
  }
}

type PrototypeController = ReturnType<typeof usePrototype>

function SectionHeading({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <div className="section-heading">
      <span className="section-index">{index}</span>
      <div><h2>{title}</h2><p>{description}</p></div>
      <i className="section-rule" />
    </div>
  )
}

function PrototypeStage({ proto, stageRef }: { proto: PrototypeController; stageRef: RefObject<HTMLElement | null> }) {
  const frame = FRAMES[proto.state]
  return (
    <section className="board-section prototype" ref={stageRef}>
      <SectionHeading index="01" title="Live prototype" description="Click the notch, use the menu-bar glyph, or press ⌥ Space. The overlay springs outward from the notch and retracts when the task is complete." />
      <div className="proto-toolbar">
        <div className="segmented" role="group" aria-label="Overlay state">
          {STATE_ORDER.map((state, index) => (
            <button className={proto.state === state ? 'active' : ''} key={state} onClick={() => proto.select(state)}>
              <span>0{index + 1}</span>{STATE_META[state].label}
            </button>
          ))}
        </div>
        <div className="toolbar-group">
          <div className="segmented" role="group" aria-label="Wallpaper">
            {(['dark', 'light'] as Wallpaper[]).map((wallpaper) => (
              <button className={proto.wallpaper === wallpaper ? 'active' : ''} key={wallpaper} onClick={() => proto.setWallpaper(wallpaper)}>{wallpaper}</button>
            ))}
          </div>
          <button className="tool-btn primary" onClick={proto.summon}><Icon name="mic" size={14} />Run file flow</button>
          <button className="tool-btn" onClick={proto.briefing}><Icon name="briefing" size={14} />Run briefing</button>
        </div>
      </div>
      <div className="device">
        <div className="device-bezel">
          <div className="device-screen">
            <ScaledFrame width={SCREEN.w} height={SCREEN.h}>
              <Desktop
                interactive
                state={proto.state}
                wallpaper={proto.wallpaper}
                query={proto.query}
                running={proto.running}
                menuOpen={proto.menuOpen}
                onSummon={proto.summon}
                onBackground={proto.background}
                onMenuToggle={proto.toggleMenu}
                onMenuAction={proto.menuAction}
                onRetry={proto.retry}
              />
            </ScaledFrame>
          </div>
        </div>
        <div className="device-base" />
      </div>
      <div className="proto-readout">
        <span className={proto.state === 'error' ? 'amber' : ''}><i />State · {STATE_META[proto.state].label}</span>
        <span>{Math.round(frame.w)} × {Math.round(frame.h)} pt</span>
        <span>Spring 420 / 26 · 300 ms</span>
        <span className="keys"><kbd>⌥ Space</kbd>summon <kbd>⌥ B</kbd>briefing <kbd>Esc</kbd>dismiss</span>
      </div>
    </section>
  )
}

function StateGallery({ onLoad }: { onLoad: (state: NotchState, wallpaper: Wallpaper) => void }) {
  return (
    <section className="board-section">
      <SectionHeading index="02" title="State frames" description="Each state is anchored to the hardware notch. Pure black surfaces merge with the camera housing; only the lower edge receives the cyan HUD line." />
      <div className="state-grid">
        {STATE_CARDS.map((card, index) => (
          <article className="state-card" key={`${card.state}-${card.wallpaper}`}>
            <Crop width={640} height={400}><Desktop state={card.state} wallpaper={card.wallpaper} still /></Crop>
            <div className="card-caption"><span>0{index + 1}</span><b>{card.title}</b><small>{card.meta}</small></div>
            <button className="card-load" onClick={() => onLoad(card.state, card.wallpaper)} aria-label={`Load ${card.title} in prototype`}><span>Load in prototype</span></button>
          </article>
        ))}
      </div>
    </section>
  )
}

function FrameStrip({ title, frames, retract = false }: { title: string; frames: typeof EXPAND_FRAMES; retract?: boolean }) {
  return (
    <div className="motion-strip">
      <div className="strip-title"><b>{title}</b><span>{retract ? 'Content out 80 ms → spring collapse' : 'Spring outward → content in at 90 ms'}</span></div>
      <div className="frame-row">
        {frames.map(({ ms, frame, content }) => {
          const label = retract && ms === RETRACT_FINAL_MS ? '07 · Final frame' : ms === DURATION_MS ? (retract ? 'Merged' : 'Settled') : ms === 0 ? (retract ? 'Start' : 'Notch') : ''
          return (
            <figure className={`frame-thumb ${label === '07 · Final frame' ? 'highlight' : ''}`} key={ms}>
              <Crop width={480} height={124}><Desktop state="summoned" wallpaper="dark" frame={frame} content={content} still showIndicator={false} /></Crop>
              <figcaption><b>{String(ms).padStart(3, '0')} ms</b><span>{Math.round(frame.w)} × {Math.round(frame.h)}</span>{label && <em>{label}</em>}</figcaption>
            </figure>
          )
        })}
      </div>
      <div className="timeline" aria-hidden="true"><i /><span>0</span><span>150 ms</span><span>300 ms</span></div>
    </div>
  )
}

function SpringPanel() {
  const width = 300
  const height = 170
  const pad = 20
  const plot = (spring: Spring, invert = false) =>
    Array.from({ length: 61 }, (_, i) => {
      const progress = i / 60
      const value = i === 60 ? 1 : springAt((progress * DURATION_MS) / 1000, spring)
      const y = invert ? 1 - value : value
      return `${(pad + progress * (width - pad * 2)).toFixed(1)},${(height - pad - y * (height - pad * 2) * 0.84).toFixed(1)}`
    }).join(' ')
  const peak = (spring: Spring) => Math.max(...Array.from({ length: 120 }, (_, i) => springAt(i / 400, spring))) - 1
  const target = height - pad - (height - pad * 2) * 0.84
  return (
    <aside className="spec-panel spring-panel">
      <div className="panel-title"><span>M</span>Spring specification</div>
      <svg className="spring-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Expand and retract spring curves">
        {[0.25, 0.5, 0.75].map((x) => <line key={x} x1={pad + x * (width - pad * 2)} x2={pad + x * (width - pad * 2)} y1={pad} y2={height - pad} className="plot-grid" />)}
        <line x1={pad} x2={width - pad} y1={target} y2={target} className="plot-target" />
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} className="plot-axis" />
        <polyline points={plot(SPRING_OUT, true)} className="plot-out" />
        <polyline points={plot(SPRING_IN)} className="plot-in" />
        <text x={pad} y={height - 5}>0</text>
        <text x={width / 2} y={height - 5} textAnchor="middle">150 ms</text>
        <text x={width - pad} y={height - 5} textAnchor="end">300 ms</text>
      </svg>
      <div className="plot-legend"><span><i className="in" />Expand</span><span><i className="out" />Retract</span></div>
      <dl className="spec-list">
        <div><dt>Expand</dt><dd>stiffness 420 · damping 26 · mass 1</dd></div>
        <div><dt>Retract</dt><dd>stiffness 300 · damping 30 · mass 1</dd></div>
        <div><dt>Duration</dt><dd>≈ 300 ms settle</dd></div>
        <div><dt>Overshoot</dt><dd>{(peak(SPRING_IN) * 100).toFixed(1)}% out · {(peak(SPRING_OUT) * 100).toFixed(1)}% in</dd></div>
        <div><dt>Origin</dt><dd>Top center · hardware notch</dd></div>
        <div><dt>Content</dt><dd>+90 ms delay · 160 ms fade</dd></div>
      </dl>
    </aside>
  )
}

function MotionSection() {
  return (
    <section className="board-section">
      <SectionHeading index="03" title="Prototype transitions" description="Width, height, and corner radius share one spring so the silhouette grows from the notch instead of fading in as a detached panel." />
      <div className="motion-layout">
        <div className="motion-strips">
          <FrameStrip title="Expand · Idle → Summoned" frames={EXPAND_FRAMES} />
          <FrameStrip title="Retract · Summoned → Notch" frames={RETRACT_FRAMES} retract />
        </div>
        <SpringPanel />
      </div>
    </section>
  )
}

function ComponentsSection() {
  const glyphStates: { status: GlyphStatus; label: string; open?: boolean }[] = [
    { status: 'running', label: 'Running' },
    { status: 'running', label: 'Menu open', open: true },
    { status: 'offline', label: 'Alert' },
    { status: 'off', label: 'Quit' },
  ]
  return (
    <section className="board-section">
      <SectionHeading index="04" title="Components" description="A compact orb system for the notch, plus a menu-bar control that remains available when the overlay is retracted." />
      <div className="components-layout">
        <div className="spec-panel">
          <div className="panel-title"><span>C1</span>Orb · five variants</div>
          <div className="orb-variants">
            {ORB_VARIANTS.map((variant) => (
              <div className={`orb-spec ${variant.id === 'error' ? 'is-error' : ''}`} key={variant.id}>
                <div className="orb-stage"><Orb variant={variant.id} size={74} /></div>
                <b>{variant.label}</b>
                <small>{variant.spec}</small>
              </div>
            ))}
          </div>
          <div className="orb-sizes"><span>Sizes</span>{[24, 28, 34, 42].map((size) => <span className="orb-size" key={size}><Orb size={size} /><small>{size}</small></span>)}</div>
        </div>
        <div className="spec-panel menu-panel">
          <div className="panel-title"><span>C2</span>Menu-bar icon & dropdown</div>
          <div className="glyph-states">
            {glyphStates.map((item) => <div className="glyph-tile" key={item.label}><span className={item.open ? 'open' : ''}><JarvisGlyph status={item.status} size={18} /></span><small>{item.label}</small></div>)}
          </div>
          <div className="menu-crop"><Crop width={560} height={250} offsetX={SCREEN.w - 560}><Desktop state="idle" wallpaper="dark" menuOpen still showIndicator={false} /></Crop></div>
        </div>
      </div>
    </section>
  )
}

function WallpaperSection() {
  return (
    <section className="board-section">
      <SectionHeading index="05" title="Wallpaper variants" description="Summoned state at the native 3024 × 1964 MacBook Pro 14″ canvas, shown at 1512 × 982 pt. Black remains constant; the glow is tuned to stay visible on both wallpapers." />
      <div className="wallpaper-grid">
        {(['dark', 'light'] as Wallpaper[]).map((wallpaper) => (
          <figure className="wallpaper-card" key={wallpaper}>
            <div className="device compact"><div className="device-bezel"><div className="device-screen"><ScaledFrame width={SCREEN.w} height={SCREEN.h}><Desktop state="summoned" wallpaper={wallpaper} still /></ScaledFrame></div></div><div className="device-base" /></div>
            <figcaption><b>{wallpaper} wallpaper</b><span>Summoned · 420 × 80</span></figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}

export default function App() {
  const proto = usePrototype()
  const stageRef = useRef<HTMLElement>(null)
  const load = (state: NotchState, wallpaper: Wallpaper) => {
    proto.load(state, wallpaper)
    stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <main className="board" style={MOTION_VARS}>
      <header className="board-header">
        <div className="board-brand">
          <span className="brand-mark"><JarvisGlyph size={20} /></span>
          <div>
            <span className="eyebrow">Ambient interface / notch-anchored</span>
            <h1>JARVIS <em>Notch Overlay</em></h1>
            <p>No main window. The assistant lives in the background, grows from the MacBook notch when summoned, then disappears back into the hardware.</p>
          </div>
        </div>
        <div className="meta-chips">
          <span>Canvas 3024 × 1964</span>
          <span>MacBook Pro 14″</span>
          <span>@2× · 1512 × 982 pt</span>
          <span className="live"><i />Prototype live</span>
        </div>
      </header>
      <PrototypeStage proto={proto} stageRef={stageRef} />
      <StateGallery onLoad={load} />
      <MotionSection />
      <ComponentsSection />
      <WallpaperSection />
      <footer className="board-footer"><span>JARVIS NOTCH SYSTEM · V3.0</span><span>Local model · private by default</span><span>⌥ Space</span></footer>
    </main>
  )
}
