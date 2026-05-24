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
  activeFixes: new Set(),
  lighthouseBefore: null,
  lighthouseAfter: null,
  question: '',
  answer: null,
  error: null,
  eventSource: null,
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
  lighthouseSection: document.getElementById('lighthouse-section'),
  suggestionsSection: document.getElementById('suggestions-section'),
  suggestionsList:document.getElementById('suggestions-list'),
  suggestionCount:document.getElementById('suggestion-count'),
  testSelectedBtn:document.getElementById('test-selected-btn'),
  optimizationSection: document.getElementById('optimization-section'),
  optimizationList:document.getElementById('optimization-list'),
  exportAllBtn:   document.getElementById('export-all-btn'),
  applySection:   document.getElementById('apply-section'),
  applyFixesBtn:  document.getElementById('apply-fixes-btn'),
  clearFixesBtn:  document.getElementById('clear-fixes-btn'),
  viewReportLink: document.getElementById('view-report-link'),
  errorSection:   document.getElementById('error-section'),
  errorMessage:   document.getElementById('error-message'),
  retryBtn:       document.getElementById('retry-btn'),
  questionToggle: document.getElementById('question-toggle'),
  questionChevron:document.getElementById('question-chevron'),
  questionWrapper:document.getElementById('question-wrapper'),
  questionInput:  document.getElementById('question-input'),
  answerSection:  document.getElementById('answer-section'),
  answerContent:  document.getElementById('answer-content'),
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
  els.applyFixesBtn.addEventListener('click', applyAllFixes);
  els.clearFixesBtn.addEventListener('click', clearAllFixes);
  els.retryBtn.addEventListener('click', startAnalysis);
  els.exportAllBtn.addEventListener('click', () => copyToClipboard(generateFullReport(), els.exportAllBtn));

  els.questionToggle.addEventListener('click', () => {
    els.questionWrapper.classList.toggle('hidden');
    els.questionChevron.classList.toggle('open');
    if (!els.questionWrapper.classList.contains('hidden')) {
      els.questionInput.focus();
    }
  });
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
    state.question = (els.questionInput.value || '').trim();
    addLog('Sending URL to Remedy API...', 'step');
    const body = { url: state.url };
    if (state.question) body.question = state.question;
    const res = await fetch(`${API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }

  const eventSource = new EventSource(`${API_URL}/stream/${reportId}`);
  state.eventSource = eventSource;

  eventSource.onmessage = (e) => {
    if (reportId !== state.reportId) return;
    try {
      const event = JSON.parse(e.data);
      handleEvent(event);
    } catch (err) {
      // Ignore non-JSON messages
    }
  };

  eventSource.onerror = () => {
    if (reportId !== state.reportId) return;
    eventSource.close();
    if (state.eventSource === eventSource) {
      state.eventSource = null;
    }
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

    case 'lighthouse':
      if (data.phase === 'before') {
        state.lighthouseBefore = data.score;
      } else if (data.phase === 'after') {
        state.lighthouseAfter = data.score;
      }
      renderLighthouse();
      break;

    case 'answer':
      state.answer = data;
      renderAnswer();
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
      showFinalActionLinks();
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

    case 'done':
      if (data?.metrics) { state.metrics = data.metrics; renderMetrics(); }
      if (data?.suggestions) { state.suggestions = data.suggestions; renderSuggestions(); }
      handleBaselineDone();
      break;

    case 'complete':
      if (data?.metrics) { state.metrics = data.metrics; renderMetrics(); }
      if (data?.suggestions) { state.suggestions = data.suggestions; renderSuggestions(); }
      if (data?.optimizations) { state.optimizations = data.optimizations; renderOptimizations(); }
      if (data?.postLoadScripts) { state.postLoadScripts = data.postLoadScripts; }
      if (data?.scripts) { state.postLoadScripts = data.scripts; }
      if (data?.reportUrl && state.reportId) {
        els.viewReportLink.href = `${API_URL}${data.reportUrl}`;
      }
      if (data?.lighthouseAfter != null) { state.lighthouseAfter = data.lighthouseAfter; renderLighthouse(); }
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

function handleBaselineDone() {
  if (state.suggestions.length > 0) {
    addLog('Baseline complete. Auto-starting optimization tests...', 'step');
    testSelected();
    return;
  }

  addLog('Baseline complete, but no fixes were returned to test.', 'warning');
  finishAnalysis();
}

function finishAnalysis() {
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

  showFinalActionLinks();
}

function showFinalActionLinks() {
  if (!state.reportId) return;

  if (!els.viewReportLink.href || els.viewReportLink.href.endsWith('#')) {
    els.viewReportLink.href = `${API_URL}/report/${state.reportId}/html`;
  }
  showSection(els.applySection);
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

function toggleFix(fixId) {
  if (state.activeFixes.has(fixId)) {
    state.activeFixes.delete(fixId);
  } else {
    state.activeFixes.add(fixId);
  }
  updateToggleUI();
  applyActiveFixes();
}

function applyAllFixes() {
  const sources = state.optimizations.length > 0 ? state.optimizations : state.suggestions;
  for (const s of sources) {
    const id = s.id || s.fixId;
    if (id) state.activeFixes.add(id);
  }
  updateToggleUI();
  applyActiveFixes();
}

function clearAllFixes() {
  state.activeFixes.clear();
  updateToggleUI();
  chrome.runtime.sendMessage({ type: 'CLEAR_FIXES' }, () => {
    addLog('All fixes cleared.', 'step');
    updateApplyButton();
  });
}

function updateToggleUI() {
  els.optimizationList.querySelectorAll('.fix-toggle').forEach((toggle) => {
    const id = toggle.dataset.fixId;
    toggle.classList.toggle('active', state.activeFixes.has(id));
  });
  updateApplyButton();
}

function updateApplyButton() {
  const count = state.activeFixes.size;
  if (count > 0) {
    els.applyFixesBtn.innerHTML = `
      <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M13.5 4.5l-7 7L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      ${count} Fix${count > 1 ? 'es' : ''} Active`;
    els.applyFixesBtn.style.background = 'linear-gradient(135deg, #16a34a, #15803d)';
    els.clearFixesBtn.classList.remove('hidden');
  } else {
    els.applyFixesBtn.innerHTML = `
      <svg class="btn-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M13.5 4.5l-7 7L3 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Apply All Fixes`;
    els.applyFixesBtn.style.background = '';
    els.clearFixesBtn.classList.add('hidden');
  }
}

function applyActiveFixes() {
  const sources = state.optimizations.length > 0 ? state.optimizations : state.suggestions;
  const active = sources.filter((s) => state.activeFixes.has(s.id || s.fixId));

  if (active.length === 0) {
    chrome.runtime.sendMessage({ type: 'CLEAR_FIXES' });
    addLog('All fixes removed.', 'step');
    return;
  }

  const initScripts = active.map((s) => s.initScript).filter(Boolean);
  const postLoadScripts = active.map((s) => s.postLoadScript).filter(Boolean);

  addLog(`Applying ${active.length} fix(es)...`, 'step');

  chrome.runtime.sendMessage(
    { type: 'APPLY_FIXES', initScripts, postLoadScripts },
    (response) => {
      if (response?.success) {
        if (response?.reloading) {
          addLog('Page reloading with selected fixes applied.', 'success');
        } else {
          addLog(`${active.length} fix(es) applied.`, 'success');
        }
      } else {
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

function renderAnswer() {
  if (!state.answer) return;
  els.answerContent.textContent = state.answer;
  showSection(els.answerSection);
}

function renderLighthouse() {
  if (state.lighthouseBefore == null) return;
  els.lighthouseSection.classList.remove('hidden');

  const before = state.lighthouseBefore;
  const after = state.lighthouseAfter;
  const beforeColor = before >= 90 ? 'good' : before >= 50 ? 'warn' : 'poor';

  let html = `<div class="lighthouse-card">`;
  html += `<div class="lighthouse-gauge ${beforeColor}">`;
  html += `<svg class="lighthouse-ring" viewBox="0 0 72 72">`;
  html += `<circle cx="36" cy="36" r="30" fill="none" stroke="var(--border-subtle)" stroke-width="5"/>`;
  html += `<circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="${(before / 100) * 188.5} 188.5" stroke-linecap="round" transform="rotate(-90 36 36)"/>`;
  html += `</svg>`;
  html += `<span class="lighthouse-score">${before}</span>`;
  html += `</div>`;
  html += `<div class="lighthouse-label">Lighthouse</div>`;

  if (after != null) {
    const afterColor = after >= 90 ? 'good' : after >= 50 ? 'warn' : 'poor';
    const delta = after - before;
    const sign = delta > 0 ? '+' : '';
    const changeClass = delta > 0 ? 'improved' : delta < 0 ? 'regressed' : '';
    html += `<div class="lighthouse-after">`;
    html += `<div class="lighthouse-gauge ${afterColor}">`;
    html += `<svg class="lighthouse-ring" viewBox="0 0 72 72">`;
    html += `<circle cx="36" cy="36" r="30" fill="none" stroke="var(--border-subtle)" stroke-width="5"/>`;
    html += `<circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="${(after / 100) * 188.5} 188.5" stroke-linecap="round" transform="rotate(-90 36 36)"/>`;
    html += `</svg>`;
    html += `<span class="lighthouse-score">${after}</span>`;
    html += `</div>`;
    html += `<div class="lighthouse-label">After Fixes</div>`;
    html += `<span class="lighthouse-delta ${changeClass}">${sign}${delta}</span>`;
    html += `</div>`;
  }

  html += `</div>`;
  els.lighthouseSection.innerHTML = html;
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

  if (state.optimizations.length > 0) {
    els.exportAllBtn.classList.remove('hidden');
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

  const fixId = opt.id || opt.fixId || `fix-${Math.random().toString(36).slice(2, 8)}`;
  const isActive = state.activeFixes.has(fixId);

  row.innerHTML = `
    <div class="opt-header">
      <span class="opt-title">${escapeHtml(opt.title || opt.name || 'Fix')}</span>
      <div class="opt-header-actions">
        <span class="fix-toggle ${isActive ? 'active' : ''}" data-fix-id="${fixId}" title="Toggle this fix on/off">
          <span class="fix-toggle-knob"></span>
        </span>
      </div>
    </div>
    <div class="opt-detail">${escapeHtml(opt.detail || opt.explanation || opt.description || '')}</div>
    ${comparisonHtml}
    <button class="btn-copy-prompt">
      <svg class="btn-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <rect x="4" y="4" width="6.5" height="7" rx="1" stroke="currentColor" stroke-width="1.1"/>
        <path d="M8 4V2.5A1.5 1.5 0 006.5 1h-4A1.5 1.5 0 001 2.5v5A1.5 1.5 0 002.5 9H4" stroke="currentColor" stroke-width="1.1"/>
      </svg>
      Copy as Prompt
    </button>`;

  row.querySelector('.fix-toggle').addEventListener('click', () => toggleFix(fixId));

  const copyBtn = row.querySelector('.btn-copy-prompt');
  copyBtn.addEventListener('click', () => copyToClipboard(generateFixPrompt(opt), copyBtn));

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

// ---- Export / Copy as Prompt ----

function generateFixPrompt(opt) {
  let md = `## Performance Fix: ${opt.name || opt.title || 'Untitled'}\n\n`;
  md += `**Problem:** ${opt.explanation || opt.description || opt.detail || 'N/A'}\n\n`;

  if (opt.improvement) {
    md += `**Impact:** ${opt.improvement}\n\n`;
  }

  if (opt.before && opt.after) {
    md += `**Verified metrics:**\n`;
    md += `| Metric | Before | After | Change |\n`;
    md += `|--------|--------|-------|--------|\n`;
    for (const key of ['lcp', 'cls', 'ttfb']) {
      const before = opt.before[key] ?? 0;
      const after = opt.after[key] ?? 0;
      if (before === 0 && after === 0) continue;
      const unit = key === 'cls' ? '' : 'ms';
      const bStr = key === 'cls' ? before.toFixed(3) : Math.round(before) + unit;
      const aStr = key === 'cls' ? after.toFixed(3) : Math.round(after) + unit;
      const diff = before > 0 ? ((before - after) / before * 100).toFixed(1) : '0';
      const sign = parseFloat(diff) > 0 ? '-' : '+';
      md += `| ${key.toUpperCase()} | ${bStr} | ${aStr} | ${sign}${Math.abs(parseFloat(diff))}% |\n`;
    }
    md += `\n`;
  }

  if (opt.initScript) {
    md += `**Init script** (runs before page scripts):\n\`\`\`js\n${opt.initScript}\n\`\`\`\n\n`;
  }
  if (opt.postLoadScript) {
    md += `**Post-load script** (runs after page load):\n\`\`\`js\n${opt.postLoadScript}\n\`\`\`\n\n`;
  }

  md += `**Implement in your codebase:**\nThe scripts above are proof-of-concept injections that verified the improvement. `;
  md += `Adapt this optimization to your framework and source code — the intent matters more than the exact DOM manipulation.\n`;

  return md;
}

function generateFullReport() {
  let md = `# Remedy Performance Report\n\n`;
  md += `**URL:** ${state.url}\n`;
  md += `**Date:** ${new Date().toISOString().slice(0, 10)}\n\n`;

  if (state.metrics && Object.keys(state.metrics).length > 0) {
    const m = state.metrics;
    const parts = [];
    if (m.lcp != null) parts.push(`LCP ${Math.round(m.lcp)}ms`);
    if (m.cls != null) parts.push(`CLS ${Number(m.cls).toFixed(3)}`);
    if (m.inp != null) parts.push(`INP ${Math.round(m.inp)}ms`);
    if (m.ttfb != null) parts.push(`TTFB ${Math.round(m.ttfb)}ms`);
    md += `**Baseline:** ${parts.join(' · ')}\n\n`;
  }

  if (state.lighthouseBefore != null) {
    let lhLine = `**Lighthouse Performance:** ${state.lighthouseBefore}`;
    if (state.lighthouseAfter != null) {
      const delta = state.lighthouseAfter - state.lighthouseBefore;
      const sign = delta > 0 ? '+' : '';
      lhLine += ` → ${state.lighthouseAfter} (${sign}${delta})`;
    }
    md += lhLine + `\n\n`;
  }

  md += `---\n\n`;

  const fixes = state.optimizations.length > 0 ? state.optimizations : state.suggestions;
  for (let i = 0; i < fixes.length; i++) {
    md += generateFixPrompt(fixes[i]);
    if (i < fixes.length - 1) md += `---\n\n`;
  }

  return md;
}

async function copyToClipboard(text, buttonEl) {
  try {
    await navigator.clipboard.writeText(text);
    const original = buttonEl.innerHTML;
    buttonEl.innerHTML = `<svg class="btn-icon" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M10 3L4.5 8.5 2 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg> Copied!`;
    buttonEl.classList.add('copied');
    setTimeout(() => {
      buttonEl.innerHTML = original;
      buttonEl.classList.remove('copied');
    }, 2000);
  } catch {
    addLog('Failed to copy to clipboard.', 'error');
  }
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
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }

  state.metrics = {};
  state.suggestions = [];
  state.optimizations = [];
  state.postLoadScripts = [];
  state.activeFixes.clear();
  state.lighthouseBefore = null;
  state.lighthouseAfter = null;
  state.answer = null;
  state.error = null;
  state.reportId = null;

  els.agentLog.innerHTML = '';
  els.lighthouseSection.innerHTML = '';
  els.lighthouseSection.classList.add('hidden');
  els.answerContent.textContent = '';
  els.metricsGrid.innerHTML = '';
  els.suggestionsList.innerHTML = '';
  els.optimizationList.innerHTML = '';
  els.suggestionCount.textContent = '0';
  els.testSelectedBtn.classList.add('hidden');
  els.exportAllBtn.classList.add('hidden');
  els.clearFixesBtn.classList.add('hidden');
  state.activeFixes.clear();

  hideSection(els.agentLogSection);
  hideSection(els.answerSection);
  hideSection(els.metricsSection);
  hideSection(els.suggestionsSection);
  hideSection(els.optimizationSection);
  hideSection(els.applySection);
  hideSection(els.errorSection);
  els.viewReportLink.href = '#';

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
