import React from 'react';

export function parseMarkdown(
  text: string,
  onLinkClick: (url: string) => void,
  primaryColor: string
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let keyIndex = 0;

  // Pre-procesar: normalizar saltos de línea
  // Convertir <br> a \n para unificar
  let processed = text.replace(/<br\s*\/?>/gi, '\n');

  // Colapsar múltiples \n en máximo 2 para párrafos
  processed = processed.replace(/\n{3,}/g, '\n\n');

  // Procesar línea por línea
  const lines = processed.split('\n');

  lines.forEach((line, lineIndex) => {
    // Agregar salto de línea entre líneas (excepto la primera)
    if (lineIndex > 0) {
      parts.push(<br key={`br-${keyIndex++}`} />);
    }

    // Si la línea está vacía, solo agregamos el br (ya agregado arriba)
    if (line.trim() === '') {
      return;
    }

    // Regex para: **negrita**, <b>negrita</b>, [link](url)
    const regex = /(\*\*(.+?)\*\*)|(<b>(.+?)<\/b>)|(\[([^\]]+)\]\(([^)]+)\))/gi;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      // Agregar texto antes del match
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }

      if (match[1]) {
        // **negrita** markdown
        parts.push(<strong key={keyIndex++}>{match[2]}</strong>);
      } else if (match[3]) {
        // <b>negrita</b> HTML
        parts.push(<strong key={keyIndex++}>{match[4]}</strong>);
      } else if (match[5]) {
        // [link](url) markdown
        const linkText = match[6];
        const url = match[7];
        parts.push(
          <a
            key={keyIndex++}
            href={url}
            onClick={(e) => {
              e.preventDefault();
              onLinkClick(url);
            }}
            className="underline font-medium hover:opacity-80 cursor-pointer"
            style={{ color: primaryColor }}
          >
            {linkText}
          </a>
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Agregar texto restante de la línea
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }
  });

  return parts.length > 0 ? parts : [text];
}
