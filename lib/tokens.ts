import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";

// Keep in sync with the installed js-tiktoken. A test checks this.
export const TOKENIZER = {
  encoding: "o200k_base",
  library: "js-tiktoken",
  version: "1.0.21",
} as const;

let encoder: Tiktoken | undefined;

// Counts page text as plain text: strings like "<|endoftext|>" are not treated as special tokens.
// This matches Python tiktoken's encode_ordinary().
export function countTokens(text: string): number {
  if (!text) return 0;
  encoder ??= new Tiktoken(o200k_base);
  return encoder.encode(text, [], []).length;
}

// Splits text into its tokens, as strings. Used to draw real tokens in the page background.
export function tokenPieces(text: string): string[] {
  encoder ??= new Tiktoken(o200k_base);
  const enc = encoder;
  return enc.encode(text, [], []).map((t) => enc.decode([t]));
}
