// "text [1] more [2][3]" -> strings and citation numbers, so citations can be rendered as buttons.
export function splitCitations(text) {
  return text
    .split(/(\[\d+\])/)
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^\[(\d+)\]$/)
      return m ? Number(m[1]) : part
    })
}
