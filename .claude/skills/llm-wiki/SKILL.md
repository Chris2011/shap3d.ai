---
name: llm-wiki
description: Project rules for writing and reviewing code in Shap3D.ai - Vue components, reactivity, composables, performance, security, KISS, DRY, YAGNI, SOLID. Use before writing or reviewing Vue or TypeScript code in this repository, when the user asks about these practices, or to add to, correct or check the wiki in docs/llm-wiki.
---

# LLM wiki

The wiki is in `docs/llm-wiki/`. Its `README.md` is the index and defines the page format.

## Use it

Before writing or reviewing code, read the index, then only the pages the task touches. Follow them. Name the rule when it decides something.

## Answer from it

Answer from the wiki and link the page. If the wiki has no answer, find it in the code or the official docs, then add what will be useful again.

## Add to it

Add something when a rule was learned the hard way: a bug the rule would have prevented, or a correction from the user.

1. Put it on the page where it belongs. Change a rule rather than adding one that contradicts it. A new page only for a new topic, and add it to the index.
2. Say what to do and why, and name a file in this repository that shows it. Check that the claim is true in the code.
3. No general knowledge an agent already has, and nothing already in `CONTRIBUTING.md` or `docs/wiki/`: link instead.
4. Raise `updated` on the page and add a line to `log.md`.

## Check it

Run after every change, and from time to time:

```bash
node .claude/skills/llm-wiki/lint.mjs
```

It finds broken links, named repository files that no longer exist, missing page headers and pages missing from the index. Whether a rule is still true is not something it can tell: when you read code that contradicts a page, fix whichever is wrong.
