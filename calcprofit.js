var BN;

const ADDRESSES = {
    idai: '0x16de59092dAE5CcF4A1E6439D611fd0653f0Bd01',
    iusdc: '0xd6aD7a6750A7593E092a9B218d66C0A814a3436e',
    iusdt: '0x83f798e925BcD4017Eb265844FDDAbb448f1707D',
    itusd: '0x73a052500105205d34Daf004eAb301916DA8190f',
};

const decimals = {
    cdai: 1e10,
    cusdc: 1e2,
}

var depositUsdSum = 0;


const CURVE = '0x45f783cce6b7ff23b2ab2d70e416cdb7d6055f51';
const CURVE_TOKEN = '0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8';
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