var BN;

const ADDRESSES = {};

const CURVE = swap_address;
const CURVE_TOKEN = token_address;
//web3.utils.sha3('Transfer(address,address,uint256)')
const TRANSFER_TOPIC =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function fromNative(curr, value) {
    const decimals = ['yUSDC', 'yUSDT'].includes(curr) ? 6 : 18;
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
                .divRound(BN(tokensSupply))
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
            if (
                tokenIndex !== -1 &&
                log.topics[0] === TRANSFER_TOPIC &&
                log.topics[2] === '0x000000000000000000000000' + CURVE.substr(2).toLowerCase()
            ) {
                const tokens = BN(log.data);
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

async function initConverters() {
    let converters = {};
    for(let curr of Object.keys(ADDRESSES)) {
        converters[curr] = await convertValues(curr);
    }
    return converters;
}


async function init_ui() {
    for(let i = 0; i < N_COINS; i++) {
        let symbol = await coins[i].methods.symbol().call()
        ADDRESSES[symbol] = coins[i]._address;
    }
	try {
		let deposits = await getDeposits();
		$("#profit li:first span").text((deposits/100).toFixed(2))
		let withdrawals = 0;
		let available = 0;
        let promises = [];
        let converters = await initConverters();
        for(let curr of Object.keys(ADDRESSES)) {
            promises.push(getWithdrawals(ADDRESSES[curr]))
            promises.push(getAvailable(curr))
        }
        let prices = await Promise.all(promises);
        for(let i = 0; i < prices.length; i+=2) {
            withdrawals += converters[Object.keys(ADDRESSES)[i/2]](prices[i]);
            available += converters[Object.keys(ADDRESSES)[i/2]](prices[i+1]);
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