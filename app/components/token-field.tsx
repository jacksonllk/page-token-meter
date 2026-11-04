import { tokenPieces } from "@/lib/tokens";

// A made-up page, as an agent gets it: menus, then content, then footer.
// "menu" parts are grey and "content" parts are blue, like the bar in the results.
const PAGE: { kind: "menu" | "content"; text: string }[] = [
  { kind: "menu", text: "[Skip to content](#main) [Home](/) [Product](/product) [Pricing](/pricing) [Docs](/docs) [Blog](/blog) [Changelog](/changelog) [Customers](/customers) [Sign in](/login) [Start for free](/signup)" },
  { kind: "content", text: "# Ship faster with less glue code Connect your stack in minutes. Every request is logged, retried and easy to trace. ## How it works Install the package, add your key and make your first call." },
  { kind: "menu", text: "[Docs](/docs) [Status](/status) [Privacy](/privacy) [Terms](/terms) [Contact](/contact) © 2026 Example Inc." },
];

// The rows are fixed, so the field keeps its shape at any screen width. Each row is long enough for a wide screen.
const ROWS = 9;
const ROW_CHARS = 420;

type Token = { kind: "menu" | "content"; lead: string; word: string; index: number };

// Real o200k tokens of the page, repeated as needed and cut into rows.
const LINES: Token[][] = (() => {
  const stream: Omit<Token, "index">[] = PAGE.flatMap(({ kind, text }) =>
    tokenPieces(text).map((p) => {
      // A token's leading space stays outside its chip, so the chips line up with the words.
      const word = p.trimStart();
      return { kind, lead: p.slice(0, p.length - word.length), word };
    }),
  );
  const rows: Token[][] = [];
  let index = 0;
  let row: Token[] = [];
  let chars = 0;
  while (rows.length < ROWS) {
    const t = stream[index % stream.length];
    // Each row starts on a token without the space before it.
    row.push({ ...t, lead: row.length ? t.lead : "", index });
    chars += t.lead.length + t.word.length;
    index++;
    if (chars >= ROW_CHARS) {
      rows.push(row);
      row = [];
      chars = 0;
    }
  }
  return rows;
})();

const CHIP = {
  menu: ["bg-faint/[0.05]", "bg-faint/[0.11]"],
  content: ["bg-accent/[0.05]", "bg-accent/[0.11]"],
};

// The hero background: real tokens, each one a chip, with the token count where each row starts.
// It fades out at the bottom and dims behind the title, so it never competes with the words in front.
export function TokenField() {
  return (
    <div
      aria-hidden
      className="token-field pointer-events-none absolute top-0 left-1/2 w-screen -translate-x-1/2 overflow-hidden opacity-50 select-none sm:opacity-100"
    >
      <div className="font-mono text-[11px] leading-[26px] whitespace-pre">
        {LINES.map((row, i) => (
          <div key={i} className="fade flex" style={{ animationDelay: `${i * 45}ms` }}>
            <span className="w-14 shrink-0 pr-3 text-right text-[10px] text-faint/50 tabular-nums">{row[0].index}</span>
            {/* Chips touch, like in a tokenizer view. The two shades show where one token ends and the next begins. */}
            <span>
              {row.map((t) => (
                <span key={t.index} className={t.kind === "content" ? "text-accent-fg/45" : "text-faint/60"}>
                  {t.lead}
                  <span className={`rounded-[3px] py-[2px] ${CHIP[t.kind][t.index % 2]}`}>{t.word}</span>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
