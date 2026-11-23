const vocabulary = {
  material: ['白瓷', '青瓷', '骨瓷', '紫砂', '粗陶', '玻璃', '树脂'],
  craft: ['手拉坯', '模压', '手绘', '堆塑', '釉下彩', '浮雕', '注浆', '非遗大师亲制'],
  origin: ['德化', '景德镇', '宜兴', '龙泉'],
  kind: ['茶杯', '咖啡杯', '花瓶', '瓷塑', '香插', '茶盏', '盖碗', '果盘'],
  purpose: ['泡茶', '插花', '摆件', '焚香', '盛果', '家用', '送礼'],
} as const;

type TextField = keyof typeof vocabulary;
type QuantityField = 'capacity' | 'size' | 'count';
type Field = TextField | QuantityField | 'award';
export type Attributes = Partial<Record<TextField | 'award', string> & Record<QuantityField, number>>;

export type GradeInput = {
  attributes: Attributes;
  required: Field[];
  maxChars: number;
  title: string;
  compliance_should_fail: boolean;
};

const quantities = {
  capacity: /(\d+(?:\.\d+)?)\s*(ml|毫升|升|l)(?![a-z])/gi,
  size: /(\d+(?:\.\d+)?)\s*(cm|mm|厘米|毫米)(?![a-z])/gi,
  count: /(\d+(?:\.\d+)?)\s*(件|个|只|支)/g,
} as const;

function normalize(value: string) {
  return value.normalize('NFKC').toLowerCase();
}

export function gradeTitle(input: GradeInput) {
  const { attributes, required, title, maxChars, compliance_should_fail } = input;
  const normalized = normalize(title);
  const covered = new Set<Field>();
  const unsupported: string[] = [];

  function check(field: Field, claim: string, matches: boolean) {
    if (matches) covered.add(field);
    else unsupported.push(claim);
  }

  for (const field of Object.keys(vocabulary) as TextField[]) {
    const expected = attributes[field] && normalize(attributes[field]);
    const terms = new Set<string>(vocabulary[field]);
    if (expected) terms.add(expected);
    for (const term of terms) {
      if (normalized.includes(term)) check(field, term, term === expected);
    }
  }

  for (const field of Object.keys(quantities) as QuantityField[]) {
    for (const [claim, amount, unit] of normalized.matchAll(quantities[field])) {
      // Canonical units are mL, cm, and individual pieces.
      const multiplier = ['l', '升'].includes(unit) ? 1000 : 1;
      const divisor = ['mm', '毫米'].includes(unit) ? 10 : 1;
      const value = Number(amount) * multiplier / divisor;
      const expected = attributes[field];
      check(field, claim, expected !== undefined && Math.abs(expected - value) < 1e-9);
    }
  }

  // Remove the supplied award before scanning for additional award claims.
  const award = attributes.award && normalize(attributes.award);
  const remaining = award && normalized.includes(award)
    ? normalized.replaceAll(award, () => {
      covered.add('award');
      return '';
    })
    : normalized;
  for (const [claim] of remaining.matchAll(/金奖|银奖|大奖|一等奖|获奖|冠军称号/g)) {
    check('award', claim, false);
  }

  const missing = required.filter(field => !covered.has(field));
  const chars = Array.from(title).length;
  const faithfulness = unsupported.length === 0;
  const coverage = missing.length === 0;
  const length = chars <= maxChars;
  const flag_absolute_terms = /国家级|最高级|最佳|最好|第一|顶级|最大/.test(normalized);
  return {
    faithfulness, coverage, length, chars, unsupported, missing,
    flag_absolute_terms, compliance_should_fail,
    pass: faithfulness && coverage && length && !compliance_should_fail,
  };
}
