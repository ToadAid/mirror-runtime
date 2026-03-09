import type { MirrorSkill } from "./types.js";

export type MirrorSkillRegistry = {
  registerSkill: (skill: MirrorSkill) => void;
  getSkill: (name: string) => MirrorSkill | undefined;
  listSkills: () => MirrorSkill[];
};

export function createMirrorSkillRegistry(): MirrorSkillRegistry {
  const skills = new Map<string, MirrorSkill>();

  return {
    registerSkill(skill: MirrorSkill): void {
      const name = skill.meta.name;
      if (skills.has(name)) {
        throw new Error(`Mirror skill already registered: ${name}`);
      }
      skills.set(name, skill);
    },

    getSkill(name: string): MirrorSkill | undefined {
      return skills.get(name);
    },

    listSkills(): MirrorSkill[] {
      return [...skills.values()];
    },
  };
}
