import { asSchema, jsonSchema } from 'ai';
import { z } from 'zod';

const form = z.string().describe('德化陶瓷器型');
const glaze = z.string().nullable();
const capacityMl = z.number().int().min(50).max(5000).describe('容量（毫升）');
const uses = z.array(z.enum(['茶饮', '陈设', '餐饮']));
const dimensions = z.object({ heightMm: z.number().nullable() });

export const ceramicAttr = z.object({
  form, glaze, capacityMl, uses, dimensions,
  painted: z.boolean().optional(),
  quantity: z.number().int().default(1),
});

export const ceramicAttrStrictSafe = z.object({
  form, glaze, capacityMl, uses, dimensions,
  painted: z.boolean().nullable(),
  quantity: z.number().int().nullable(),
});

const bounded = asSchema(ceramicAttrStrictSafe);
const wireSchema = structuredClone(await bounded.jsonSchema);
const capacity = wireSchema.properties?.capacityMl;
const quantity = wireSchema.properties?.quantity;
const quantityInteger = typeof quantity === 'object' ? quantity.anyOf?.[0] : undefined;
for (const numeric of [capacity, quantityInteger]) {
  if (typeof numeric !== 'object' || numeric.type !== 'integer') {
    throw new Error('缺少整数 JSON Schema');
  }
  delete numeric.minimum;
  delete numeric.maximum;
}

export const ceramicAttrLocalRange = jsonSchema(wireSchema, {
  validate: async value => {
    const parsed = ceramicAttrStrictSafe.safeParse(value);
    return parsed.success
      ? { success: true, value: parsed.data }
      : { success: false, error: parsed.error };
  },
});

export const museTagUnion = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('釉色'), tag: z.string() }),
  z.object({ kind: z.literal('器型'), tag: z.string() }),
]);

export function optionalN(count: number) {
  return z.object(Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`attribute${i + 1}`, z.string().optional()]),
  ));
}

export const fixtures = {
  ceramicAttr, ceramicAttrStrictSafe, ceramicAttrLocalRange, museTagUnion,
  optional10: optionalN(10), optional11: optionalN(11),
};

export const ceramicSample = {
  form: '盖碗', glaze: null, capacityMl: 120, uses: ['茶饮'],
  dimensions: { heightMm: null },
};
export const strictSample = { ...ceramicSample, painted: null, quantity: null };
