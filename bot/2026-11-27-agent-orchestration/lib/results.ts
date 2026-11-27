export type Observation = {
  id: string;
  conclusion: string;
  data: Record<string, unknown>;
};

export const check = (id: string, matches: boolean, data: Observation['data']): Observation =>
  ({ id, conclusion: matches ? '支持' : '不支持', data });
export const observed = (id: string, data: Observation['data']): Observation =>
  ({ id, conclusion: '记录', data });
export const errorInfo = (error: unknown) => ({
  errorClass: error instanceof Error ? error.constructor.name : typeof error,
  message: error instanceof Error ? error.message : String(error),
});

export async function capture(action: () => unknown | Promise<unknown>) {
  try {
    await action();
    return null;
  } catch (error) {
    return errorInfo(error);
  }
}
