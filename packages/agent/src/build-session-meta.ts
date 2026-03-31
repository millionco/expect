interface BuildSessionMetaOptions {
  readonly systemPrompt?: string;
}

export const buildSessionMeta = ({ systemPrompt }: BuildSessionMetaOptions) =>
  systemPrompt ? { systemPrompt } : undefined;
