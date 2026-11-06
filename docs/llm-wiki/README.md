# LLM wiki

Rules for agents that write code in this repository: Vue best practices and design principles, tied to how Shap3D.ai really works. People may read it too, but it is written to be loaded by an agent: short pages, one topic each, rules first.

Agents keep this wiki up to date with the skill [`llm-wiki`](../../.claude/skills/llm-wiki/SKILL.md). `docs/wiki/` remains the documentation for users and contributors. This wiki does not repeat it, it links to it.

## How to use it

1. Read only the pages the task needs (see the index).
2. A project convention beats a general rule. A rule of the wiki beats your habit.
3. If code and wiki disagree, check which is right, then fix the wrong one. Do not silently follow either.

## Index

| Page                                         | Read it when                                                  |
| -------------------------------------------- | ------------------------------------------------------------- |
| [Project conventions](project-conventions.md) | any change: where code belongs, names, texts, checks          |
| [Principles](principles.md)                  | designing or judging a change: KISS, DRY, YAGNI, SOLID        |
| [Vue components](vue-components.md)          | writing or changing a `.vue` file                             |
| [Vue reactivity](vue-reactivity.md)          | state, `ref`, `computed`, `watch`, data from the kernel       |
| [Vue composables](vue-composables.md)        | reusing stateful logic                                        |
| [Vue performance](vue-performance.md)        | a big list, a slow panel, work on every frame                 |
| [Vue security](vue-security.md)              | `v-html`, links, anything from files, catalogs or plugins     |
| [Log](log.md)                                | what changed in this wiki, and when                           |

## Page format

```markdown
---
title: Short name
sources: [official pages or repository files the page rests on]
updated: YYYY-MM-DD
---
```

Then the rules. Each rule says what to do and why, and names a file in this repository when one shows it. A page stays under about 100 lines; when it grows, split it and add the new page to the index.
