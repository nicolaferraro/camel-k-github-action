const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');

try {
  
    exec.exec('01-setup.sh');

} catch (error) {
  core.setFailed(error.message);
}
