import { defineConfig, type Plugin } from 'vite'

const POINTER = '/*! tokenlab. Bundled third party code and its licences: ./THIRD-PARTY-NOTICES.txt */\n'

/** Prepends the pointer to every emitted chunk, after the minifier has run. */
function notice(): Plugin {
  return {
    name: 'third-party-notice',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') file.code = POINTER + file.code
      }
    },
  }
}

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    cssMinify: 'lightningcss',
    /*
     * SC-F4. 97 percent of the JavaScript this site serves is gpt-tokenizer,
     * and the minifier removes its licence header on the way through: measured
     * on the built site, "Copyright (c)", "MIT License" and "Bazyli" had zero
     * hits anywhere in dist.
     *
     * The pointer is one line rather than the whole licence because the whole
     * licence ships beside it, as THIRD-PARTY-NOTICES.txt, written from
     * node_modules by tools/third-party.mjs and held to it by check:notices.
     * What this line has to do is make sure somebody who redeploys dist/ on its
     * own can still find that file.
     *
     * It is prepended after minification rather than set as
     * rollupOptions.output.banner, and that is measured rather than assumed: the
     * banner option works and the minifier removes it. Built unminified, every
     * chunk begins with the comment; built normally, none of them do, even
     * though `/*!` is the legal comment convention. vite 8.3.0, oxc.
     */
  },
  plugins: [notice()],
})
