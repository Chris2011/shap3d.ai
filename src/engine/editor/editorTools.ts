import { markRaw } from 'vue';
import { normalizeNumberInput, t } from '../../i18n';
import { EditorContext } from './editorContext';
import { MAIN_TOOLS, type DialogOption, type Tool } from './tool';

/** The tools (registering, switching), the status line, the measurements box and the modal dialogs. */
export abstract class EditorTools extends EditorContext {
  register(tool: Tool) {
    this.tools.set(tool.id, markRaw(tool));
    this.ui.toolsRevision++;
  }
  /** Removes a tool (plugin switched off): leaves it if active and drops it from the toolbar right away. */
  unregister(id: string) {
    if (this.ui.tool === id) {
      this.setTool('select');
    }
    this.tools.delete(id);
    this.ui.recentTools = this.ui.recentTools.filter((recent) => recent !== id);
    this.ui.toolsRevision++;
  }
  /** true if a tool with this id is registered (reactive through ui.toolsRevision) */
  hasTool(id: string) {
    void this.ui.toolsRevision;
    return this.tools.has(id);
  }

  setTool(id: string) {
    const tool = this.tools.get(id);
    if (!tool) {
      return;
    }
    if (this.tool) {
      this.tool.cancel();
      this.tool.deactivate();
    }
    this.tool = tool;
    this.ui.tool = id;
    if (!MAIN_TOOLS.includes(id) && !['place', 'zoomwindow', 'poscam', 'lookaround', 'walk', 'zoom'].includes(id)) {
      this.ui.recentTools = [id, ...this.ui.recentTools.filter((x) => x !== id)].slice(0, 3);
    }
    this.ui.vcbValue = '';
    this.ui.vcbLabel = tool.vcbLabel;
    this.infer?.reset();
    this.setHover(null);
    tool.activate();
    this.refreshStatus();
    this.onToolChange.forEach((listener) => listener());
    this.redraw();
  }
  refreshStatus() {
    if (this.tool) {
      this.ui.status = this.tool.status();
      this.ui.vcbLabel = this.tool.vcbLabel;
    }
  }
  setVcb(value: string, label?: string) {
    if (!this.ui.vcbEditing) {
      this.ui.vcbValue = value;
    }
    if (label != null) {
      this.ui.vcbLabel = label;
    }
  }

  submitVcb(text: string) {
    this.ui.vcbEditing = false;
    // Arabic-Indic digits, "٫", "؛" and translated unit symbols → what the tools parse
    const ok = this.tool.onVcb(normalizeNumberInput(text).trim());
    if (!ok) {
      this.toast(t('editor.invalidVcb'));
    }
    this.redraw();
  }

  /** Modal choice of a few options; null when cancelled. */
  askOptions(title: string, options: DialogOption[]): Promise<Record<string, string | boolean> | null> {
    return new Promise((resolve) => {
      this.ui.dialog = {
        kind: 'options',
        data: {
          title,
          options,
          resolve: (values: Record<string, string | boolean> | null) => {
            this.ui.dialog = null;
            resolve(values);
          },
        },
      };
    });
  }
  /** Modal text prompt rendered by the UI. */
  prompt(title: string, value = '', multiline = false): Promise<string | null> {
    return new Promise((resolve) => {
      this.ui.dialog = {
        kind: 'prompt',
        data: {
          title,
          value,
          multiline,
          resolve: (answer: string | null) => {
            this.ui.dialog = null;
            resolve(answer);
          },
        },
      };
    });
  }
  confirm(title: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.ui.dialog = {
        kind: 'confirm',
        data: {
          title,
          resolve: (confirmed: boolean) => {
            this.ui.dialog = null;
            resolve(confirmed);
          },
        },
      };
    });
  }
}
