const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const tc = require('@actions/tool-cache');
const io = require('@actions/io');
const path = require('path')
const fs = require('fs')
const { promisify } = require('util')

const writeFileAsync = promisify(fs.writeFile)

async function run() {

    await getKinD(core.getInput('kindVersion'));
    await exec.exec('kind --version');

    var registry = await startKinDContainerRegistry();
    await startKinD(registry);

    await printClusterInfo();

    await getKamel(core.getInput('version'));
    await exec.exec("kamel version");

}


async function getKinD(version) {
    var url = `https://github.com/kubernetes-sigs/kind/releases/download/${version}/kind-linux-amd64`;
    console.log("Downloading kind from " + url);
    downloadPath = await tc.downloadTool(url);
    var binPath = "/home/runner/bin";
    await io.mkdirP(binPath);
    await exec.exec("chmod", ["+x", downloadPath]);
    await io.mv(downloadPath, path.join(binPath, "kind"));

    core.addPath(binPath);
}

async function startKinD(registry) {
    var clusterConfig = `kind: Cluster\napiVersion: kind.x-k8s.io/v1alpha4\ncontainerdConfigPatches:\n- |-\n  [plugins."io.containerd.grpc.v1.cri".registry.mirrors."${registry.ip}:${registry.port}"]\n    endpoint = ["http://${registry.ip}:${registry.port}"]\n`
    await writeFileAsync('config.yml', clusterConfig)
    await exec.exec("cat ./config.yml")

    await exec.exec("kind create cluster --config=./config.yml")
}

async function getKamel(version) {
    var url = `https://github.com/apache/camel-k/releases/download/${version}/camel-k-client-${version}-linux-64bit.tar.gz`;
    console.log("Downloading kamel from " + url);
    downloadPath = await tc.downloadTool(url);
    var binPath = "/home/runner/bin";
    await io.mkdirP(binPath);
    await tc.extractTar(downloadPath, ".")
    await io.mv("./kamel", path.join(binPath, "kamel"));

    core.addPath(binPath);
}

async function printClusterInfo() {
    await exec.exec("kubectl cluster-info")
    await exec.exec("kubectl describe nodes")
}

async function startKinDContainerRegistry() {
    var port = 5000
    await exec.exec(`docker run -d -p=${port}:5000 --restart=always --name=kind-registry registry:2`);
    
    var ip;
    await exec.exec(`docker inspect --format "{{json .NetworkSettings.IPAddress }}" "kind-registry"`, undefined, {
        listeners: {
            stdline: l => ip=l
        }
    })
    ip = ip.replace(/['"]+/g, '')
    
    core.exportVariable(`KAMEL_INSTALL_REGISTRY`, `${ip}:${port}`)
    core.exportVariable(`KAMEL_INSTALL_REGISTRY_INSECURE`, `true`)

    return {
        ip: ip,
        port: port
    }
}


run().catch(error => {
    core.setFailed(error.message);
})
