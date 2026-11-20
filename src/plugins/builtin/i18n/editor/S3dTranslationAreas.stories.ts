import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { areaOf } from '../areas';
import S3dTranslationAreas from './S3dTranslationAreas.vue';

const meta = {
  title: 'Plugins/Languages/Translation editor/TranslationAreas',
  component: S3dTranslationAreas,
  args: {
    rows: [
      {
        key: 'tools.line',
        area: areaOf('tools.line'),
        source: 'Line',
        reference: 'Linie',
        text: 'Ligne',
        changed: false,
        placeholders: '',
        placeholderProblem: false,
      },
      {
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
        key: 'menu.file',
        area: areaOf('menu.file'),
        source: 'File',
        reference: 'Datei',
        text: '',
      },
    ],
  },
} satisfies Meta<typeof S3dTranslationAreas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
