var BN;

let ADDRESSES = {};

const CURVE = swap_address;
const CURVE_TOKEN = token_address;
//web3.utils.sha3('Transfer(address,address,uint256)')
const TRANSFER_TOPIC =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

let priceData;

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

function findClosest(timestamp) {
    let dates = priceData.data.find(d=>d[0] - timestamp > 0);
    return dates;
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
    let mints = await web3provider.eth.getPastLogs({
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
        let mintevent = web3provider.eth.abi.decodeParameters(['address','uint256','uint256'], mint.data)
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
    let currentBlock = await web3provider.eth.getBlockNumber();
    let pastCurrentBlock = false;
    if(exchangeRate === false) {
        let i = j = blockNumber;
        while((exchangeRatePast = await checkExchangeRateBlocks(i, address, -1)) === false) {
            i-=100;
        }
        while((exchangeRateFuture = await checkExchangeRateBlocks(j, address, 1)) === false) {
            if(j > currentBlock) {
                pastCurrentBlock = true;
                break;
            }
            j+=100;
        }

        while(pastCurrentBlock) {
            let i = blockNumber - 200;
            let j = blockNumber - 100;
            while((exchangeRatePast = await checkExchangeRateBlocks(i, address, -1)) === false) {
                i-=200;
            }
            while((exchangeRateFuture = await checkExchangeRateBlocks(j, address, -1)) === false) {
                if(j > currentBlock) {
                    pastCurrentBlock = true;
                    break;
                }
                j-=100;
            }
            if(exchangeRatePast.blockNumber && exchangeRateFuture.blockNumber) pastCurrentBlock = false;
        }

        if(exchangeRatePast.blockNumber == exchangeRateFuture.blockNumber) {
            return exchangeRatePast.exchangeRate;
        }

        exchangeRate = BN(exchangeRateFuture.blockNumber - exchangeRatePast.blockNumber).mul(exchangeRateFuture.exchangeRate.sub(exchangeRatePast.exchangeRate))
        exchangeRate = exchangeRate.div(BN(exchangeRateFuture.blockNumber - exchangeRatePast.blockNumber))
        exchangeRate = exchangeRate.add(exchangeRatePast.exchangeRate)
    }

    
    return exchangeRate;
}
async function getDeposits() {
    var default_account = (await web3provider.eth.getAccounts())[0];
    default_account = default_account.substr(2).toLowerCase();

    let depositUsdSum = 0;

    let fromBlock = '0x91c86f';
    if(localStorage.getItem('pversion') == version && localStorage.getItem('ClastDepositBlock') && localStorage.getItem('ClastAddress') == default_account) {
        let block = +localStorage.getItem('ClastDepositBlock')
        fromBlock = '0x'+parseInt(block+1).toString(16)
        depositUsdSum += +localStorage.getItem('ClastDeposits')
    }

    const poolTokensReceivings = await web3provider.eth.getPastLogs({
        fromBlock: fromBlock,
        toBlock: 'latest',
        address: CURVE_TOKEN,
        topics: [
            TRANSFER_TOPIC,
            [],
            '0x000000000000000000000000' + default_account,
        ],
    });

    console.log(poolTokensReceivings)

    var lastBlock = poolTokensReceivings.length && poolTokensReceivings[poolTokensReceivings.length-1].blockNumber || fromBlock

    const txs = poolTokensReceivings.map(e => e.transactionHash);
    console.time('timer')
    for (const hash of txs) {
        const receipt = await web3provider.eth.getTransactionReceipt(hash);
        let timestamp = (await web3provider.eth.getBlock(receipt.blockNumber)).timestamp;
        console.log(timestamp)
        let cDAI = 0;
        let cUSDC = 0;
        let addliquidity = receipt.logs.filter(log=>log.topics[0] == '0x26f55a85081d24974e85c6c00045d0f0453991e95873f52bff0d21af4079a768')
        if(addliquidity.length) {
            let cTokens = (web3provider.eth.abi.decodeParameters(['uint256[2]','uint256[2]', 'uint256', 'uint256'], addliquidity[0].data))[0]
            for(let i = 0; i < 2; i++) {
                const tokenIndex = Object.values(ADDRESSES)[i];
                const tokens = BN(cTokens[i])
                if(tokens == 0) continue;
                let curr = Object.keys(ADDRESSES)[tokenIndex]
                let exchangeRate = await getExchangeRate(receipt.blockNumber, coins[i]._address , '')
                const usd = fromNative(curr, BN(exchangeRate).mul(BN(tokens)))
                depositUsdSum += usd;
                
            }
        }
        if(!addliquidity.length) {
            let transfer = receipt.logs.filter(log=>log.topics[0] == TRANSFER_TOPIC && log.topics[2] == '0x000000000000000000000000' + default_account)
            let tokens = +transfer[0].data
            let exchangeRate = findClosest(timestamp)[1]
            depositUsdSum += tokens*exchangeRate/1e16
        }
    }
    console.timeEnd('timer')
    localStorage.setItem('ClastDepositBlock', lastBlock);
    localStorage.setItem('ClastAddress', default_account)
    localStorage.setItem('ClastDeposits', depositUsdSum);
    localStorage.setItem('pversion', version);
    return depositUsdSum;
}

async function calculateAmount(cTokens, block) {
    let amount = 0;
    for(let i = 0; i < 2; i++) {
            const tokens = BN(cTokens[i]);
            if(tokens == 0) continue;
            const tokenIndex = Object.values(ADDRESSES)[i]
            let curr = Object.keys(ADDRESSES)[i]
            let exchangeRate = await getExchangeRate(block, coins[i]._address, '')
            const usd = fromNative(curr, BN(exchangeRate).mul(BN(tokens)))
            amount += usd;
    }
    return amount;
}

async function getWithdrawals(address) {
    var default_account = (await provider.eth.getAccounts())[0];
    default_account = default_account.substr(2).toLowerCase();
    let withdrawals = 0;
    let fromBlock = '0x91c86f';
    if(localStorage.getItem('pwversion') == version && localStorage.getItem('ClastWithdrawalBlock') && localStorage.getItem('ClastAddress') == default_account) {
        let block = +localStorage.getItem('ClastWithdrawalBlock')
        fromBlock = '0x'+parseInt(block+1).toString(16)
        withdrawals += +localStorage.getItem('ClastWithdrawals')
    }
    const logs = await web3provider.eth.getPastLogs({
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
        const receipt = await web3provider.eth.getTransactionReceipt(log.transactionHash);
        let timestamp = (await web3provider.eth.getBlock(receipt.blockNumber)).timestamp;
        let removeliquidity = receipt.logs.filter(log=>log.topics[0] == '0x7c363854ccf79623411f8995b362bce5eddff18c927edc6f5dbbb5e05819a82c')
        let [cDAI, cUSDC] = [0,0];
        let cTokens = [cDAI, cUSDC];
        if(removeliquidity.length) {
            cTokens = (web3provider.eth.abi.decodeParameters(['uint256[2]','uint256[2]', 'uint256'], removeliquidity[0].data))[0]
            withdrawals += await calculateAmount(cTokens, log.blockNumber)
            continue;
        }
        removeliquidity = receipt.logs.filter(log=>log.topics[0] == '0x2b5508378d7e19e0d5fa338419034731416c4f5b219a10379956f764317fd47e')
        if(removeliquidity.length) {
            let decoded = web3provider.eth.abi.decodeParameters(['uint256[2]','uint256[2]', 'uint256', 'uint256'], removeliquidity[0].data)
            withdrawals += await calculateAmount(decoded[0], log.blockNumber)
        }
        else {
            let transfer = receipt.logs.filter(log=>log.topics[0] == TRANSFER_TOPIC && log.topics[1] == '0x000000000000000000000000' + default_account)
            let tokens = +transfer[0].data
            let exchangeRate = findClosest(timestamp)[1]
            withdrawals += tokens*exchangeRate/1e16
            localStorage.setItem('ClastWithdrawalBlock', lastBlock);
            localStorage.setItem('ClastWithdrawals', withdrawals);
        }


    }
    localStorage.setItem('ClastWithdrawalBlock', lastBlock);
    localStorage.setItem('ClastWithdrawals', withdrawals);
    localStorage.setItem('pwversion', version);
    return withdrawals;
}

async function getAvailable(curr) {
    var default_account = (await web3provider.eth.getAccounts())[0];
    default_account = default_account.substr(2).toLowerCase();
    const tokenAddress = ADDRESSES[curr];
    //balanceOf method
    const balanceOfCurveContract = await web3provider.eth.call({
        to: tokenAddress,
        data: '0x70a08231000000000000000000000000' + CURVE.substr(2),
    });
    const poolTokensBalance = await web3provider.eth.call({
        to: CURVE_TOKEN,
        data: '0x70a08231000000000000000000000000' + default_account,
    });
    //totalSupply
    const poolTokensSupply = await web3provider.eth.call({
        to: CURVE_TOKEN,
        data: '0x18160ddd',
    });
    return BN(balanceOfCurveContract)
        .mul(BN(poolTokensBalance))
        .div(BN(poolTokensSupply));
}

async function init_ui() {
    priceData = await $.getJSON('https://compound.curve.fi/stats.json')
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
            const exchangeRate = await web3provider.eth.call({
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
        localStorage.removeItem('ClastDepositBlock');
        localStorage.removeItem('ClastDeposits');
        localStorage.removeItem('ClastWithdrawals');
        localStorage.removeItem('ClastWithdrawalBlock');
        localStorage.removeItem('ClastAddress');
        localStorage.removeItem('pversion');
        localStorage.removeItem('pwversion');
        localStorage.removeItem('ClastDeposits');
    }

}

window.addEventListener('load', async () => {
    try {
        await init();
        update_fee_info();
        BN = web3provider.utils.toBN;
        
        await init_ui();
    }
    catch(err) {
        const web3 = new Web3(infura_url);
        window.web3provider = web3
        window.web3 = web3

        await init_contracts();
        update_fee_info();
        BN = web3provider.utils.toBN;

        await init_ui();        
    }
});