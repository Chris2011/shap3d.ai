import { computed, nextTick } from 'vue';
import { useEditor } from '../components/keys';
import { parseLength } from '../core/units';
import { runScriptAsync, runJson, type ScriptLog } from '../scripting/api';
import { importObj } from '../scripting/mesh';
import { findScriptLanguage, prepareScript } from '../scripting/languages';
import { useScriptEditorState } from './useScriptEditorState';
import { t, localize } from '../i18n';

/**
 * Runs the editor's code – JavaScript, JSON, OBJ or a plugin language – and writes the result to the console.
 */
export const useScriptRun = () => {
  const editor = useEditor();
  const { lang, code, objSize, objYUp, objSmooth, out, lastMs, running, clearFirst, currentSaved, consoleBox } = useScriptEditorState();
  const pluginLanguage = computed(() => findScriptLanguage(lang.value));

  const run = async () => {
    if (running.value) {
      return;
    }
    if (clearFirst.value) {
      editor.newModel();
    }
    let result;
    if (pluginLanguage.value) {
      running.value = true;
      out.value = [{ kind: 'log', text: t('scriptEditor.running', { language: localize(pluginLanguage.value.label) }) }];
      const startedAt = performance.now();
      try {
        result = await pluginLanguage.value.run(code.value, editor);
      } catch (error: any) {
        result = { ok: false, logs: [], error: error?.message ?? String(error), durationMs: performance.now() - startedAt };
      } finally {
        running.value = false;
      }
    } else if (lang.value === 'obj') {
      const size = parseLength(objSize.value, 'm');
      if (size == null || size <= 0) {
        out.value = [{ kind: 'error', text: `✗ ${t('scriptEditor.invalidSize', { size: objSize.value })}` }];
        return;
      }
      result = importObj(editor, code.value, { size, yUp: objYUp.value, smooth: objSmooth.value || 0, name: currentSaved.value ?? 'Mesh' });
    } else {
      // plugins prepare what the script uses (e.g. fonts for text3d) – for JSON as for JavaScript
      running.value = true;
      out.value = [{ kind: 'log', text: t('statusbar.building') }];
      try {
        await prepareScript(code.value);
        result = lang.value === 'json' ? runJson(editor, code.value) : await runScriptAsync(editor, code.value);
      } finally {
        running.value = false;
      }
    }
    lastMs.value = result.durationMs;
    const summary: ScriptLog = result.ok
      ? { kind: 'log', text: `✓ ${t('scriptEditor.done', { count: editor.model.root.stats().faces })}` }
      : { kind: 'error', text: '✗ ' + result.error };
    out.value = [...result.logs, summary];
    nextTick(() => {
      if (consoleBox.value) {
        consoleBox.value.scrollTop = consoleBox.value.scrollHeight;
      }
    });
  };

  /** Builds an API example right away – as its own group next to what is already there (one undo step). */
  const tryExample = async (example: string) => {
    const bounds = editor.model.bounds();
    const place = bounds.isEmpty()
      ? ''
      : `
{ const bb = __g.entities.bounds(new THREE.Box3()); if (!bb.isEmpty()) __g.move([${(bounds.max.x + 1).toFixed(3)} - bb.min.x, ${bounds.min.y.toFixed(3)} - bb.min.y, 0]); }`;
    const result = await runScriptAsync(
      editor,
      `const __g = s3d.group(${JSON.stringify(t('scriptEditor.exampleGroup'))}, () => {
${example}
});${place}
s3d.zoomExtents();`,
      t('scriptEditor.apiExample'),
    );
    lastMs.value = result.durationMs;
    out.value = [
      ...result.logs,
      result.ok ? { kind: 'log', text: t('scriptEditor.exampleBuilt') } : { kind: 'error', text: '✗ ' + result.error },
    ];
  };

  return { run, tryExample };
};
