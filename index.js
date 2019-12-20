const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');

async function run() {
    await exec.exec('echo "Hello World!"');
}


run().catch(error => {
    core.setFailed(error.message);
})
