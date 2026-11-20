import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dScriptEditor from './S3dScriptEditor.vue';

const meta = {
  title: 'Panels/ScriptEditor',
  component: S3dScriptEditor,
} satisfies Meta<typeof S3dScriptEditor>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
