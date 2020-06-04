const ChaincodeAction = require('./chaincodeAction');
const ProposalManager = require('khala-fabric-admin/proposal');
const {waitForTx} = require('./eventHub');
const {transientMapTransform} = require('khala-fabric-formatter/txProposal');

const EndorseALL = (result) => {
	const {errors, responses} = result;
	if (errors.length > 0) {
		const err = Error('SYSTEM_ERROR');
		err.errors = errors;
		throw err;
	}

	const endorsementErrors = [];
	for (const Response of responses) {
		const {response, connection} = Response;
		if (response.status !== 200) {
			endorsementErrors.push({response, connection});
		}

	}
	if (endorsementErrors.length > 0) {
		const err = Error('ENDORSE_ERROR');
		err.errors = endorsementErrors;
		throw err;
	}
	return result;
};

class Transaction extends ChaincodeAction {
	constructor(peers, user, channel, logger) {
		super(peers, user, channel);
		if (!logger) {
			logger = require('khala-logger/log4js').consoleLogger('Transaction');
		}
		this.logger = logger;
	}

	setProposalOptions(options) {
		this.proposalOptions = options;
	}

	setCommitOptions(options) {
		this.commitOptions = options;
	}

	setEventOptions(options) {
		this.eventOptions = options;
	}

	build(chaincodeId, endorseResultHandler) {
		this.proposal = new ProposalManager(this.identityContext, this.channel, chaincodeId, this.endorsers);
		if (typeof endorseResultHandler === 'function') {
			this.endorseResultInterceptor = endorseResultHandler;
		}
	}

	_endorseResultIntercept(result) {
		const {endorseResultInterceptor} = this;
		if (typeof endorseResultInterceptor === 'function') {
			return endorseResultInterceptor(result);
		} else {
			return result;
		}
	}

	async evaluate({fcn, args = [], transientMap}) {
		this.proposal.asQuery();
		const result = await this.proposal.send({
			fcn,
			args,
			transientMap: transientMapTransform(transientMap)
		}, this.proposalOptions);
		return this._endorseResultIntercept(result);
	}

	async submit({fcn, args = [], transientMap, init}, orderer) {
		if (init) {
			fcn = 'init';
		}
		this.proposal.asEndorsement();
		const result = await this.proposal.send({
			fcn,
			args,
			transientMap: transientMapTransform(transientMap),
			init
		}, this.proposalOptions);
		this._endorseResultIntercept(result);
		const commitResult = await this.proposal.commit([orderer.committer], this.commitOptions);
		this.logger.debug(commitResult);
		const eventHub = this.newEventHub(this.eventOptions);
		try {
			await waitForTx(eventHub, this.proposal.identityContext);
		} finally {
			eventHub.disconnect();
		}

		return result;

	}
}

Transaction.EndorseALL = EndorseALL;
module.exports = Transaction;
