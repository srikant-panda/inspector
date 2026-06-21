/**
 * Shared HTML export module for Inspector.
 * Generates self-contained, dark-themed HTML reports from data objects.
 */

/**
 * Escapes HTML special characters to prevent injection.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Recursively renders a data object as HTML definition-list sections.
 * Nested objects become sub-sections with their own headings.
 * @param {object} obj
 * @returns {string} HTML fragment
 */
function renderSection(obj) {
  let html = '<dl>';
  for (const [key, value] of Object.entries(obj)) {
    const label = escapeHtml(key.replace(/([A-Z])/g, ' $1').trim());
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      html += `<dt>${label}</dt><dd>${renderSection(value)}</dd>`;
    } else if (Array.isArray(value)) {
      html += `<dt>${label}</dt><dd>${escapeHtml(value.join(', '))}</dd>`;
    } else {
      html += `<dt>${label}</dt><dd>${escapeHtml(String(value))}</dd>`;
    }
  }
  html += '</dl>';
  return html;
}

/**
 * Renders a complete, self-contained HTML page from a title and data object.
 *
 * @param {string} title – page/report title
 * @param {object} dataObject – key-value data (nested objects become sub-sections)
 * @returns {string} complete HTML document string
 */
function renderInfoHtml(title, dataObject) {
  const timestamp = new Date().toISOString();
  const body = renderSection(dataObject);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #1a1b26; color: #a9b1d6;
    font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
    padding: 2rem; max-width: 800px; margin: 0 auto; line-height: 1.6;
  }
  h1 { color: #7aa2f7; font-size: 1.5rem; margin-bottom: 0.25rem; }
  .ts { color: #565f89; font-size: 0.85rem; margin-bottom: 2rem; }
  dl { margin: 0.5rem 0; }
  dt {
    color: #7dcfff; font-weight: 600; margin-top: 0.75rem;
    padding-bottom: 0.15rem; border-bottom: 1px solid #292e42;
  }
  dd { margin-left: 1.5rem; padding: 0.25rem 0; color: #c0caf5; }
  dd dl { margin-left: 0; }
  dd dl dt { color: #bb9af7; border-bottom-color: #292e42; }
  dd dl dd dl dt { color: #9ece6a; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p class="ts">Generated: ${escapeHtml(timestamp)}</p>
${body}
</body>
</html>`;
}

module.exports = { renderInfoHtml };
