const {BlockNumberFilterType: {NEWEST}} = require('khala-fabric-formatter/eventHub');
/**
 *
 * @param eventHub
 * @param identityContext
 * @param {number} blockNumber Note: NEWEST or OLDEST is not supported so far
 * @return {Promise<Block>}
 */
const getSingleBlock = async (eventHub, identityContext, blockNumber) => {
	const startBlock = blockNumber;
	const endBlock = blockNumber;
	eventHub.build(identityContext, {startBlock, endBlock});

	return await new Promise((resolve, reject) => {
		const listener = (err, info) => {
			if (info) {
				if (parseInt(info.block.header.number) === blockNumber) {
					resolve(info.block);
				}
			}
		};
		eventHub.blockEvent(listener, {unregister: true, startBlock, endBlock});
		eventHub.connect();
	});
};
/**
 * @param eventHub
 * @param identityContext
 * @return {Promise<unknown>}
 */
const getLastBlock = async (eventHub, identityContext) => {
	const startBlock = NEWEST;
	eventHub.build(identityContext, {startBlock});
	return await new Promise((resolve, reject) => {
		const listener = (err, {block}) => {
			if (err) {
				reject(err);
			} else {
				resolve(block);
			}
		};
		eventHub.blockEvent(listener, {unregister: true});
		eventHub.connect();
	});
};

const waitForBlock = async (eventHub, identityContext) => {
	eventHub.build(identityContext, {startBlock: NEWEST});
	return await new Promise((resolve, reject) => {
		let currentBlock;
		const callback = (err, {block}) => {
			if (err) {
				reject(err);
			} else {
				if (currentBlock) {
					listener.unregisterEventListener();
					resolve(block);
				} else {
					currentBlock = block;
				}

			}

		};
		const listener = eventHub.blockEvent(callback, {unregister: false});
		eventHub.connect();
	});
};
module.exports = {
	getSingleBlock,
	getLastBlock,
	waitForBlock,
};