export type MirrorSkillName = string;

export type MirrorSkillMetadata = {
  name: MirrorSkillName;
  description: string;
  version: string;
  inputs?: string[];
  outputs?: string[];
};

export type MirrorSkill = {
  meta: MirrorSkillMetadata;
  run: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};
