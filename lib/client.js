// Workgroup — live agent activity as a group chat.
// Two event-driven sources (session list, job roster) plus one poll of
// POST /sidebar/api/subagents.live that runs ONLY while something is working:
//   · the session list  (who exists / who is running / titles / lineage)
//   · the client jobs service (background tasks, folded onto their owner)
//   · POST /sidebar/api/subagents.live  (per-child live fold: tool + latest text)
// Nothing is written to disk and nothing is polled when the panel is idle or
// its page is hidden, so an idle tab costs zero requests.
window.__ModuleLoader__.load({ id: 'dsh-group-tab', factory: (require) => {
  'use strict'
  var module = { exports: {} }
  var exports = module.exports

  const React = require('react')
  const h = React.createElement

  const TAB_ID = 'dsh-group-tab:group'
  const POLL_MS = 2000
  const MAX_FEED = 200
  const DONE_KEEP_MS = 20000
  const LS_STARTED = 'dsh-workgroup:started'
  const LS_DURATIONS = 'dsh-workgroup:durations'
  const LS_AUTOOPEN_OFF = 'dsh-workgroup:autoopen-off'
  const LS_SOUND_ON = 'dsh-workgroup:sound'
  const EMPTY_JOBS = { rows: {}, observed: {} }
  const MODEL_TTL_MS = 30000

  // ---------- language ----------
  // The panel follows the browser language, defaulting to Chinese when it
  // cannot tell (the DSH desktop shell on this machine is zh-CN). No locale
  // service dependency: one dictionary, one lookup.
  const STRINGS = {
    zh: {
      title: '工作群',
      subtitle: '谁在干活、现在做到哪、还要多久',
      refresh: '立即刷新',
      soundOn: '关闭完成提示音',
      soundOff: '打开完成提示音',
      openDetail: '展开看细节',
      closeDetail: '收起',
      elapsedHint: '从面板第一次看到它开始计时',
      basisHistory: '按本机历史中位估算',
      basisPrior: '按经验值（3 分钟）估算',
      etaUnknown: '时长未知',
      etaLeft: (ms) => '剩余 ~' + ms,
      etaLate: (ms) => '超预估 +' + ms,
      used: (ms) => '用时 ' + ms,
      running: '运行中',
      ended: '已结束',
      ranFor: (ms) => '已跑 ' + ms,
      aboutLeft: (ms) => '约剩 ~' + ms,
      beyond: (ms) => '超预估 +' + ms,
      model: '模型',
      status: '状态',
      now: '现在',
      jobsTitle: '后台任务',
      recent: '最近',
      noModelCall: '还没有发起过模型调用',
      noTool: '没有在跑工具（在等模型 / 在思考）',
      dash: '—',
      thinking: '思考中…',
      toolFallback: '用工具',
      rootName: '主代理',
      childName: (id) => '子代理 ' + id,
      waitTitle: '在等你回答 / 等审批',
      jumpTitle: '在右侧栏打开这个子代理的会话',
      runningCount: (n) => n + ' 个成员在干活',
      idleCount: '没有人在干活',
      awaitingCount: (n) => n + ' 个在等你',
      jobsCount: (n) => n + ' 个后台任务',
      syncNone: '等待数据',
      syncJust: '刚刚同步',
      syncAgo: (n) => n + ' 秒前同步',
      untitled: '当前对话',
      members: 'MEMBERS · 成员',
      membersCount: (running, total) => running + ' 在跑 / ' + total,
      emptyTitle: '群里还很安静',
      emptyDesc1: '主代理或子代理开始干活时，会自动出现在这里，带着进度和「还剩多久」。',
      emptyDesc2: '页面在右侧栏 ＋ 菜单里，和「任务管理」并列。点一行可以展开看细节。',
      apiError: '实时接口失败：',
      connectError: '连不上宿主：',
      footerLive: 'LIVE · 2s',
      footerIdle: 'LIVE · 空闲不轮询',
      footerHint: '点一行展开细节',
      feedStart: '开始干活',
      feedEnd: (ms) => '收工 · 用时 ' + ms,
      feedJobStart: (label) => '起了后台任务 · ' + label,
      feedJobEnd: (label, ms) => '后台任务结束 · ' + label + ' · 用时 ' + ms,
      activity: {
        read: '读文件', readImage: '看图', search: '搜文件', write: '写文件', edit: '改文件',
        commands: '跑命令', code: '跑代码', webSearch: '搜网页', webFetch: '抓网页',
        subagents: '派子代理', plan: '列计划', questions: '等你回答', tools: '用工具'
      },
      jobStatus: { running: '运行中', stopping: '停止中', completed: '已完成', killed: '已终止', failed: '失败' }
    },
    en: {
      title: 'Workgroup',
      subtitle: 'Who is working, what they are doing, how long is left',
      refresh: 'Refresh now',
      soundOn: 'Mute the finish chime',
      soundOff: 'Unmute the finish chime',
      openDetail: 'Expand details',
      closeDetail: 'Collapse',
      elapsedHint: 'Timed from the first time the panel saw it',
      basisHistory: 'from this machine’s median',
      basisPrior: 'from a 3-minute prior',
      etaUnknown: 'no estimate yet',
      etaLeft: (ms) => '~' + ms + ' left',
      etaLate: (ms) => '+' + ms + ' over',
      used: (ms) => ms + ' total',
      running: 'running',
      ended: 'finished',
      ranFor: (ms) => ms + ' elapsed',
      aboutLeft: (ms) => '~' + ms + ' left',
      beyond: (ms) => '+' + ms + ' over',
      model: 'Model',
      status: 'Status',
      now: 'Now',
      jobsTitle: 'Background jobs',
      recent: 'Recent',
      noModelCall: 'no model call yet',
      noTool: 'no tool running (waiting on the model)',
      dash: '—',
      thinking: 'thinking…',
      toolFallback: 'tool',
      rootName: 'Main agent',
      childName: (id) => 'Subagent ' + id,
      waitTitle: 'Waiting for your answer / approval',
      jumpTitle: 'Open this subagent’s session in the sidebar',
      runningCount: (n) => n + ' working',
      idleCount: 'nobody is working',
      awaitingCount: (n) => n + ' waiting on you',
      jobsCount: (n) => n + ' background job' + (n === 1 ? '' : 's'),
      syncNone: 'waiting for data',
      syncJust: 'synced just now',
      syncAgo: (n) => 'synced ' + n + 's ago',
      untitled: 'this conversation',
      members: 'MEMBERS',
      membersCount: (running, total) => running + ' running / ' + total,
      emptyTitle: 'The group is quiet',
      emptyDesc1: 'As soon as the main agent or a subagent starts working it shows up here with progress and an ETA.',
      emptyDesc2: 'Find the page under ＋ in the right sidebar, next to Tasks. Click a row to expand it.',
      apiError: 'Live endpoint failed: ',
      connectError: 'cannot reach the host: ',
      footerLive: 'LIVE · 2s',
      footerIdle: 'LIVE · idle, no polling',
      footerHint: 'click a row to expand',
      feedStart: 'started working',
      feedEnd: (ms) => 'done · ' + ms,
      feedJobStart: (label) => 'started a background job · ' + label,
      feedJobEnd: (label, ms) => 'background job finished · ' + label + ' · ' + ms,
      activity: {
        read: 'read', readImage: 'view image', search: 'search', write: 'write', edit: 'edit',
        commands: 'command', code: 'run code', webSearch: 'web search', webFetch: 'fetch web',
        subagents: 'delegate', plan: 'plan', questions: 'waiting on you', tools: 'tool'
      },
      jobStatus: { running: 'running', stopping: 'stopping', completed: 'done', killed: 'killed', failed: 'failed' }
    }
  }

  function detectLang() {
    try {
      const nav = typeof navigator === 'undefined' ? '' : String(navigator.language || '')
      if (nav === '') return 'zh'
      return /^zh/i.test(nav) ? 'zh' : 'en'
    } catch (error) { return 'zh' }
  }

  const LANG = detectLang()
  const T = STRINGS[LANG] || STRINGS.zh
  const ACTIVITY_LABEL = T.activity
  const JOB_STATUS_TEXT = T.jobStatus

  // ---------- utils ----------
  function pad2(n) { return n < 10 ? '0' + n : '' + n }
  function fmtDur(ms) {
    const total = Math.max(0, Math.floor((ms || 0) / 1000))
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor(total / 60) % 60
    const seconds = total % 60
    return hours > 0 ? hours + ':' + pad2(minutes) + ':' + pad2(seconds) : minutes + ':' + pad2(seconds)
  }
  function fmtClock(t) {
    const d = new Date(t)
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
  }
  function clean(text, max) {
    const flat = String(text == null ? '' : text).replace(/\s+/g, ' ').trim()
    return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
  }
  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw == null) return fallback
      const value = JSON.parse(raw)
      return value !== null && typeof value === 'object' ? value : fallback
    } catch (error) { return fallback }
  }
  function writeJson(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)) } catch (error) { /* private mode */ }
  }
  function readFlag(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key)
      return raw == null ? fallback : raw === '1'
    } catch (error) { return fallback }
  }
  function writeFlag(key, value) {
    try { window.localStorage.setItem(key, value ? '1' : '0') } catch (error) { /* private mode */ }
  }

  // A short two-tone chime when a subagent finishes. Web Audio keeps the
  // plugin asset-free; a browser without it (or a blocked context) stays silent.
  let audioCtx = null
  function chime() {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext
      if (!Ctor) return
      if (audioCtx === null) audioCtx = new Ctor()
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') audioCtx.resume()
      const at = audioCtx.currentTime
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(784, at)
      osc.frequency.setValueAtTime(1046, at + 0.1)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.05, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start(at)
      osc.stop(at + 0.3)
    } catch (error) { /* no audio, no problem */ }
  }
  function median(list) {
    if (!Array.isArray(list) || list.length === 0) return 0
    const sorted = list.slice().sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  }
  function hashHue(text) {
    let hash = 0
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360
    return hash
  }
  function activityText(summary) {
    if (!summary) return null
    if (summary.preparing) return T.thinking
    if (summary.running) {
      const label = ACTIVITY_LABEL[summary.running] || T.toolFallback
      const detail = summary.runningDetail ? clean(summary.runningDetail, 78) : ''
      return detail === '' ? label : label + ' · ' + detail
    }
    return null
  }

  // ---------- lineage ----------
  function rootOf(byId, sessionId) {
    let current = byId[sessionId]
    const seen = new Set()
    while (current && current.origin === 'subagent' && current.parentId && !seen.has(current.id)) {
      seen.add(current.id)
      const parent = byId[current.parentId]
      if (!parent) return current.parentId
      current = parent
    }
    return current ? current.id : sessionId
  }
  function inTree(byId, sessionId, rootId) {
    if (sessionId === rootId) return true
    let current = byId[sessionId]
    const seen = new Set()
    while (current && current.origin === 'subagent' && current.parentId && !seen.has(current.id)) {
      if (current.parentId === rootId) return true
      seen.add(current.id)
      current = byId[current.parentId]
    }
    return false
  }
  function isSideThread(summary) {
    return String((summary && summary.displayTitle) || '').slice(0, 6) === 'Side: '
  }

  // ---------- wire ----------
  // better-sidebar's hostRouteUrl resolves against the page base (reverse-proxy
  // prefixes and the desktop shell's dsh-app:// origin included); the DOM base is
  // the fallback when an older sidebar has no such helper.
  function makeResolver(ctx) {
    const sidebar = ctx.get('betterSidebar')
    if (sidebar && typeof sidebar.hostRouteUrl === 'function') {
      return function (method) { return sidebar.hostRouteUrl('sidebar/api/' + method) }
    }
    return function (method) { return new URL('sidebar/api/' + method, window.document.baseURI).href }
  }
  async function callApi(url, payload) {
    let response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {})
      })
    } catch (error) {
      throw new Error(T.connectError + String((error && error.message) || error))
    }
    let parsed = null
    try { parsed = await response.json() } catch (error) { parsed = null }
    if (!response.ok || parsed === null || parsed.ok !== true) {
      const message = (parsed && parsed.error && parsed.error.message) || ('HTTP ' + response.status)
      throw new Error(message)
    }
    return parsed.value
  }

  // ---------- hooks ----------
  function useSessionList(ctx) {
    return React.useSyncExternalStore(
      React.useCallback(function (callback) {
        const service = ctx.get('sessions')
        return service && service.list ? service.list.subscribe(callback) : function () {}
      }, [ctx]),
      React.useCallback(function () {
        const service = ctx.get('sessions')
        return (service && service.list && service.list.getSnapshot()) || null
      }, [ctx])
    )
  }

  // Hidden browser tab? Then the panel is invisible too and must not poll.
  function usePageVisible() {
    const read = function () {
      return typeof document === 'undefined' || !document.visibilityState || document.visibilityState !== 'hidden'
    }
    const [value, setValue] = React.useState(read)
    React.useEffect(function () {
      if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined
      const onChange = function () { setValue(read()) }
      document.addEventListener('visibilitychange', onChange)
      return function () { document.removeEventListener('visibilitychange', onChange) }
    }, [])
    return value
  }

  function useJobs(ctx) {
    const service = React.useMemo(function () {
      const candidate = ctx.get('jobs')
      if (!candidate || !candidate.state || typeof candidate.state.subscribe !== 'function') return null
      if (typeof candidate.watchRows !== 'function') return null
      return candidate
    }, [ctx])
    const snapshot = React.useSyncExternalStore(
      React.useCallback(function (callback) { return service ? service.state.subscribe(callback) : function () {} }, [service]),
      React.useCallback(function () { return service ? service.state.getSnapshot() : EMPTY_JOBS }, [service])
    )
    return [service, snapshot || EMPTY_JOBS]
  }

  // ---------- styles ----------
  const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace'
  const CSS = [
    '.wg-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}',
    '.wg-head{flex:none;padding:9px 12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
    '.wg-head-row{display:flex;align-items:center;gap:6px;min-width:0}',
    '.wg-head-icon{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary)}',
    '.wg-head-title{font-size:12.5px;font-weight:600;white-space:nowrap;flex:none}',
    '.wg-crumb{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-family:' + MONO + ';font-size:10.5px}',
    '.wg-iconbtn{margin-left:auto;flex:none;width:22px;height:22px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}',
    '.wg-iconbtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}',
    '.wg-head-meta{margin-top:5px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:10.5px}',
    '.wg-live{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}',
    '.wg-live.on{background:var(--dsw-alias-state-success-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,transparent)}',
    '.wg-live.err{background:var(--dsw-alias-state-error-primary)}',
    '.wg-sep{opacity:.45}',
    '.wg-body{flex:1;min-height:0;overflow:auto;padding:0 12px 14px;scroll-behavior:smooth}',
    '.wg-sec{display:flex;align-items:center;gap:6px;margin:12px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:600;letter-spacing:.09em;text-transform:uppercase}',
    '.wg-sec-count{margin-left:auto;font-weight:500;letter-spacing:0;text-transform:none;font-size:10.5px}',
    '.wg-card{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:8px 10px;margin-bottom:6px;min-width:0}',
    '.wg-card.run{box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}',
    '.wg-card.done{opacity:.7}',
    '.wg-card:hover{border-color:var(--dsw-alias-border-l2)}',
    '.wg-card-row{display:flex;align-items:center;gap:6px;min-width:0}',
    '.wg-status{position:relative;width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-state-success-primary)}',
    '.wg-status.run{background:var(--dsw-alias-brand-primary)}',
    '.wg-status.run:after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--dsw-alias-brand-primary);opacity:.4;animation:wg-pulse 1.6s ease-out infinite}',
    '@keyframes wg-pulse{0%{transform:scale(.6);opacity:.55}70%{transform:scale(1.35);opacity:0}100%{opacity:0}}',
    '.wg-name{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
    '.wg-chip{flex:none;font-size:10px;line-height:1.6;padding:0 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
    '.wg-chip.on{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 42%,transparent);color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent)}',
    '.wg-spacer{flex:1;min-width:4px}',
    '.wg-elapsed{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);font-family:' + MONO + ';font-variant-numeric:tabular-nums}',
    '.wg-detail{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:' + MONO + '}',
    '.wg-new{color:var(--dsw-alias-state-success-primary);font-family:inherit;font-weight:600}',
    '.wg-card-foot{margin-top:7px;display:flex;align-items:center;gap:8px}',
    '.wg-bar{position:relative;flex:1;height:4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);overflow:hidden}',
    '.wg-bar>i{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width .5s linear}',
    '.wg-bar.done>i{background:var(--dsw-alias-state-success-primary)}',
    '.wg-bar.unknown>i{width:100%;background:repeating-linear-gradient(90deg,var(--dsw-alias-brand-primary) 0 4px,transparent 4px 10px);opacity:.34;animation:wg-slide 2.4s linear infinite}',
    '@keyframes wg-slide{0%{transform:translateX(0)}100%{transform:translateX(10px)}}',
    '.wg-eta{flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;font-family:' + MONO + ';font-variant-numeric:tabular-nums}',
    '.wg-jobs{margin-top:6px;padding-top:5px;border-top:1px dashed var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:3px}',
    '.wg-jobs-title{font-size:9.5px;color:var(--dsw-alias-label-tertiary);text-transform:uppercase;letter-spacing:.08em}',
    '.wg-job{display:flex;align-items:center;gap:5px;min-width:0;font-size:10.5px;color:var(--dsw-alias-label-tertiary)}',
    '.wg-job-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:' + MONO + '}',
    '.wg-job-state{flex:none;color:var(--dsw-alias-label-tertiary);font-family:' + MONO + ';font-variant-numeric:tabular-nums}',
    '.wg-tl{margin-top:2px}',
    '.wg-row2{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);margin-bottom:6px;overflow:hidden}',
    '.wg-row2.run{box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}',
    '.wg-row2.open{border-color:var(--dsw-alias-border-l2)}',
    '.wg-row2:hover{border-color:var(--dsw-alias-border-l2)}',
    '.wg-rhead{display:flex;align-items:center;gap:6px;width:100%;padding:7px 9px 0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;min-width:0}',
    '.wg-chev{flex:none;display:inline-flex;color:var(--dsw-alias-label-tertiary);transition:transform .15s ease}',
    '.wg-row2.open .wg-chev{transform:rotate(90deg)}',
    '.wg-model{flex:0 1 auto;min-width:0;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:' + MONO + ';font-size:9.5px;line-height:1.6;color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l1);border-radius:4px;padding:0 4px}',
    '.wg-now{display:flex;align-items:baseline;gap:8px;padding:1px 9px 0 9px;min-width:0}',
    '.wg-now-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:' + MONO + '}',
    '.wg-barwrap{padding:6px 9px 8px}',
    '.wg-open{padding:2px 9px 10px;border-top:1px solid var(--dsw-alias-border-l1);margin-top:7px}',
    '.wg-kv{display:grid;grid-template-columns:30px minmax(0,1fr);gap:3px 8px;margin-top:6px;font-size:10.5px;color:var(--dsw-alias-label-tertiary)}',
    '.wg-kv span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}',
    '.wg-kv span.wg-wrap{white-space:normal;line-height:1.5}',
    '.wg-kv .mono{font-family:' + MONO + ';font-size:10px}',
    '.wg-events{display:flex;flex-direction:column;gap:3px;margin-top:9px}',
    '.wg-time-sm{flex:none;width:32px;font-family:' + MONO + ';font-size:9.5px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
    '.wg-line{display:flex;align-items:flex-start;gap:5px;margin-top:3px;min-width:0}',
    '.wg-line-icon{flex:none;margin-top:1.5px;color:var(--dsw-alias-label-tertiary);display:inline-flex}',
    '.wg-line-text{min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-word;line-height:1.5}',
    '.wg-line-text.mono{font-family:' + MONO + ';font-size:10.5px}',
    '.wg-bub{margin-top:3px;padding:5px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-secondary);word-break:break-word}',
    '.wg-wait{flex:none;display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border-radius:50%;background:var(--dsw-alias-state-error-primary);color:#fff;font-size:9px;font-weight:700;line-height:1}',
    '.wg-row2.wait{box-shadow:inset 2px 0 0 var(--dsw-alias-state-error-primary)}',
    '.wg-jumpbtn{width:18px;height:18px;margin-left:2px;opacity:.45}',
    '.wg-rhead:hover .wg-jumpbtn,.wg-jumpbtn:focus-visible{opacity:1}',
    '.wg-empty{display:flex;flex-direction:column;align-items:center;gap:9px;padding:44px 14px 20px;text-align:center;color:var(--dsw-alias-label-tertiary)}',
    '.wg-empty-art{opacity:.55;color:var(--dsw-alias-label-secondary)}',
    '.wg-empty-t{font-size:12px;color:var(--dsw-alias-label-secondary);font-weight:600}',
    '.wg-empty-d{font-size:11px;line-height:1.75;max-width:252px}',
    '.wg-key{font-family:' + MONO + ';font-size:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:4px;padding:0 4px;color:var(--dsw-alias-label-secondary)}',
    '.wg-foot{flex:none;padding:6px 12px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:10px;display:flex;align-items:center;gap:6px;font-family:' + MONO + '}'
  ].join('\n')

  function ensureCss() {
    if (typeof document === 'undefined') return
    if (document.getElementById('dsh-workgroup-css')) return
    const tag = document.createElement('style')
    tag.id = 'dsh-workgroup-css'
    tag.textContent = CSS
    document.head.appendChild(tag)
  }

  // ---------- icons ----------
  // Chunky glyphs: fills read better than 1px strokes at 11–14px.
  function Svg(props) {
    return React.createElement('svg', {
      width: props.size || 12,
      height: props.size || 12,
      viewBox: props.viewBox || '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: props.weight || 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true'
    }, props.children)
  }

  function Glyph(props) {
    const size = props.size || 12
    const name = props.name
    if (name === 'play') return h(Svg, { size }, React.createElement('path', { d: 'M5.2 3.4 12.4 8l-7.2 4.6z', fill: 'currentColor', stroke: 'none' }))
    if (name === 'dot') return h(Svg, { size }, React.createElement('circle', { cx: 8, cy: 8, r: 2.8, fill: 'currentColor', stroke: 'none' }))
    if (name === 'bolt') return h(Svg, { size }, React.createElement('path', { d: 'M9.2 1.6 3.6 9.1h3.5l-.9 5.3 5.9-7.8H8.4z', fill: 'currentColor', stroke: 'none' }))
    if (name === 'bars') {
      return h(Svg, { size },
        React.createElement('rect', { x: 2.6, y: 8.6, width: 2.6, height: 4.6, rx: 1, fill: 'currentColor', stroke: 'none' }),
        React.createElement('rect', { x: 6.7, y: 3.2, width: 2.6, height: 10, rx: 1, fill: 'currentColor', stroke: 'none' }),
        React.createElement('rect', { x: 10.8, y: 6.2, width: 2.6, height: 7, rx: 1, fill: 'currentColor', stroke: 'none' }))
    }
    if (name === 'terminal') {
      return h(Svg, { size },
        React.createElement('path', { d: 'M3.2 4.6 6.4 8l-3.2 3.4' }),
        React.createElement('path', { d: 'M8.6 11.4h4.2' }))
    }
    if (name === 'check') return h(Svg, { size }, React.createElement('path', { d: 'M3.2 8.6 6.2 11.6 12.8 4.8' }))
    if (name === 'chevron') return h(Svg, { size }, React.createElement('path', { d: 'M6.2 3.6 11 8l-4.8 4.4z', fill: 'currentColor', stroke: 'none' }))
    if (name === 'jump') {
      return h(Svg, { size },
        React.createElement('path', { d: 'M5.4 10.6 10.8 5.2' }),
        React.createElement('path', { d: 'M6.6 5h4.2v4.2' }))
    }
    if (name === 'bell') {
      return h(Svg, { size },
        React.createElement('path', { d: 'M4.2 10.6V7.4a3.8 3.8 0 0 1 7.6 0v3.2l1 1.4H3.2z' }),
        React.createElement('path', { d: 'M6.8 13.2a1.4 1.4 0 0 0 2.4 0' }))
    }
    if (name === 'bell-off') {
      return h(Svg, { size },
        React.createElement('path', { d: 'M4.2 10.6V7.4a3.8 3.8 0 0 1 5.4-3.5' }),
        React.createElement('path', { d: 'M10.4 8.2v2.4l1 1.4H3.2l1-1.4' }),
        React.createElement('path', { d: 'M2.4 2.4l11.2 11.2' }))
    }
    if (name === 'x') return h(Svg, { size }, React.createElement('path', { d: 'M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2' }))
    if (name === 'refresh') {
      return h(Svg, { size },
        React.createElement('path', { d: 'M13.2 8a5.2 5.2 0 1 1-1.6-3.8' }),
        React.createElement('path', { d: 'M13.4 2.6v3.2h-3.2' }))
    }
    if (name === 'users') {
      return h(Svg, { size, weight: 1.5 },
        React.createElement('circle', { cx: 6, cy: 6, r: 2.2 }),
        React.createElement('path', { d: 'M2.4 13c0-2 1.6-3.2 3.6-3.2s3.6 1.2 3.6 3.2' }),
        React.createElement('path', { d: 'M10.8 4.2a2 2 0 0 1 0 3.8' }),
        React.createElement('path', { d: 'M11.4 9.9c1.4.3 2.2 1.4 2.2 3.1' }))
    }
    if (name === 'inbox') {
      return h(Svg, { size, weight: 1.5 },
        React.createElement('path', { d: 'M2.6 8.8h3l1 1.7h3l1-1.7h3' }),
        React.createElement('path', { d: 'M2.6 8.8V5.2a1.4 1.4 0 0 1 1.4-1.4h8a1.4 1.4 0 0 1 1.4 1.4v3.6a2 2 0 0 1-2 2H4.6a2 2 0 0 1-2-2z' }))
    }
    return h(Svg, { size }, React.createElement('path', { d: 'M3.2 8h9.6' }))
  }

  // ---------- members ----------

  const LINE_ICON = {
    hello: 'inbox',
    start: 'play',
    tool: 'bolt',
    job: 'terminal',
    progress: 'bars',
    jobend: 'check',
    end: 'check'
  }

  function modelLabel(model) {
    if (!model || !model.model) return null
    return model.model
  }

  // Waiting for the user first, then running, then finished: the one member
  // that blocks the tree should never be buried under finished rows.
  function orderMembers(members) {
    return members.slice().sort(function (a, b) {
      if (Boolean(a.awaiting) !== Boolean(b.awaiting)) return a.awaiting ? -1 : 1
      if (Boolean(a.running) !== Boolean(b.running)) return a.running ? -1 : 1
      return 0
    })
  }

  function EntryLine(props) {
    const entry = props.entry
    if (entry.kind === 'say') return h('div', { className: 'wg-bub', key: entry.id }, entry.text)
    const mono = entry.kind === 'tool' || entry.kind === 'job' || entry.kind === 'progress'
    const failed = entry.kind === 'jobend' && entry.fail === true
    return h('div', { className: 'wg-line', key: entry.id },
      h('span', { className: 'wg-time-sm' }, fmtClock(entry.t)),
      h('span', { className: 'wg-line-icon' }, h(Glyph, { name: failed ? 'x' : (LINE_ICON[entry.kind] || 'dot'), size: 11 })),
      h('span', { className: 'wg-line-text' + (mono ? ' mono' : '') }, entry.text)
    )
  }

  function MemberRow(props) {
    const member = props.member
    const now = props.now
    const open = props.open === true
    const model = props.model
    const entries = props.entries || []
    const running = member.running
    const jobs = member.jobs || []
    const runningJobs = jobs.filter(function (job) { return job.status === 'running' })
    const elapsed = running ? now - member.startedAt : Math.max(0, (member.endedAt || now) - member.startedAt)
    const expected = member.expected
    const known = running && expected > 0
    const late = known && elapsed > expected
    const pct = running
      ? (known ? Math.min(98, Math.max(3, Math.round((elapsed / expected) * 100))) : 0)
      : 100
    const nowText = member.activity || (running ? T.thinking : (member.text ? clean(member.text, 60) : T.ended))
    const basis = member.estimated === 'history' ? T.basisHistory : T.basisPrior
    const etaText = !running
      ? T.used(fmtDur(elapsed))
      : (known ? (late ? T.etaLate(fmtDur(elapsed - expected)) : T.etaLeft(fmtDur(expected - elapsed))) : T.etaUnknown)
    const label = modelLabel(model)
    const recent = entries.slice(-8)

    return h('div', { className: 'wg-row2' + (running ? ' run' : '') + (member.awaiting ? ' wait' : '') + (open ? ' open' : '') },
      h('button', {
        className: 'wg-rhead',
        onClick: props.onToggle,
        'aria-expanded': open ? 'true' : 'false',
        title: open ? T.closeDetail : T.openDetail
      },
        h('span', { className: 'wg-chev' }, h(Glyph, { name: 'chevron', size: 10 })),
        h('span', { className: 'wg-status' + (running ? ' run' : '') }),
        h('span', { className: 'wg-name' }, member.name),
        member.awaiting ? h('span', { className: 'wg-wait', title: T.waitTitle }, '!') : null,
        label ? h('span', { className: 'wg-model', title: model.provider + ' / ' + model.model }, label) : null,
        h('span', { className: 'wg-spacer' }),
        member.isRoot ? null : h('button', {
          className: 'wg-iconbtn wg-jumpbtn',
          title: T.jumpTitle,
          onClick: function (event) {
            event.stopPropagation()
            if (typeof props.onJump === 'function') props.onJump(member)
          }
        }, h(Glyph, { name: 'jump', size: 11 })),
        running ? h('span', { className: 'wg-elapsed', title: T.elapsedHint }, fmtDur(elapsed)) : null
      ),
      open ? null : h('div', { className: 'wg-now' },
        h('span', { className: 'wg-now-text', title: nowText }, (running ? '' : '✓ ') + nowText),
        h('span', { className: 'wg-spacer' }),
        h('span', { className: 'wg-eta', title: known ? basis : (running ? T.etaUnknown : '') }, etaText)
      ),
      h('div', { className: 'wg-barwrap' },
        h('div', { className: 'wg-bar' + (running ? (known ? '' : ' unknown') : ' done') },
          h('i', { style: running && !known ? undefined : { width: pct + '%' } })
        )
      ),
      open
        ? h('div', { className: 'wg-open' },
          h('div', { className: 'wg-kv' },
            h('b', null, T.model),
            h('span', { className: 'mono', title: model ? model.provider + ' / ' + model.model : '' },
              model ? model.provider + ' / ' + model.model : T.noModelCall),
            h('b', null, T.status),
            h('span', { className: 'wg-wrap' },
              (running ? T.running : T.ended) +
              ' · ' + T.ranFor(fmtDur(elapsed)) +
              (running ? (known ? ' · ' + (late ? T.beyond(fmtDur(elapsed - expected)) : T.aboutLeft(fmtDur(expected - elapsed))) : ' · ' + T.etaUnknown) : '') +
              (running && known ? ' · ' + basis : '')),
            h('b', null, T.now),
            h('span', { title: member.activity || '' }, member.activity || (running ? T.noTool : T.dash))
          ),
          jobs.length > 0
            ? h('div', { className: 'wg-jobs' },
              h('div', { className: 'wg-jobs-title' }, T.jobsTitle),
              jobs.map(function (job) {
                const active = job.status === 'running'
                return h('div', {
                  className: 'wg-job',
                  key: job.id,
                  title: (job.label || job.id) + ' · ' + (JOB_STATUS_TEXT[job.status] || job.status)                },
                  h('span', { className: 'wg-line-icon' }, h(Glyph, { name: active ? 'terminal' : (job.status === 'failed' ? 'x' : 'check'), size: 11 })),
                  h('span', { className: 'wg-job-label' }, clean(job.label || job.id, 64)),
                  h('span', { className: 'wg-spacer' }),
                  h('span', { className: 'wg-job-state' }, job.progress ? clean(job.progress, 22) : (JOB_STATUS_TEXT[job.status] || job.status))
                )
              })
            )
            : null,
          recent.length > 0
            ? h('div', { className: 'wg-events' },
              h('div', { className: 'wg-jobs-title' }, T.recent),
              recent.map(function (entry) { return h(EntryLine, { key: entry.id, entry: entry }) })
            )
            : null
        )
        : null
    )
  }

  // ---------- the panel ----------
  function WorkgroupView(props) {
    ensureCss()
    const ctx = props.ctx
    const scope = props.scope || {}
    const visible = props.visible !== false
    const sessionId = scope.sessionId

    const listState = useSessionList(ctx)
    const jobsPair = useJobs(ctx)
    const jobsService = jobsPair[0]
    const jobsSnapshot = jobsPair[1]

    const byId = (listState && listState.byId) || {}
    const rootId = sessionId ? rootOf(byId, sessionId) : ''
    const rootSummary = byId[rootId] || {}

    const [live, setLive] = React.useState({ map: {}, error: null, at: 0 })
    const [tick, setTick] = React.useState(0)
    const [view, setView] = React.useState({ members: [], feed: [], at: 0 })
    const [expanded, setExpanded] = React.useState({})
    const [models, setModels] = React.useState({})
    const [soundOn, setSoundOn] = React.useState(function () { return readFlag(LS_SOUND_ON, true) })

    const startedRef = React.useRef(null)
    if (startedRef.current === null) startedRef.current = readJson(LS_STARTED, {})
    const durationsRef = React.useRef(null)
    if (durationsRef.current === null) durationsRef.current = readJson(LS_DURATIONS, { child: [], job: [] })
    const prevRef = React.useRef(new Map())
    const finishedRef = React.useRef({})
    const feedRef = React.useRef([])
    const routeRef = React.useRef(null)
    if (routeRef.current === null) routeRef.current = makeResolver(ctx)
    const pageVisible = usePageVisible()

    // Is anything actually working right now? Only then is the 2s fold worth
    // a request: the session list and the job roster are event-driven, so a
    // member that starts running flips this and wakes the poll back up.
    const anyRunning = React.useMemo(function () {
      if (rootSummary.running === true) return true
      for (const id in live.map) {
        const entry = live.map[id]
        if (entry && (entry.running === true || entry.preparing === true)) return true
      }
      const rows = (jobsSnapshot && jobsSnapshot.rows) || {}
      for (const owner in rows) {
        const list = rows[owner]
        if (!Array.isArray(list)) continue
        for (let index = 0; index < list.length; index += 1) {
          if (list[index] && list[index].status === 'running') return true
        }
      }
      return false
    }, [live.map, rootSummary.running, jobsSnapshot])

    // 1) live poll
    React.useEffect(function () {
      if (!rootId) return undefined
      let cancelled = false
      let timer = 0
      function load() {
        callApi(routeRef.current('subagents.live'), { rootSessionId: rootId }).then(function (value) {
          if (cancelled) return
          setLive({ map: (value && value.live) || {}, error: null, at: Date.now() })
        }).catch(function (error) {
          if (cancelled) return
          setLive(function (previous) {
            return { map: previous.map, error: String((error && error.message) || error), at: Date.now() }
          })
        })
      }
      load()
      if (visible && pageVisible && anyRunning) timer = window.setInterval(load, POLL_MS)
      return function () { cancelled = true; if (timer) window.clearInterval(timer) }
    }, [rootId, visible, pageVisible, anyRunning])

    // 2) local clock tick so elapsed/ETA move between polls (only while a
    // timer is actually on screen; an idle panel does not re-render)
    React.useEffect(function () {
      if (!visible || !pageVisible || !anyRunning) return undefined
      const timer = window.setInterval(function () { setTick(function (value) { return value + 1 }) }, 1000)
      return function () { window.clearInterval(timer) }
    }, [visible, pageVisible, anyRunning])

    // 3) watch the job rosters of the whole tree
    const treeIds = React.useMemo(function () {
      const ids = []
      if (rootId) ids.push(rootId)
      for (const id in byId) {
        if (id === rootId) continue
        const summary = byId[id]
        if (!summary || summary.origin !== 'subagent' || isSideThread(summary)) continue
        if (inTree(byId, id, rootId)) ids.push(id)
      }
      return ids
    }, [byId, rootId])

    const treeKey = treeIds.join(',')
    React.useEffect(function () {
      if (!jobsService || !visible || treeKey === '') return undefined
      const releases = treeKey.split(',').map(function (id) {
        try { return jobsService.watchRows(id) } catch (error) { return null }
      })
      return function () {
        for (let i = 0; i < releases.length; i += 1) {
          if (typeof releases[i] === 'function') releases[i]()
        }
      }
    }, [jobsService, treeKey, visible])

    // 4) which model each member is actually dispatching on.
    // `/sidebar/api/git.models` reports the routes a session's own log has used
    // (newest first); per member with a short cache, since a route rarely moves.
    const modelIds = React.useMemo(function () {
      const ids = [rootId]
      for (const id in live.map) {
        if (id !== rootId && inTree(byId, id, rootId)) ids.push(id)
      }
      return ids.filter(Boolean)
    }, [rootId, live.map, byId])

    const modelKey = modelIds.join(',')
    React.useEffect(function () {
      if (!visible || modelKey === '') return undefined
      let cancelled = false
      const now = Date.now()
      const stale = modelKey.split(',').filter(function (id) {
        const cached = models[id]
        return !cached || now - cached.at > MODEL_TTL_MS
      })
      if (stale.length === 0) return undefined
      Promise.all(stale.map(function (id) {
        return callApi(routeRef.current('git.models'), { sessionId: id }).then(function (value) {
          const route = value && Array.isArray(value.recent) ? value.recent[0] : undefined
          if (!route || typeof route.provider !== 'string' || typeof route.model !== 'string') return null
          return { id: id, provider: route.provider, model: route.model }
        }).catch(function () { return null })
      })).then(function (found) {
        if (cancelled) return
        const usable = found.filter(Boolean)
        if (usable.length === 0) return
        setModels(function (previous) {
          const next = Object.assign({}, previous)
          for (let i = 0; i < usable.length; i += 1) {
            next[usable[i].id] = { provider: usable[i].provider, model: usable[i].model, at: Date.now() }
          }
          return next
        })
      })
      return function () { cancelled = true }
    }, [modelKey, visible, pageVisible, live.at])

    // 5) compose members + diff into the chat feed
    React.useEffect(function () {
      if (!rootId) return
      const now = Date.now()
      const members = []

      const rootLive = live.map[rootId] || {}
      const rootActive = rootSummary.running === true || rootLive.running === true || rootLive.preparing === true ||
        (typeof rootLive.lastEventTime === 'number' && now - rootLive.lastEventTime < 15000)
      members.push({
        id: rootId,
        name: T.rootName,
        isRoot: true,
        running: rootActive,
        awaiting: Boolean(rootLive.summary && rootLive.summary.running === 'questions'),
        activity: activityText(rootLive.summary),
        text: typeof rootLive.text === 'string' ? rootLive.text : '',
        lastEventTime: rootLive.lastEventTime || 0,
        jobs: []
      })

      for (const id in live.map) {
        if (id === rootId) continue
        const summary = byId[id]
        if (!summary || summary.origin !== 'subagent' || isSideThread(summary)) continue
        if (!inTree(byId, id, rootId)) continue
        const childLive = live.map[id] || {}
        members.push({
          id: id,
          name: summary.displayTitle || T.childName(id.slice(-4)),
          isRoot: false,
          running: childLive.running !== undefined ? childLive.running === true : summary.running === true,
          awaiting: Boolean(childLive.summary && childLive.summary.running === 'questions'),
          activity: activityText(childLive.summary),
          text: typeof childLive.text === 'string' ? childLive.text : '',
          lastEventTime: childLive.lastEventTime || 0,
          jobs: []
        })
      }

      // background jobs, folded onto their owner
      const rows = (jobsSnapshot && jobsSnapshot.rows) || {}
      const seenJobs = new Set()
      for (const watched in rows) {
        const jobList = rows[watched]
        if (!Array.isArray(jobList)) continue
        for (let i = 0; i < jobList.length; i += 1) {
          const job = jobList[i]
          if (!job || seenJobs.has(job.id)) continue
          const owner = job.owner || watched
          if (!inTree(byId, owner, rootId)) continue
          seenJobs.add(job.id)
          let target = null
          for (let m = 0; m < members.length; m += 1) if (members[m].id === owner) target = members[m]
          if (target === null) target = members[0]
          target.jobs.push(job)
        }
      }

      // elapsed bookkeeping (survives a page refresh through localStorage)
      const started = startedRef.current
      const finished = finishedRef.current
      const durations = durationsRef.current
      if (!Array.isArray(durations.child)) durations.child = []
      if (!Array.isArray(durations.job)) durations.job = []
      const feed = feedRef.current
      const prev = prevRef.current
      const next = new Map()

      let currentMemberId = ''
      function push(entry) {
        feed.push({
          id: entry.id,
          t: entry.t,
          kind: entry.kind,
          member: entry.member,
          memberId: entry.memberId || currentMemberId,
          text: entry.text,
          fail: entry.fail === true
        })
        if (feed.length > MAX_FEED) feed.splice(0, feed.length - MAX_FEED)
      }

      for (let index = 0; index < members.length; index += 1) {
        const member = members[index]
        currentMemberId = member.id
        const before = prev.get(member.id)
        const localStart = started[member.id]
        if (member.running) {
          if (typeof localStart !== 'number') started[member.id] = now
          member.startedAt = started[member.id]
          delete finished[member.id]
        } else {
          // A finished member keeps the run it actually had: `started` is cleared
          // at the transition, so the pair lives in `finished` for the linger window.
          const past = finished[member.id]
          if (past) {
            member.startedAt = past.from
            member.endedAt = past.at
          } else {
            member.startedAt = typeof localStart === 'number' ? localStart : now
            member.endedAt = now
            if (before !== undefined && before.running) finished[member.id] = { from: member.startedAt, at: now }
          }
        }

        // ETA basis: this browser's own finished runs, median over the last 20.
        // Before any history exists a labeled prior stands in for it.
        const history = member.isRoot ? 0 : median(durations.child)
        member.estimated = history > 0 ? 'history' : 'prior'
        member.expected = history > 0 ? history : (member.isRoot ? 0 : 180000)

        if (before === undefined) {
          // first sight: the ACTIVE card already states what it is doing, so only
          // a finished member (no card) gets an opening line in the timeline
          if (!member.running && member.text) {
            push({ id: member.id + ':hello', t: now, kind: 'say', member: member.name, text: clean(member.text, 420) })
          }
        } else {
          if (!before.running && member.running) {
            push({ id: member.id + ':start:' + member.startedAt, t: now, kind: 'start', member: member.name, text: T.feedStart })
          }
          if (member.running && member.activity && before.activity !== member.activity) {
            push({ id: member.id + ':act:' + now, t: now, kind: 'tool', member: member.name, text: member.activity })
          }
          if (member.text && before.text !== member.text) {
            push({ id: member.id + ':say:' + now, t: now, kind: 'say', member: member.name, text: clean(member.text, 420) })
          }
          if (before.running && !member.running) {
            const spent = Math.max(0, now - member.startedAt)
            if (!member.isRoot && spent > 3000) {
              durations.child.push(spent)
              if (durations.child.length > 20) durations.child.splice(0, durations.child.length - 20)
              if (readFlag(LS_SOUND_ON, true)) chime()
            }
            delete started[member.id]
            push({ id: member.id + ':end:' + now, t: now, kind: 'end', member: member.name, text: T.feedEnd(fmtDur(spent)) })
          }
        }

        // job lifecycle
        const beforeJobs = (before && before.jobs) || []
        const beforeById = new Map()
        for (let i = 0; i < beforeJobs.length; i += 1) beforeById.set(beforeJobs[i].id, beforeJobs[i])
        for (let i = 0; i < member.jobs.length; i += 1) {
          const job = member.jobs[i]
          const prior = beforeById.get(job.id)
          if (!prior && job.status === 'running') {
            push({ id: job.id + ':start', t: now, kind: 'job', member: member.name, text: T.feedJobStart(clean(job.label || job.id, 80)) })
          }
          if (prior && prior.status === 'running' && job.status !== 'running') {
            const spent = Math.max(0, (job.finishedAt || now) - (job.startedAt || now))
            if (spent > 3000) {
              durations.job.push(spent)
              if (durations.job.length > 20) durations.job.splice(0, durations.job.length - 20)
            }
            const failed = job.status === 'failed' || job.status === 'killed'
            push({
              id: job.id + ':end:' + job.status,
              t: now,
              kind: 'jobend',
              member: member.name,
              fail: failed,
              text: T.feedJobEnd(clean(job.label || job.id, 80), fmtDur(spent))
            })
          }
          if (job.status === 'running' && job.progress && (!prior || prior.progress !== job.progress)) {
            push({ id: job.id + ':prog:' + clean(job.progress, 40), t: now, kind: 'progress', member: member.name, text: clean(job.progress, 120) })
          }
        }

        // A member we only ever saw idle (page loaded after it finished, no
        // recorded start) is not shown at all — a card reading "用时 0:00" is noise.
        const everRan = member.running || typeof localStart === 'number' || before !== undefined
        const keep = member.running || (everRan && typeof member.endedAt === 'number' && now - member.endedAt < DONE_KEEP_MS)
        if (keep) next.set(member.id, member)
        else delete finished[member.id]
      }

      prevRef.current = next
      writeJson(LS_STARTED, started)
      writeJson(LS_DURATIONS, durations)

      setView({ members: orderMembers(members.filter(function (member) { return next.has(member.id) })), feed: feed.slice(), at: now })
    }, [rootId, live, jobsSnapshot, byId, tick])

    // 5) keep the timeline pinned to the newest line
    const bodyRef = React.useRef(null)
    const stickRef = React.useRef(true)
    React.useEffect(function () {
      const node = bodyRef.current
      if (!node || !stickRef.current) return
      node.scrollTop = node.scrollHeight
    }, [view])

    function onScroll(event) {
      const node = event.currentTarget
      stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48
    }

    const runningMembers = view.members.filter(function (member) { return member.running })
    const awaitingMembers = view.members.filter(function (member) { return member.awaiting })
    const activeJobs = view.members.reduce(function (sum, member) {
      return sum + member.jobs.filter(function (job) { return job.status === 'running' }).length
    }, 0)
    const byMember = {}
    for (let index = 0; index < view.feed.length; index += 1) {
      const entry = view.feed[index]
      const key = entry.memberId || entry.member
      if (!byMember[key]) byMember[key] = []
      byMember[key].push(entry)
    }
    const secondSince = live.at > 0 ? Math.max(0, Math.round((Date.now() - live.at) / 1000)) : null

    const syncLabel = secondSince === null
      ? T.syncNone
      : (secondSince <= 1 ? T.syncJust : T.syncAgo(secondSince))
    const title = rootSummary.displayTitle ? clean(rootSummary.displayTitle, 30) : T.untitled

    // Open a child's own session in the sidebar (the subagent tab). A root or a
    // disabled subagent tab is a silent no-op, never an error.
    function openMember(member) {
      try {
        const sidebar = ctx.get('betterSidebar')
        if (!sidebar || typeof sidebar.openTab !== 'function' || member.isRoot) return
        sidebar.openTab({ type: 'subagent', meta: { childSessionId: member.id } }, { sessionId: rootId })
      } catch (error) { /* the subagent tab is disabled or unavailable */ }
    }

    const header = h('div', { className: 'wg-head' },
      h('div', { className: 'wg-head-row' },
        h('span', { className: 'wg-head-icon' }, h(Glyph, { name: 'users', size: 14, weight: 1.5 })),
        h('span', { className: 'wg-head-title' }, T.title),
        h('span', { className: 'wg-crumb', title: rootSummary.displayTitle || '' }, '/ ' + title),
        h('button', {
          className: 'wg-iconbtn',
          title: soundOn ? T.soundOn : T.soundOff,
          'aria-pressed': soundOn ? 'true' : 'false',
          onClick: function () {
            const next = !readFlag(LS_SOUND_ON, true)
            writeFlag(LS_SOUND_ON, next)
            setSoundOn(next)
            if (next) chime()
          }
        }, h(Glyph, { name: soundOn ? 'bell' : 'bell-off', size: 13 })),
        h('button', {
          className: 'wg-iconbtn',
          title: T.refresh,
          onClick: function () { setTick(function (value) { return value + 1 }) }
        }, h(Glyph, { name: 'refresh', size: 13 }))
      ),
      h('div', { className: 'wg-head-meta' },
        h('span', { className: 'wg-live' + (runningMembers.length > 0 ? ' on' : '') + (live.error !== null ? ' err' : '') }),
        h('span', null, runningMembers.length > 0 ? T.runningCount(runningMembers.length) : T.idleCount),
        awaitingMembers.length > 0 ? h('span', { className: 'wg-sep' }, '·') : null,
        awaitingMembers.length > 0
          ? h('span', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, T.awaitingCount(awaitingMembers.length))
          : null,
        activeJobs > 0 ? h('span', { className: 'wg-sep' }, '·') : null,
        activeJobs > 0 ? h('span', null, T.jobsCount(activeJobs)) : null,
        h('span', { className: 'wg-sep' }, '·'),
        h('span', null, syncLabel)
      )
    )

    const emptyArt = h('div', { className: 'wg-empty-art' },
      h(Svg, { size: 58, weight: 1.1, viewBox: '0 0 58 58' },
        React.createElement('circle', { cx: 21, cy: 22, r: 6.5 }),
        React.createElement('path', { d: 'M9 45c0-6.4 5.4-10.6 12-10.6s12 4.2 12 10.6' }),
        React.createElement('circle', { cx: 41, cy: 18, r: 5 }),
        React.createElement('path', { d: 'M33.5 35.5c1.8-3.4 5.2-5.2 9-5.2 4.4 0 8.2 2.6 9.2 6.6' }),
        React.createElement('path', { d: 'M20 50h18', strokeDasharray: '2 4' })
      ))

    const rows = view.members.length === 0
      ? h('div', { className: 'wg-empty' },
        emptyArt,
        h('div', { className: 'wg-empty-t' }, T.emptyTitle),
        h('div', { className: 'wg-empty-d' }, T.emptyDesc1),
        h('div', { className: 'wg-empty-d' }, T.emptyDesc2)
      )
      : h('div', null,
        h('div', { className: 'wg-sec' },
          T.members,
          h('span', { className: 'wg-sec-count' }, T.membersCount(runningMembers.length, view.members.length))
        ),
        view.members.map(function (member) {
          return h(MemberRow, {
            key: member.id,
            member: member,
            now: view.at,
            open: expanded[member.id] === true,
            model: models[member.id],
            entries: byMember[member.id] || [],
            onToggle: function () {
              setExpanded(function (previous) {
                const next = Object.assign({}, previous)
                if (next[member.id]) delete next[member.id]
                else next[member.id] = true
                return next
              })
            },
            onJump: openMember
          })
        })
      )

    return h('div', { className: 'wg-root' },
      header,
      h('div', { className: 'wg-body', ref: bodyRef, onScroll: onScroll },
        live.error !== null
          ? h('div', { className: 'wg-line' },
            h('span', { className: 'wg-line-icon' }, h(Glyph, { name: 'x', size: 11 })),
            h('span', { className: 'wg-line-text', style: { color: 'var(--dsw-alias-state-error-primary)' } },
              T.apiError + clean(live.error, 120)))
          : null,
        rows
      ),
      h('div', { className: 'wg-foot' },
        h('span', null, anyRunning ? T.footerLive : T.footerIdle),
        h('span', { className: 'wg-sep' }, '/'),
        h('span', null, T.footerHint)
      )
    )
  }

  // ---------- plugin ----------
  function apply(ctx) {
    const closed = new Set()
    const opened = new Set()

    ctx.plugin({
      inject: ['betterSidebar'],
      apply(sidebarCtx) {
        const betterSidebar = sidebarCtx.betterSidebar
        if (!betterSidebar || typeof betterSidebar.registerTab !== 'function') {
          console.warn('[dsh-group-tab] betterSidebar missing; the workgroup tab cannot register')
          return
        }

        function autoOpenOff() {
          try { return window.localStorage.getItem(LS_AUTOOPEN_OFF) === '1' } catch (error) { return false }
        }
        function rememberClosed() {
          try { window.localStorage.setItem(LS_AUTOOPEN_OFF, '1') } catch (error) { /* private mode */ }
        }

        ctx.effect(function () {
          return betterSidebar.registerTab({
            id: TAB_ID,
            title: function () { return T.title },
            description: function () { return T.subtitle },
            icon: function (size) { return h(Glyph, { name: 'users', size: size, weight: 1.5 }) },
            order: 58,
            single: true,
            onOpen: function (tab, scope) {
              // A deliberate open re-arms the closed memory for the next page load.
              if (scope && scope.sessionId) closed.delete(scope.sessionId)
              try { window.localStorage.removeItem(LS_AUTOOPEN_OFF) } catch (error) { /* private mode */ }
            },
            onClose: function (tab, scope) {
              if (scope && scope.sessionId) closed.add(scope.sessionId)
              rememberClosed()
            },
            component: function (p) { return React.createElement(WorkgroupView, p) }
          })
        })

        // Put the page on screen instead of leaving it in the + menu:
        //  · once per page load for the session that is active (single:true makes
        //    a re-open a focus, never a duplicate), unless the user closed it;
        //  · once per session as soon as delegated work starts — driven by the
        //    session list subscription, not a page-wide timer.
        let booted = false
        const offSnapshot = betterSidebar.subscribeState(function () {
          if (booted) return
          let snapshot = null
          try { snapshot = betterSidebar.getSnapshot() } catch (error) { snapshot = null }
          const seat = snapshot && snapshot.sessionId
          if (!seat) return
          booted = true
          if (autoOpenOff()) return
          opened.add(seat)
          try { betterSidebar.openTab({ type: TAB_ID, id: TAB_ID }, { sessionId: seat }) } catch (error) { /* refused */ }
        })
        ctx.effect(function () { return function () { if (typeof offSnapshot === 'function') offSnapshot() } })

        function openForDelegatedWork() {
          if (autoOpenOff()) return
          let list = null
          try {
            const service = ctx.get('sessions')
            list = service && service.list ? service.list.getSnapshot() : null
          } catch (error) { list = null }
          const byId = (list && list.byId) || null
          if (!byId) return
          for (const id in byId) {
            const summary = byId[id]
            if (!summary || summary.origin !== 'subagent' || summary.running !== true) continue
            if (isSideThread(summary)) continue
            const root = rootOf(byId, id)
            if (opened.has(root) || closed.has(root)) continue
            opened.add(root)
            try {
              betterSidebar.openTab({ type: TAB_ID, id: TAB_ID }, { sessionId: root })
            } catch (error) { console.warn('[dsh-group-tab] auto-open refused', error) }
            break
          }
        }

        // The sessions service publishes a snapshot on every change, so a
        // subagent that starts running is an event, not a 4-second poll.
        let offWork = null
        try {
          const service = ctx.get('sessions')
          if (service && service.list && typeof service.list.subscribe === 'function') {
            offWork = service.list.subscribe(openForDelegatedWork)
          }
        } catch (error) { offWork = null }
        ctx.effect(function () { return function () { if (typeof offWork === 'function') offWork() } })
        openForDelegatedWork()
      }
    })
  }

  exports.apply = apply
  return module.exports
} })
