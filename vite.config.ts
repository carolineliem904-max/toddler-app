import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Minimal PWA layer (Slice 7 deployment prep). Rationale: this app's real
// usage is "kid grabs phone in the car" — offline matters more than for most
// apps. `registerType: 'autoUpdate'` activates a new service worker
// immediately on the next load with no user prompt (no "update available"
// UI would make sense for a toddler-facing app anyway).
//
// `globPatterns` includes mp3 so that whenever real voice lines are recorded
// and dropped into public/audio/voice/ (see HANDOFF's recording checklist),
// the NEXT build's precache manifest picks them up automatically — no code
// change needed, matching every other "drop a file in, no code change"
// pattern this app already uses for voice assets.
//
// No custom runtime-caching route is configured for anything (voice
// included) — precaching only lists files that existed at build time, and
// falls through to a normal network fetch for anything else, so a fetch to a
// currently-missing voice file just 404s normally (as AudioManager already
// expects) rather than being intercepted and cached as a permanent 404. This
// is what keeps a later-added file from ever being "cache-poisoned" by an
// already-installed service worker — see HANDOFF's verification of this via
// a deploy-like dist/ serve + file-added-after-build test.
export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Toddler Match',
        short_name: 'Toddler Match',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fff8ee',
        theme_color: '#fff8ee',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,mp3,png,svg,ico}'],
      },
    }),
  ],
});
