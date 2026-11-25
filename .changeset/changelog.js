// Changelog lines without commit hashes. The changelog is shown to users on the
// "What's new" page, where hashes are noise.
module.exports = {
  getReleaseLine: async (changeset) => {
    const [first, ...rest] = changeset.summary.trim().split("\n");
    const body = rest.map((line) => (line.trim() ? `  ${line.trimEnd()}` : "")).join("\n");
    return `\n- ${first}${body ? `\n${body}` : ""}`;
  },
  getDependencyReleaseLine: async () => "",
};
