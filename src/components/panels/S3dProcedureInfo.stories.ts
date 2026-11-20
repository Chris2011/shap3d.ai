import { onUnmounted } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dProcedureInfo from './S3dProcedureInfo.vue';
import { useEditor } from '../keys';

const meta = {
  title: 'Panels/ProcedureInfo',
  component: S3dProcedureInfo,
  render: () => ({
    components: { S3dProcedureInfo },
    setup: () => {
      // the demo model has a procedural group (a box with a hole) – select it
      const editor = useEditor();
      const procedure = [...editor.model.root.instances.values()].find((instance) => instance.definition.procedure);
      editor.select(procedure ? [{ kind: 'instance', id: procedure.id }] : []);
      onUnmounted(() => editor.select([]));
    },
    template: '<S3dProcedureInfo />',
  }),
} satisfies Meta<typeof S3dProcedureInfo>;

export default meta;

export const SolidSubtract: StoryObj<typeof meta> = {};
