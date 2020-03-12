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

    
    return exchangeRate;
}
async function getDeposits() {
    var default_account = (await web3.eth.getAccounts())[0];
    default_account = default_account.substr(2).toLowerCase();

    let depositUsdSum = 0;

    let fromBlock = '0x91c86f';
    if(localStorage.getItem('ClastDepositBlock') && localStorage.getItem('ClastAddress') == default_account) {
        let block = +localStorage.getItem('ClastDepositBlock')
        fromBlock = '0x'+parseInt(block+1).toString(16)
        depositUsdSum += +localStorage.getItem('ClastDeposits')
    }

    const poolTokensReceivings = await web3.eth.getPastLogs({
        fromBlock: fromBlock,
        toBlock: 'latest',
        address: CURVE_TOKEN,
        topics: [
            TRANSFER_TOPIC,
            [],
            '0x000000000000000000000000' + default_account,
        ],
    });

    var lastBlock = poolTokensReceivings.length && poolTokensReceivings[poolTokensReceivings.length-1].blockNumber || fromBlock

    const txs = poolTokensReceivings.map(e => e.transactionHash);

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
                const tokens = BN(log.data);
                if(tokens == 0) continue;
                const tokenIndex = Object.values(ADDRESSES).indexOf(log.address);
                let curr = Object.keys(ADDRESSES)[tokenIndex]
                let exchangeRate = await getExchangeRate(receipt.blockNumber, log.address, log.data)
                const usd = fromNative(curr, BN(exchangeRate).mul(BN(tokens)))
                depositUsdSum += usd;
            }
        }
    }
    console.timeEnd('timer')
    localStorage.setItem('ClastDepositBlock', lastBlock);
    localStorage.setItem('ClastAddress', default_account)
    localStorage.setItem('ClastDeposits', depositUsdSum);
    return depositUsdSum;
}

async function getWithdrawals(address) {
    var default_account = (await web3.eth.getAccounts())[0];
    default_account = default_account.substr(2).toLowerCase();
    let withdrawals = 0;
    let fromBlock = '0x91c86f';
    if(localStorage.getItem('ClastWithdrawalBlock') && localStorage.getItem('ClastAddress') == default_account) {
        let block = +localStorage.getItem('ClastWithdrawalBlock')
        fromBlock = '0x'+parseInt(block+1).toString(16)
        withdrawals += +localStorage.getItem('ClastWithdrawals')
    }
    const logs = await web3.eth.getPastLogs({
        fromBlock: fromBlock,
        toBlock: 'latest',
        address: token_address,
        topics: [
            TRANSFER_TOPIC,
            '0x000000000000000000000000' + default_account,
        ],
    });

    var lastBlock = logs.length && logs[logs.length-1].blockNumber || fromBlock



        for(let log of logs) {
            const receipt = await web3.eth.getTransactionReceipt(log.transactionHash);
            let removeliquidity = receipt.logs.filter(log=>log.topics[0] == '0x7c363854ccf79623411f8995b362bce5eddff18c927edc6f5dbbb5e05819a82c')
            let [cDAI, cUSDC] = [0,0];
            if(removeliquidity.length) {
                [cDAI, cUSDC] = (web3.eth.abi.decodeParameters(['uint256[2]','uint256[2]', 'uint256'], removeliquidity[0].data))[0]
            }
            else {
                removeliquidity = receipt.logs.filter(log=>log.topics[0] == '0x2b5508378d7e19e0d5fa338419034731416c4f5b219a10379956f764317fd47e')
                let decoded = web3.eth.abi.decodeParameters(['uint256[2]','uint256[2]', 'uint256', 'uint256'], removeliquidity[0].data)
                cDAI = decoded[0][0]
                cUSDC = decoded[0][1]
            }
            let cTokens = [cDAI, cUSDC];

            for(let i = 0; i < 2; i++) {
                    const tokens = BN(cTokens[i]);
                    if(tokens == 0) continue;
                    const tokenIndex = Object.values(ADDRESSES)[i]
                    let curr = Object.keys(ADDRESSES)[i]
                    let exchangeRate = await getExchangeRate(log.blockNumber, coins[i]._address, log.data)
                    const usd = fromNative(curr, BN(exchangeRate).mul(BN(tokens)))
                    withdrawals += usd;
            }
        }
    localStorage.setItem('ClastWithdrawalBlock', lastBlock);
    localStorage.setItem('ClastWithdrawals', withdrawals);
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
        $("#profit li:first span").text((deposits/100).toFixed(2))
        let withdrawals = await getWithdrawals();
        $("#profit li:nth-child(2) span").removeClass('loading line');
        $("#profit li:nth-child(2) span").text((withdrawals/100).toFixed(2))

        let available = 0;

        let promises = [];
        for(let curr of Object.keys(ADDRESSES)) {
            promises.push(getAvailable(curr))
        }
        let prices = await Promise.all(promises);
        for(let i = 0; i < prices.length; i++) {
            let curr = Object.keys(ADDRESSES)[i]
            const exchangeRate = await web3.eth.call({
                to: ADDRESSES[curr],
                data: '0xbd6d894d',
            });
            available += fromNativeCurrent(curr,
                BN(exchangeRate)
                .mul(BN(prices[i]))
                .div(BN(1e8))
            );
        }
        $("#profit li:nth-child(3) span").removeClass('loading line');
        $("#profit li:nth-child(3) span").text((available/100).toFixed(2))
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