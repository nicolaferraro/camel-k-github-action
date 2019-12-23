const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const tc = require('@actions/tool-cache');
const io = require('@actions/io');
const path = require('path')
const axios = require('axios');
const fs = require('fs')
const { promisify } = require('util')

const writeFileAsync = promisify(fs.writeFile)

async function run() {
    var cluster = core.getInput('cluster');

    if (cluster.toLowerCase() == "kubernetes") {
        await getKinD(core.getInput('kindVersion'));
        await exec.exec('kind --version');
    
        var registry = await startKinDContainerRegistry();
        await startKinD(registry);
    } else if (cluster.toLowerCase() == "openshift") {
        downloadURL = await getOCDownloadURL(core.getInput('openshiftVersion'));
        await startOC(downloadURL);

    } else if (cluster.toLowerCase() == "none") {
        core.info(`No cluster will be started up`);
    } else {
        throw new `unknown cluster type ${cluster}`
    }

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

    await exec.exec(`kubectl cluster-info`)
    await exec.exec(`kubectl describe nodes`)
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

async function getOCDownloadURL(version) {
    const tagInfoUrl = `https://api.github.com/repos/openshift/origin/releases/tags/${version}`;
    const tagInfo = await axios.get(tagInfoUrl);
    const downloadUrl = tagInfo.data.assets.find(
      asset =>
        asset.name.indexOf('linux') >= 0 && asset.name.indexOf('client') >= 0
    ).browser_download_url;
    core.info(`OpenShift Cluster version found at: ${downloadUrl}`);
    return downloadUrl;
}

async function startOC(downloadURL) {
    var startOCScript = `
#!/bin/bash

# set docker0 to promiscuous mode
sudo ip link set docker0 promisc on

# Download and install the oc binary
sudo mount --make-shared /

sudo apt-get install resolvconf
echo "nameserver 8.8.8.8" | sudo tee /etc/resolvconf/resolv.conf.d/head > /dev/null
echo "nameserver 8.8.4.4" | sudo tee /etc/resolvconf/resolv.conf.d/head > /dev/null
sudo service resolvconf restart

sudo service docker stop
sudo echo '{"insecure-registries": ["172.30.0.0/16"]}' | sudo tee /etc/docker/daemon.json > /dev/null
sudo service docker start

wget -O client.tar.gz ${downloadURL}
tar xvzOf client.tar.gz > oc.bin
sudo mv oc.bin /usr/local/bin/oc
sudo chmod 755 /usr/local/bin/oc

# Figure out this host's IP address
IP_ADDR="$(ip addr show eth0 | grep "inet\b" | awk '{print $2}' | cut -d/ -f1)"

# Setup cluster dir
sudo mkdir -p /home/runner/lib/oc
sudo chmod 777 /home/runner/lib/oc
cd /home/runner/lib/oc

# Start OpenShift
oc cluster up --public-hostname=$IP_ADDR

oc login -u system:admin

# Wait until we have a ready node in openshift
TIMEOUT=0
TIMEOUT_COUNT=60
until [ $TIMEOUT -eq $TIMEOUT_COUNT ]; do
  if [ -n "$(oc get nodes | grep Ready)" ]; then
    break
  fi

  echo "openshift is not up yet"
  TIMEOUT=$((TIMEOUT+1))
  sleep 5
done

if [ $TIMEOUT -eq $TIMEOUT_COUNT ]; then
  echo "Failed to start openshift"
  exit 1
fi

echo "openshift is deployed and reachable"
oc describe nodes
    `
    await writeFileAsync('startOC.sh', startOCScript)
    await exec.exec("chmod a+x ./startOC.sh")
    await exec.exec("./startOC.sh")
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

run().catch(error => {
    core.setFailed(error.message);
})
