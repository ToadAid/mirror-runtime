import { discoverPondAgents } from "./discovery.js";
import { getPondAgents, setPondAgents } from "./registry.js";

export async function refreshPond(): Promise<ReturnType<typeof getPondAgents>> {
  const agents = await discoverPondAgents();
  setPondAgents(agents);

  for (const agent of agents) {
    console.log("[POND] agent registered", agent.agent_id);
  }

  return agents;
}

export function listPondAgents(): ReturnType<typeof getPondAgents> {
  return getPondAgents();
}
