export type ChainWalletProfileInput = {
  walletAddress: string;
  rpcUrl: string;
  tokens: string[];
};

export type ChainWalletProfileResult = {
  walletAddress: string;
  balances: Array<{
    tokenAddress: string;
    balance: string;
  }>;
};
