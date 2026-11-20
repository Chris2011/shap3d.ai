import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { areaOf } from '../areas';
import S3dTranslationRow from './S3dTranslationRow.vue';

const meta = {
  title: 'Plugins/Languages/Translation editor/TranslationRow',
  component: S3dTranslationRow,
  args: {
    row: {
      key: 'tools.line',
      area: areaOf('tools.line'),
      source: 'Line',
      reference: 'Linie',
      text: 'Ligne',
      changed: false,
      placeholders: '',
      placeholderProblem: false,
    },
    columns: '12rem 1fr 1fr',
    withReference: true,
    dir: 'ltr',
  },
} satisfies Meta<typeof S3dTranslationRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Translated: Story = {};
export const Missing: Story = {
  args: {
    row: {
      ...{
        key: 'tools.line',
        area: areaOf('tools.line'),
        source: 'Line',
        reference: 'Linie',
        text: 'Ligne',
        changed: false,
        placeholders: '',
        placeholderProblem: false,
      },
      text: '',
    },
  },
};
export const PlaceholderProblem: Story = {
  args: {
    row: {
      ...{
        key: 'tools.line',
        area: areaOf('tools.line'),
        source: 'Line',
        reference: 'Linie',
        text: 'Ligne',
        changed: false,
        placeholders: '',
        placeholderProblem: false,
      },
      source: '{count} faces',
      text: '{anzahl} faces',
      placeholders: 'count',
      placeholderProblem: true,
    },
  },
};
