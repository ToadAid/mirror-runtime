export type ChainTokenStateInput = {
  address: string;
  rpcUrl: string;
};

export type ChainTokenStateResult = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  chainId?: string;
  rpcUrl?: string;
};
