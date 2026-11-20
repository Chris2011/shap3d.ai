import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { Decorator } from '@storybook/vue3-vite';
import { provideAiSetup } from './useAiSetup';
import { MODEL_PRESETS } from '../providers';
import S3dModelPresetCard from './S3dModelPresetCard.vue';

/** the wizard steps read the wizard's state */
const withAiSetup: Decorator = (story) => ({ components: { story }, setup: () => provideAiSetup(), template: '<story />' });

const meta = {
  title: 'Plugins/AI/Setup/ModelPresetCard',
  component: S3dModelPresetCard,
  args: { preset: MODEL_PRESETS[0] },
  decorators: [withAiSetup],
} satisfies Meta<typeof S3dModelPresetCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
