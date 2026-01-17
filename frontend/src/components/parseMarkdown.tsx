export function parseMarkdown(
  text: string,
  onLinkClick: (url: string) => void,
  primaryColor: string
): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = [];
  let keyIndex = 0;

  // Primero reemplazamos <br><br> por un placeholder único
  let processed = text.replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '{{DOUBLE_BR}}');
  // Luego <br> simple
  processed = processed.replace(/<br\s*\/?>/gi, '{{SINGLE_BR}}');

  // Regex para: **negrita**, <b>negrita</b>, [link](url), placeholders de BR
  const regex = /(\*\*(.+?)\*\*)|(<b>(.+?)<\/b>)|(\[([^\]]+)\]\(([^)]+)\))|(\{\{DOUBLE_BR\}\})|(\{\{SINGLE_BR\}\})/gi;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(processed)) !== null) {
    // Agregar texto antes del match
    if (match.index > lastIndex) {
      parts.push(processed.slice(lastIndex, match.index));
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
    } else if (match[8]) {
      // {{DOUBLE_BR}} = separador de párrafo con espacio
      parts.push(<div key={keyIndex++} className="h-3" />);
    } else if (match[9]) {
      // {{SINGLE_BR}} = salto de línea
      parts.push(<br key={keyIndex++} />);
    }

    lastIndex = match.index + match[0].length;
  }

  // Agregar texto restante
  if (lastIndex < processed.length) {
    parts.push(processed.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
