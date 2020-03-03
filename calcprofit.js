var BN;

const ADDRESSES = {
    idai: '0xC2cB1040220768554cf699b0d863A3cd4324ce32',
    iusdc: '0x26EA744E5B887E5205727f55dFBE8685e3b21951',
    iusdt: '0xE6354ed5bC4b393a5Aad09f21c46E101e692d447',
    ibusd: '0x04bC0Ab673d88aE9dbC9DA2380cB6B79C4BCa9aE'
};

const decimals = {
    cdai: 1e10,
    cusdc: 1e2,
}

var depositUsdSum = 0;


const CURVE = '0x79a8c46dea5ada233abaffd40f3a0a2b1e5a4f27';
const CURVE_TOKEN = '0x3B3Ac5386837Dc563660FB6a0937DFAa5924333B';
//web3.utils.sha3('Transfer(address,address,uint256)')
const TRANSFER_TOPIC =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function fromNative(curr, value) {
    const decimals = ['iusdc', 'iusdt'].includes(curr) ? 6 : 18;
    if (decimals === 18) {
        return Number(web3.utils.fromWei(value));
    }
    return value.toNumber() / 10 ** decimals;
}

async function convertValues(curr) {
    const usdPool = await web3.eth.call({
        to: ADDRESSES[curr],
        data: '0x7137ef99',
    });
    const tokensSupply = await web3.eth.call({
        to: ADDRESSES[curr],
        data: '0x18160ddd',
    });
    return value => {
        return this.fromNative(
            curr,
            BN(usdPool)
                .mul(BN(value))
                .div(BN(tokensSupply))
                .mul(BN(100))
        );
    };
}

async function getDeposits() {
    var default_account = (await web3.eth.getAccounts())[0];
    default_account = default_account.substr(2).toLowerCase();

	const poolTokensReceivings = await web3.eth.getPastLogs({
        fromBlock: '0x909974',
        toBlock: 'latest',
        address: CURVE_TOKEN,
        topics: [
            TRANSFER_TOPIC,
            [],
            '0x000000000000000000000000' + default_account,
        ],
    });
    const txs = poolTokensReceivings.map(e => e.transactionHash);

    let depositUsdSum = 0;
    for (const hash of txs) {
        const { logs } = await web3.eth.getTransactionReceipt(hash);
        for (const log of logs) {
            const tokenIndex = Object.values(ADDRESSES).indexOf(log.address);
            console.log(log.address)
            if (
                tokenIndex !== -1 &&
                log.topics[0] === TRANSFER_TOPIC &&
                log.topics[2] === '0x000000000000000000000000' + CURVE.substr(2).toLowerCase()
            ) {
                const tokens = BN(log.data);
                console.log(+tokens, "TOKENS")
                const usd = (await convertValues(Object.keys(ADDRESSES)[tokenIndex]))(tokens)
                depositUsdSum += usd;
            }
        }
    }
    return depositUsdSum;
}

async function getWithdrawals(address) {
    var default_account = (await web3.eth.getAccounts())[0];
    default_account = default_account.substr(2).toLowerCase();
    const logs = await web3.eth.getPastLogs({
        fromBlock: '0x909974',
        toBlock: 'latest',
        address,
        topics: [
            TRANSFER_TOPIC,
            '0x000000000000000000000000' + CURVE.substr(2),
            '0x000000000000000000000000' + default_account,
        ],
    });
    if(!logs.length) return 0;
    return logs.reduce(
        (acc, val) => BN(val.data).add(acc),
        BN('0')
    );
}

async function getAvailable(curr) {
    var default_account = (await web3.eth.getAccounts())[0];
    default_account = default_account.substr(2).toLowerCase();
    const tokenAddress = ADDRESSES[curr];
    //balanceOf method
    const balanceOfCurveContract = await web3.eth.call({
        to: tokenAddress,
        data: '0x70a08231000000000000000000000000' + CURVE.substr(2),
    });
    const poolTokensBalance = await web3.eth.call({
        to: CURVE_TOKEN,
        data: '0x70a08231000000000000000000000000' + default_account,
    });
    //totalSupply
    const poolTokensSupply = await web3.eth.call({
        to: CURVE_TOKEN,
        data: '0x18160ddd',
    });
    return BN(balanceOfCurveContract)
        .mul(BN(poolTokensBalance))
        .div(BN(poolTokensSupply));
}

async function init_ui() {
	try {
		let deposits = await getDeposits();
		$("#profit li:first span").text((deposits/100).toFixed(2))
		let withdrawals = 0;
		let available = 0;
		for(let curr of Object.keys(ADDRESSES)) {
			const converter = await convertValues(curr);
			const usdWithdrawn = converter(await getWithdrawals(ADDRESSES[curr]));
			withdrawals += usdWithdrawn || 0;
			const availableUsd = converter(await getAvailable(curr));
			available += availableUsd || 0;
		}
		$("#profit li:nth-child(2) span").text((withdrawals/100).toFixed(2))
		$("#profit li:nth-child(3) span").text((available/100).toFixed(2))
		$("#profit li:nth-child(4) span").text((available/100 + withdrawals/100 - deposits/100).toFixed(2))
	}
	catch(err) {
		console.error(err)
	}

}

window.addEventListener('load', async () => {
    try {
        await init();
        update_fee_info();
        BN = web3.utils.toBN;
        
        await init_ui();
    }
    catch(err) {
        const web3 = new Web3(infura_url);
        window.web3 = web3

        await init_contracts();
        update_fee_info();

        await init_ui();        
    }
});