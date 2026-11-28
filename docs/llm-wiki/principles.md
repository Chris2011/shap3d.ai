---
title: Principles
sources: [CONTRIBUTING.md, src/plugins/types.ts, packages/procgen/README.md, src/scripting/api.ts]
updated: 2026-11-22
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
| Liskov substitution   | A subclass keeps the promises of its base                                  | Every tool in `src/tools/` can stand in for `Tool` from `src/engine/editor/tool.ts`                    |
| Interface segregation | Small, focused APIs; nobody depends on what they do not use                | `PluginContext` in `src/plugins/types.ts` groups by area: `meshes`, `files`, `render`               |
| Dependency inversion  | High-level code depends on an agreed contract, not on details              | Plugin packages use `src/plugins/types.ts`, never the app's modules                                 |

Split by job, never by line count. A helper that only makes a function shorter hides the flow.

## Separation of layers

- The kernel holds the truth, and the UI shows it. `src/core/` does not import Vue, and its geometry does not touch the DOM, so workers can run it: `src/scripting/meshJobs.ts` uses it off the main thread.
- Slow work goes to a worker, and the main thread only applies the result.
- Fix a bug once, in the shared code, not in each caller. Search all callers first.

## Composition over inheritance

Combine small functions and composables. Inherit only where a real "is a" contract exists, as with tools.

## Splitting a large module

- Split before a file gets big, not after: when a module holds several jobs that change on their own, give each its own file. Aim for at most about 200 lines of code per file (without blank lines and comments); past that, look for a second job. One tool per file, and what tools share in small modules next to them: `src/tools/modify/` – `picking.ts` (what the cursor picks), `transform.ts` (live transforms, moves in the open group, arrays from a copy), `boxFrame.ts` / `boxGrips.ts` (the box with its grips), `gaps.ts`, `scaleBox.ts`, `rotateAngle.ts`. `src/tools/modify.ts` is the barrel.
- A long list of definitions is split by what it belongs to and put together in order where it is registered: the menu commands in `src/engine/commands/fileCommands.ts`, `editCommands.ts`, `viewCommands.ts`, `cameraCommands.ts`, joined in `src/engine/commands.ts`, which also re-exports the command functions so the 20 importers keep their path.
- Before splitting, look for copies across the files: the same matrix about a point (`aboutPoint` in `src/core/geometry.ts`), the same pick or overlay mark. Move them to one place first; the split then needs fewer cross imports.
- Split by job, and keep the import path: the old file becomes a barrel that only re-exports. `src/scripting/api.ts` re-exports points, handles, the `s3d` class, running JavaScript and JSON, and error texts – the plugin packages import it unchanged.
- A class that scripts and plugins use as one object (`s3d`) may be built in layers, one file each, every layer one job: `src/scripting/scriptApi/` (base → groups → sketch → solids → round solids → `ScriptApi`). Members a later layer needs are `protected`, callbacks take `this`, and code that walks the members (error hints in `src/scripting/scriptErrors.ts`) walks the whole prototype chain.
- Side effects on a class (wrapping its methods) live in a function the class file calls, not in a module that has to be imported for its effect: `recordParametricShapes` in `src/scripting/parametric.ts`.
- A worker imports the modules it needs, not the barrel: `src/scripting/scriptWorker.ts`.

## Fail at the boundary

Check data where it enters: files, plugins, catalogs, network, scripts. Inside, trust your own types and do not repeat checks for cases that cannot happen. Details: [Vue security](vue-security.md).

## Checklist before finishing

- Does every line serve the task?
- Is there an existing helper that does this?
- Did the change reach every caller, test and text it affects?
- What did you not check? Say so.
