import type { Component } from 'vue';
import type { PluginContext } from '../../../src/plugins/types';
import { CLASS_CHOICES } from './ifcClasses';
import { ensureClassTag, ifcOf, setIfc, type IfcData, type IfcValue } from './ifcData';
import { formatNumber, t } from './runtime';

type Field = keyof Omit<IfcData, 'class' | 'properties' | 'quantities'>;

const muted = 'font-size:.75rem;opacity:.75';

/**
 * The "IFC properties" panel: the IFC data of the selected group or component – class, attributes
 * and (read-only) property sets and quantities. A Vue component built with the app's Vue (context.vue),
 * so the package needs no build step for templates.
 */
export const createPanel = (context: PluginContext): Component => {
  const { h, computed, defineComponent } = context.vue;
  const editor = context.editor;

  return defineComponent({
    name: 'S3dIfcPanel',
    setup() {
      // the model is not reactive – the editor bumps ui.revision after every change and ui.selRev after every selection change
      const selected = computed(() => {
        void editor.ui.revision;
        void editor.ui.selRev;
        const selection = editor.selected();
        if (selection.length !== 1 || selection[0].kind !== 'instance') {
          return null;
        }
        const instance = editor.entities.instances.get(selection[0].id);
        if (!instance) {
          return null;
        }
        let copies = 0;
        const count = (entities: typeof editor.model.root) => {
          for (const other of entities.instances.values()) {
            copies += other.definition === instance.definition ? 1 : 0;
            count(other.definition.entities);
          }
        };
        count(editor.model.root);
        return { instance, name: instance.name || instance.definition.name, data: ifcOf(instance.definition), copies };
      });

      const formatValue = ({ value, type }: IfcValue) => {
        if (typeof value === 'boolean') {
          return value ? t('ifc.panel.yes') : t('ifc.panel.no');
        }
        if (typeof value === 'number') {
          if (/AREA/.test(type)) {
            return editor.fmtArea(value);
          }
          if (/VOLUME/.test(type)) {
            return `${formatNumber(value, { maximumFractionDigits: 3 })} m³`; // i18n-ignore – unit symbol
          }
          if (/LENGTH/.test(type)) {
            return editor.fmt(value);
          }
          return formatNumber(value, { maximumFractionDigits: 3 });
        }
        return value == null ? '–' : String(value);
      };

      /** classify (or with '' unclassify) the selected group – the class is also its tag, as in SketchUp */
      const setClass = (ifcClass: string) => {
        const current = selected.value;
        if (!current) {
          return;
        }
        const name = ifcClass.trim();
        editor.commit('ifc.undo.classify', () => {
          const definition = current.instance.definition;
          const previous = ifcOf(definition);
          if (!name) {
            setIfc(definition, undefined);
            if (previous && current.instance.tag === previous.class) {
              current.instance.tag = undefined;
            }
            return;
          }
          setIfc(definition, { ...previous, class: name });
          current.instance.tag = ensureClassTag(editor.model, name);
        });
      };

      const setField = (field: Field, value: string) => {
        const current = selected.value;
        if (!current?.data) {
          return;
        }
        editor.commit('ifc.undo.edit', () => {
          const data: IfcData = { ...current.data!, [field]: value.trim() || undefined };
          if (data[field] === undefined) {
            delete data[field];
          }
          setIfc(current.instance.definition, data);
        });
      };

      const row = (label: string, content: ReturnType<typeof h>) =>
        h('div', { class: 's3d-row' }, [h('span', { class: 's3d-label' }, label), content]);
      const input = (value: string, onChange: (value: string) => void, extra: Record<string, unknown> = {}) =>
        h('input', { class: 's3d-input', value, onChange: (event: Event) => onChange((event.target as HTMLInputElement).value), ...extra });
      const fieldRow = (field: Field, label: string, data: IfcData) =>
        row(
          label,
          input(data[field] ?? '', (value) => setField(field, value)),
        );

      return () => {
        const current = selected.value;
        if (!current) {
          return h('p', { style: `margin:.25rem 0;${muted}` }, t('ifc.panel.selectGroup'));
        }
        const data = current.data;
        const children = [
          h('div', { style: 'margin:.25rem 0 .625rem;font-weight:600' }, current.name),
          row(
            t('ifc.panel.class'),
            input(data?.class ?? '', setClass, { list: 's3d-ifc-classes', placeholder: t('ifc.panel.unclassified') }),
          ),
          h(
            'datalist',
            { id: 's3d-ifc-classes' },
            CLASS_CHOICES.map((choice) => h('option', { value: choice })),
          ),
        ];
        if (data) {
          children.push(
            fieldRow('predefinedType', t('ifc.panel.predefinedType'), data),
            fieldRow('objectType', t('ifc.panel.objectType'), data),
            fieldRow('material', t('ifc.panel.material'), data),
            row(
              'GlobalId',
              h(
                'span',
                { style: 'font-family:monospace;font-size:.75rem;overflow:hidden;text-overflow:ellipsis', title: t('ifc.panel.guidHint') },
                data.guid ?? t('ifc.panel.guidOnExport'),
              ),
            ),
          );
          if (current.copies > 1) {
            children.push(h('p', { style: `margin:0 0 .5rem;${muted}` }, t('ifc.panel.sharedData', { count: current.copies })));
          }
          for (const sets of [data.properties, data.quantities]) {
            for (const [setName, values] of Object.entries(sets ?? {})) {
              children.push(h('div', { class: 's3d-section-title' }, setName));
              for (const [property, value] of Object.entries(values)) {
                const shown = formatValue(value);
                children.push(
                  h('div', { class: 's3d-row', style: 'font-size:.75rem' }, [
                    h('span', { class: 's3d-label', style: 'overflow:hidden;text-overflow:ellipsis', title: property }, property),
                    h('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap', title: shown }, shown),
                  ]),
                );
              }
            }
          }
          children.push(
            h('button', { class: 's3d-btn small', style: 'margin-top:.5rem', onClick: () => setClass('') }, t('ifc.panel.remove')),
          );
        }
        return h('div', children);
      };
    },
  });
};
