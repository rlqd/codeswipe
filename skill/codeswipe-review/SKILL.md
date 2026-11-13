---
name: codeswipe-review
description: Prepare a codeswipe review file (*.codeswipe.json) from a git diff, so a human can review the change as a guided deck of swipeable cards. Use when the user asks to prepare, generate or update a codeswipe review, or asks for a "swipe review" of a branch, commit range or pull request.
---

# codeswipe review

codeswipe is a browser app where a human reviews a change one card at a time: swipe right to accept, swipe left to comment. Your job is to turn a diff into the metadata file that the app loads. The file carries the original diff, how to cut it into cards, the order to show them in, how the cards relate to each other, and your own provisional review comments.

The reviewer sees nothing but your cards, so the quality of the review depends on how well you split, order and annotate the change.

## Workflow

1. **Get the diff.** Ask which change to review if it is not obvious (default: the current branch against its merge base with the main branch). Write it to a file with git itself, so the encoding is right on every shell:

   ```
   git diff --no-color --output=review.diff main...HEAD
   ```

2. **Number it.** Every card points at a range of lines in the diff file, so print the diff with line numbers:

   ```
   node scripts/codeswipe.mjs annotate review.diff
   ```

   The first column is the diff line number. Only lines that also have an old or new line number are hunk body lines.

3. **Understand the change.** Read the diff, and read the surrounding source where you need it to judge correctness. Review it properly: this is a real code review, the cards are how you report it.

4. **Write `plan.json`** with the cards and relations (format below).

5. **Build and validate.**

   ```
   node scripts/codeswipe.mjs build review.diff plan.json -o <name>.codeswipe.json
   ```

   Fix every error and read every warning. Rerun until it prints `OK`.

6. **Hand over.** Tell the user where the file is and that they can drop it into the codeswipe app. Delete `review.diff` and `plan.json` unless the user wants them.

## plan.json

```json
{
  "title": "Rate limit login attempts",
  "description": "One or two sentences on what the change does.",
  "cards": [
    {
      "id": "limiter-check",
      "title": "RateLimiter.check()",
      "summary": "Sliding window check, called on every login attempt.",
      "lines": [41, 63],
      "attention": 8,
      "provisionalComment": {
        "severity": "question",
        "text": "The window is never pruned for keys that stop sending requests. Does this map grow forever?"
      }
    }
  ],
  "relations": [
    { "from": "login-handler", "to": "limiter-check", "kind": "calls" }
  ]
}
```

Card fields:

| field | required | meaning |
| --- | --- | --- |
| `id` | yes | Unique, short, kebab-case. No `#`. |
| `title` | yes | What the reviewer is looking at: a function name or a few words. |
| `lines` | yes | `[start, end]`, inclusive diff line numbers from `annotate`. Must start and end on hunk body lines and stay inside one file. |
| `attention` | yes | 0 to 10, see below. |
| `summary` | no | One sentence of context shown under the title. |
| `provisionalComment` | no | Your review comment: `{ "severity": "reject" \| "comment" \| "question", "text": "..." }`. |

Relation fields: `from` and `to` are card ids and mean "`from` depends on `to`" (calls it, uses its type, tests it, reads its config). `kind` is a short verb shown on the diagram: `calls`, `uses`, `tests`, `implements`, `configures`, `extends`.

## Splitting into cards

- One card is one thing a reviewer can judge on its own: a function, a type, a config change, a test case.
- A card should fit on screen: **aim for at most 26 diff lines**, context lines included. Longer ranges are split by the app automatically, at a blank line where it can, but a split you choose at a logical boundary is better.
- Every changed line (`+` or `-`) must belong to exactly one card. Cards must not overlap. Lines you leave out are appended by the app as "unassigned" cards, which is a poor experience for the reviewer.
- Include the context lines that help the change read well (the signature above an edited body, the closing brace). Leave out context that adds nothing.
- A range may cross hunks of the same file when they belong together, but never crosses files.
- Trivial mechanical changes (import reordering, renames) can share one card per file with a low attention score.

## Ordering

The order of `cards` is the order the reviewer sees. Guide them through the change the way you would explain it in person:

- **Keep all cards of one file together.** Once the reviewer has left a file, never come back to it: no jumping back and forth between files. This rule wins over the others below, and `build` warns when a file's cards are not consecutive.
- Order the files by dependency: the file that defines something comes before the file that uses it. Types and config before the code that depends on them.
- Inside a file, show a definition before its uses: `functionA` first, then `functionB` which calls it. This may differ from the order in the diff.
- Put the core of the change early, while the reviewer is fresh. A test file comes right after the file it covers. Mechanical noise goes last.

## Attention score

The app draws an orange glow around a card, brighter for higher scores. Use the full range, most cards in a normal change should be low.

- **0 to 2**: mechanical or obviously correct: imports, renames, formatting, generated code.
- **3 to 5**: ordinary logic that deserves a normal read.
- **6 to 8**: critical paths: auth, money, data deletion, concurrency, migrations, public API changes, tricky algorithms. Any card with a provisional comment is at least 6.
- **9 to 10**: you believe there is a bug or a security problem here, or a mistake would be very costly.

## Provisional comments

Add a `provisionalComment` when you found something a reviewer should see: a likely bug, a missing edge case, an unclear decision. The reviewer either adopts it as their own comment or rejects it, so:

- Be specific and self-contained: say what is wrong, where, and why it matters. Name the line or the variable.
- Choose the severity honestly: `reject` for something that must change, `comment` for a suggestion, `question` when you need the author's intent.
- Do not comment for the sake of commenting. No praise, no restating the code. A card with no problem gets no comment.

## Relations

Relations feed the diagram screen, where the reviewer sees how the cards connect. Add one for each real dependency between two cards in this change. Do not connect cards merely because they are in the same file. Cards with no relations are fine and are shown on their own.

## Updating an existing review

A file the user has already worked on contains a `review` object with their progress, keyed by card id. If you regenerate the file for the same diff, keep the same card ids and line ranges and copy the `review` object across unchanged.
