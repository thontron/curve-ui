var BN;

const ADDRESSES = {
    cdai: '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643',
    cusdc: '0x39AA39c021dfbaE8faC545936693aC917d5E7563'
}

const decimals = {
    cdai: 1e10,
    cusdc: 1e2,
}

var depositUsdSum = 0;


const CURVE = swap_address;
const CURVE_TOKEN = token_address;
//web3.utils.sha3('Transfer(address,address,uint256)')
const TRANSFER_TOPIC =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function fromNative(curr, value) {
    if(curr == 'cdai') return value.div(BN(1e10)).div(BN(1e16)).toNumber();
    if(curr == 'cusdc') {
        return value.div(BN(1e14)).toNumber();
    }
}

async function convertValues(curr) {
    //exchangeRate method
    const exchangeRate = await web3.eth.call({
        to: ADDRESSES[curr],
        data: '0xbd6d894d',
    });
    const tokensSupply = await web3.eth.call({
        to: ADDRESSES[curr],
        data: '0x18160ddd',
    });
    return value => {
        return this.fromNative(
            curr,
            BN(exchangeRate)
            .mul(BN(value))
            .div(BN(1e8))
        )
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
    console.log(tokenAddress)
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
		$("#profit li:first span").text(deposits/100)
		let withdrawals = 0;
		let available = 0;
		for(let curr of Object.keys(ADDRESSES)) {
			const converter = await convertValues(curr);
			const usdWithdrawn = converter(await getWithdrawals(ADDRESSES[curr]));
			withdrawals += usdWithdrawn;
			const availableUsd = converter(await getAvailable(curr));
			console.log(availableUsd)
			available += availableUsd;
		}
		$("#profit li:nth-child(2) span").text(withdrawals/100)
		$("#profit li:nth-child(3) span").text(available/100)
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
