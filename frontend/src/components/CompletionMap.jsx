import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarRange, ChevronRight, Database, Loader, Maximize2, Minimize2, MousePointer2, RotateCcw, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { api } from '../lib/api.js';

const LEVELS = ['SESSION', 'DAY', 'WEEK', 'MONTH'];
const DEFAULT_SCHEDULE = ['08:00', '13:00', '17:00'];

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value) {
  const date = startOfDay(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function startOfWeek(value) {
  const date = startOfDay(value);
  return addDays(date, -((date.getDay() + 6) % 7));
}

function startOfMonth(value) {
  const date = startOfDay(value);
  date.setDate(1);
  return date;
}

function endOfMonth(value) {
  const date = startOfMonth(value);
  date.setMonth(date.getMonth() + 1);
  date.setMilliseconds(-1);
  return date;
}

function dateKey(value) {
  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function datesBetween(start, end) {
  const values = [];
  for (let date = startOfDay(start); date <= endOfDay(end); date = addDays(date, 1)) values.push(date);
  return values;
}

function shortDate(value) {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function displayLevel(level) {
  return level.charAt(0) + level.slice(1).toLowerCase();
}

function buildPeriods(level, focus) {
  const today = startOfDay(new Date());

  if (level === 'SESSION' || level === 'DAY') {
    const fallbackDays = level === 'SESSION' ? 5 : 14;
    const start = focus?.start || addDays(today, -(fallbackDays - 1));
    const end = focus?.end || today;
    return datesBetween(start, end).map(date => ({
      key: dateKey(date),
      start: startOfDay(date),
      end: endOfDay(date),
      eyebrow: date.toLocaleDateString('en-IN', { weekday: 'short' }),
      label: shortDate(date),
      isToday: dateKey(date) === dateKey(today),
    }));
  }

  if (level === 'WEEK') {
    const rangeStart = focus?.start || addDays(startOfWeek(today), -49);
    const rangeEnd = focus?.end || addDays(startOfWeek(today), 6);
    const periods = [];
    for (let cursor = startOfWeek(rangeStart); cursor <= rangeEnd; cursor = addDays(cursor, 7)) {
      const start = focus && cursor < focus.start ? startOfDay(focus.start) : cursor;
      const naturalEnd = endOfDay(addDays(cursor, 6));
      const end = focus && naturalEnd > focus.end ? endOfDay(focus.end) : naturalEnd;
      if (start <= end) periods.push({
        key: `week-${dateKey(start)}`,
        start,
        end,
        eyebrow: 'Week',
        label: `${shortDate(start)}–${shortDate(end)}`,
        isToday: today >= start && today <= end,
      });
    }
    return periods;
  }

  const periods = [];
  let cursor = focus?.start ? startOfMonth(focus.start) : startOfMonth(today);
  if (!focus) cursor.setMonth(cursor.getMonth() - 7);
  const lastMonth = focus?.end ? startOfMonth(focus.end) : startOfMonth(today);
  while (cursor <= lastMonth) {
    const start = new Date(cursor);
    const end = endOfMonth(cursor);
    periods.push({
      key: `month-${dateKey(start)}`,
      start,
      end,
      eyebrow: start.toLocaleDateString('en-IN', { year: 'numeric' }),
      label: start.toLocaleDateString('en-IN', { month: 'short' }),
      isToday: today >= start && today <= end,
    });
    cursor = new Date(cursor);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return periods;
}

function scoreTone(score) {
  if (score === null) return 'pending';
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 40) return 'warning';
  return 'critical';
}

export default function CompletionMap({ toilets, facilityId, onToiletClick, onSessionClick, demoMode = false }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [level, setLevel] = useState('DAY');
  const [focus, setFocus] = useState(null);
  const [zoomDirection, setZoomDirection] = useState('in');
  const [gestureMessage, setGestureMessage] = useState('');
  const [query, setQuery] = useState('');
  const [healthFilter, setHealthFilter] = useState('ALL');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wheelLockRef = useRef(0);
  const pinchRef = useRef({ distance: 0, locked: false });
  const gestureTimerRef = useRef(null);
  const viewportRef = useRef(null);
  const shellRef = useRef(null);
  const pointerLightRef = useRef(null);
  const pointerFrameRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (demoMode || !facilityId) {
      setSessions([]);
      setLoadError('');
      setLoading(false);
      return () => { cancelled = true; };
    }

    async function loadSessions() {
      setLoading(true);
      setLoadError('');
      try {
        const first = await api(`/api/admin/sessions?facility_id=${facilityId}&limit=100&offset=0`);
        const pageCount = Math.min(5, Math.ceil((first.total || 0) / 100));
        const remaining = pageCount > 1
          ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) =>
              api(`/api/admin/sessions?facility_id=${facilityId}&limit=100&offset=${(index + 1) * 100}`)
            ))
          : [];
        if (!cancelled) setSessions([...(first.sessions || []), ...remaining.flatMap(page => page.sessions || [])]);
      } catch (error) {
        console.error(error);
        if (!cancelled) setLoadError('Could not refresh session history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadSessions();
    return () => { cancelled = true; };
  }, [facilityId, demoMode]);

  const sessionsByToiletDay = useMemo(() => {
    const index = new Map();
    sessions.forEach(session => {
      const toiletId = session.toilet_id || session.toilets?.id;
      const timestamp = session.started_at || session.completed_at;
      if (!toiletId || !timestamp) return;
      const key = `${toiletId}:${dateKey(timestamp)}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(session);
    });
    index.forEach(items => items.sort((a, b) => new Date(a.started_at || a.completed_at) - new Date(b.started_at || b.completed_at)));
    return index;
  }, [sessions]);

  const periods = useMemo(() => buildPeriods(level, focus), [level, focus]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (viewport) viewport.scrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    });
    return () => cancelAnimationFrame(frame);
  }, [level, focus, periods.length]);

  const getDayMetrics = useCallback((toilet, day) => {
    const schedule = Array.isArray(toilet.cleaning_schedule) && toilet.cleaning_schedule.length
      ? [...toilet.cleaning_schedule].sort()
      : DEFAULT_SCHEDULE;
    const actual = sessionsByToiletDay.get(`${toilet.id}:${dateKey(day)}`) || [];
    const now = new Date();
    const activatedAt = toilet.created_at ? new Date(toilet.created_at) : null;
    const slots = schedule.map((time, index) => {
      const session = actual[index] || null;
      const [hours, minutes] = String(time).split(':').map(Number);
      const dueAt = startOfDay(day);
      dueAt.setHours(hours || 0, minutes || 0, 0, 0);
      let status = 'PENDING';
      if (activatedAt && dueAt < activatedAt) status = 'NOT_APPLICABLE';
      else if (demoMode && dueAt <= now) {
        const daySeed = Number(dateKey(day).replaceAll('-', ''));
        const performanceBands = [97, 93, 88, 82, 76, 69, 60, 49, 35, 22];
        const baseline = performanceBands[(toilet.demo_index ?? 0) % performanceBands.length];
        const roll = (((toilet.demo_index ?? 0) + 1) * 37 + daySeed * 13 + index * 29) % 100;
        const isToday = dateKey(day) === dateKey(now);
        status = roll < baseline ? 'COMPLETED' : isToday && roll < baseline + 4 ? 'IN_PROGRESS' : 'MISSED';
      }
      else if (session?.status === 'COMPLETED') status = 'COMPLETED';
      else if (session?.status === 'IN_PROGRESS') status = 'IN_PROGRESS';
      else if (session || dueAt <= now) status = 'MISSED';
      return { time, session, status, due: !['PENDING', 'NOT_APPLICABLE'].includes(status) };
    });
    return {
      slots,
      completed: slots.filter(slot => slot.status === 'COMPLETED').length,
      due: slots.filter(slot => slot.due).length,
      active: slots.filter(slot => slot.status === 'IN_PROGRESS').length,
      missed: slots.filter(slot => slot.status === 'MISSED').length,
      pending: slots.filter(slot => slot.status === 'PENDING').length,
    };
  }, [sessionsByToiletDay, demoMode]);

  const getPeriodMetrics = useCallback((toilet, period) => {
    const result = datesBetween(period.start, period.end)
      .map(day => getDayMetrics(toilet, day))
      .reduce((total, value) => ({
        completed: total.completed + value.completed,
        due: total.due + value.due,
        active: total.active + value.active,
        missed: total.missed + value.missed,
        pending: total.pending + value.pending,
      }), { completed: 0, due: 0, active: 0, missed: 0, pending: 0 });
    result.score = result.due ? Math.round((result.completed / result.due) * 100) : null;
    result.tone = scoreTone(result.score);
    return result;
  }, [getDayMetrics]);

  const toiletScores = useMemo(() => toilets.map(toilet => {
    const total = periods.map(period => getPeriodMetrics(toilet, period))
      .reduce((sum, item) => ({ completed: sum.completed + item.completed, due: sum.due + item.due }), { completed: 0, due: 0 });
    const score = total.due ? Math.round((total.completed / total.due) * 100) : null;
    return { toilet, score, tone: scoreTone(score) };
  }), [toilets, periods, getPeriodMetrics]);

  const filterCounts = useMemo(() => toiletScores.reduce((counts, item) => {
    counts.ALL += 1;
    if (item.score === null || item.score >= 70) counts.HEALTHY += 1;
    else if (item.score >= 40) counts.WATCH += 1;
    else counts.CRITICAL += 1;
    return counts;
  }, { ALL: 0, HEALTHY: 0, WATCH: 0, CRITICAL: 0 }), [toiletScores]);

  const filteredToilets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return toiletScores.filter(({ toilet, score }) => {
      const matchesQuery = !needle || [toilet.name, toilet.code, toilet.floor, toilet.area, toilet.toilet_type]
        .some(value => String(value || '').toLowerCase().includes(needle));
      const matchesHealth = healthFilter === 'ALL'
        || (healthFilter === 'HEALTHY' && (score === null || score >= 70))
        || (healthFilter === 'WATCH' && score !== null && score >= 40 && score < 70)
        || (healthFilter === 'CRITICAL' && score !== null && score < 40);
      return matchesQuery && matchesHealth;
    }).map(item => item.toilet);
  }, [toiletScores, query, healthFilter]);

  const overview = useMemo(() => {
    const total = filteredToilets.flatMap(toilet => periods.map(period => getPeriodMetrics(toilet, period)))
      .reduce((sum, item) => ({ completed: sum.completed + item.completed, due: sum.due + item.due }), { completed: 0, due: 0 });
    return { ...total, score: total.due ? Math.round((total.completed / total.due) * 100) : null };
  }, [filteredToilets, periods, getPeriodMetrics]);

  function selectLevel(nextLevel) {
    setZoomDirection(LEVELS.indexOf(nextLevel) < LEVELS.indexOf(level) ? 'in' : 'out');
    setLevel(nextLevel);
    setFocus(null);
  }

  function stepZoom(amount) {
    gestureZoom(amount);
  }

  function drillInto(period) {
    const current = LEVELS.indexOf(level);
    if (current === 0) return;
    setZoomDirection('in');
    setFocus({ start: period.start, end: period.end, label: period.label });
    setLevel(LEVELS[current - 1]);
  }

  const visibleRange = periods.length
    ? `${shortDate(periods[0].start)} – ${shortDate(periods[periods.length - 1].end)}`
    : 'No date range';

  useEffect(() => () => clearTimeout(gestureTimerRef.current), []);

  useEffect(() => () => cancelAnimationFrame(pointerFrameRef.current), []);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isFullscreen]);

  function showGesture(message) {
    setGestureMessage(message);
    clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = setTimeout(() => setGestureMessage(''), 850);
  }

  function periodFromTarget(target) {
    const node = target?.closest?.('[data-period-start]');
    if (!node?.dataset.periodStart) return null;
    return {
      start: new Date(node.dataset.periodStart),
      end: new Date(node.dataset.periodEnd),
      label: node.dataset.periodLabel,
    };
  }

  function contextualRange(nextLevel, anchorValue) {
    const anchor = startOfDay(anchorValue || periods.at(-1)?.end || new Date());
    if (nextLevel === 'DAY') return { start: addDays(anchor, -13), end: endOfDay(anchor), label: shortDate(anchor) };
    if (nextLevel === 'WEEK') return { start: addDays(startOfWeek(anchor), -49), end: endOfDay(addDays(startOfWeek(anchor), 6)), label: shortDate(anchor) };
    if (nextLevel === 'MONTH') {
      const start = startOfMonth(anchor);
      start.setMonth(start.getMonth() - 7);
      return { start, end: endOfMonth(anchor), label: anchor.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) };
    }
    return { start: anchor, end: endOfDay(anchor), label: shortDate(anchor) };
  }

  function gestureZoom(amount, targetPeriod = null) {
    const current = LEVELS.indexOf(level);
    const next = Math.max(0, Math.min(LEVELS.length - 1, current + amount));
    if (next === current) {
      showGesture(amount < 0 ? 'Maximum detail' : 'Maximum overview');
      return;
    }

    const nextLevel = LEVELS[next];
    setZoomDirection(amount < 0 ? 'in' : 'out');
    if (amount < 0 && targetPeriod) {
      setFocus(targetPeriod);
    } else if (amount > 0) {
      const anchor = targetPeriod?.start || focus?.start || periods.at(-1)?.end || new Date();
      setFocus(contextualRange(nextLevel, anchor));
    }
    setLevel(nextLevel);
    showGesture(`${amount < 0 ? 'Zoomed in' : 'Zoomed out'} · ${displayLevel(nextLevel)}`);
  }

  function handleWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    if (Math.abs(event.deltaY) < 4) return;
    event.preventDefault();
    const now = Date.now();
    if (now - wheelLockRef.current < 420) return;
    wheelLockRef.current = now;
    gestureZoom(event.deltaY < 0 ? -1 : 1, periodFromTarget(event.target));
  }

  function touchDistance(touches) {
    const [first, second] = touches;
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  }

  function handleTouchStart(event) {
    if (event.touches.length !== 2) return;
    pinchRef.current = { distance: touchDistance(event.touches), locked: false };
  }

  function handleTouchMove(event) {
    if (event.touches.length !== 2 || !pinchRef.current.distance) return;
    event.preventDefault();
    const distance = touchDistance(event.touches);
    const ratio = distance / pinchRef.current.distance;
    if (pinchRef.current.locked || (ratio > .88 && ratio < 1.12)) return;
    pinchRef.current.locked = true;
    gestureZoom(ratio > 1 ? -1 : 1, periodFromTarget(event.target));
  }

  function handleTouchEnd(event) {
    if (event.touches.length < 2) pinchRef.current = { distance: 0, locked: false };
  }

  function handlePointerMove(event) {
    const shell = shellRef.current;
    const light = pointerLightRef.current;
    if (!shell || !light) return;
    const rect = shell.getBoundingClientRect();
    const x = event.clientX - rect.left - 210;
    const y = event.clientY - rect.top - 210;
    cancelAnimationFrame(pointerFrameRef.current);
    pointerFrameRef.current = requestAnimationFrame(() => {
      light.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
  }

  return (
    <div ref={shellRef} className={`zm-shell ${isFullscreen ? 'is-fullscreen' : ''}`} onPointerMove={handlePointerMove}>
      <div ref={pointerLightRef} className="zm-pointer-light" aria-hidden="true" />
      <div className="zm-toolbar">
        <div className="zm-toolbar-copy">
          <div className="zm-kicker"><span className="zm-live-dot" /> Interactive completion map</div>
          <div className="zm-range"><CalendarRange size={14} /> {focus ? `Inside ${focus.label}` : visibleRange}</div>
        </div>

        <div className="zm-controls">
          <div className="zm-levels" aria-label="Zoom level">
            {LEVELS.map(item => (
              <button key={item} className={level === item ? 'active' : ''} onClick={() => selectLevel(item)} aria-pressed={level === item}>
                {displayLevel(item)}
              </button>
            ))}
          </div>
          <div className="zm-step-controls" aria-label="Map detail controls">
            <button onClick={() => stepZoom(-1)} disabled={level === 'SESSION'} aria-label="Show more detail"><ZoomIn size={14} /><span>More detail</span></button>
            <button onClick={() => stepZoom(1)} disabled={level === 'MONTH'} aria-label="Show more overview"><ZoomOut size={14} /><span>Overview</span></button>
          </div>
          {focus && <button className="zm-reset-view" onClick={() => { setFocus(null); showGesture('Returned to recent range'); }}><RotateCcw size={13} /> Reset</button>}
          <button className="zm-fullscreen-btn" onClick={() => setIsFullscreen(value => !value)} aria-label={isFullscreen ? 'Exit full screen map' : 'Open full screen map'}>
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span>{isFullscreen ? 'Exit full screen' : 'Full screen'}</span>
          </button>
        </div>
      </div>

      <div className="zm-summary-strip">
        <div className={`zm-score-badge tone-${scoreTone(overview.score)}`} style={{ '--score': overview.score || 0 }}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.strong key={overview.score ?? 'none'} initial={{ opacity: 0, y: 5, scale: .8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -5, scale: .8 }} transition={{ duration: .22 }}>
              {overview.score === null ? '—' : `${overview.score}%`}
            </motion.strong>
          </AnimatePresence>
          <span>visible completion</span>
        </div>
        <div className="zm-summary-copy">
          <strong>{displayLevel(level)} level</strong>
          <span>{level === 'SESSION' ? 'Every required cleaning slot is visible.' : 'Select any colored tile to zoom into its detail.'}</span>
        </div>
        <div className="zm-ratio"><b>{overview.completed}</b><span>/ {overview.due} due sessions completed</span></div>
        {loading && <div className="zm-refresh"><Loader size={13} className="spin" /> Refreshing</div>}
        {loadError && <div className="zm-refresh error">{loadError}</div>}
      </div>

      <div className="zm-dataset-bar">
        <label className="zm-search-box">
          <Search size={14} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={`Search ${toilets.length} locations…`}
            aria-label="Search locations"
          />
          {query && <button onClick={() => setQuery('')} aria-label="Clear location search"><X size={13} /></button>}
        </label>
        <div className="zm-health-filters" aria-label="Filter by completion health">
          {[
            ['ALL', 'All'],
            ['HEALTHY', 'Healthy'],
            ['WATCH', 'Watch'],
            ['CRITICAL', 'Critical'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`${healthFilter === value ? 'active' : ''} filter-${value.toLowerCase()}`}
              onClick={() => setHealthFilter(value)}
              aria-pressed={healthFilter === value}
            >
              <i /> {label} <b>{filterCounts[value]}</b>
            </button>
          ))}
        </div>
        {demoMode && <div className="zm-demo-badge"><Database size={12} /> Demo fleet · {toilets.length} assets</div>}
      </div>

      <div className="zm-map-stage">
        <div className="zm-scan-beam" aria-hidden="true" />
        <div className="zm-gesture-coach"><MousePointer2 size={12} /><span>Ctrl/Cmd + scroll to zoom</span><i /> <span>Click a tile to drill down</span><i /> <span>Pinch on touch</span></div>
        <AnimatePresence>
          {gestureMessage && (
            <motion.div className="zm-gesture-toast" initial={{ opacity: 0, scale: .9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .94 }} aria-live="polite">
              <ZoomIn size={14} /> {gestureMessage}
            </motion.div>
          )}
        </AnimatePresence>
        <div
          ref={viewportRef}
          className={`zm-viewport level-${level.toLowerCase()}`}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${level}-${focus?.start?.getTime() || 'recent'}`}
              className="zm-map"
              initial={{ opacity: 0, scale: zoomDirection === 'in' ? .96 : 1.035, x: zoomDirection === 'in' ? 10 : -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: zoomDirection === 'in' ? 1.025 : .975, x: zoomDirection === 'in' ? -8 : 8 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
            <div className="zm-map-row zm-map-header">
              <div className="zm-location-head"><span>Locations</span><b>{filteredToilets.length}/{toilets.length}</b></div>
              <div className="zm-period-rail" style={{ '--period-count': periods.length }}>
                {periods.map(period => (
                  <div key={period.key} className={`zm-period-head ${period.isToday ? 'today' : ''}`} data-period-start={period.start.toISOString()} data-period-end={period.end.toISOString()} data-period-label={period.label}>
                    <span>{period.eyebrow}</span>
                    <strong>{period.label}</strong>
                  </div>
                ))}
              </div>
            </div>

            <AnimatePresence initial={false}>
            {filteredToilets.map((toilet, rowIndex) => (
              <motion.div
                key={toilet.id}
                className="zm-map-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5, scale: .995 }}
                transition={{ delay: Math.min(rowIndex * 0.004, 0.14), duration: .24 }}
              >
                <button
                  className={`zm-location ${demoMode ? 'is-demo' : ''}`}
                  onClick={() => !demoMode && onToiletClick?.(toilet)}
                  title={`${toilet.name} · ${toilet.code || 'Cleaning point'} · ${toilet.floor || toilet.area || ''}`}
                >
                  <span className="zm-location-avatar">{String(rowIndex + 1).padStart(2, '0')}</span>
                  <span className="zm-location-copy">
                    <strong>{toilet.name}</strong>
                    <small>{[toilet.code, toilet.floor].filter(Boolean).join(' · ') || toilet.area || 'Cleaning point'}</small>
                  </span>
                  {!demoMode && <ChevronRight size={14} />}
                </button>

                <div className="zm-period-rail" style={{ '--period-count': periods.length }}>
                  {periods.map(period => {
                    if (level === 'SESSION') {
                      const metrics = getDayMetrics(toilet, period.start);
                      return (
                        <div key={period.key} className={`zm-session-group ${period.isToday ? 'today' : ''}`} data-period-start={period.start.toISOString()} data-period-end={period.end.toISOString()} data-period-label={period.label}>
                          {metrics.slots.map((slot, slotIndex) => {
                            const clickable = slot.status === 'COMPLETED' && slot.session?.site_photo_path;
                            return (
                              <button
                                key={`${period.key}-${slot.time}-${slotIndex}`}
                                className={`zm-session-cell status-${slot.status.toLowerCase()} ${clickable ? 'clickable' : ''}`}
                                onClick={() => clickable && onSessionClick?.(slot.session)}
                                disabled={!clickable}
                                title={`${shortDate(period.start)} at ${slot.time}: ${slot.status.toLowerCase().replace('_', ' ')}`}
                              >
                                <span className="zm-session-time">{slot.time}</span>
                                <span className="zm-session-state">
                                  {slot.status === 'COMPLETED' ? '✓ Done' : slot.status === 'IN_PROGRESS' ? '• Live' : slot.status === 'MISSED' ? '! Missed' : slot.status === 'NOT_APPLICABLE' ? '— Not open' : '· Pending'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    }

                    const metrics = getPeriodMetrics(toilet, period);
                    return (
                      <button
                        key={period.key}
                        className={`zm-aggregate-tile tone-${metrics.tone} ${period.isToday ? 'today' : ''}`}
                        onClick={() => drillInto(period)}
                        title={`${metrics.score === null ? 'No sessions due' : `${metrics.score}% complete`} — click to zoom in`}
                        data-period-start={period.start.toISOString()}
                        data-period-end={period.end.toISOString()}
                        data-period-label={period.label}
                      >
                        <span className="zm-tile-wash" />
                        <span className="zm-tile-score">{metrics.score === null ? '—' : `${metrics.score}%`}</span>
                        <span className="zm-tile-ratio">{metrics.completed}/{metrics.due} done</span>
                        <span className="zm-tile-detail">
                          {metrics.score === null ? 'Not active' : metrics.active ? `${metrics.active} live` : metrics.missed ? `${metrics.missed} missed` : metrics.pending ? `${metrics.pending} upcoming` : 'All clear'}
                        </span>
                        <span className="zm-tile-meter"><i style={{ width: `${metrics.score || 0}%` }} /></span>
                        <span className="zm-drill-hint"><ZoomIn size={11} /> View {LEVELS[LEVELS.indexOf(level) - 1]?.toLowerCase()}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
            {!filteredToilets.length && (
              <div className="zm-map-empty">
                <Search size={20} />
                <strong>No matching locations</strong>
                <span>Try another search or health filter.</span>
                <button onClick={() => { setQuery(''); setHealthFilter('ALL'); }}>Reset filters</button>
              </div>
            )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="zm-footer">
        <div className="zm-legend">
          <span><i className="tone-excellent" />90–100%</span>
          <span><i className="tone-good" />70–89%</span>
          <span><i className="tone-warning" />40–69%</span>
          <span><i className="tone-critical" />0–39%</span>
          <span><i className="tone-pending" />Nothing due</span>
        </div>
        <p><b>Score:</b> completed ÷ required sessions due by now. Future sessions are excluded until their scheduled time.</p>
      </div>
    </div>
  );
}
