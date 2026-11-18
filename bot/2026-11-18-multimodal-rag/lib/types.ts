export type Glaze = {
  id: string;
  label: string;
  color: string;
  crackle: boolean;
};

export type Shape = {
  id: string;
  label: string;
};

export type Sku = {
  id: string;
  model: string;
  category: string;
  capacityMl: number;
  mouthCm: number;
  glazeId: string;
  glazeLabel: string;
  shapeId: string;
  shapeLabel: string;
  crackle: boolean;
  caption: string;
  description: string;
  image: string;
};

export type Catalog = {
  synthetic: true;
  note: string;
  category: string;
  glazes: Glaze[];
  shapes: Shape[];
  skus: Sku[];
};

export type QueryType = "appearance" | "attribute" | "image";

export type EvalQuery = {
  id: string;
  type: QueryType;
  text: string | null;
  relevant: string[];
  querySkuId?: string;
  targetAttribute?: "glaze" | "shape";
  targetValue?: string;
  excludeSelf?: boolean;
};

export type QuerySet = {
  frozenAt: string;
  timezone: string;
  note: string;
  counts: {
    total: number;
    appearance: number;
    attribute: number;
    image: number;
  };
  queries: EvalQuery[];
};

export type Hit = {
  id: string;
  score: number;
};
