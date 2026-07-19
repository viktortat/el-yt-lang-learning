(function exposePlayerLayout(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PlayerLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function gridTemplate(layout) {
    if (layout.mode === "center") return "minmax(0, 1fr)";
    const columns = [];
    if (layout.english) columns.push(`${layout.leftWidth}px`, "6px");
    else columns.push("42px");
    columns.push("minmax(380px, 1fr)");
    if (layout.russian) columns.push("6px", `${layout.rightWidth}px`);
    else columns.push("42px");
    return columns.join(" ");
  }

  return { gridTemplate };
});
