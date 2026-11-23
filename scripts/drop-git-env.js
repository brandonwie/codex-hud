// Git gives a hook GIT_DIR, GIT_INDEX_FILE, GIT_CONFIG_PARAMETERS and more (in
// a linked worktree GIT_DIR and GIT_INDEX_FILE are absolute), and the Husky
// pre-commit hook runs npm test. A test that passed them on to git, or to the
// HUD, which runs git status, would act on the caller's repository: `git init`
// with GIT_DIR set marks it bare. Each suite calls this before its first test;
// a test that needs a GIT_* variable sets it itself.
module.exports = function dropInheritedGitEnv() {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("GIT_")) delete process.env[key];
  }
};
