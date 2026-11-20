import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dTranslationToolbar from './S3dTranslationToolbar.vue';

const meta = {
  title: 'Plugins/Languages/Translation editor/TranslationToolbar',
  component: S3dTranslationToolbar,
  args: { creating: false },
} satisfies Meta<typeof S3dTranslationToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
export const Creating: Story = { args: { creating: true } };
