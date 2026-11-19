import type { Plugin } from 'vite'

/** The brand faces of the first paint (body text, its medium weight, headings); FiraGO (ka) loads on use. */
const PRELOADED_FONTS = ['e-Ukraine-Regular', 'e-Ukraine-Medium', 'e-UkraineHead-Medium']

/**
 * `<link rel="preload" as="font">` for the brand faces, so they arrive with the HTML instead of after
 * the CSS parses and text first uses them (no fallback-font flash). `crossorigin` is required: font
 * fetches are CORS-anonymous, and a preload without it is not reused. A renamed face fails the build.
 */
export function fontPreload(): Plugin {
  return {
    name: 'gadgets:font-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {})
        return PRELOADED_FONTS.map((font) => {
          const pattern = new RegExp(`^assets/${font}-[\\w-]+\\.woff2$`)
          const fileName = files.find((file) => pattern.test(file))
          if (!fileName) throw new Error(`font preload: ${font} was not emitted`)
          return {
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: '/' + fileName },
            injectTo: 'head' as const,
          }
        })
      },
    },
  }
}
