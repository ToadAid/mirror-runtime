import { mirrorChainTokenBalanceSkill } from "./builtins/chain_token_balance/skill.js";
import { mirrorChainTokenStateSkill } from "./builtins/chain_token_state/skill.js";
import { mirrorChainWalletProfileSkill } from "./builtins/chain_wallet_profile/skill.js";
import { mirrorEchoSkill } from "./builtins/echo/skill.js";
import type { MirrorSkill } from "./types.js";

export function getBuiltinMirrorSkills(): MirrorSkill[] {
  return [
    mirrorEchoSkill,
    mirrorChainTokenStateSkill,
    mirrorChainTokenBalanceSkill,
    mirrorChainWalletProfileSkill,
  ];
}
