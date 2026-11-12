/**
 * The OpenAI-compatible API root every deployment's Semantyka models run on; pi appends
 * `/chat/completions`. Fixed in code: deployments differ only in the key.
 */
export const SEMANTYKA_BASE_URL = "https://6f4cf922.neutrome.dev/v1";

/** A deployment's Semantyka endpoint: where its Semantyka models run, and the key they run with. */
export type SemantykaEndpoint = {
  /** SEMANTYKA_BASE_URL. */
  baseUrl: string;

  /** Bearer key for every Semantyka request: the Worker secret SEMANTYKA_API_KEY. */
  apiKey: string;
};

/** The deployment's Semantyka endpoint, or undefined when SEMANTYKA_API_KEY is unset or blank. */
export function semantykaEndpoint(env: Cloudflare.Env): SemantykaEndpoint | undefined {
  const apiKey = env.SEMANTYKA_API_KEY?.trim();
  return apiKey ? { baseUrl: SEMANTYKA_BASE_URL, apiKey } : undefined;
}
