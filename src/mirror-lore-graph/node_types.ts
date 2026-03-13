export type MirrorLoreGraphNode =
  | {
      id: string;
      type: "scroll";
      label: string;
      path: string;
      scroll_id: string;
    }
  | {
      id: string;
      type: "symbol";
      label: string;
      symbol: string;
    }
  | {
      id: string;
      type: "concept";
      label: string;
      concept: string;
    };
