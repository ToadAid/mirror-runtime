import { mirrorEchoSkill } from "./builtins/echo/skill.js";
import type { MirrorSkill } from "./types.js";

export function getBuiltinMirrorSkills(): MirrorSkill[] {
  return [mirrorEchoSkill];
}
