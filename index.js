const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');

async function run() {
    return await exec.exec('./01-setup.sh');
}


run().catch(error => {
    core.setFailed(error.message);
})
