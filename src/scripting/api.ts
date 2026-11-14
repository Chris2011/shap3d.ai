/**
 * The scripting API (`s3d`) – one import for the app and the plugin packages. The parts live in their own modules:
 * points, handles, the `s3d` class in layers (`scriptApi/`), running JavaScript and JSON, error texts.
 */
export type { Pt } from './points';
export { FaceHandle, GroupHandle } from './handles';
export type { PolyhedronFace, ScriptLog, RunResult } from './scriptTypes';
export { ScriptApi } from './scriptApi/scriptApi';
export { PARAMETRIC } from './parametric';
export { PLUGIN_EXTENSIONS } from './pluginExtensions';
export { scriptErrorText } from './scriptErrors';
export { runScript, runScriptAsync } from './runScript';
export { runJson } from './runJson';
