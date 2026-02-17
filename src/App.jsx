import { useState, useEffect, useRef } from 'react'
import './App.css'

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const centiseconds = Math.floor((ms % 1000) / 10)

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
}

function Stopwatch() {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [laps, setLaps] = useState([])
  const startTimeRef = useRef(null)
  const elapsedRef = useRef(0)
  const rafRef = useRef(null)

  const tick = () => {
    setElapsed(Date.now() - startTimeRef.current + elapsedRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }

  const handleStart = () => {
    startTimeRef.current = Date.now()
    rafRef.current = requestAnimationFrame(tick)
    setRunning(true)
  }

  const handlePause = () => {
    cancelAnimationFrame(rafRef.current)
    elapsedRef.current += Date.now() - startTimeRef.current
    setRunning(false)
  }

  const handleReset = () => {
    cancelAnimationFrame(rafRef.current)
    elapsedRef.current = 0
    setElapsed(0)
    setLaps([])
    setRunning(false)
  }

  const handleLap = () => {
    setLaps(prev => [...prev, elapsed])
  }

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  return (
    <div className="timer-section">
      <div className="display">{formatTime(elapsed)}</div>
      <div className="controls">
        {!running ? (
          <button className="btn btn-start" onClick={handleStart}>
            {elapsed > 0 ? 'Resume' : 'Start'}
          </button>
        ) : (
          <button className="btn btn-pause" onClick={handlePause}>Pause</button>
        )}
        <button className="btn btn-lap" onClick={handleLap} disabled={!running}>Lap</button>
        <button className="btn btn-reset" onClick={handleReset} disabled={elapsed === 0 && !running}>Reset</button>
      </div>
      {laps.length > 0 && (
        <div className="laps">
          {[...laps].reverse().map((lap, i) => (
            <div key={i} className="lap-item">
              <span>Lap {laps.length - i}</span>
              <span>{formatTime(lap)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Countdown() {
  const [inputMinutes, setInputMinutes] = useState(5)
  const [inputSeconds, setInputSeconds] = useState(0)
  const [remaining, setRemaining] = useState(null)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const intervalRef = useRef(null)
  const endTimeRef = useRef(null)

  const totalMs = () => (inputMinutes * 60 + inputSeconds) * 1000

  const handleStart = () => {
    const ms = remaining !== null ? remaining : totalMs()
    if (ms <= 0) return
    endTimeRef.current = Date.now() + ms
    setFinished(false)
    setRunning(true)
    intervalRef.current = setInterval(() => {
      const left = endTimeRef.current - Date.now()
      if (left <= 0) {
        setRemaining(0)
        setRunning(false)
        setFinished(true)
        clearInterval(intervalRef.current)
      } else {
        setRemaining(left)
      }
    }, 50)
  }

  const handlePause = () => {
    clearInterval(intervalRef.current)
    setRemaining(endTimeRef.current - Date.now())
    setRunning(false)
  }

  const handleReset = () => {
    clearInterval(intervalRef.current)
    setRemaining(null)
    setRunning(false)
    setFinished(false)
  }

  useEffect(() => () => clearInterval(intervalRef.current), [])

  const displayMs = remaining !== null ? remaining : totalMs()

  return (
    <div className="timer-section">
      {!running && remaining === null && (
        <div className="input-row">
          <div className="input-group">
            <input
              type="number"
              min={0}
              max={99}
              value={inputMinutes}
              onChange={e => setInputMinutes(Math.max(0, parseInt(e.target.value) || 0))}
            />
            <label>min</label>
          </div>
          <span className="colon">:</span>
          <div className="input-group">
            <input
              type="number"
              min={0}
              max={59}
              value={inputSeconds}
              onChange={e => setInputSeconds(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
            />
            <label>sec</label>
          </div>
        </div>
      )}
      <div className={`display${finished ? ' finished' : ''}`}>
        {formatTime(displayMs)}
      </div>
      {finished && <div className="done-msg">Time&apos;s up!</div>}
      <div className="controls">
        {!running ? (
          <button className="btn btn-start" onClick={handleStart} disabled={displayMs <= 0}>
            {remaining !== null && !finished ? 'Resume' : 'Start'}
          </button>
        ) : (
          <button className="btn btn-pause" onClick={handlePause}>Pause</button>
        )}
        <button className="btn btn-reset" onClick={handleReset} disabled={remaining === null && !running}>Reset</button>
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState('stopwatch')

  return (
    <div className="app">
      <h1>Timer</h1>
      <div className="tabs">
        <button className={`tab${tab === 'stopwatch' ? ' active' : ''}`} onClick={() => setTab('stopwatch')}>
          Stopwatch
        </button>
        <button className={`tab${tab === 'countdown' ? ' active' : ''}`} onClick={() => setTab('countdown')}>
          Countdown
        </button>
      </div>
      {tab === 'stopwatch' ? <Stopwatch /> : <Countdown />}
    </div>
  )
}
