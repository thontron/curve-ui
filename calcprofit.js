var BN;

let ADDRESSES = {};

const CURVE = swap_address;
const CURVE_TOKEN = token_address;
//web3.utils.sha3('Transfer(address,address,uint256)')
const TRANSFER_TOPIC =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function fromNative(curr, value) {
    return value.divRound(BN(1e16)).toNumber()
}

function convertValues(curr, exchangeRate, value) {
    if(curr == 'cDAI') exchangeRate*=1e8
    if(curr == 'cUSDC') exchangeRate*=1e20
    return BN(exchangeRate).mul(BN(value))
}

function fromNativeCurrent(curr, value) {
    if(curr == 'cDAI') return value.div(BN(1e10)).div(BN(1e16)).toNumber();
    if(curr == 'cUSDC') {
        return value.div(BN(1e14)).toNumber();
    }
    if(curr == 'USDT') {
        return value.divRound(BN(1e4)).toNumber();
    }
}

async function checkExchangeRateBlocks(block, address, direction) {
    let fromBlock = '0x'+parseInt(block-100).toString(16)
    let toBlock = '0x'+parseInt(block).toString(16)
    if(direction == 1) {
        fromBlock = '0x'+parseInt(block).toString(16)
        toBlock = '0x'+parseInt(block+100).toString(16)
    }
    if(direction == 0) {
        fromBlock = '0x'+parseInt(block-1).toString(16)
        toBlock = '0x'+parseInt(block+1).toString(16)
    }
    let mints = await web3.eth.getPastLogs({
        fromBlock: fromBlock,
        toBlock: toBlock,
        address: address,
        //web3.utils.sha3('Mint(address,uint256,uint256)')
        topics: [
            '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f',
        ],
    });
    if(mints.length) {
        let mint = mints[0]
        let mintevent = web3.eth.abi.decodeParameters(['address','uint256','uint256'], mint.data)
        let exchangeRate = BN(mintevent[1]).div(BN(mintevent[2]));
        if(address == coins[1]._address) {
            exchangeRate = BN(mintevent[1]).mul(BN(1e12)).div(BN(mintevent[2]))
        }
        if(direction == 0) return exchangeRate
        return {blockNumber: mint.blockNumber, exchangeRate: exchangeRate};
    }
    return false;
}

async function getExchangeRate(blockNumber, address, value) {
    let exchangeRate = await checkExchangeRateBlocks(blockNumber, address, 0);
    let exchangeRatePast, exchangeRateFuture;
    if(exchangeRate === false) {
        let i = j = blockNumber;
        while((exchangeRatePast = await checkExchangeRateBlocks(i, address, -1)) === false) {
            i-=100;
        }
        while((exchangeRateFuture = await checkExchangeRateBlocks(j, address, 1)) === false) {
            j+=100;
        }

        exchangeRate = BN(exchangeRateFuture.blockNumber - exchangeRatePast.blockNumber).mul(exchangeRateFuture.exchangeRate.sub(exchangeRatePast.exchangeRate))
        exchangeRate = exchangeRate.div(BN(exchangeRateFuture.blockNumber - exchangeRatePast.blockNumber))
        exchangeRate = exchangeRate.add(exchangeRatePast.exchangeRate)
    }

    const tokens = BN(value);
    const tokenIndex = Object.values(ADDRESSES).indexOf(address);
    let curr = Object.keys(ADDRESSES)[tokenIndex]
    let currRate = await web3.eth.call({
        to: ADDRESSES[curr],
        data: '0xbd6d894d',
    });
    const usd = fromNative(curr, BN(exchangeRate).mul(BN(tokens)))
    return usd;
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
                console.time('timer')
    for (const hash of txs) {
        const receipt = await web3.eth.getTransactionReceipt(hash);
        for (const log of receipt.logs) {
            const tokenIndex = Object.values(ADDRESSES).indexOf(log.address);
            if (
                tokenIndex !== -1 &&
                log.topics[0] === TRANSFER_TOPIC &&
                log.topics[2] === '0x000000000000000000000000' + CURVE.substr(2).toLowerCase()
            ) {
                let usd;
                if(log.address == coins[2]._address) {
                    usd = BN(log.data).div(BN(1e4)).toNumber();
                    console.log(usd.toString(), "USDT")
                }
                else {
                    usd = await getExchangeRate(receipt.blockNumber, log.address, log.data)
                }
                depositUsdSum += usd;
            }
        }
    }
                console.timeEnd('timer')
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
    let withdrawals = 0;
    for(let log of logs) {
        let usd = await getExchangeRate(log.blockNumber, log.address, log.data)
        withdrawals += usd;
    }
    return withdrawals;
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
    for(let i = 0; i < N_COINS; i++) {
        let symbol = await coins[i].methods.symbol().call()
        ADDRESSES[symbol] = coins[i]._address;
    }

    try {
        let deposits = await getDeposits();
        $("#profit li:first span").removeClass('loading line');
        $("#profit li:first span").text(deposits/100)
        let withdrawals = 0;
        let available = 0;

        let promises = [];
        for(let curr of Object.keys(ADDRESSES)) {
            promises.push(getWithdrawals(ADDRESSES[curr]))
            promises.push(getAvailable(curr))
        }
        let prices = await Promise.all(promises);
        for(let i = 0; i < prices.length; i+=2) {
            withdrawals += prices[i];
            let curr = Object.keys(ADDRESSES)[i/2]
            if(curr == 'USDT') {
                available += fromNativeCurrent(curr, prices[i+1])
            }
            else {
                const exchangeRate = await web3.eth.call({
                    to: ADDRESSES[curr],
                    data: '0xbd6d894d',
                });
                available += fromNativeCurrent(curr,
                    BN(exchangeRate)
                    .mul(BN(prices[i+1]))
                    .div(BN(1e8))
                );
            }
        }
        $("#profit li:nth-child(2) span").removeClass('loading line');
        $("#profit li:nth-child(2) span").text(withdrawals/100)
        $("#profit li:nth-child(3) span").removeClass('loading line');
        $("#profit li:nth-child(3) span").text(available/100)
        $("#profit li:nth-child(4) span").removeClass('loading line');
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
        BN = web3.utils.toBN;

        await init_ui();        
    }
});