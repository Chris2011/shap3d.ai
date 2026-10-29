import type { Definition, Instance } from '../core/model';
import type { Editor } from '../engine/editor';
import { t } from '../i18n';
import type { Disposer } from './types';

/**
 * Plugin data: plain JSON plugins keep on the model, on a group/component definition or on one instance, by key
 * (a plugin's own data under its id). Every change made through here is announced to the plugins that listen
 * (`events.onDataChange`) – at the end of the undo step it happens in, still inside it. Data formats let a plugin
 * describe its data (key, version, check), so other plugins can read and write it without calling that plugin.
 */

/** where plugin data lives – a definition (all copies of a component), one instance, or the model (null) */
export type DataTarget = Definition | Instance | null;

export interface DataChange {
  /** whose data changed – the plugin id it is kept under */
  key: string;
  target: DataTarget;
}

/**
 * A data format: data kept under `key` that more than one plugin may read and write. Its id is global (by custom
 * "<plugin>.<name>"), so a plugin that writes another plugin's format may declare it too – declarations of the same
 * id must agree on key and version, the first one's check is used.
 */
export interface PluginDataFormat {
  id: string;
  /** the key the data is kept under – usually the id of the plugin it belongs to */
  key: string;
  /** raised when the shape of the data changes in a way older readers cannot follow */
  version: number;
  /** text or message key */
  label?: string;
  /** true when a value has the format's shape – writes that fail it are refused, reads return nothing */
  validate?: (value: unknown) => boolean;
}

const holderOf = (editor: Editor, target: DataTarget): { pluginData?: Record<string, unknown> } => target ?? editor.model;

export const readData = (editor: Editor, key: string, target: DataTarget) => holderOf(editor, target).pluginData?.[key];

/** writes (or with undefined removes) the data under `key` and announces the change */
export const writeData = (editor: Editor, key: string, target: DataTarget, value: unknown) => {
  const holder = holderOf(editor, target);
  const data = { ...holder.pluginData };
  if (value === undefined) {
    delete data[key];
  } else {
    data[key] = value;
  }
  holder.pluginData = Object.keys(data).length ? data : undefined;
  announce(editor, { key, target });
};

// ------------------------------------------------------------ changes

interface ChangeBus {
  pending: DataChange[];
  listeners: ((change: DataChange) => void)[];
  scheduled: boolean;
}

const buses = new WeakMap<Editor, ChangeBus>();

/** how often listeners may answer each other's changes before the rest is dropped (a loop) */
const ROUNDS = 8;

const deliver = (bus: ChangeBus) => {
  for (let round = 0; round < ROUNDS && bus.pending.length; round++) {
    const changes = bus.pending.splice(0);
    for (const change of changes) {
      for (const listener of [...bus.listeners]) {
        try {
          listener(change);
        } catch (error) {
          console.error(error);
        }
      }
    }
  }
  if (bus.pending.length) {
    console.warn(t('plugins.errors.dataChangeLoop'));
    bus.pending.length = 0;
  }
};

const busOf = (editor: Editor) => {
  let bus = buses.get(editor);
  if (!bus) {
    const created: ChangeBus = { pending: [], listeners: [], scheduled: false };
    buses.set(editor, created);
    // inside an undo step the listeners run at its end, so what they change belongs to the same step
    editor.settling.push(() => deliver(created));
    bus = created;
  }
  return bus;
};

const announce = (editor: Editor, change: DataChange) => {
  const bus = busOf(editor);
  if (!bus.pending.some((other) => other.key === change.key && other.target === change.target)) {
    bus.pending.push(change);
  }
  if (!editor.changing() && !bus.scheduled) {
    // a change outside an undo step (e.g. while loading) – announced once the current task is done
    bus.scheduled = true;
    queueMicrotask(() => {
      bus.scheduled = false;
      deliver(bus);
    });
  }
};

export const onDataChange = (editor: Editor, listener: (change: DataChange) => void): Disposer => {
  const bus = busOf(editor);
  bus.listeners.push(listener);
  return () => {
    const index = bus.listeners.indexOf(listener);
    if (index >= 0) {
      bus.listeners.splice(index, 1);
    }
  };
};

// ------------------------------------------------------------ formats

const formats = new Map<string, { format: PluginDataFormat; count: number }>();

export const registerDataFormat = (format: PluginDataFormat): Disposer => {
  const existing = formats.get(format.id);
  if (existing && (existing.format.key !== format.key || existing.format.version !== format.version)) {
    throw new Error(t('plugins.errors.formatMismatch', { id: format.id, version: format.version, existing: existing.format.version }));
  }
  if (existing) {
    existing.count++;
  } else {
    formats.set(format.id, { format: { ...format }, count: 1 });
  }
  return () => {
    const entry = formats.get(format.id);
    if (entry && --entry.count <= 0) {
      formats.delete(format.id);
    }
  };
};

export const dataFormat = (id: string) => formats.get(id)?.format;

const formatFor = (id: string) => {
  const format = dataFormat(id);
  if (!format) {
    throw new Error(t('plugins.errors.formatUnknown', { id }));
  }
  return format;
};

/** the data of a format at a target – undefined when there is none or it does not have the format's shape */
export const readFormat = (editor: Editor, id: string, target: DataTarget) => {
  const format = formatFor(id);
  const value = readData(editor, format.key, target);
  return value === undefined || (format.validate && !format.validate(value)) ? undefined : value;
};

/** writes the data of a format at a target – refused when it does not have the format's shape */
export const writeFormat = (editor: Editor, id: string, target: DataTarget, value: unknown) => {
  const format = formatFor(id);
  if (value !== undefined && format.validate && !format.validate(value)) {
    throw new Error(t('plugins.errors.formatInvalid', { id }));
  }
  writeData(editor, format.key, target, value);
};
