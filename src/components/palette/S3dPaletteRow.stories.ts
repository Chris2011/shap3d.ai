import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dPaletteRow from './S3dPaletteRow.vue';

const meta = {
  title: 'Command palette/PaletteRow',
  component: S3dPaletteRow,
  args: {
    row: {
      item: { id: 'tool.move', label: 'Verschieben', group: 'Werkzeuge', icon: 'move', shortcut: 'M', run: () => {} },
      segs: [
        { t: 'Ver', hit: true },
        { t: 'schieben', hit: false },
      ],
      header: 'Werkzeuge',
      state: false,
      disabled: false,
    },
    selected: true,
  },
} satisfies Meta<typeof S3dPaletteRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};
export const NotSelected: Story = { args: { selected: false } };
