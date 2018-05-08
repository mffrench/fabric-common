const dockerUtil = require('../docker/nodejs/dockerode-util');
const logger = require('./logger').new('dockerode');
const peerUtil = require('./peer');
const caUtil = require('./ca');
const kafkaUtil = require('./kafka');
const ordererUtil = require('./orderer');
const zookeeperUtil = require('./zookeeper');

exports.imagePullCCENV = (imageTag)=>{
	return dockerUtil.imagePull(`hyperledger/fabric-ccenv:${imageTag}`);
};
exports.runCA = ({
					 container_name, port, network, imageTag, admin = 'Admin', adminpw = 'passwd'
				 }) => {
	const createOptions = {
		name: container_name,
		Env: caUtil.envBuilder(),
		ExposedPorts: {
			'7054': {}
		},
		Cmd: ['fabric-ca-server', 'start', '-d', '-b', `${admin}:${adminpw}`],
		Image: `hyperledger/fabric-ca:${imageTag}`,
		Hostconfig: {
			PortBindings: {
				'7054': [
					{
						HostPort: port.toString()
					}
				]
			},
			NetworkMode: network
		}
	};
	return dockerUtil.containerStart(createOptions);
};
exports.deployCA = ({Name, network, imageTag, Constraints, port, admin = 'Admin', adminpw = 'passwd'}) => {
	return dockerUtil.serviceExist({Name}).then((info) => {
		if (info) return info;
		return dockerUtil.serviceCreate({
			Image: `hyperledger/fabric-ca:${imageTag}`,
			Name,
			Cmd: ['fabric-ca-server', 'start', '-d', '-b', `${admin}:${adminpw}`],
			network, Constraints, volumes: [], ports: [{host: port, container: 7054}]
		});
	});
};

exports.runKafka = ({container_name, network, imageTag, BROKER_ID}, zookeepers, {N, M}) => {

	const createOptions = {
		name: container_name,
		Env: kafkaUtil.envBuilder({N, M, BROKER_ID}, zookeepers),
		ExposedPorts: {
			'9092': {}
		},
		Image: `hyperledger/fabric-kafka:${imageTag}`,
		Hostconfig: {
			NetworkMode: network
		}
	};
	return dockerUtil.containerStart(createOptions);
};
exports.runZookeeper = ({container_name, network, imageTag, MY_ID}, allIDs) => {
	const createOptions = {
		name: container_name,
		Env: zookeeperUtil.envBuilder(MY_ID, allIDs),
		ExposedPorts: {
			'2888': {}, '3888': {}, '2181': {}
		},
		Image: `hyperledger/fabric-zookeeper:${imageTag}`,
		Hostconfig: {
			NetworkMode: network
		}
	};
	return dockerUtil.containerStart(createOptions);
};
exports.uninstallChaincode = ({container_name, chaincodeId, chaincodeVersion}) => {
	const Cmd = ['rm', '-rf', `/var/hyperledger/production/chaincodes/${chaincodeId}.${chaincodeVersion}`];
	return dockerUtil.containerExec({container_name, Cmd});

// 	docker exec $PEER_CONTAINER rm -rf /var/hyperledger/production/chaincodes/$CHAINCODE_NAME.$VERSION
};
exports.chaincodeContainerList = () => {
	return dockerUtil.containerList().then(containers =>
		containers.filter(container => container.Names.find(name => name.startsWith('/dev-')))
	);
};
exports.chaincodeContainerClean = () => {
	return module.exports.chaincodeContainerList().then(containers => {
		containers.forEach(container => {
			return dockerUtil.containerDelete(container.Id)
				.then(() => dockerUtil.imageDelete(container.Image));

		});
		return containers;
	});
};
exports.runOrderer = ({container_name, imageTag, port, network, BLOCK_FILE, CONFIGTXVolume, msp: {id, configPath, volumeName}, kafkas, tls}) => {
	const Image = `hyperledger/fabric-orderer:${imageTag}`;
	const Cmd = ['orderer'];
	const Env = ordererUtil.envBuilder({
		BLOCK_FILE, msp: {
			configPath, id
		}, kafkas, tls
	});

	const createOptions = {
		name: container_name,
		Env,
		Volumes: {
			[peerUtil.container.MSPROOT]: {},
			[ordererUtil.container.CONFIGTX]: {},
		},
		Cmd,
		Image,
		ExposedPorts: {
			'7050': {},
		},
		Hostconfig: {
			Binds: [
				`${volumeName}:${peerUtil.container.MSPROOT}`,
				`${CONFIGTXVolume}:${ordererUtil.container.CONFIGTX}`
			],
			PortBindings: {
				'7050': [
					{
						HostPort: port.toString()
					}
				]
			},
			NetworkMode: network
		}
	};
	return dockerUtil.containerStart(createOptions);
};

exports.deployOrderer = ({
							 Name, network, imageTag, Constraints, port,
							 msp: {volumeName, configPath, id}, CONFIGTXVolume, BLOCK_FILE, kafkas, tls
						 }) => {
	return dockerUtil.serviceExist({Name}).then((info) => {
		if (info) return info;
		const Env = ordererUtil.envBuilder({BLOCK_FILE, msp: {configPath, id}, kafkas, tls});
		return dockerUtil.serviceCreate({
			Cmd: ['orderer'],
			Image: `hyperledger/fabric-orderer:${imageTag}`
			, Name, network, Constraints, volumes: [{
				volumeName, volume: peerUtil.container.MSPROOT
			}, {
				volumeName: CONFIGTXVolume, volume: ordererUtil.container.CONFIGTX
			}], ports: [{host: port, container: 7050}],
			Env
		});
	});
};
exports.deployPeer = ({
						  Name, network, imageTag, Constraints, port, eventHubPort,
						  msp: {volumeName, configPath, id}, peer_hostName_full, tls
					  }) => {
	return dockerUtil.serviceExist({Name}).then((info) => {
		if (info) return info;
		const Env = peerUtil.envBuilder({
			network, msp: {
				configPath, id, peer_hostName_full
			}, tls
		});

		return dockerUtil.serviceCreate({
			Image: `hyperledger/fabric-peer:${imageTag}`,
			Cmd: ['peer', 'node', 'start'],
			Name, network, Constraints, volumes: [{
				volumeName, volume: peerUtil.container.MSPROOT
			}, {
				Type: 'bind', volumeName: peerUtil.host.dockerSock, volume: peerUtil.container.dockerSock
			}], ports: [
				{host: port, container: 7051},
				{host: eventHubPort, container: 7053}
			],
			Env
		});
	});
};
exports.runPeer = ({
					   container_name, port, eventHubPort, network, imageTag,
					   msp: {
						   id, volumeName,
						   configPath
					   }, peer_hostName_full, tls
				   }) => {
	const Image = `hyperledger/fabric-peer:${imageTag}`;
	const Cmd = ['peer', 'node', 'start'];
	const Env = peerUtil.envBuilder({
		network, msp: {
			configPath, id, peer_hostName_full
		}, tls
	});

	const createOptions = {
		name: container_name,
		Env,
		Volumes: {
			[peerUtil.container.dockerSock]: {},
			[peerUtil.container.MSPROOT]: {}
		},
		Cmd,
		Image,
		ExposedPorts: {
			'7051': {},
			'7053': {}
		},
		Hostconfig: {
			Binds: [
				`${peerUtil.host.dockerSock}:${peerUtil.container.dockerSock}`,
				`${volumeName}:${peerUtil.container.MSPROOT}`],
			PortBindings: {
				'7051': [
					{
						HostPort: port.toString()
					}
				],
				'7053': [
					{
						HostPort: eventHubPort.toString()
					}
				]
			},
		},
		NetworkingConfig: {
			EndpointsConfig:{
				[network]: {
					Aliases: [peer_hostName_full]
				}
			}
		}
	};
	return dockerUtil.containerStart(createOptions);
};

exports.volumeReCreate = ({Name, path}) => {
	return dockerUtil.volumeRemove({Name}).then(() => dockerUtil.volumeCreateIfNotExist({Name, path}));
};
/**
 * service=<service name>
 node=<node id or name>
 */
exports.findTask = ({service, node, state}) => {
	return dockerUtil.taskList({
		services: service ? [service] : [],
		nodes: node ? [node] : [],
	}).then(result => {
		if (state) {
			return result.filter((each) => {
				return each.Status.State = state;
			});
		} else {
			return result;
		}
	});
};
exports.networkCreateIfNotExist = ({Name}, swarm) => {
	return dockerUtil.networkInspect({Name}).then(status => {
		logger.info(Name, 'exist', status);
		return status;
	}).catch(err => {
		if (err.toString().includes('no such network')) {
			return dockerUtil.networkCreate({Name}, swarm);
		}
		throw err;
	});
};
exports.networkReCreate = ({Name}, swarm) => {
	return dockerUtil.networkRemove({Name}).then(() => dockerUtil.networkCreate({Name}, swarm));
};