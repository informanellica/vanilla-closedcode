/** @file Markdown-to-HTML rendering for the main process, configured to open links externally in a new tab. */
import { marked } from "marked";
const renderer = new marked.Renderer();
/**
 * Custom link renderer that forces external links to open in a new tab safely.
 * @param {Object} token - The marked link token with href, title and text fields.
 * @returns {string} An HTML anchor tag with the external-link class and safe rel/target attributes.
 */
renderer.link = ({
  href,
  title,
  text
}) => {
  const titleAttr = title ? ` title="${title}"` : "";
  return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`;
};
/**
 * Render a Markdown string to HTML using the GFM-enabled marked parser and custom link renderer.
 * @param {string} input - The raw Markdown source text.
 * @returns {string} The rendered HTML string.
 */
export function parseMarkdown(input) {
  return marked(input, {
    renderer,
    breaks: false,
    gfm: true
  });
}