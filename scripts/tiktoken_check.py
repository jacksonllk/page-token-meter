# Counts the saved fixture texts with OpenAI's own Python tiktoken.
# A test then checks that js-tiktoken gives the same numbers.
# Run once, locally: .venv/bin/python scripts/tiktoken_check.py
import json
from pathlib import Path

import tiktoken

FIXTURES = Path("tests/fixtures/local")
PAGES = ["docs-context-dev", "context-dev-pricing"]
CALLS = {"full": ["markdown", "html"], "main": ["markdown"], "published": ["markdown"]}

enc = tiktoken.get_encoding("o200k_base")
counts = {}
for page in PAGES:
    for call, outputs in CALLS.items():
        name = f"{page}.{call}"
        res = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
        for output in outputs:
            text = res[output]["data"] or ""
            # encode_ordinary: special-token strings count as plain text, like lib/tokens.ts.
            counts[f"{name}.{output}"] = len(enc.encode_ordinary(text))

out = {"library": "tiktoken (Python)", "version": tiktoken.__version__, "encoding": "o200k_base", "counts": counts}
(FIXTURES / "python-counts.json").write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
print(json.dumps(out, indent=2))
