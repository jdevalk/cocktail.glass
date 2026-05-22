import type { Cocktail } from './src/types';

/** A cocktail record as the shared tools expect it: catalogue data plus URL. */
export type CocktailWithUrl = Cocktail & { url: string };

/** One tool, runtime-agnostic — the transport adapter supplies `cocktails`. */
export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; openWorldHint: boolean };
  /** Pure and synchronous. Returns plain data, or `{ error }` on bad input. */
  run(cocktails: CocktailWithUrl[], args: Record<string, unknown>): unknown;
}

/** The six read-only tools shared by the remote MCP server and WebMCP. */
export const TOOLS: ToolDef[];

declare const _default: ToolDef[];
export default _default;
