---
title: Principles
sources: [CONTRIBUTING.md, src/plugins/types.ts, packages/procgen/README.md]
updated: 2026-11-06
---

# Principles

Principles serve one goal: code that is correct and easy to change. When two conflict, the order is correct, safe, simple, then elegant.

## KISS: keep it simple

- Take the simplest thing that fully works. Fully means edge cases and error handling too: simple is not incomplete.
- Prefer a plain function to a class, a class to a framework, and the platform to a new dependency.
- Test it: can someone who has never seen this code follow it in one read?

## YAGNI: you aren't gonna need it

- No option, parameter or abstraction until a real caller needs it.
- Do not build for a future that was only imagined. Adding it later costs less than carrying it now.
- A known limit gets a comment naming the limit and when to lift it.

## DRY: don't repeat yourself

- DRY is about knowledge, not text. Two pieces of code that must change together are a duplicate. Two that only look alike are not.
- Wait for the third copy unless the rule is one that must never differ, such as a security check. Those belong in one place from the start: `tools/requestGuard.ts` guards every dev-server endpoint.
- The wrong abstraction costs more than duplication. A helper that grows flags for each caller should be split again.

## SOLID, for TypeScript and Vue

SOLID comes from class-based design. Apply the idea, not the ceremony: a function or a type often does the job of an interface hierarchy.

| Principle             | Means here                                                                 | In this repository                                                                                  |
| --------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Single responsibility | One reason to change. A component shows, a composable holds logic           | `src/composables/usePopover.ts` only opens and closes                                               |
| Open/closed           | Add behaviour by registering, not by editing the core                      | Plugins call `context.panels.register`, `context.tools.register`                                    |
| Liskov substitution   | A subclass keeps the promises of its base                                  | Every tool in `src/tools/` can stand in for `Tool` from `src/engine/editor.ts`                      |
| Interface segregation | Small, focused APIs; nobody depends on what they do not use                | `PluginContext` in `src/plugins/types.ts` groups by area: `meshes`, `files`, `render`               |
| Dependency inversion  | High-level code depends on an agreed contract, not on details              | Plugin packages use `src/plugins/types.ts`, never the app's modules                                 |

Split by job, never by line count. A helper that only makes a function shorter hides the flow.

## Separation of layers

- The kernel holds the truth, and the UI shows it. `src/core/` does not import Vue, and its geometry does not touch the DOM, so workers can run it: `src/scripting/meshJobs.ts` uses it off the main thread.
- Slow work goes to a worker, and the main thread only applies the result.
- Fix a bug once, in the shared code, not in each caller. Search all callers first.

## Composition over inheritance

Combine small functions and composables. Inherit only where a real "is a" contract exists, as with tools.

## Fail at the boundary

Check data where it enters: files, plugins, catalogs, network, scripts. Inside, trust your own types and do not repeat checks for cases that cannot happen. Details: [Vue security](vue-security.md).

## Checklist before finishing

- Does every line serve the task?
- Is there an existing helper that does this?
- Did the change reach every caller, test and text it affects?
- What did you not check? Say so.
