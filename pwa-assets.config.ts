import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Generates the PNG icons in public/ from public/favicon.svg: `npm run generate-pwa-assets`.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0b0f14' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0b0f14' } },
  },
  images: ['public/favicon.svg'],
})
