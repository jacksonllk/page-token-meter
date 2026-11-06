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

// Where each token starts in the text, in characters. A character that spans two tokens belongs to the first.
export function tokenStarts(text: string): number[] {
  encoder ??= new Tiktoken(o200k_base);
  const enc = encoder;
  const ids = enc.encode(text, [], []);
  const starts: number[] = [];
  let at = 0;
  for (let i = 0; i < ids.length; ) {
    let j = i + 1;
    let piece = enc.decode(ids.slice(i, j));
    while (j < ids.length && piece.endsWith("\uFFFD") && text[at + piece.length - 1] !== "\uFFFD") piece = enc.decode(ids.slice(i, ++j));
    for (; i < j; i++) starts.push(at);
    at = Math.min(text.length, at + piece.length);
  }
  return starts;
}

// Cuts text into `parts` runs of equal tokens and returns where each run starts, in characters.
export function equalTokenStarts(text: string, parts: number, at: number[] = tokenStarts(text)): number[] {
  return Array.from({ length: parts }, (_, i) => {
    const k = Math.floor((i * at.length) / parts);
    return k < at.length ? at[k] : text.length;
  });
}
