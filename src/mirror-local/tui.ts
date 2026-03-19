import readline from "node:readline";
import { buildMirrorOperatorEnv } from "./operator_env.js";

type MirrorTuiTab = "home" | "chat" | "events" | "workspace" | "provider";

type MirrorTuiState = {
  tab: MirrorTuiTab;
  input: string;
  chatLog: string[];
  status: Record<string, unknown> | null;
  workspace: Record<string, unknown> | null;
  providers: Record<string, unknown> | null;
  debug: Record<string, unknown> | null;
  error: string | null;
};

const TAB_ORDER: MirrorTuiTab[] = ["home", "chat", "events", "workspace", "provider"];

function section(title: string, lines: string[]): string {
  return [`== ${title} ==`, ...lines, ""].join("\n");
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function valueAtPath<T>(record: Record<string, unknown> | null, path: string[]): T | undefined {
  let current: unknown = record;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current as T | undefined;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function sendChat(baseUrl: string, message: string): Promise<string> {
  const res = await fetch(`${baseUrl}/mirror/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "mirror-default",
      messages: [{ role: "user", content: message }],
    }),
  });
  if (!res.ok) {
    throw new Error(`chat failed: ${res.status}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const first = choices[0];
  if (first && typeof first === "object") {
    const messageObj = (first as Record<string, unknown>).message;
    if (messageObj && typeof messageObj === "object") {
      const content = (messageObj as Record<string, unknown>).content;
      if (typeof content === "string" && content.trim().length > 0) {
        return content;
      }
    }
  }
  return JSON.stringify(body, null, 2);
}

function render(state: MirrorTuiState): string {
  const homeLines = [
    `Node: ${valueAtPath<string>(state.status, ["health", "service", "node_id"]) ?? "unknown"}`,
    `Port: ${valueAtPath<number>(state.status, ["health", "service", "port"]) ?? "unknown"}`,
    `Provider ready: ${asBoolean(valueAtPath<boolean>(state.status, ["health", "provider", "ready"]))}`,
    `Workspace root: ${valueAtPath<string>(state.workspace, ["workspace_root"]) ?? "unknown"}`,
    `Lore entries: ${valueAtPath<number>(state.workspace, ["directories", "lore", "entries"]) ?? 0}`,
    `Sessions open: ${valueAtPath<number>(state.status, ["runtime", "sessions", "open"]) ?? 0}`,
    `Peers known: ${valueAtPath<number>(state.status, ["health", "sync", "peers_known"]) ?? 0}`,
  ];

  const eventLines = (valueAtPath<unknown[]>(state.debug, ["recent_events"]) ?? [])
    .slice(-10)
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return JSON.stringify(entry);
      }
      const event = entry as Record<string, unknown>;
      return `${asString(event.timestamp)} ${asString(event.type, "event")}`;
    });

  const workspaceLines = Object.entries(
    valueAtPath<Record<string, unknown>>(state.workspace, ["directories"]) ?? {},
  ).map(([name, value]) => {
    const dir = value as Record<string, unknown>;
    return `${name.padEnd(10)} ${asBoolean(dir.exists) ? "present" : "missing"} (${asNumber(dir.entries)})`;
  });

  const providerLines = (valueAtPath<unknown[]>(state.providers, ["providers"]) ?? []).map(
    (entry) => {
      const provider = entry as Record<string, unknown>;
      return `${asString(provider.label, asString(provider.provider_id, "provider"))} ready=${asBoolean(provider.ready)} selected=${asBoolean(provider.selected)}`;
    },
  );

  const chatLines = [...state.chatLog.slice(-12), "", `> ${state.input}`];
  const activeSection =
    state.tab === "home"
      ? section("Home", homeLines)
      : state.tab === "chat"
        ? section("Chat", chatLines)
        : state.tab === "events"
          ? section("Events", eventLines)
          : state.tab === "workspace"
            ? section("Workspace", workspaceLines)
            : section("Provider", providerLines);

  const header = [
    "Mirror TUI",
    `Tabs: ${TAB_ORDER.map((tab) => (tab === state.tab ? `[${tab}]` : tab)).join("  ")}`,
    "Keys: ←/→ switch tabs, Enter sends chat on Chat tab, q quits",
    state.error ? `Error: ${state.error}` : "Status: connected to live Mirror runtime",
    "",
  ].join("\n");

  return `\x1bc${header}${activeSection}`;
}

export async function runMirrorTui(): Promise<number> {
  const env = await buildMirrorOperatorEnv();
  const baseUrl = `http://127.0.0.1:${env.port}`;
  const state: MirrorTuiState = {
    tab: "home",
    input: "",
    chatLog: [],
    status: null,
    workspace: null,
    providers: null,
    debug: null,
    error: null,
  };

  async function refresh(): Promise<void> {
    try {
      const [statusEnvelope, workspace, providers, debug] = await Promise.all([
        fetchJson(`${baseUrl}/mirror/ui/runtime/status`),
        fetchJson(`${baseUrl}/mirror/workspace`),
        fetchJson(`${baseUrl}/mirror/providers`),
        fetchJson(`${baseUrl}/mirror/runtime/debug`),
      ]);
      state.status =
        statusEnvelope.data && typeof statusEnvelope.data === "object"
          ? (statusEnvelope.data as Record<string, unknown>)
          : statusEnvelope;
      state.workspace = workspace;
      state.providers = providers;
      state.debug = debug;
      state.error = null;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
    }
    process.stdout.write(render(state));
  }

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  const interval = setInterval(() => {
    void refresh();
  }, 2_000);

  await refresh();

  return await new Promise<number>((resolve) => {
    process.stdin.on("keypress", async (str, key) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        resolve(0);
        return;
      }
      if (key.name === "q") {
        cleanup();
        resolve(0);
        return;
      }
      if (key.name === "left") {
        const index = TAB_ORDER.indexOf(state.tab);
        state.tab = TAB_ORDER[(index + TAB_ORDER.length - 1) % TAB_ORDER.length] ?? "home";
        process.stdout.write(render(state));
        return;
      }
      if (key.name === "right" || key.name === "tab") {
        const index = TAB_ORDER.indexOf(state.tab);
        state.tab = TAB_ORDER[(index + 1) % TAB_ORDER.length] ?? "home";
        process.stdout.write(render(state));
        return;
      }
      if (state.tab !== "chat") {
        return;
      }
      if (key.name === "return") {
        const message = state.input.trim();
        state.input = "";
        if (message) {
          state.chatLog.push(`you: ${message}`);
          process.stdout.write(render(state));
          try {
            const response = await sendChat(baseUrl, message);
            state.chatLog.push(`mirror: ${response}`);
            state.error = null;
          } catch (error) {
            state.error = error instanceof Error ? error.message : String(error);
          }
          process.stdout.write(render(state));
        }
        return;
      }
      if (key.name === "backspace") {
        state.input = state.input.slice(0, -1);
        process.stdout.write(render(state));
        return;
      }
      if (typeof str === "string" && str >= " ") {
        state.input += str;
        process.stdout.write(render(state));
      }
    });

    const cleanup = () => {
      clearInterval(interval);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdout.write("\x1bc");
    };
  });
}
