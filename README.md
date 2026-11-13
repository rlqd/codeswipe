# codeswipe

Code review as a deck of cards. A coding agent turns a diff into a `*.codeswipe.json` file; a human drops it into this app and swipes through it.

```
npm run dev      # start the app
npm run build    # type-check and build
npm run lint
```

## GitHub Pages

In the GitHub repository, set **Settings → Pages → Source** to **GitHub Actions**.
The deployment workflow builds and publishes `dist` on pushes to `main`, or when
run manually from the Actions tab. Vite uses `/codeswipe/` as the base path.

## How it fits together

- `skill/codeswipe-review/` is the agent skill that produces the review file. `SKILL.md` explains how to split, order and annotate a diff; `scripts/codeswipe.mjs` numbers the diff lines, assembles the file and validates it. The app serves both from its start screen.
- `src/lib/` holds everything that is not UI: the diff parser, deck building (including splitting long cards), review state, file load/save, Markdown export and the diagram layout.
- `src/components/` holds the screens: `Home`, and `Review` with its two views, `Deck` and `Diagram`.
- `src/sample/sample.codeswipe.json` is the built-in sample, generated with the skill script.

## The review file

```jsonc
{
  "format": "codeswipe",
  "version": 1,
  "title": "Rate limit login attempts",
  "diff": "diff --git a/...",            // the original unified diff
  "cards": [                             // in the order they are shown
    {
      "id": "limiter-check",
      "title": "RateLimiter.check()",
      "summary": "optional one-liner",
      "lines": [137, 170],               // 1-based, inclusive line numbers in "diff"
      "attention": 8,                    // 0 to 10, drives the orange glow
      "provisionalComment": { "severity": "comment", "text": "..." }
    }
  ],
  "relations": [{ "from": "login-handler", "to": "limiter-check", "kind": "calls" }],
  "review": {                            // written by the app, absent in a fresh file
    "cards": { "limiter-check": { "accepted": true, "provisional": "dismissed" } },
    "comments": [{ "id": "...", "card": "login-handler#2", "severity": "reject", "text": "...", "lines": [66, 69] }]
  }
}
```

A card longer than 26 diff lines (`MAX_ROWS` in `src/lib/deck.ts`) is split into parts with ids `id`, `id#2`, `id#3`. Changed lines that no card claims are appended as "unassigned" cards, so nothing in the diff can be skipped. A plain `.diff` file can be dropped too and becomes a deck of unassigned cards.

The diff parser exists twice, in `src/lib/diff.ts` and in the skill script. Cards address the diff by line number, so the two must agree on which lines are hunk body lines.
