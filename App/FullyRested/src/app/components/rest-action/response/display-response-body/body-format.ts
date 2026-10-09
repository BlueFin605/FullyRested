import { CodeLanguage } from '../../../code-editor/code-editor.component';

export type BodyKind = 'json' | 'xml' | 'html' | 'image' | 'text';

export function bodyKind(contentType: string | undefined): BodyKind {
  const type = (contentType ?? '').toLowerCase().split(';')[0].trim();
  if (type.startsWith('image/')) return 'image';
  if (type == 'application/json' || type.endsWith('+json')) return 'json';
  if (type == 'text/html') return 'html';
  if (type == 'application/xml' || type == 'text/xml' || type.endsWith('+xml')) return 'xml';
  return 'text';
}

export function editorLanguage(kind: BodyKind): CodeLanguage {
  return kind == 'json' || kind == 'xml' || kind == 'html' ? kind : 'text';
}

// Indented copy for the Pretty view; anything that doesn't parse is shown as it came
export function prettyBody(kind: BodyKind, raw: string): string {
  try {
    switch (kind) {
      case 'json':
        return JSON.stringify(JSON.parse(raw), null, 2);
      case 'xml':
        return prettyXml(raw);
      default:
        return raw;
    }
  } catch {
    return raw;
  }
}

function prettyXml(raw: string): string {
  const xmlDoc = new DOMParser().parseFromString(raw, 'application/xml');
  if (xmlDoc.getElementsByTagName('parsererror').length > 0) return raw;

  const xsltDoc = new DOMParser().parseFromString(
    [
      '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">',
      '  <xsl:strip-space elements="*"/>',
      '  <xsl:template match="node()|@*">',
      '    <xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy>',
      '  </xsl:template>',
      '  <xsl:output indent="yes"/>',
      '</xsl:stylesheet>',
    ].join('\n'),
    'application/xml',
  );

  const processor = new XSLTProcessor();
  processor.importStylesheet(xsltDoc);
  return new XMLSerializer().serializeToString(processor.transformToDocument(xmlDoc));
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes == undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
