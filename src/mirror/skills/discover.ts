// Archived builtin skills retained only for tests and explicit compatibility references.
// They are not part of the canonical standalone Mirror tool or CLI surface.
import { mirrorChainTokenBalanceSkill } from "./builtins/chain_token_balance/skill.js";
import { mirrorChainTokenStateSkill } from "./builtins/chain_token_state/skill.js";
import { mirrorChainWalletProfileSkill } from "./builtins/chain_wallet_profile/skill.js";
import { mirrorEchoSkill } from "./builtins/echo/skill.js";
import { mirrorFindScrollSkill } from "./builtins/find_scroll/skill.js";
import type { MirrorSkill } from "./types.js";

export function getBuiltinMirrorSkills(): MirrorSkill[] {
  return [
    mirrorEchoSkill,
    mirrorFindScrollSkill,
    mirrorChainTokenStateSkill,
    mirrorChainTokenBalanceSkill,
    mirrorChainWalletProfileSkill,
  ];
}
