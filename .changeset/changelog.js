// Changelog lines without commit hashes: PRs are squash-merged, so the commit that
// added a changeset never reaches main and its hash would be a dead reference.
module.exports = {
  getReleaseLine: async (changeset) => {
    const [first, ...rest] = changeset.summary.trim().split("\n");
    const body = rest.map((line) => (line.trim() ? `  ${line.trimEnd()}` : "")).join("\n");
    return `\n- ${first}${body ? `\n${body}` : ""}`;
  },
  getDependencyReleaseLine: async () => "",
};
