export function renderMirrorConsoleHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mirror Runtime Console</title>
    <style>
      :root {
        --bg: #f3efe4;
        --panel: #fffaf0;
        --ink: #1f2a24;
        --accent: #2f6f57;
        --line: #d7ccb7;
      }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background: radial-gradient(circle at top, #fffaf0, var(--bg));
        color: var(--ink);
      }
      header {
        padding: 24px;
        border-bottom: 1px solid var(--line);
      }
      main {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        padding: 20px;
      }
      section {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 8px 24px rgba(31, 42, 36, 0.06);
      }
      h1, h2 { margin: 0 0 12px; }
      textarea, input {
        width: 100%;
        box-sizing: border-box;
        margin-top: 8px;
        margin-bottom: 8px;
        padding: 10px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fff;
        color: var(--ink);
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 10px 16px;
        background: var(--accent);
        color: white;
        cursor: pointer;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        background: #f8f3e8;
        border-radius: 8px;
        padding: 12px;
        min-height: 80px;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Mirror Console</h1>
      <p>Use Mirror to chat, inspect canon, manage personal tasks and reminders, use Monk assistance, inspect sync state, and review runtime operations.</p>
      <input id="user-id" value="local-user" placeholder="Workspace user id" />
      <input id="operator-token" type="password" placeholder="Operator token for write actions" />
    </header>
    <main>
      <section><h2>Ask Mirror</h2><textarea id="chat-input">What happened to the patience vault?</textarea><button onclick="runChat()">Send</button><pre id="chat-output"></pre></section>
      <section><h2>Search Lore</h2><textarea id="find-input">patience vault</textarea><button onclick="runTool('find-scroll','find-input','find-output','query')">Search</button><pre id="find-output"></pre></section>
      <section><h2>Interpret Tweet</h2><textarea id="interpret-input">At sunrise the pond remembers renewal.</textarea><button onclick="runTool('interpret-tweet','interpret-input','interpret-output','tweet_text')">Interpret</button><pre id="interpret-output"></pre></section>
      <section><h2>Forge Scroll</h2><input id="forge-title" value="Quiet Pond" /><textarea id="forge-input">Renewal begins at sunrise.</textarea><button onclick="runForge()">Forge</button><pre id="forge-output"></pre></section>
      <section><h2>Commit Scroll</h2><textarea id="commit-input">---</textarea><button onclick="runCommit()">Commit</button><pre id="commit-output"></pre></section>
      <section><h2>Tasks</h2><input id="task-title" value="Check today&#39;s plan" /><textarea id="task-description">Review active work for today.</textarea><button onclick="createTask()">Create</button><button onclick="listTasks()">List</button><input id="task-id" placeholder="Task id for complete/delete" /><button onclick="completeTask()">Complete</button><button onclick="deleteTask()">Delete</button><pre id="task-output"></pre></section>
      <section><h2>Reminders</h2><input id="reminder-title" value="Evening check-in" /><textarea id="reminder-message">Pause and review open tasks.</textarea><input id="reminder-at" value="2026-03-13T18:00:00.000Z" /><button onclick="createReminder()">Create</button><button onclick="listReminders()">List</button><button onclick="dueReminders()">Due</button><input id="reminder-id" placeholder="Reminder id for enable/disable/delete" /><button onclick="enableReminder()">Enable</button><button onclick="disableReminder()">Disable</button><pre id="reminder-output"></pre></section>
      <section><h2>Heartbeat</h2><input id="heartbeat-threshold" value="3" /><select id="heartbeat-tone"><option value="gentle">gentle</option><option value="calm">calm</option><option value="steady">steady</option></select><label><input id="heartbeat-enabled" type="checkbox" /> enabled</label><label><input id="heartbeat-quiet" type="checkbox" /> quiet mode</label><button onclick="getHeartbeat()">Get</button><button onclick="updateHeartbeat()">Update</button><button onclick="recordSeen()">Record Seen</button><button onclick="evaluateHeartbeat()">Evaluate</button><pre id="heartbeat-output"></pre></section>
      <section><h2>Monk Assistance</h2><textarea id="monk-note">Follow up on the next open task.</textarea><input id="monk-task-id" placeholder="Task id for task follow-up" /><input id="monk-reminder-id" placeholder="Reminder id for reminder follow-up" /><button onclick="getMonkContext()">Context</button><button onclick="getMonkNextTask()">Next Task</button><button onclick="getMonkOpenWork()">Open Work</button><button onclick="getMonkReminders()">Due Reminders</button><button onclick="getMonkResume()">Resume</button><button onclick="getMonkTaskFollowup()">Follow-up Task</button><button onclick="getMonkReminderFollowup()">Follow-up Reminder</button><button onclick="recordMonkNote()">Monk Note</button><pre id="monk-output"></pre></section>
      <section><h2>Sync</h2><input id="sync-peer-id" value="mirror-peer-1" /><input id="sync-base-url" value="http://127.0.0.1:7999" /><button onclick="listSyncPeers()">Peers</button><button onclick="getSyncUpdates()">Updates</button><button onclick="announceSyncPeer()">Announce</button><button onclick="pullSyncPeer()">Pull</button><pre id="sync-output"></pre></section>
      <section><h2>Operations</h2><button onclick="getHealthStatus()">Health</button><button onclick="getMetrics()">Metrics</button><button onclick="getDiagnostics()">Diagnostics</button><pre id="ops-output"></pre></section>
      <section><h2>Browse Lore Graph</h2><input id="graph-input" value="TOBY_L1219" /><button onclick="runGraph()">Browse</button><pre id="graph-output"></pre></section>
    </main>
    <script>
      function currentUserId() {
        return document.getElementById('user-id').value;
      }
      async function postJson(url, payload) {
        const token = document.getElementById('operator-token').value;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-mirror-operator-token': token } : {}),
          },
          body: JSON.stringify(payload),
        });
        return res.json();
      }
      async function runChat() {
        const body = await postJson('/mirror/chat', { model: 'mirror-default', messages: [{ role: 'user', content: document.getElementById('chat-input').value }] });
        document.getElementById('chat-output').textContent = JSON.stringify(body, null, 2);
      }
      async function getJson(url) {
        const res = await fetch(url);
        return res.json();
      }
      async function runNamedTool(tool, payload, outputId) {
        const body = await postJson('/mirror/console/api/tools/' + tool, payload);
        document.getElementById(outputId).textContent = JSON.stringify(body, null, 2);
      }
      async function runTool(tool, inputId, outputId, field) {
        await runNamedTool('mirror.' + tool, { [field]: document.getElementById(inputId).value }, outputId);
      }
      async function runForge() {
        await runNamedTool('mirror.forge-scroll', { title: document.getElementById('forge-title').value, category: 'L', narrative: document.getElementById('forge-input').value }, 'forge-output');
      }
      async function runCommit() {
        await runNamedTool('mirror.commit-scroll', { draft_scroll_content: document.getElementById('commit-input').value, dry_run: true }, 'commit-output');
      }
      async function createTask() {
        await runNamedTool('mirror.task.create', {
          user_id: currentUserId(),
          title: document.getElementById('task-title').value,
          description: document.getElementById('task-description').value,
        }, 'task-output');
      }
      async function listTasks() {
        await runNamedTool('mirror.task.list', {
          user_id: currentUserId(),
        }, 'task-output');
      }
      async function completeTask() {
        await runNamedTool('mirror.task.complete', {
          user_id: currentUserId(),
          task_id: document.getElementById('task-id').value,
        }, 'task-output');
      }
      async function deleteTask() {
        await runNamedTool('mirror.task.delete', {
          user_id: currentUserId(),
          task_id: document.getElementById('task-id').value,
        }, 'task-output');
      }
      async function createReminder() {
        await runNamedTool('mirror.reminder.create', {
          user_id: currentUserId(),
          title: document.getElementById('reminder-title').value,
          message: document.getElementById('reminder-message').value,
          remind_at: document.getElementById('reminder-at').value,
        }, 'reminder-output');
      }
      async function listReminders() {
        await runNamedTool('mirror.reminder.list', {
          user_id: currentUserId(),
        }, 'reminder-output');
      }
      async function dueReminders() {
        await runNamedTool('mirror.reminder.due', {
          user_id: currentUserId(),
        }, 'reminder-output');
      }
      async function enableReminder() {
        await runNamedTool('mirror.reminder.enable', {
          user_id: currentUserId(),
          reminder_id: document.getElementById('reminder-id').value,
        }, 'reminder-output');
      }
      async function disableReminder() {
        await runNamedTool('mirror.reminder.disable', {
          user_id: currentUserId(),
          reminder_id: document.getElementById('reminder-id').value,
        }, 'reminder-output');
      }
      async function getHeartbeat() {
        await runNamedTool('mirror.heartbeat.get', {
          user_id: currentUserId(),
        }, 'heartbeat-output');
      }
      async function updateHeartbeat() {
        await runNamedTool('mirror.heartbeat.update', {
          user_id: currentUserId(),
          enabled: document.getElementById('heartbeat-enabled').checked,
          quiet_mode: document.getElementById('heartbeat-quiet').checked,
          preferred_tone: document.getElementById('heartbeat-tone').value,
          check_in_after_inactivity_days: Number.parseInt(document.getElementById('heartbeat-threshold').value, 10),
        }, 'heartbeat-output');
      }
      async function recordSeen() {
        await runNamedTool('mirror.heartbeat.record-seen', {
          user_id: currentUserId(),
        }, 'heartbeat-output');
      }
      async function evaluateHeartbeat() {
        await runNamedTool('mirror.heartbeat.evaluate', {
          user_id: currentUserId(),
        }, 'heartbeat-output');
      }
      async function getMonkContext() {
        await runNamedTool('mirror.monk.context', {
          user_id: currentUserId(),
        }, 'monk-output');
      }
      async function getMonkNextTask() {
        await runNamedTool('mirror.monk.next-task', {
          user_id: currentUserId(),
        }, 'monk-output');
      }
      async function getMonkOpenWork() {
        await runNamedTool('mirror.monk.open-work', {
          user_id: currentUserId(),
        }, 'monk-output');
      }
      async function getMonkReminders() {
        await runNamedTool('mirror.monk.due-reminders', {
          user_id: currentUserId(),
        }, 'monk-output');
      }
      async function getMonkResume() {
        await runNamedTool('mirror.monk.resume', {
          user_id: currentUserId(),
        }, 'monk-output');
      }
      async function getMonkTaskFollowup() {
        await runNamedTool('mirror.monk.followup-task', {
          user_id: currentUserId(),
          task_id: document.getElementById('monk-task-id').value,
        }, 'monk-output');
      }
      async function getMonkReminderFollowup() {
        await runNamedTool('mirror.monk.followup-reminder', {
          user_id: currentUserId(),
          reminder_id: document.getElementById('monk-reminder-id').value,
        }, 'monk-output');
      }
      async function recordMonkNote() {
        await runNamedTool('mirror.monk.note', {
          user_id: currentUserId(),
          note: document.getElementById('monk-note').value,
        }, 'monk-output');
      }
      async function listSyncPeers() {
        const body = await getJson('/mirror/console/api/sync/peers');
        document.getElementById('sync-output').textContent = JSON.stringify(body, null, 2);
      }
      async function getSyncUpdates() {
        const body = await getJson('/mirror/console/api/sync/updates');
        document.getElementById('sync-output').textContent = JSON.stringify(body, null, 2);
      }
      async function announceSyncPeer() {
        const body = await postJson('/mirror-sync/announce', {
          peer_id: document.getElementById('sync-peer-id').value,
          base_url: document.getElementById('sync-base-url').value,
        });
        document.getElementById('sync-output').textContent = JSON.stringify(body, null, 2);
      }
      async function pullSyncPeer() {
        const body = await postJson('/mirror/console/api/sync/pull', {
          peer_id: document.getElementById('sync-peer-id').value,
          base_url: document.getElementById('sync-base-url').value,
        });
        document.getElementById('sync-output').textContent = JSON.stringify(body, null, 2);
      }
      async function getHealthStatus() {
        const body = await getJson('/mirror/console/api/ops/health');
        document.getElementById('ops-output').textContent = JSON.stringify(body, null, 2);
      }
      async function getMetrics() {
        const body = await getJson('/mirror/console/api/ops/metrics');
        document.getElementById('ops-output').textContent = JSON.stringify(body, null, 2);
      }
      async function getDiagnostics() {
        const body = await getJson('/mirror/console/api/ops/diagnostics');
        document.getElementById('ops-output').textContent = JSON.stringify(body, null, 2);
      }
      async function runGraph() {
        const query = encodeURIComponent(document.getElementById('graph-input').value);
        const res = await fetch('/mirror/console/api/graph/related?scroll=' + query);
        const body = await res.json();
        document.getElementById('graph-output').textContent = JSON.stringify(body, null, 2);
      }
    </script>
  </body>
</html>`;
}
