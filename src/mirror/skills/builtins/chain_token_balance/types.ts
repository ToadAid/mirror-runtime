export type ChainTokenBalanceInput = {
  tokenAddress: string;
  walletAddress: string;
  rpcUrl: string;
};

export type ChainTokenBalanceResult = {
  tokenAddress: string;
  walletAddress: string;
  balance: string;
};
