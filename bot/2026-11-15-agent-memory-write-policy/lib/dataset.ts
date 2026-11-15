export type Message = { role: "user" | "assistant"; content: string };
export type Slot = {
  name: string;
  timeline: { session: number; value: string; aliases: string[] }[];
};
export type Question = {
  id: string;
  type: "current" | "history" | "distractor";
  text: string;
  gold: string[];
  old: string[];
  avoid: string[];
};
export type Dialogue = {
  id: string;
  seed: number;
  slots: Slot[];
  distractors: { slot: string; value: string }[];
  sessions: { created_at: string; messages: Message[] }[];
  questions: Question[];
};
const names = [
  "发货城市",
  "釉色",
  "数量",
  "单价预算",
  "发票抬头",
  "交期",
  "Logo工艺",
  "包装",
  "器型",
  "物流",
];
const values = [
  ["泉州", "厦门", "福州"],
  ["羊脂白", "天青色", "米黄色"],
  ["300件", "500件", "800件"],
  ["每件20元", "每件25元", "每件30元"],
  ["德化春山商贸有限公司", "厦门远山商贸有限公司", "福州青山商贸有限公司"],
  ["2026年12月10日", "2026年12月15日", "2026年12月20日"],
  ["激光雕刻", "釉下彩", "贴花"],
  ["独立纸盒", "礼盒", "蜂窝纸"],
  ["盖碗", "茶杯", "花瓶"],
  ["顺丰", "德邦", "中通"],
];
// Mulberry32: local state resets on every generation.
function randomSource(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const filler = [
  [
    "样品能先寄一套看看吗？主要想摸一下手感。",
    "可以先看样，确认手感后再安排大货。",
  ],
  [
    "开模费和后面的货款是分开算的吗？",
    "可以分别列明，开模前会先给您费用说明。",
  ],
  [
    "釉面有小针孔的话，验货时怎么判断？",
    "会按双方确认的样品标准检查，瑕疵拍照核对。",
  ],
  [
    "付款方式支持对公转账吗？财务想了解流程。",
    "支持，付款前会提供对公资料和核对步骤。",
  ],
  ["底足能拍个近照吗？怕放桌上不稳。", "可以补拍底足和桌面摆放的视频。"],
  ["色差是不是要在自然光下看比较准？", "建议自然光下对照实物，照片仅供参考。"],
  ["运输破损需要留哪些凭证？", "请保留外箱和开箱照片，方便售后核查。"],
  ["外箱唛头能先出一版排版给我看吗？", "可以先出示意图，您确认之后再制作。"],
  ["批发验货可以抽箱检查吗？", "可以沟通抽检流程，出货前提供验货资料。"],
  ["开模之前能不能看一下三维图？", "可以先核对图稿，细节确认后再进入下一步。"],
  [
    "样品和大货的收缩率会影响尺寸吗？",
    "烧制存在合理公差，可以先核对样品尺寸范围。",
  ],
  [
    "财务问尾款什么时候核对，我先了解一下。",
    "可以先把结算流程发给您，具体以合同确认为准。",
  ],
];

export function makeDataset(): Dialogue[] {
  const seed = 20261115;
  const random = randomSource(seed);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
  const shuffle = <T>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  return Array.from({ length: 4 }, (_, customer) => {
    const sessionCount = [3, 4, 5, 3][customer];
    const correctedIndices = shuffle(names.map((_, i) => i)).slice(
      0,
      5 + (customer % 2),
    );
    const revertedIndex = correctedIndices[0];
    const slots = names.map((name, i): Slot => {
      const options = shuffle(values[i]);
      const event = (session: number, value: string) => ({
        session,
        value,
        aliases: [value],
      });
      const timeline = [event(0, options[0])];
      if (correctedIndices.includes(i)) {
        const twice = i === revertedIndex || random() < 0.5;
        const firstSession = twice
          ? 1
          : 1 + Math.floor(random() * (sessionCount - 1));
        timeline.push(event(firstSession, options[1]));
        if (twice)
          timeline.push(
            event(
              sessionCount - 1,
              i === revertedIndex ? options[0] : options[2],
            ),
          );
      }
      return { name, timeline };
    });
    const distractors = [0, 1, 2].map((i) => ({
      slot: names[i],
      value: ["杭州", "珊瑚红", "1200件"][i],
    }));
    const sessions = Array.from({ length: sessionCount }, (_, session) => {
      const messages: Message[] = [];
      const exchange = (user: string, reply: string) =>
        messages.push(
          { role: "user", content: user },
          { role: "assistant", content: reply },
        );
      for (const [i, slot] of slots.entries()) {
        for (const [step, event] of slot.timeline.entries()) {
          if (event.session !== session) continue;
          const { name } = slot;
          const value = event.value;
          const previous = slot.timeline[step - 1]?.value;
          const variants =
            step === 0
              ? [
                  `这批陶瓷的${name}先定为${value}，麻烦记一下。`,
                  `跟您确认一下，本单${name}是${value}。`,
                  `我们店这次要的${name}：${value}。`,
                  `${name}已经和同事核对好了，就按${value}来。`,
                ]
              : i === revertedIndex
                ? step === 1
                  ? [
                      `${name}先临时改成${value}，后面有变再联系。`,
                      `这两天安排有变化，本单${name}暂时换成${value}吧。`,
                    ]
                  : [
                      `${name}还是改回${value}，临时方案不用了。`,
                      `之前临时调整的${name}取消，恢复${value}。`,
                    ]
                : [
                    `之前说的${name}${previous}改成${value}吧。`,
                    `${name}还是按${value}来，麻烦更新一下。`,
                    `刚跟采购确认了，这单${name}改为${value}。`,
                    `${name}不用${previous}了，最后确定${value}。`,
                  ];
          exchange(
            pick(variants),
            pick([
              `好的，已记下这次的${name}要求。`,
              `收到，按您确认的${value}核对。`,
              `明白，我把订单里的${name}同步一下。`,
              "收到您的确认，出货单会再核对。",
            ]),
          );
        }
      }
      distractors
        .filter((_, i) => 1 + (i % (sessionCount - 1)) === session)
        .forEach((d) => {
          exchange(
            pick([
              `我朋友订的是${d.value}（${d.slot}），跟我无关，别混进我的单子。`,
              `群里提到${d.value}是朋友那单的${d.slot}，不是我的要求。`,
              `顺便问问朋友订的${d.value}（${d.slot}），这跟我的订单无关。`,
            ]),
            pick([
              "知道了，朋友的信息不会算到您的订单。",
              "两份订单分开核对，您的要求仍按您自己的确认。",
              "明白，这只是朋友那单的情况。",
            ]),
          );
        });
      const target = Math.max(
        messages.length,
        [24, 20, 16][sessionCount - 3] + 2 * Math.floor(random() * 3),
      );
      let topics = shuffle(filler);
      while (messages.length < target) {
        if (!topics.length) topics = shuffle(filler);
        const [question, reply] = topics.pop()!;
        exchange(question, reply);
      }
      return {
        created_at: `2026-11-${String(1 + session * 3 + customer).padStart(2, "0")}T09:00:00.000Z`,
        messages,
      };
    });
    const currentSlots = [
      ...correctedIndices.map((i) => slots[i]),
      ...shuffle(slots.filter((_, i) => !correctedIndices.includes(i))),
    ].slice(0, 8);
    const questions: Question[] = currentSlots.map((slot, i) => ({
      id: `current-${i}`,
      type: "current",
      text: `我的订单当前${slot.name}是什么？`,
      gold: slot.timeline.at(-1)!.aliases,
      old: [...new Set(slot.timeline.slice(0, -1).map((t) => t.value))].filter(
        (v) => v !== slot.timeline.at(-1)!.value,
      ),
      avoid: distractors
        .filter((d) => d.slot === slot.name)
        .map((d) => d.value),
    }));
    correctedIndices.slice(0, 4).forEach((index, i) => {
      const slot = slots[index];
      const sequence = i % 2 === 0;
      questions.push({
        id: `history-${i}`,
        type: "history",
        text: sequence
          ? `我的${slot.name}从什么改成了什么？按顺序列出，包含改回。`
          : `我的${slot.name}最初确认的值是什么？`,
        gold: sequence
          ? slot.timeline.map((t) => t.value)
          : [slot.timeline[0].value],
        old: [],
        avoid: [],
      });
    });
    distractors.forEach((d, i) =>
      questions.push({
        id: `distractor-${i}`,
        type: "distractor",
        text: `朋友提到的${d.slot}会影响我的订单吗？请说明我的当前${d.slot}。`,
        gold: [slots.find((s) => s.name === d.slot)!.timeline.at(-1)!.value],
        old: [],
        avoid: [d.value],
      }),
    );
    return {
      id: `customer-${customer + 1}`,
      seed,
      slots,
      distractors,
      sessions,
      questions,
    };
  });
}
