export type Context = string | Record<string, unknown>;

export type Test = string | { readonly title: string; readonly context?: Context };
