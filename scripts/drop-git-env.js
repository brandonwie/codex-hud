// Git gives a hook GIT_DIR and GIT_INDEX_FILE (absolute in a linked worktree),
// GIT_PREFIX and, after `git -c`, GIT_CONFIG_PARAMETERS, and the Husky
// pre-commit hook runs npm test. Passed on to git, or to the HUD, which runs git
// status, they point a test at the caller's repository: `git init` with GIT_DIR
// set marks it bare. Each suite drops them before its first test.
//
// The list is what `git rev-parse --local-env-vars` prints (Git 2.56), plus
// GIT_ATTR_SOURCE, which it omits, and the GIT_CONFIG_KEY_n/VALUE_n pairs of
// GIT_CONFIG_COUNT. Other GIT_* settings stay, such as GIT_OPTIONAL_LOCKS=0 and
// the Mac gate's GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM and GIT_ATTR_NOSYSTEM.
const repositoryVariables = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_ATTR_SOURCE",
  "GIT_COMMON_DIR",
  "GIT_CONFIG",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_DIR",
  "GIT_GRAFT_FILE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
]);

function isRepositoryVariable(key) {
  return repositoryVariables.has(key) || /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key);
}

module.exports = function dropRepositoryGitEnv() {
  for (const key of Object.keys(process.env)) {
    if (isRepositoryVariable(key)) delete process.env[key];
  }
};
