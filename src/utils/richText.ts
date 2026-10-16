const ALLOWED_TAGS = new Set(['P', 'DIV', 'SPAN', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG', 'A']);
const safeImageUrl = (src: string) => !src.includes('\\') && /^(https?:\/\/[^\s]+|\/(?!\/)[^\s]+)$/i.test(src);

export function richTextImages(html: string | null | undefined): string[] {
  if (!html || typeof DOMParser === 'undefined') return [];
  return Array.from(new DOMParser().parseFromString(html, 'text/html').images)
    .map((image) => image.getAttribute('src') ?? '')
    .filter(safeImageUrl);
}

export function richTextText(html: string | null | undefined): string {
  if (!html || typeof DOMParser === 'undefined') return html ?? '';
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
}

export function safeRichText(html: string | null | undefined): string {
  if (!html || typeof DOMParser === 'undefined') return '';
  const source = new DOMParser().parseFromString(html, 'text/html').body;
  const clean = document.createElement('div');
  const copy = (node: Node, parent: Node) => {
    if (node instanceof HTMLElement && ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(document.createTextNode(node.textContent ?? ''));
      return;
    }
    if (!(node instanceof HTMLElement) || !ALLOWED_TAGS.has(node.tagName)) {
      node.childNodes.forEach((child) => copy(child, parent));
      return;
    }
    const element = document.createElement(node.tagName.toLowerCase());
    for (const property of ['text-align', 'color', 'background-color', 'font-family', 'font-size', 'line-height']) {
      const value = node.style.getPropertyValue(property).trim();
      const rules: Record<string, RegExp> = {
        'text-align': /^(left|center|right|justify)$/i,
        'color': /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i,
        'background-color': /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i,
        'font-family': /^[a-z\s,"'-]+$/i,
        'font-size': /^(\d{1,2})(px|pt)$/i,
        'line-height': /^(normal|[1-3](\.\d+)?)$/i
      };
      if (rules[property].test(value)) element.style.setProperty(property, value);
    }
    for (const attribute of ['colspan', 'rowspan', 'data-colwidth', 'width', 'height', 'start']) {
      const value = node.getAttribute(attribute) ?? '';
      if (/^\d{1,4}(,\d{1,4})*$/.test(value)) element.setAttribute(attribute, value);
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') ?? '';
      if (!safeImageUrl(src)) return;
      element.setAttribute('src', src);
      element.setAttribute('alt', node.getAttribute('alt') ?? '');
    } else if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(href)) {
        element.setAttribute('href', href);
        element.setAttribute('rel', 'noopener noreferrer');
        element.setAttribute('target', '_blank');
      }
    }
    node.childNodes.forEach((child) => copy(child, element));
    parent.appendChild(element);
  };
  source.childNodes.forEach((node) => copy(node, clean));
  return clean.innerHTML;
}

export function hasRichText(html: string): boolean {
  const body = new DOMParser().parseFromString(safeRichText(html), 'text/html').body;
  return Boolean(body.textContent?.replace(/[\s\u200b]/g, '') || body.querySelector('img'));
}
