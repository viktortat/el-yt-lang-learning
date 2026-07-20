function arrayFromJson(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return null;
  for (const key of ["translations", "items", "result", "data"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return null;
}

function jsonValuesInText(value) {
  const values = [];
  for (let start = 0; start < value.length; start += 1) {
    if (value[start] !== "[" && value[start] !== "{") continue;
    const stack = [value[start] === "[" ? "]" : "}"];
    let quoted = false;
    let escaped = false;
    for (let end = start + 1; end < value.length; end += 1) {
      const character = value[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') {
        quoted = true;
        continue;
      }
      if (character === "[" || character === "{") stack.push(character === "[" ? "]" : "}");
      else if (character === "]" || character === "}") {
        if (character !== stack.pop()) break;
        if (!stack.length) {
          try { values.push(JSON.parse(value.slice(start, end + 1))); } catch {}
          break;
        }
      }
    }
  }
  return values;
}

function translationsFromModel(value) {
  const direct = arrayFromJson(value);
  if (direct) return direct;
  if (typeof value !== "string") throw new Error("Модель не вернула JSON-перевод.");

  try {
    const parsed = JSON.parse(value.trim());
    const translations = arrayFromJson(parsed);
    if (translations) return translations;
  } catch {}

  for (const parsed of jsonValuesInText(value)) {
    const translations = arrayFromJson(parsed);
    if (translations) return translations;
  }
  throw new Error("Модель не вернула JSON-перевод.");
}

module.exports = { translationsFromModel };
