// ============================================================
// Remedy — Side Panel Application
// Vanilla JS, no build tools
// ============================================================

const API_URL = 'http://localhost:3001';

// ---- State ----
const state = {
  url: '',
  reportId: null,
  phase: 'idle', // idle | analyzing | metrics | suggestions | optimizing | done | error
  metrics: {},
  suggestions: [],
  optimizations: [],
  postLoadScripts: [],
  error: null,
};

// ---- DOM Elements ----
const els = {
  detectedUrl:    document.getElementById('detected-url'),
  analyzeBtn:     document.getElementById('analyze-btn'),
  agentLogSection:document.getElementById('agent-log-section'),
  agentLog:       document.getElementById('agent-log'),
  agentStatus:    document.getElementById('agent-status'),
  metricsSection: document.getElementById('metrics-section'),
  metricsGrid:    document.getElementById('metrics-grid'),
  suggestionsSection: document.getElementById('suggestions-section'),
  suggestionsList:document.getElementById('suggestions-list'),
  suggestionCount:document.getElementById('suggestion-count'),
  testSelectedBtn:document.getElementById('test-selected-btn'),
  optimizationSection: document.getElementById('optimization-section'),
  optimizationList:document.getElementById('optimization-list'),
  applySection:   document.getElementById('apply-section'),
  applyFixesBtn:  document.getElementById('apply-fixes-btn'),
  viewReportLink: document.getElementById('view-report-link'),
  errorSection:   document.getElementById('error-section'),
  errorMessage:   document.getElementById('error-message'),
  retryBtn:       document.getElementById('retry-btn'),
};

// ---- Init ----
document.addEventListener('DOMContentLoaded', init);

function init() {
  // Get current tab URL from service worker
  chrome.runtime.sendMessage({ type: 'GET_TAB_URL' }, (response) => {
    if (response?.url) {
      state.url = response.url;
      els.detectedUrl.textContent = cleanUrl(response.url);
      els.analyzeBtn.disabled = false;
    } else {
      els.detectedUrl.textContent = 'No page detected';
    }
  });

  // Event listeners
  els.analyzeBtn.addEventListener('click', startAnalysis);
  els.testSelectedBtn.addEventListener('click', testSelected);
  els.applyFixesBtn.addEventListener('click', applyFixes);
  els.retryBtn.addEventListener('click', startAnalysis);
}

// ---- Analysis Flow ----
async function startAnalysis() {
  resetUI();
  state.phase = 'analyzing';
  els.analyzeBtn.disabled = true;
  els.analyzeBtn.innerHTML = '<span class="spinner"></span><span>Analyzing...</span>';
  showSection(els.agentLogSection);
  setAgentStatus('running');

  try {
    // Step 1: POST /analyze
    addLog('Sending URL to Remedy API...', 'step');
    const res = await fetch(`${API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: state.url }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server returned ${res.status}`);
    }

    const data = await res.json();
    state.reportId = data.reportId || data.id;
    addLog(`Report ID: ${state.reportId}`, 'step');

    // Step 2: Open SSE stream
    addLog('Connected to agent stream...', 'step');
    openStream(state.reportId);
  } catch (err) {
    showError(err.message);
  }
}

function openStream(reportId) {
  const eventSource = new EventSource(`${API_URL}/stream/${reportId}`);

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      handleEvent(event);
    } catch (err) {
      // Ignore non-JSON messages
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    if (state.phase !== 'done' && state.phase !== 'error') {
      // Stream ended — could mean the analysis is complete
      if (state.phase === 'optimizing' || state.suggestions.length > 0) {
        finishAnalysis();
      } else {
        showError('Connection to agent lost.');
      }
    }
  };
}

function handleEvent(event) {
  const { type, data } = event;

  switch (type) {
    case 'status':
      addLog(typeof data === 'string' ? data : (data.message || JSON.stringify(data)), 'step');
      break;

    case 'log':
    case 'agent:log':
      addLog(data.message || data.text || JSON.stringify(data), data.level || 'info');
      break;

    case 'step':
    case 'agent:step':
      addLog(data.message || data.name || 'Processing...', 'step');
      break;

    case 'metrics':
    case 'baseline':
      state.metrics = data.metrics || data;
      renderMetrics();
      break;

    case 'suggestion':
      state.suggestions.push(data);
      renderSuggestions();
      break;

    case 'suggestions':
      state.suggestions = data.suggestions || data;
      renderSuggestions();
      showSection(els.applySection);
      break;

    case 'optimization':
    case 'fix':
      state.optimizations.push(data);
      renderOptimizations();
      break;

    case 'optimizations':
    case 'fixes':
      state.optimizations = data.optimizations || data.fixes || data;
      renderOptimizations();
      break;

    case 'scripts':
    case 'postLoadScripts':
      state.postLoadScripts = data.scripts || data;
      break;

    case 'complete':
    case 'done':
      if (data?.metrics) { state.metrics = data.metrics; renderMetrics(); }
      if (data?.suggestions) { state.suggestions = data.suggestions; renderSuggestions(); }
      if (data?.optimizations) { state.optimizations = data.optimizations; renderOptimizations(); }
      if (data?.postLoadScripts) { state.postLoadScripts = data.postLoadScripts; }
      if (data?.scripts) { state.postLoadScripts = data.scripts; }
      finishAnalysis();
      break;

    case 'error':
      showError(typeof data === 'string' ? data : (data.message || 'Analysis failed.'));
      break;

    default:
      // Unknown event type — log it
      if (data?.message) addLog(data.message, 'info');
      break;
  }
}

function finishAnalysis() {
  // If baseline just finished and we have suggestions but no optimizations yet,
  // auto-start testing all suggestions
  if (state.phase !== 'optimizing' && state.suggestions.length > 0 && state.optimizations.length === 0) {
    addLog('Auto-starting optimization tests...', 'step');
    testSelected();
    return;
  }

  state.phase = 'done';
  setAgentStatus('done');
  els.analyzeBtn.disabled = false;
  els.analyzeBtn.innerHTML = `
    <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M14 8l-6-6v4H2v4h6v4l6-6z" fill="currentColor"/>
    </svg>
    <span>Re-analyze</span>`;
  els.testSelectedBtn.disabled = false;
  els.testSelectedBtn.innerHTML = `
    <svg class="btn-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11.5 7A4.5 4.5 0 112.5 7a4.5 4.5 0 019 0z" stroke="currentColor" stroke-width="1.3"/>
      <path d="M5.5 7l1.5 1.5L9 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Re-test`;
  addLog('Analysis complete.', 'success');

  // Show apply section if we have scripts or optimizations
  if (state.postLoadScripts.length > 0 || state.optimizations.length > 0) {
    showSection(els.applySection);
  }

  // Set report link
  if (state.reportId) {
    els.viewReportLink.href = `${API_URL}/report/${state.reportId}`;
    showSection(els.applySection);
  }
}

// ---- Test Selected ----
async function testSelected() {
  const checked = getSelectedFixIds();
  if (checked.length === 0) return;

  els.testSelectedBtn.disabled = true;
  els.testSelectedBtn.innerHTML = '<span class="spinner"></span> Testing...';
  state.phase = 'optimizing';
  showSection(els.optimizationSection);

  try {
    const res = await fetch(`${API_URL}/apply/${state.reportId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixIds: checked }),
    });

    if (!res.ok) throw new Error(`Server returned ${res.status}`);

    // Optimizations arrive via SSE stream (optimization events + complete event),
    // not in this HTTP response. The SSE handler will call finishAnalysis().
  } catch (err) {
    showError(err.message);
    els.testSelectedBtn.disabled = false;
    els.testSelectedBtn.innerHTML = `
      <svg class="btn-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M11.5 7A4.5 4.5 0 112.5 7a4.5 4.5 0 019 0z" stroke="currentColor" stroke-width="1.3"/>
        <path d="M5.5 7l1.5 1.5L9 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Test Selected`;
  }
}

function getSelectedFixIds() {
  const checkboxes = els.suggestionsList.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checkboxes).map((cb) => cb.dataset.fixId);
}

// ---- Apply Fixes ----
async function applyFixes() {
  // Gather fix sources: optimizations first, then selected suggestions
  let sources = state.optimizations;
  if (sources.length === 0) {
    const selectedIds = new Set(getSelectedFixIds());
    sources = state.suggestions.filter((s) => selectedIds.has(s.id));
  }

  const initScripts = sources.map((s) => s.initScript).filter(Boolean);
  const postLoadScripts = state.postLoadScripts.length > 0
    ? state.postLoadScripts
    : sources.map((s) => s.postLoadScript).filter(Boolean);

  if (initScripts.length === 0 && postLoadScripts.length === 0) {
    addLog('No fix scripts available to apply.', 'warning');
    return;
  }

  addLog(`Applying ${initScripts.length} init script(s) + ${postLoadScripts.length} post-load script(s)...`, 'step');

  els.applyFixesBtn.disabled = true;
  els.applyFixesBtn.innerHTML = '<span class="spinner"></span> Applying...';

  chrome.runtime.sendMessage(
    { type: 'APPLY_FIXES', initScripts, postLoadScripts },
    (response) => {
      els.applyFixesBtn.disabled = false;
      if (response?.success) {
        els.applyFixesBtn.innerHTML = `
          <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M13.5 4.5l-7 7L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Fixes Applied!`;
        els.applyFixesBtn.style.background = 'linear-gradient(135deg, #16a34a, #15803d)';
        if (response?.reloading) {
          addLog('Fixes registered — page is reloading with initScripts applied before page scripts.', 'success');
        } else {
          addLog('Fixes applied to page successfully.', 'success');
        }
        addLog('Fixes will persist across refreshes. Use "Clear Fixes" to remove.', 'step');
      } else {
        els.applyFixesBtn.innerHTML = `
          <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M13.5 4.5l-7 7L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Apply Fixes to Page`;
        addLog(`Failed to apply fixes: ${response?.error || 'Unknown error'}`, 'error');
      }
    }
  );
}

// ---- Rendering ----

function renderMetrics() {
  showSection(els.metricsSection);
  els.metricsGrid.innerHTML = '';

  const metricDefs = [
    { key: 'lcp', name: 'LCP', unit: 'ms' },
    { key: 'cls', name: 'CLS', unit: '' },
    { key: 'inp', name: 'INP', unit: 'ms' },
    { key: 'ttfb', name: 'TTFB', unit: 'ms' },
  ];

  for (const def of metricDefs) {
    const val = state.metrics[def.key] ?? state.metrics[def.name] ?? state.metrics[def.key.toUpperCase()];
    if (val == null) continue;
    els.metricsGrid.appendChild(renderMetric(def.name, val, def.unit));
  }
}

function renderMetric(name, value, unit) {
  const color = getMetricRating(name, value);
  const formatted = formatMetric(name, value);

  const card = document.createElement('div');
  card.className = `metric-card ${color}`;
  card.innerHTML = `
    <div class="metric-name">${name}</div>
    <div class="metric-value">${formatted}<span class="metric-unit">${unit}</span></div>`;
  return card;
}

function renderSuggestions() {
  showSection(els.suggestionsSection);
  els.suggestionsList.innerHTML = '';
  els.suggestionCount.textContent = state.suggestions.length;

  for (const sug of state.suggestions) {
    els.suggestionsList.appendChild(renderSuggestion(sug));
  }

  if (state.suggestions.length > 0) {
    els.testSelectedBtn.classList.remove('hidden');
  }
}

function renderSuggestion(suggestion) {
  const id = suggestion.id || suggestion.fixId || `fix-${Math.random().toString(36).slice(2, 8)}`;
  const impact = (suggestion.impact || 'medium').toLowerCase();

  const row = document.createElement('label');
  row.className = 'suggestion-row';
  row.innerHTML = `
    <input type="checkbox" data-fix-id="${id}" checked />
    <div class="suggestion-content">
      <div class="suggestion-title">${escapeHtml(suggestion.title || suggestion.name || 'Untitled')}</div>
      <div class="suggestion-desc">${escapeHtml(suggestion.description || suggestion.explanation || suggestion.detail || '')}</div>
    </div>
    <span class="suggestion-impact impact-${impact}">${impact}</span>`;
  return row;
}

function renderOptimizations() {
  showSection(els.optimizationSection);
  els.optimizationList.innerHTML = '';

  for (const opt of state.optimizations) {
    els.optimizationList.appendChild(renderOptimization(opt));
  }
}

function renderOptimization(opt) {
  const status = (opt.status || 'applied').toLowerCase();

  const row = document.createElement('div');
  row.className = 'opt-row';

  let comparisonHtml = '';
  if (opt.before && opt.after) {
    const metrics = ['lcp', 'cls', 'ttfb'];
    comparisonHtml = '<div class="opt-comparison">';
    comparisonHtml += '<div class="opt-comparison-header"><span>Metric</span><span>Before</span><span>After</span><span>Change</span></div>';
    for (const key of metrics) {
      const before = opt.before[key] ?? 0;
      const after = opt.after[key] ?? 0;
      if (before === 0 && after === 0) continue;
      const unit = key === 'cls' ? '' : 'ms';
      const beforeStr = key === 'cls' ? before.toFixed(3) : Math.round(before).toLocaleString();
      const afterStr = key === 'cls' ? after.toFixed(3) : Math.round(after).toLocaleString();
      const diff = before > 0 ? ((before - after) / before * 100).toFixed(1) : '0';
      const improved = parseFloat(diff) > 0;
      const changeStr = improved ? `-${diff}%` : `+${Math.abs(parseFloat(diff))}%`;
      const changeClass = improved ? 'improved' : parseFloat(diff) < 0 ? 'regressed' : '';
      comparisonHtml += `<div class="opt-comparison-row">
        <span class="opt-comparison-label">${key.toUpperCase()}</span>
        <span class="opt-comparison-before">${beforeStr}${unit}</span>
        <span class="opt-comparison-after">${afterStr}${unit}</span>
        <span class="opt-comparison-change ${changeClass}">${changeStr}</span>
      </div>`;
    }
    comparisonHtml += '</div>';
  } else if (opt.improvement && typeof opt.improvement === 'string') {
    comparisonHtml = `<div class="opt-metrics"><span class="opt-metric">${escapeHtml(opt.improvement)}</span></div>`;
  }

  row.innerHTML = `
    <div class="opt-header">
      <span class="opt-title">${escapeHtml(opt.title || opt.name || 'Fix')}</span>
      <span class="opt-status ${status}">${status}</span>
    </div>
    <div class="opt-detail">${escapeHtml(opt.detail || opt.explanation || opt.description || '')}</div>
    ${comparisonHtml}`;
  return row;
}

// ---- Agent Log ----
function addLog(message, level = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${level}`;

  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-msg">${escapeHtml(message)}</span>`;

  els.agentLog.appendChild(entry);
  els.agentLog.scrollTop = els.agentLog.scrollHeight;
}

function setAgentStatus(status) {
  els.agentStatus.textContent = status;
  els.agentStatus.className = `status-badge ${status}`;
}

// ---- Helpers ----

function getMetricRating(metric, value) {
  const thresholds = {
    LCP:  { good: 2500, poor: 4000 },
    CLS:  { good: 0.1,  poor: 0.25 },
    INP:  { good: 200,  poor: 500 },
    TTFB: { good: 800,  poor: 1800 },
  };
  const t = thresholds[metric.toUpperCase()];
  if (!t) return 'warn';
  if (value <= t.good) return 'good';
  if (value >= t.poor) return 'poor';
  return 'warn';
}

function formatMetric(metric, value) {
  if (metric.toUpperCase() === 'CLS') {
    return Number(value).toFixed(3);
  }
  return Math.round(value).toLocaleString();
}

function cleanUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? '' : u.pathname;
    return u.hostname + path;
  } catch {
    return url;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showSection(el) {
  el.classList.remove('hidden');
}

function hideSection(el) {
  el.classList.add('hidden');
}

function resetUI() {
  state.metrics = {};
  state.suggestions = [];
  state.optimizations = [];
  state.postLoadScripts = [];
  state.error = null;
  state.reportId = null;

  els.agentLog.innerHTML = '';
  els.metricsGrid.innerHTML = '';
  els.suggestionsList.innerHTML = '';
  els.optimizationList.innerHTML = '';
  els.suggestionCount.textContent = '0';
  els.testSelectedBtn.classList.add('hidden');

  hideSection(els.agentLogSection);
  hideSection(els.metricsSection);
  hideSection(els.suggestionsSection);
  hideSection(els.optimizationSection);
  hideSection(els.applySection);
  hideSection(els.errorSection);

  // Reset apply button
  els.applyFixesBtn.disabled = false;
  els.applyFixesBtn.style.background = '';
  els.applyFixesBtn.innerHTML = `
    <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M13.5 4.5l-7 7L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Apply Fixes to Page`;
}

function showError(message) {
  state.phase = 'error';
  state.error = message;
  setAgentStatus('error');
  addLog(message, 'error');
  showSection(els.errorSection);
  els.errorMessage.textContent = message;
  els.analyzeBtn.disabled = false;
  els.analyzeBtn.innerHTML = `
    <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M14 8l-6-6v4H2v4h6v4l6-6z" fill="currentColor"/>
    </svg>
    <span>Retry Analysis</span>`;
}
