import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { supabase } from './lib/supabaseClient.js';
import {
  STAT_DEFS,
  GROUP_LABELS,
  GROUP_ORDER,
  BUCKETS,
  ERROR_KEYS,
  parseClockMinutes,
  bucketIndex,
  parsePlayerLine,
  pct,
} from './statDefs.js';

// ---------- Auth gate ----------

function AuthGate({ children }) {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="wrap"><p className="empty">Loading…</p></div>;
  }

  if (!session) {
    async function handleSubmit(e) {
      e.preventDefault();
      setError('');
      setInfo('');
      setBusy(true);
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setError(error.message);
        else setInfo('Account created — check your inbox to confirm your email, then sign in below.');
      }
      setBusy(false);
    }

    return (
      <div className="wrap">
        <div className="field-lines">
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '1.5rem', margin: '0 0 6px' }}>
            Match Stat Tracker
          </h1>
          <p className="sub">{mode === 'signin' ? 'Sign in to load your matches.' : 'Create an account to get started.'}</p>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14, maxWidth: 280 }}>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="clock"
              style={{ width: '100%', textAlign: 'left' }}
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="clock"
              style={{ width: '100%', textAlign: 'left' }}
            />
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <button
            className="btn-ghost small"
            style={{ marginTop: 10 }}
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }}
          >
            {mode === 'signin' ? "Need an account? Sign up" : 'Already have an account? Sign in'}
          </button>
          {error && <p className="sub" style={{ color: 'var(--red)' }}>{error}</p>}
          {info && <p className="sub" style={{ color: 'var(--paper)' }}>{info}</p>}
        </div>
      </div>
    );
  }

  return children(session);
}

// ---------- Modal (confirm / prompt) ----------

function Modal({ modal, onClose }) {
  const inputRef = useRef(null);
  useEffect(() => {
    if (modal?.type === 'prompt' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.value = modal.defaultValue || '';
    }
  }, [modal]);

  if (!modal) return null;

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal-box">
        <p className="modal-message">{modal.message}</p>
        {modal.type === 'prompt' && (
          <input
            ref={inputRef}
            type="text"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                modal.onConfirm(inputRef.current.value);
                onClose();
              }
            }}
          />
        )}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => {
              modal.onConfirm(modal.type === 'prompt' ? inputRef.current.value : undefined);
              onClose();
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Toast ----------

function useToast() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timerRef = useRef(null);
  const showToast = useCallback((text) => {
    setMsg(text);
    setShow(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), 1400);
  }, []);
  const node = <div className={'toast' + (show ? ' show' : '')}>{msg}</div>;
  return [showToast, node];
}

// ---------- Main app (once authenticated) ----------

function TrackerApp({ session }) {
  const userId = session.user.id;

  const [matches, setMatches] = useState([]); // [{id, title, created_at}]
  const [currentMatchId, setCurrentMatchId] = useState(null);
  const [players, setPlayers] = useState([]); // [{id, name, jersey}]
  const [events, setEvents] = useState([]); // [{id, player_id, stat, stat_label, clock}]
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [clock, setClock] = useState('');
  const [tab, setTab] = useState('main');
  const [newName, setNewName] = useState('');
  const [newJersey, setNewJersey] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showToast, toastNode] = useToast();

  const pendingDigitRef = useRef(null);
  const pendingTimerRef = useRef(null);

  const currentMatch = matches.find((m) => m.id === currentMatchId) || null;

  // Load matches on mount
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('id, title, created_at')
        .order('created_at', { ascending: true });
      if (error) {
        showToast('Could not load matches');
        setLoading(false);
        return;
      }
      let list = data;
      if (list.length === 0) {
        const { data: created, error: createErr } = await supabase
          .from('matches')
          .insert({ title: 'Match Stat Tracker', user_id: userId })
          .select('id, title, created_at')
          .single();
        if (createErr) {
          showToast('Could not create a match');
          setLoading(false);
          return;
        }
        list = [created];
      }
      setMatches(list);
      setCurrentMatchId(list[0].id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load players + events whenever the current match changes
  useEffect(() => {
    if (!currentMatchId) return;
    (async () => {
      const [{ data: p, error: pErr }, { data: e, error: eErr }] = await Promise.all([
        supabase.from('players').select('id, name, jersey').eq('match_id', currentMatchId).order('sort_order', { ascending: true }),
        supabase.from('events').select('id, player_id, stat, stat_label, clock').eq('match_id', currentMatchId).order('logged_at', { ascending: true }),
      ]);
      if (pErr || eErr) {
        showToast('Could not load match data');
        return;
      }
      setPlayers(p || []);
      setEvents(e || []);
      setSelectedPlayerId(null);
    })();
  }, [currentMatchId, showToast]);

  const playerName = (id) => players.find((p) => p.id === id)?.name || 'Unknown';
  const countFor = (playerId, statKey) => events.filter((e) => e.player_id === playerId && e.stat === statKey).length;
  const teamCount = (statKey) => events.filter((e) => e.stat === statKey).length;

  // ---------- Mutations ----------

  async function renameMatch(title) {
    setMatches((ms) => ms.map((m) => (m.id === currentMatchId ? { ...m, title } : m)));
    await supabase.from('matches').update({ title }).eq('id', currentMatchId);
  }

  async function createMatch(title) {
    const { data, error } = await supabase
      .from('matches')
      .insert({ title: title || 'New match', user_id: userId })
      .select('id, title, created_at')
      .single();
    if (error) { showToast('Could not create match'); return; }
    setMatches((ms) => [...ms, data]);
    setCurrentMatchId(data.id);
  }

  async function deleteMatch() {
    if (matches.length <= 1) { showToast("Can't delete your only match"); return; }
    const { error } = await supabase.from('matches').delete().eq('id', currentMatchId);
    if (error) { showToast('Could not delete match'); return; }
    const remaining = matches.filter((m) => m.id !== currentMatchId);
    setMatches(remaining);
    setCurrentMatchId(remaining[0].id);
  }

  async function addPlayer(name, jersey) {
    const sortOrder = players.length;
    const { data, error } = await supabase
      .from('players')
      .insert({ match_id: currentMatchId, name, jersey: jersey || null, sort_order: sortOrder })
      .select('id, name, jersey')
      .single();
    if (error) { showToast('Could not add player'); return null; }
    setPlayers((ps) => [...ps, data]);
    return data;
  }

  async function addPlayersBulk(lines) {
    const parsed = lines.map(parsePlayerLine).filter((p) => p && p.name);
    if (parsed.length === 0) return 0;
    const rows = parsed.map((p, i) => ({
      match_id: currentMatchId,
      name: p.name,
      jersey: p.jersey || null,
      sort_order: players.length + i,
    }));
    const { data, error } = await supabase.from('players').insert(rows).select('id, name, jersey');
    if (error) { showToast('Could not add players'); return 0; }
    setPlayers((ps) => [...ps, ...data]);
    if (!selectedPlayerId && data.length > 0) setSelectedPlayerId(data[data.length - 1].id);
    return data.length;
  }

  async function removePlayer(id) {
    setPlayers((ps) => ps.filter((p) => p.id !== id));
    setEvents((es) => es.filter((e) => e.player_id !== id));
    if (selectedPlayerId === id) setSelectedPlayerId(null);
    await supabase.from('players').delete().eq('id', id);
  }

  async function logEvent(statKey, statLabel) {
    if (!selectedPlayerId) {
      showToast('Select a player first');
      return;
    }
    const { data, error } = await supabase
      .from('events')
      .insert({
        match_id: currentMatchId,
        player_id: selectedPlayerId,
        stat: statKey,
        stat_label: statLabel,
        clock: clock.trim() || null,
      })
      .select('id, player_id, stat, stat_label, clock')
      .single();
    if (error) { showToast('Could not log event'); return; }
    setEvents((es) => [...es, data]);
    flashButton(statKey);
  }

  function flashButton(key) {
    const btn = document.querySelector(`.stat-btn[data-key="${key}"]`);
    if (!btn) return;
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 220);
  }

  async function undoLast() {
    if (events.length === 0) { showToast('Nothing to undo'); return; }
    const last = events[events.length - 1];
    setEvents((es) => es.slice(0, -1));
    await supabase.from('events').delete().eq('id', last.id);
    showToast(`Removed: ${last.stat_label} — ${playerName(last.player_id)}`);
  }

  async function deleteEvent(id) {
    setEvents((es) => es.filter((e) => e.id !== id));
    await supabase.from('events').delete().eq('id', id);
  }

  async function clearMatch() {
    const ids = players.map((p) => p.id);
    setPlayers([]);
    setEvents([]);
    setSelectedPlayerId(null);
    if (ids.length > 0) {
      await supabase.from('players').delete().eq('match_id', currentMatchId);
    }
  }

  function exportCsv() {
    if (events.length === 0) { showToast('No events to export'); return; }
    let csv = 'Video Time,Player,Jersey,Stat\n';
    events.forEach((ev) => {
      const p = players.find((pl) => pl.id === ev.player_id);
      csv += `"${ev.clock || ''}","${(p ? p.name : 'Unknown').replace(/"/g, '""')}","${p ? p.jersey || '' : ''}","${ev.stat_label}"\n`;
    });
    csv += '\nTOTALS\nPlayer,Jersey,' + STAT_DEFS.map((s) => s.label).join(',') + '\n';
    players.forEach((p) => {
      csv += `"${p.name.replace(/"/g, '""')}","${p.jersey || ''}",` + STAT_DEFS.map((s) => countFor(p.id, s.key)).join(',') + '\n';
    });
    csv += '"Team total","",' + STAT_DEFS.map((s) => teamCount(s.key)).join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentMatch?.title || 'match').replace(/[^a-z0-9]+/gi, '_') + '_stats.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------- Keyboard shortcuts ----------

  const selectPlayerByIndex = useCallback((idx1based) => {
    const p = players[idx1based - 1];
    if (p) setSelectedPlayerId((cur) => (cur === p.id ? null : p.id));
  }, [players]);

  useEffect(() => {
    function handleDigitKey(digit) {
      if (pendingDigitRef.current === '1') {
        clearTimeout(pendingTimerRef.current);
        const num = parseInt('1' + digit, 10);
        pendingDigitRef.current = null;
        selectPlayerByIndex(num);
        return;
      }
      if (digit === '1' && players.length > 9) {
        pendingDigitRef.current = '1';
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = setTimeout(() => {
          pendingDigitRef.current = null;
          selectPlayerByIndex(1);
        }, 450);
        return;
      }
      if (digit === '0') return;
      selectPlayerByIndex(parseInt(digit, 10));
    }

    function onKeyDown(e) {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;

      if (/^[0-9]$/.test(e.key)) {
        handleDigitKey(e.key);
        return;
      }

      if (pendingDigitRef.current !== null) {
        clearTimeout(pendingTimerRef.current);
        const num = parseInt(pendingDigitRef.current, 10);
        pendingDigitRef.current = null;
        selectPlayerByIndex(num);
      }

      const lower = e.key.toLowerCase();
      const stat = STAT_DEFS.find((s) => s.shortcut === lower);
      if (stat) logEvent(stat.key, stat.label);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, selectedPlayerId, clock, currentMatchId]);

  // ---------- Derived data ----------

  const metrics = useMemo(() => {
    const tackle = teamCount('tackle'), missed = teamCount('missed_tackle');
    const ownLoWon = teamCount('own_lineout_won'), ownLoLost = teamCount('own_lineout_lost');
    const defLoWon = teamCount('def_lineout_won'), defLoLost = teamCount('def_lineout_lost');
    const ownScWon = teamCount('own_scrum_won'), ownScLost = teamCount('own_scrum_lost');
    const defScWon = teamCount('def_scrum_won'), defScLost = teamCount('def_scrum_lost');
    return [
      { label: 'Tackle success', value: pct(tackle, tackle + missed), sub: `${tackle}/${tackle + missed} made` },
      { label: 'Own lineout won', value: pct(ownLoWon, ownLoWon + ownLoLost), sub: `${ownLoWon}/${ownLoWon + ownLoLost} retained` },
      { label: 'Defence lineout steal', value: pct(defLoWon, defLoWon + defLoLost), sub: `${defLoWon}/${defLoWon + defLoLost} contested` },
      { label: 'Own scrum won', value: pct(ownScWon, ownScWon + ownScLost), sub: `${ownScWon}/${ownScWon + ownScLost} retained` },
      { label: 'Defence scrum steal', value: pct(defScWon, defScWon + defScLost), sub: `${defScWon}/${defScWon + defScLost} contested` },
      { label: 'Turnover differential', value: teamCount('turnover_won') - teamCount('turnover_lost'), isRaw: true, sub: `${teamCount('turnover_won')} won / ${teamCount('turnover_lost')} conceded` },
      { label: 'Discipline', value: teamCount('penalty_conceded') + teamCount('card'), isRaw: true, sub: `${teamCount('penalty_conceded')} penalties, ${teamCount('card')} cards` },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const dashboardRows = useMemo(() => {
    function sorted(fn) {
      return [...players].map((p) => ({ name: p.name, value: fn(p) })).sort((a, b) => b.value - a.value);
    }
    return {
      carries: sorted((p) => countFor(p.id, 'carry')),
      tackles: sorted((p) => countFor(p.id, 'tackle')),
      tries: sorted((p) => countFor(p.id, 'try')),
      errors: sorted((p) => ERROR_KEYS.reduce((sum, k) => sum + countFor(p.id, k), 0)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, events]);

  const timeline = useMemo(() => {
    const grid = {};
    GROUP_ORDER.forEach((g) => { grid[g] = new Array(BUCKETS.length).fill(0); });
    let unbucketed = 0;
    events.forEach((ev) => {
      const def = STAT_DEFS.find((s) => s.key === ev.stat);
      const g = def?.group;
      const mins = parseClockMinutes(ev.clock);
      const bi = bucketIndex(mins);
      if (bi === -1 || !g) { unbucketed++; return; }
      grid[g][bi]++;
    });
    let maxVal = 1;
    GROUP_ORDER.forEach((g) => grid[g].forEach((v) => { maxVal = Math.max(maxVal, v); }));
    return { grid, maxVal, unbucketed };
  }, [events]);

  if (loading) return <div className="wrap"><p className="empty">Loading your matches…</p></div>;

  return (
    <div className="wrap">
      <div className="field-lines">
        <input
          className="match-title-input"
          value={currentMatch?.title || ''}
          onChange={(e) => renameMatch(e.target.value)}
          spellCheck={false}
        />
        <div className="sub">Tag stats as you watch. Pick a player, then tap what they did — everything saves to your account.</div>
        <div className="clock-row">
          <label>Video time</label>
          <input className="clock" type="text" placeholder="12:34" maxLength={8} value={clock} onChange={(e) => setClock(e.target.value)} />
          <span style={{ fontSize: '0.8rem', color: 'var(--paper-dim)' }}>optional — stamps each event and drives the timeline</span>
        </div>
        <div className="match-bar">
          <label>Match</label>
          <select value={currentMatchId || ''} onChange={(e) => setCurrentMatchId(e.target.value)}>
            {matches.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
          <button className="btn-ghost small" onClick={() => setModal({
            type: 'prompt', message: 'Name this match:', defaultValue: 'New match',
            onConfirm: (v) => createMatch((v || '').trim() || 'New match'),
          })}>New match</button>
          <button className="btn-ghost small danger" onClick={() => setModal({
            type: 'confirm', message: `Delete "${currentMatch?.title}" and all its logged data?`,
            onConfirm: () => deleteMatch(),
          })}>Delete match</button>
          <button className="btn-ghost small" style={{ marginLeft: 'auto' }} onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </div>

      <div className="panel">
        <h2>Roster</h2>
        <div className="roster">
          {players.length === 0 && <div className="empty">No players yet — add your first below.</div>}
          {players.map((p, i) => (
            <div key={p.id} className={'chip' + (selectedPlayerId === p.id ? ' active' : '')}
              onClick={() => setSelectedPlayerId((cur) => (cur === p.id ? null : p.id))}>
              <span className="idx">{i < 19 ? i + 1 : ''}</span>
              <span>{p.name}</span>
              {p.jersey && <span className="jersey">#{p.jersey}</span>}
              <span className="rm" onClick={(e) => {
                e.stopPropagation();
                setModal({
                  type: 'confirm', message: 'Remove this player and their logged events?',
                  onConfirm: () => removePlayer(p.id),
                });
              }}>✕</span>
            </div>
          ))}
        </div>
        <div className="add-player">
          <input className="name" placeholder="Player name" value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { addPlayer(newName.trim(), newJersey.trim()); setNewName(''); setNewJersey(''); } }} />
          <input className="jersey" placeholder="No." maxLength={3} value={newJersey} onChange={(e) => setNewJersey(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { addPlayer(newName.trim(), newJersey.trim()); setNewName(''); setNewJersey(''); } }} />
          <button className="btn-primary" onClick={() => {
            if (!newName.trim()) return;
            addPlayer(newName.trim(), newJersey.trim());
            setNewName(''); setNewJersey('');
          }}>Add player</button>
          <button className="btn-ghost small" onClick={() => setBulkOpen((o) => !o)}>Add multiple</button>
        </div>
        {bulkOpen && (
          <div className="bulk-add">
            <textarea rows={5} placeholder={'One player per line, e.g.\n9 Jamie Reid\n15 Alex Kim\nSam Doyle'}
              value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
            <p className="bulk-hint">A leading or trailing number is read as the jersey number — names on their own are fine too.</p>
            <div className="bulk-actions">
              <button className="btn-primary" onClick={async () => {
                const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
                const added = await addPlayersBulk(lines);
                setBulkText(''); setBulkOpen(false);
                showToast(`Added ${added} player${added === 1 ? '' : 's'}`);
              }}>Add list</button>
              <button className="btn-ghost" onClick={() => { setBulkText(''); setBulkOpen(false); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Log an action</h2>
        <div className="selected-hint">
          {selectedPlayerId
            ? <>Tagging for <b>{playerName(selectedPlayerId)}</b> — tap an action or press its letter.</>
            : 'Select a player above to start tagging.'}
        </div>
        <div className="kbd-tip">
          Press <span className="kbd">1</span>–<span className="kbd">19</span> to pick a player (numbers on the roster chips — for 10–19, tap the first digit then the second quickly), then the letter shown on each action below.
        </div>
        <div className="stat-groups">
          {GROUP_ORDER.map((g) => (
            <div className={'stat-group ' + g} key={g}>
              <h3>{GROUP_LABELS[g]}</h3>
              {STAT_DEFS.filter((s) => s.group === g).map((s) => (
                <button key={s.key} className="stat-btn" data-key={s.key} onClick={() => logEvent(s.key, s.label)}>
                  <span className="left"><span className="kbd">{s.shortcut.toUpperCase()}</span><span>{s.label}</span></span>
                  <span className="count">{selectedPlayerId ? countFor(selectedPlayerId, s.key) : 0}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="tabs">
          {['main', 'log'].map((t) => (
            <button key={t} className={'tab-btn' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>
              {t === 'log' ? 'Event log' : 'Main'}
            </button>
          ))}
        </div>

        {tab === 'main' && (
          <div className="main-tab">
            <h3 className="section-heading">Totals</h3>
            <div className="table-scroll">
              <table className="totals">
                <thead>
                  <tr><th style={{ textAlign: 'left' }}>Player</th>{STAT_DEFS.map((s) => <th key={s.key}>{s.label}</th>)}</tr>
                </thead>
                <tbody>
                  {players.length === 0 && <tr><td className="empty" style={{ textAlign: 'left' }}>Add players to see totals.</td></tr>}
                  {players.map((p) => (
                    <tr key={p.id}>
                      <td className="name">{p.name}{p.jersey && <span style={{ color: 'var(--paper-dim)', fontWeight: 400 }}> #{p.jersey}</span>}</td>
                      {STAT_DEFS.map((s) => <td key={s.key}>{countFor(p.id, s.key)}</td>)}
                    </tr>
                  ))}
                  {players.length > 0 && (
                    <tr className="team-row">
                      <td className="name">Team total</td>
                      {STAT_DEFS.map((s) => <td key={s.key}>{teamCount(s.key)}</td>)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <h3 className="section-heading">Dashboard</h3>
            {players.length === 0 ? (
              <p className="timeline-note">Add players and log some events to see the charts.</p>
            ) : (
              <div className="dashboard-grid">
                {[
                  ['Carries by player', dashboardRows.carries],
                  ['Tackles by player', dashboardRows.tackles],
                  ['Tries by player', dashboardRows.tries],
                  ['Errors by player', dashboardRows.errors],
                ].map(([title, rows]) => {
                  const maxVal = Math.max(1, ...rows.map((r) => r.value));
                  return (
                    <div className="chart-card" key={title}>
                      <h3>{title}</h3>
                      <div className="chart-holder">
                        {rows.map((r) => (
                          <div className="bar-row" key={r.name}>
                            <span className="bar-label" title={r.name}>{r.name}</span>
                            <span className="bar-track">
                              <span className="bar-fill" style={{ width: `${Math.round((r.value / maxVal) * 100)}%`, background: r.value > 0 ? 'var(--red)' : 'transparent' }} />
                            </span>
                            <span className="bar-value">{r.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <h3 className="section-heading">Metrics</h3>
            <div className="metrics-grid">
              {metrics.map((c) => (
                <div className="metric-card" key={c.label}>
                  <div className="big">{c.value === null ? '–' : c.isRaw ? (c.value > 0 ? '+' : '') + c.value : c.value + '%'}</div>
                  <div className="lbl">{c.label}</div>
                  <div className="sub">{c.sub}</div>
                </div>
              ))}
            </div>

            <h3 className="section-heading">Timeline</h3>
            {events.length === 0 ? (
              <p className="timeline-note">Log some events with a video time to see the timeline.</p>
            ) : (
              <>
                <div className="timeline-scroll">
                  <table className="timeline">
                    <thead>
                      <tr><th className="row-label"></th>{BUCKETS.map((b) => <th key={b}>{b}</th>)}</tr>
                    </thead>
                    <tbody>
                      {GROUP_ORDER.map((g) => (
                        <tr key={g}>
                          <td className="row-label">{GROUP_LABELS[g]}</td>
                          {timeline.grid[g].map((v, i) => {
                            const opacity = v === 0 ? 0 : 0.18 + 0.72 * (v / timeline.maxVal);
                            return (
                              <td key={i}>
                                <div className="heat-cell" style={{ background: `rgba(226,43,61,${opacity.toFixed(2)})` }} title={`${v} ${GROUP_LABELS[g]} event(s)`}>
                                  {v > 0 ? v : ''}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {timeline.unbucketed > 0 && (
                  <p className="timeline-note">{timeline.unbucketed} event(s) have no readable video time (mm:ss) and aren't shown here.</p>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'log' && (
          <ul className="log-list">
            {events.length === 0 && <div className="empty">No events logged yet.</div>}
            {[...events].reverse().map((ev) => (
              <li key={ev.id}>
                <span>
                  {ev.clock && <span className="meta">{ev.clock}</span>}{ev.clock && ' — '}
                  {playerName(ev.player_id)}
                  <span className="tag">{ev.stat_label}</span>
                </span>
                <button className="del" onClick={() => deleteEvent(ev.id)}>✕</button>
              </li>
            ))}
          </ul>
        )}

        <div className="footer-row" style={{ marginTop: 14 }}>
          <button className="btn-ghost" onClick={undoLast}>Undo last</button>
          <div className="right">
            <button className="btn-ghost" onClick={exportCsv}>Export CSV</button>
            <button className="btn-ghost" onClick={() => setModal({
              type: 'confirm', message: 'Clear all players and events for this match? This cannot be undone.',
              onConfirm: () => clearMatch(),
            })}>Clear this match</button>
          </div>
        </div>
      </div>

      <Modal modal={modal} onClose={() => setModal(null)} />
      {toastNode}
    </div>
  );
}

export default function App() {
  return <AuthGate>{(session) => <TrackerApp session={session} />}</AuthGate>;
}
