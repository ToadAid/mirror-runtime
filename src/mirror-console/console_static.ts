export function renderMirrorConsoleHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mirror Runtime Web UI</title>
    <style>
      :root {
        --bg: #f2efe8;
        --panel: #fffdf8;
        --line: #d5cbbb;
        --ink: #152019;
        --muted: #5d6a61;
        --accent: #2f6f57;
        --accent-2: #c56c37;
        --danger: #9c4320;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, #fff9ef, transparent 40%),
          linear-gradient(180deg, #f7f2e7, var(--bg));
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
      }
      .shell {
        display: grid;
        grid-template-columns: 240px minmax(0, 1fr);
        min-height: 100vh;
      }
      aside {
        border-right: 1px solid var(--line);
        background: rgba(255, 253, 248, 0.88);
        padding: 24px 18px;
      }
      main {
        padding: 24px;
        display: grid;
        gap: 16px;
      }
      h1, h2, h3, p { margin: 0; }
      .brand {
        margin-bottom: 20px;
      }
      .brand p,
      .meta,
      .hint {
        color: var(--muted);
        line-height: 1.4;
      }
      .brand p {
        margin-top: 8px;
      }
      .nav {
        display: grid;
        gap: 10px;
      }
      .nav button, .action {
        width: 100%;
        border: 1px solid var(--line);
        background: var(--panel);
        color: var(--ink);
        border-radius: 14px;
        padding: 12px 14px;
        text-align: left;
        cursor: pointer;
      }
      .nav button.active {
        border-color: var(--accent);
        background: #ecf6f1;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 16px;
      }
      .header .meta {
        color: var(--muted);
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
      }
      .card, .panel {
        border: 1px solid var(--line);
        background: rgba(255, 253, 248, 0.92);
        border-radius: 16px;
        padding: 16px;
        box-shadow: 0 12px 30px rgba(27, 39, 32, 0.05);
      }
      .card h3, .panel h2 {
        margin-bottom: 8px;
      }
      .card .value {
        font-size: 1.35rem;
        font-weight: 700;
      }
      .grid-two {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 16px;
      }
      .chat-log, .events-log, pre {
        min-height: 280px;
        max-height: 420px;
        overflow: auto;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: #faf6ed;
        padding: 12px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      textarea, input, select {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: white;
        color: var(--ink);
        padding: 12px;
        font: inherit;
      }
      textarea { min-height: 120px; resize: vertical; }
      .stack { display: grid; gap: 12px; }
      .row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .row .action {
        width: auto;
        background: var(--accent);
        color: white;
        border: 0;
        padding: 10px 16px;
      }
      .row .action.secondary {
        background: var(--accent-2);
      }
      .row .action.danger {
        background: var(--danger);
      }
      .kv {
        display: grid;
        grid-template-columns: 160px 1fr;
        gap: 8px 14px;
      }
      .kv dt {
        color: var(--muted);
      }
      .hidden { display: none; }
      .pill {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #e8f0ea;
        color: var(--accent);
        font-size: 0.85rem;
      }
      .form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px 14px;
      }
      .field {
        display: grid;
        gap: 6px;
      }
      .field label {
        font-weight: 700;
      }
      .field.checkbox {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-top: 26px;
      }
      .field.checkbox input {
        width: auto;
      }
      .status {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px;
        background: #f8f4eb;
      }
      .status.error {
        border-color: #e8bba6;
        background: #fff2eb;
        color: var(--danger);
      }
      .mini-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .mini-card {
        border: 1px solid var(--line);
        border-radius: 14px;
        background: #faf6ed;
        padding: 12px;
        display: grid;
        gap: 6px;
      }
      .mini-card strong {
        font-size: 1rem;
      }
      code, pre {
        font-family: "SFMono-Regular", "Menlo", monospace;
      }
      @media (max-width: 900px) {
        .shell { grid-template-columns: 1fr; }
        aside { border-right: 0; border-bottom: 1px solid var(--line); }
        .grid-two { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <div class="brand">
          <h1>Mirror</h1>
          <p>Local operator UI for runtime health, workspace visibility, provider status, events, settings, and live chat.</p>
        </div>
        <div class="nav">
          <button class="active" data-tab="dashboard">Dashboard</button>
          <button data-tab="chat">Chat</button>
          <button data-tab="events">Events</button>
          <button data-tab="workspace">Workspace</button>
          <button data-tab="provider">Provider</button>
          <button data-tab="settings">Settings</button>
        </div>
      </aside>
      <main>
        <div class="header">
          <div>
            <h2 id="page-title">Dashboard</h2>
            <div class="meta" id="page-meta">Loading runtime state…</div>
          </div>
          <div class="pill" id="runtime-pill">connecting</div>
        </div>

        <section id="tab-dashboard" class="stack">
          <div class="cards">
            <div class="card"><h3>Node</h3><div class="value" id="card-node">-</div></div>
            <div class="card"><h3>Port</h3><div class="value" id="card-port">-</div></div>
            <div class="card"><h3>Provider</h3><div class="value" id="card-provider">-</div></div>
            <div class="card"><h3>Workspace</h3><div class="value" id="card-workspace">-</div></div>
            <div class="card"><h3>Lore</h3><div class="value" id="card-lore">-</div></div>
            <div class="card"><h3>Sessions</h3><div class="value" id="card-sessions">-</div></div>
          </div>
          <div class="grid-two">
            <div class="panel">
              <h2>Runtime</h2>
              <dl class="kv" id="runtime-kv"></dl>
            </div>
            <div class="panel">
              <h2>Workspace</h2>
              <dl class="kv" id="workspace-kv"></dl>
            </div>
          </div>
        </section>

        <section id="tab-chat" class="stack hidden">
          <div class="panel stack">
            <h2>Local Chat</h2>
            <div class="meta">This hits the live <code>/mirror/chat</code> runtime path.</div>
            <textarea id="chat-input" placeholder="Ask Mirror something local…">Summarize the current runtime state.</textarea>
            <div class="row">
              <button class="action" id="send-chat">Send</button>
              <button class="action secondary" id="clear-chat">Clear</button>
            </div>
            <div class="chat-log" id="chat-log"></div>
          </div>
        </section>

        <section id="tab-events" class="stack hidden">
          <div class="panel stack">
            <h2>Runtime Events</h2>
            <div class="meta">Live from <code>/mirror/runtime/events</code>.</div>
            <div class="events-log" id="events-log"></div>
          </div>
        </section>

        <section id="tab-workspace" class="stack hidden">
          <div class="panel stack">
            <h2>Workspace Layout</h2>
            <pre id="workspace-json"></pre>
          </div>
        </section>

        <section id="tab-provider" class="stack hidden">
          <div class="panel stack">
            <h2>Provider Summary</h2>
            <pre id="provider-json"></pre>
          </div>
        </section>

        <section id="tab-settings" class="stack hidden">
          <div class="panel stack">
            <h2>Settings</h2>
            <div class="meta">These fields write to <code>~/.mirror/config/</code>. Bootstrap overrides still live in <code>~/.config/mirror-runtime/mirror-runtime.env</code>.</div>
            <div class="status hidden" id="settings-status"></div>
          </div>

          <div class="panel stack">
            <h2>Runtime Basics</h2>
            <div class="form-grid">
              <div class="field">
                <label for="settings-runtime-port">Runtime port</label>
                <input id="settings-runtime-port" type="number" min="1" max="65535" />
              </div>
              <div class="field">
                <label for="settings-runtime-node-id">Node ID</label>
                <input id="settings-runtime-node-id" type="text" />
              </div>
              <div class="field">
                <label for="settings-runtime-base-url">Base URL</label>
                <input id="settings-runtime-base-url" type="text" placeholder="http://127.0.0.1:7777" />
              </div>
              <div class="field checkbox">
                <input id="settings-runtime-web-ui" type="checkbox" />
                <label for="settings-runtime-web-ui">Local Web UI enabled</label>
              </div>
              <div class="field" style="grid-column: 1 / -1;">
                <label for="settings-workspace-root">Workspace root</label>
                <input id="settings-workspace-root" type="text" readonly />
                <div class="hint">Workspace path is shown here for visibility. Editing it stays manual for now.</div>
              </div>
            </div>
          </div>

          <div class="panel stack">
            <h2>Provider Basics</h2>
            <div class="hint">Provider kind labels compatibility profiles. Runtime execution currently uses one OpenAI-compatible request path.</div>
            <div class="form-grid">
              <div class="field">
                <label for="settings-provider-kind">Provider kind</label>
                <select id="settings-provider-kind">
                  <option value="ollama">ollama</option>
                  <option value="lmstudio">lmstudio</option>
                  <option value="openai">openai</option>
                  <option value="custom">custom</option>
                </select>
              </div>
              <div class="field">
                <label for="settings-provider-url">Provider URL</label>
                <input id="settings-provider-url" type="text" placeholder="http://127.0.0.1:11434/v1/chat/completions" />
              </div>
              <div class="field">
                <label for="settings-provider-model">Default model</label>
                <input id="settings-provider-model" type="text" placeholder="llama3.2:latest" />
              </div>
              <div class="field checkbox">
                <input id="settings-provider-enabled" type="checkbox" />
                <label for="settings-provider-enabled">Provider enabled</label>
              </div>
            </div>
            <div class="row">
              <button class="action" id="save-runtime-provider">Save runtime and provider</button>
            </div>
            <div class="hint">Saving runtime or provider basics writes structured config and requires a runtime restart.</div>
          </div>

          <div class="panel stack">
            <h2>Credentials</h2>
            <div class="hint">Existing secrets stay redacted. Leave fields blank to keep the current value.</div>
            <div class="form-grid">
              <div class="field">
                <label for="settings-auth-token">Current operator token for saving</label>
                <input id="settings-auth-token" type="password" placeholder="Required only if operator auth is configured" />
              </div>
              <div class="field">
                <label for="settings-provider-token">New provider token</label>
                <input id="settings-provider-token" type="password" placeholder="Loading…" />
              </div>
              <div class="field">
                <label for="settings-operator-token">New operator token</label>
                <input id="settings-operator-token" type="password" placeholder="Loading…" />
              </div>
              <div class="field">
                <label for="settings-telegram-token">New Telegram bot token</label>
                <input id="settings-telegram-token" type="password" placeholder="Loading…" />
              </div>
            </div>
            <div class="row">
              <button class="action secondary" id="save-credentials">Save credentials</button>
            </div>
          </div>

          <div class="panel stack">
            <h2>Connector Mode</h2>
            <div class="hint">Choose how this Mirror runtime is being used right now.</div>
            <div class="form-grid">
              <div class="field">
                <label for="settings-connectors-mode">Operating mode</label>
                <select id="settings-connectors-mode">
                  <option value="api_only">api_only</option>
                  <option value="local_ui">local_ui</option>
                  <option value="connectors">connectors</option>
                </select>
              </div>
            </div>
            <div class="hint" id="settings-connectors-mode-help">API-only mode means no external connector is actively being configured.</div>
          </div>

          <div class="panel stack">
            <h2>Connector Status</h2>
            <div class="mini-cards">
              <div class="mini-card">
                <strong>Local Web UI</strong>
                <div id="connector-status-local-web-ui-enabled">-</div>
                <div id="connector-status-local-web-ui-state" class="hint">-</div>
              </div>
              <div class="mini-card">
                <strong>Telegram</strong>
                <div id="connector-status-telegram-enabled">-</div>
                <div id="connector-status-telegram-state" class="hint">-</div>
                <div id="connector-status-telegram-bot" class="hint">-</div>
                <div id="connector-status-telegram-poll" class="hint">-</div>
                <div id="connector-status-telegram-running" class="hint">-</div>
                <div id="connector-status-telegram-error" class="hint">-</div>
              </div>
              <div class="mini-card">
                <strong>WhatsApp</strong>
                <div id="connector-status-whatsapp-enabled">-</div>
                <div id="connector-status-whatsapp-state" class="hint">-</div>
              </div>
            </div>
          </div>

          <div class="panel stack">
            <h2>Telegram</h2>
            <div class="hint">Telegram uses structured config plus stored credentials. Runtime status below reflects live token validation and polling state.</div>
            <div class="form-grid">
              <div class="field checkbox">
                <input id="settings-telegram-enabled" type="checkbox" />
                <label for="settings-telegram-enabled">Telegram enabled</label>
              </div>
              <div class="field">
                <label for="settings-telegram-setup-state">Telegram setup state</label>
                <select id="settings-telegram-setup-state">
                  <option value="unconfigured">unconfigured</option>
                  <option value="configured">configured</option>
                  <option value="paired">paired</option>
                </select>
              </div>
              <div class="field">
                <label for="settings-telegram-token-status">Telegram token status</label>
                <input id="settings-telegram-token-status" type="text" readonly />
              </div>
            </div>
            <div class="row">
              <button class="action" id="save-connectors">Save connector settings</button>
            </div>
          </div>

          <div class="panel stack">
            <h2>WhatsApp</h2>
            <div class="hint">WhatsApp QR and session flow are intentionally deferred. This panel only records operator intent and visible setup state.</div>
            <div class="form-grid">
              <div class="field checkbox">
                <input id="settings-whatsapp-enabled" type="checkbox" />
                <label for="settings-whatsapp-enabled">WhatsApp enabled</label>
              </div>
              <div class="field">
                <label for="settings-whatsapp-setup-state">WhatsApp setup state</label>
                <select id="settings-whatsapp-setup-state">
                  <option value="unconfigured">unconfigured</option>
                  <option value="configured">configured</option>
                  <option value="paired">paired</option>
                </select>
              </div>
              <div class="field" style="grid-column: 1 / -1;">
                <label for="settings-whatsapp-placeholder">Deferred deeper setup</label>
                <input
                  id="settings-whatsapp-placeholder"
                  type="text"
                  readonly
                  value="QR/session linking will arrive in a later connector phase."
                />
              </div>
            </div>
          </div>

          <div class="panel stack">
            <h2>Apply Changes</h2>
            <div class="hint">After saving settings, restart the runtime service so the new structured config is loaded.</div>
            <pre id="settings-restart-command">systemctl --user restart mirror-runtime.service</pre>
          </div>
        </section>
      </main>
    </div>
    <script>
      const tabs = ["dashboard", "chat", "events", "workspace", "provider", "settings"];
      const state = {
        status: null,
        workspace: null,
        providers: null,
        settings: null,
        eventSource: null,
      };

      function setTab(next) {
        for (const tab of tabs) {
          document.querySelector('[data-tab="' + tab + '"]').classList.toggle("active", tab === next);
          document.getElementById('tab-' + tab).classList.toggle('hidden', tab !== next);
        }
        document.getElementById('page-title').textContent = next[0].toUpperCase() + next.slice(1);
      }

      async function getJson(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(url + ' -> ' + res.status);
        return await res.json();
      }

      async function requestJson(url, init) {
        const res = await fetch(url, init);
        const body = await res.json();
        if (!res.ok) {
          throw new Error(body?.error || (url + ' -> ' + res.status));
        }
        return body;
      }

      function setKv(targetId, entries) {
        const node = document.getElementById(targetId);
        node.innerHTML = entries.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('');
      }

      function appendLog(targetId, line) {
        const log = document.getElementById(targetId);
        log.textContent += (log.textContent ? "\\n" : "") + line;
        log.scrollTop = log.scrollHeight;
      }

      function restartCommand() {
        return 'systemctl --user restart mirror-runtime.service';
      }

      function connectorEnabledLabel(enabled) {
        return enabled === false ? 'disabled' : 'enabled';
      }

      function connectorStateLabel(state, fallback) {
        return state || fallback || 'unconfigured';
      }

      function providerLabelForKind(kind) {
        if (kind === 'ollama') return 'Local Ollama';
        if (kind === 'lmstudio') return 'Local LM Studio';
        if (kind === 'openai') return 'OpenAI Compatible';
        return 'Primary Provider';
      }

      function connectorModeHelp(mode) {
        return mode === 'connectors'
          ? 'Connectors mode means external messaging or app integrations are being configured.'
          : mode === 'local_ui'
            ? 'Local UI mode means this runtime is primarily being used through mirror web and mirror tui.'
            : 'API-only mode means no external connector is actively being configured.';
      }

      function formatTimestamp(value) {
        if (!value) {
          return 'never';
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
      }

      function telegramBotLabel(runtime) {
        if (!runtime?.bot) {
          return 'bot identity unavailable';
        }
        const username = runtime.bot.username ? '@' + runtime.bot.username : 'no username';
        const displayName = runtime.bot.display_name ? runtime.bot.display_name + ' · ' : '';
        return displayName + username + ' · id ' + runtime.bot.id;
      }

      function setSettingsStatus(message, tone) {
        const node = document.getElementById('settings-status');
        node.textContent = message;
        node.classList.remove('hidden', 'error');
        if (tone === 'error') {
          node.classList.add('error');
        }
      }

      function clearSettingsStatus() {
        const node = document.getElementById('settings-status');
        node.textContent = '';
        node.classList.add('hidden');
        node.classList.remove('error');
      }

      function authHeaders() {
        const token = document.getElementById('settings-auth-token').value.trim();
        if (!token) {
          return {
            'content-type': 'application/json',
          };
        }
        return {
          'content-type': 'application/json',
          'x-mirror-operator-token': token,
        };
      }

      function renderSettings(settings) {
        state.settings = settings;
        const runtime = settings.mirror?.runtime || {};
        const workspaceRoot = settings.resolved?.workspace?.root || '';
        const activeProvider = settings.resolved?.provider?.active;
        const connectors = settings.connectors || {};
        const connectorRuntime = settings.resolved?.connectors || {};
        const telegramRuntime = connectorRuntime.telegram || null;
        const telegram = connectors.connectors?.telegram || {};
        const whatsapp = connectors.connectors?.whatsapp || {};
        const providerEntry =
          settings.providers.providers.find((entry) => entry.id === settings.providers.default_provider_id) ||
          settings.providers.providers[0] ||
          activeProvider ||
          null;

        document.getElementById('settings-runtime-port').value = String(
          runtime.port || settings.resolved.runtime.port || 7777,
        );
        document.getElementById('settings-runtime-node-id').value =
          runtime.node_id || settings.resolved.runtime.node_id || '';
        document.getElementById('settings-runtime-base-url').value =
          runtime.base_url || settings.resolved.runtime.base_url || '';
        document.getElementById('settings-runtime-web-ui').checked =
          Boolean(runtime.web_ui_enabled ?? settings.connectors?.local_web_ui?.enabled ?? true);
        document.getElementById('settings-workspace-root').value = workspaceRoot;

        document.getElementById('settings-provider-kind').value =
          providerEntry?.kind || activeProvider?.kind || 'custom';
        document.getElementById('settings-provider-url').value =
          providerEntry?.url || activeProvider?.url || '';
        document.getElementById('settings-provider-model').value =
          providerEntry?.model || activeProvider?.model || '';
        document.getElementById('settings-provider-enabled').checked =
          providerEntry?.enabled !== false;

        const providerConfigured = Boolean(settings.credentials?.['provider:primary']?.configured || activeProvider?.credential_id && settings.credentials?.[activeProvider.credential_id]?.configured);
        const operatorConfigured = Boolean(settings.credentials?.['operator:local']?.configured);
        const telegramConfigured = Boolean(settings.credentials?.['telegram:default']?.configured);
        document.getElementById('settings-provider-token').placeholder = providerConfigured ? 'configured' : 'not configured';
        document.getElementById('settings-operator-token').placeholder = operatorConfigured ? 'configured' : 'not configured';
        document.getElementById('settings-telegram-token').placeholder = telegramConfigured ? 'configured' : 'not configured';
        document.getElementById('settings-telegram-token-status').value = telegramConfigured ? 'configured' : 'not configured';

        document.getElementById('settings-connectors-mode').value =
          connectors.mode || 'api_only';
        document.getElementById('settings-connectors-mode-help').textContent =
          connectorModeHelp(connectors.mode || 'api_only');

        document.getElementById('settings-telegram-enabled').checked = telegram.enabled === true;
        document.getElementById('settings-telegram-setup-state').value =
          connectorStateLabel(telegram.setup_state, 'unconfigured');
        document.getElementById('settings-whatsapp-enabled').checked = whatsapp.enabled === true;
        document.getElementById('settings-whatsapp-setup-state').value =
          connectorStateLabel(whatsapp.setup_state, 'unconfigured');

        document.getElementById('connector-status-local-web-ui-enabled').textContent =
          connectorEnabledLabel(connectors.local_web_ui?.enabled !== false);
        document.getElementById('connector-status-local-web-ui-state').textContent =
          connectors.local_web_ui?.enabled === false ? 'local UI disabled' : 'available for mirror web and mirror tui';
        document.getElementById('connector-status-telegram-enabled').textContent =
          connectorEnabledLabel(telegram.enabled);
        document.getElementById('connector-status-telegram-state').textContent =
          (telegramRuntime
            ? telegramRuntime.state +
              (telegramRuntime.detail ? ' · ' + telegramRuntime.detail : '')
            : connectorStateLabel(telegram.setup_state, telegramConfigured ? 'configured' : 'unconfigured') +
              ' · token ' +
              (telegramConfigured ? 'configured' : 'not configured'));
        document.getElementById('connector-status-telegram-bot').textContent =
          telegramRuntime ? telegramBotLabel(telegramRuntime) : 'bot identity unavailable';
        document.getElementById('connector-status-telegram-poll').textContent =
          telegramRuntime
            ? 'last successful poll ' + formatTimestamp(telegramRuntime.last_successful_poll_at) +
              ' · updates processed ' + String(telegramRuntime.updates_processed || 0)
            : 'last successful poll never';
        document.getElementById('connector-status-telegram-running').textContent =
          telegramRuntime
            ? (telegramRuntime.running ? 'polling active' : 'polling not active')
            : 'polling not active';
        document.getElementById('connector-status-telegram-error').textContent =
          telegramRuntime?.last_error_summary
            ? 'last error ' + telegramRuntime.last_error_summary +
              (telegramRuntime.last_error_at ? ' · ' + formatTimestamp(telegramRuntime.last_error_at) : '')
            : 'no recent Telegram error';
        document.getElementById('connector-status-whatsapp-enabled').textContent =
          connectorEnabledLabel(whatsapp.enabled);
        document.getElementById('connector-status-whatsapp-state').textContent =
          connectorStateLabel(whatsapp.setup_state, 'unconfigured') +
          ' · deeper QR/session setup deferred';
        document.getElementById('settings-restart-command').textContent = restartCommand();
      }

      async function refreshDashboard() {
        const [statusEnvelope, workspace, providers, settings] = await Promise.all([
          getJson('/mirror/ui/runtime/status'),
          getJson('/mirror/workspace'),
          getJson('/mirror/providers'),
          getJson('/mirror/settings'),
        ]);
        state.status = statusEnvelope;
        state.workspace = workspace;
        state.providers = providers;

        const runtime = statusEnvelope.data.runtime;
        const health = statusEnvelope.data.health;
        document.getElementById('page-meta').textContent =
          'node ' + health.service.node_id + ' on port ' + health.service.port;
        document.getElementById('runtime-pill').textContent = health.provider.ready ? 'provider ready' : 'provider not ready';
        document.getElementById('card-node').textContent = health.service.node_id;
        document.getElementById('card-port').textContent = String(health.service.port);
        document.getElementById('card-provider').textContent = health.provider.ready ? 'ready' : 'not ready';
        document.getElementById('card-workspace').textContent = workspace.workspace_root;
        document.getElementById('card-lore').textContent = String(workspace.directories.lore.entries);
        document.getElementById('card-sessions').textContent = String(runtime.sessions.open);

        setKv('runtime-kv', [
          ['base url', health.service.base_url || 'local only'],
          ['provider url', health.service.provider_url],
          ['operator auth', health.service.operator_auth_configured ? 'configured' : 'unset'],
          ['active provider', health.provider.active_provider_id || 'none'],
          ['providers available', String(health.provider.available)],
          ['recent events', String(runtime.event_stream.recent_events)],
        ]);
        setKv('workspace-kv', [
          ['workspace root', workspace.workspace_root],
          ['users root', workspace.users_root],
          ['lore root', workspace.lore_root],
          ['state root', workspace.state_root],
          ['logs root', workspace.logs_root],
          ['memory db', workspace.memory_db_path],
        ]);
        document.getElementById('workspace-json').textContent = JSON.stringify(workspace, null, 2);
        document.getElementById('provider-json').textContent = JSON.stringify(providers, null, 2);
        renderSettings(settings);
      }

      async function sendChat() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text) return;
        appendLog('chat-log', 'you: ' + text);
        input.value = '';
        const res = await fetch('/mirror/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'mirror-default',
            messages: [{ role: 'user', content: text }],
          }),
        });
        const body = await res.json();
        const answer = body?.choices?.[0]?.message?.content || JSON.stringify(body, null, 2);
        appendLog('chat-log', 'mirror: ' + answer);
      }

      function buildSettingsPayload() {
        const current = state.settings;
        const mirror = JSON.parse(JSON.stringify(current.mirror));
        const providers = JSON.parse(JSON.stringify(current.providers));
        const connectors = JSON.parse(JSON.stringify(current.connectors));

        mirror.runtime = mirror.runtime || {};
        mirror.workspace = mirror.workspace || {};
        mirror.onboarding = mirror.onboarding || {};
        mirror.runtime.port = Number.parseInt(document.getElementById('settings-runtime-port').value, 10) || 7777;
        mirror.runtime.node_id = document.getElementById('settings-runtime-node-id').value.trim() || 'mirror-node-local';
        const baseUrl = document.getElementById('settings-runtime-base-url').value.trim();
        mirror.runtime.base_url = baseUrl || null;
        mirror.runtime.web_ui_enabled = document.getElementById('settings-runtime-web-ui').checked;
        mirror.workspace.root = current.resolved.workspace.root;

        connectors.local_web_ui = connectors.local_web_ui || {};
        connectors.local_web_ui.enabled = document.getElementById('settings-runtime-web-ui').checked;

        providers.providers = Array.isArray(providers.providers) ? providers.providers : [];
        const providerId =
          providers.default_provider_id ||
          current.resolved.provider.active?.id ||
          providers.providers[0]?.id ||
          'primary';
        providers.default_provider_id = providerId;
        const existingProviderIndex = providers.providers.findIndex((entry) => entry.id === providerId);
        const currentProvider = existingProviderIndex >= 0
          ? providers.providers[existingProviderIndex]
          : {
              id: providerId,
              credential_id: 'provider:' + providerId,
            };
        const kind = document.getElementById('settings-provider-kind').value;
        const nextProvider = {
          id: providerId,
          kind,
          label: providerLabelForKind(kind),
          url: document.getElementById('settings-provider-url').value.trim(),
          model: document.getElementById('settings-provider-model').value.trim() || null,
          enabled: document.getElementById('settings-provider-enabled').checked,
          credential_id: currentProvider.credential_id || 'provider:' + providerId,
        };
        if (existingProviderIndex >= 0) {
          providers.providers[existingProviderIndex] = nextProvider;
        } else {
          providers.providers.push(nextProvider);
        }

        return { mirror, providers, connectors };
      }

      function buildConnectorSettingsPayload() {
        const current = state.settings;
        const connectors = JSON.parse(JSON.stringify(current.connectors));
        connectors.local_web_ui = connectors.local_web_ui || {};
        connectors.connectors = connectors.connectors || {};
        connectors.mode = document.getElementById('settings-connectors-mode').value;
        connectors.local_web_ui.enabled = document.getElementById('settings-runtime-web-ui').checked;
        connectors.connectors.telegram = {
          enabled: document.getElementById('settings-telegram-enabled').checked,
          setup_state: document.getElementById('settings-telegram-setup-state').value,
          credential_id: 'telegram:default',
        };
        connectors.connectors.whatsapp = {
          enabled: document.getElementById('settings-whatsapp-enabled').checked,
          setup_state: document.getElementById('settings-whatsapp-setup-state').value,
          credential_id: connectors.connectors.whatsapp?.credential_id || null,
        };
        return {
          mirror: current.mirror,
          providers: current.providers,
          connectors,
        };
      }

      async function saveRuntimeAndProvider() {
        clearSettingsStatus();
        const payload = buildSettingsPayload();
        const body = await requestJson('/mirror/settings', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
        await refreshDashboard();
        setSettingsStatus(
          body.restart_required
            ? 'Settings saved. Restart required: ' + restartCommand()
            : 'Settings saved.',
        );
      }

      async function saveConnectors() {
        clearSettingsStatus();
        const payload = buildConnectorSettingsPayload();
        const body = await requestJson('/mirror/settings', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(payload),
        });
        await refreshDashboard();
        setSettingsStatus(
          body.restart_required
            ? 'Connector settings saved. Restart required: ' + restartCommand()
            : 'Connector settings saved.',
        );
      }

      async function saveCredentials() {
        clearSettingsStatus();
        const providerToken = document.getElementById('settings-provider-token').value.trim();
        const operatorToken = document.getElementById('settings-operator-token').value.trim();
        const telegramToken = document.getElementById('settings-telegram-token').value.trim();
        const providerId =
          state.settings.providers.default_provider_id ||
          state.settings.resolved.provider.active?.id ||
          'primary';
        const credentials = {};
        if (providerToken) {
          credentials['provider:' + providerId] = {
            type: 'bearer_token',
            value: providerToken,
          };
        }
        if (operatorToken) {
          credentials['operator:local'] = {
            type: 'operator_token',
            value: operatorToken,
          };
        }
        if (telegramToken) {
          credentials['telegram:default'] = {
            type: 'bot_token',
            value: telegramToken,
          };
        }
        if (Object.keys(credentials).length === 0) {
          setSettingsStatus('No credential changes to save.');
          return;
        }
        const body = await requestJson('/mirror/settings/credentials', {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({ credentials }),
        });
        document.getElementById('settings-provider-token').value = '';
        document.getElementById('settings-operator-token').value = '';
        document.getElementById('settings-telegram-token').value = '';
        await refreshDashboard();
        setSettingsStatus(
          body.restart_required
            ? 'Credentials saved. Restart required: ' + restartCommand()
            : 'Credentials saved.',
        );
      }

      function startEvents() {
        const source = new EventSource('/mirror/runtime/events');
        state.eventSource = source;
        source.addEventListener('open', () => appendLog('events-log', '[connected]'));
        source.addEventListener('error', () => appendLog('events-log', '[stream error]'));
        source.onmessage = (event) => appendLog('events-log', event.data);
        for (const type of ['runtime.health.requested', 'chat.started', 'chat.finished', 'tool.executed', 'policy.denied', 'sync.announce', 'sync.pull', 'settings.updated', 'settings.credentials.updated']) {
          source.addEventListener(type, (event) => appendLog('events-log', type + ' ' + event.data));
        }
      }

      for (const button of document.querySelectorAll('[data-tab]')) {
        button.addEventListener('click', () => setTab(button.dataset.tab));
      }
      document.getElementById('send-chat').addEventListener('click', () => void sendChat());
      document.getElementById('clear-chat').addEventListener('click', () => {
        document.getElementById('chat-log').textContent = '';
      });
      document.getElementById('settings-connectors-mode').addEventListener('change', (event) => {
        document.getElementById('settings-connectors-mode-help').textContent =
          connectorModeHelp(event.target.value);
      });
      document.getElementById('save-runtime-provider').addEventListener('click', async () => {
        try {
          await saveRuntimeAndProvider();
        } catch (error) {
          setSettingsStatus(error instanceof Error ? error.message : String(error), 'error');
        }
      });
      document.getElementById('save-connectors').addEventListener('click', async () => {
        try {
          await saveConnectors();
        } catch (error) {
          setSettingsStatus(error instanceof Error ? error.message : String(error), 'error');
        }
      });
      document.getElementById('save-credentials').addEventListener('click', async () => {
        try {
          await saveCredentials();
        } catch (error) {
          setSettingsStatus(error instanceof Error ? error.message : String(error), 'error');
        }
      });

      void refreshDashboard().catch((error) => {
        setSettingsStatus(error instanceof Error ? error.message : String(error), 'error');
      });
      startEvents();
      setInterval(() => void refreshDashboard(), 3000);
    </script>
  </body>
</html>`;
}
