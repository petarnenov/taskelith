export { GITHUB_API_VERSION, type GithubConnection } from './github-api.js';
export {
  GITHUB_PLUGIN_MANIFEST,
  GITHUB_SECRET_NAMES,
  GITHUB_SETTING_NAMES,
  githubSourceControlPlugin,
  registerGithubSourceControl,
  registerGithubSourceControlPlugin,
  type GithubPluginOptions,
} from './github-plugin.js';
export { createGithubSourceControl, type GithubSourceControlOptions } from './github-source-control.js';
export { basicAuthorization, type CredentialClock } from './run-credentials.js';
