var BN;

let ADDRESSES = {};

const CURVE = swap_address;
const CURVE_TOKEN = token_address;
//web3.utils.sha3('Transfer(address,address,uint256)')
const TRANSFER_TOPIC =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

let priceData;

function findClosest(timestamp) {
    let dates = priceData.data.find(d=>d[0] - timestamp > 0);
    return dates;
}

function fromNative(curr, value) {
    return value.divRound(BN(1e16)).toNumber()
}

function convertValues(curr, exchangeRate, value) {
    if(curr == 'cDAI') exchangeRate*=1e8
    if(curr == 'cUSDC') exchangeRate*=1e20
    return BN(exchangeRate).mul(BN(value))
}

function fromNativeCurrent(curr, value) {
    const decimals = ['yUSDC', 'yUSDT'].includes(curr) ? 6 : 18;
    if (decimals === 18) {
        return Number(web3.utils.fromWei(value));
    }
    return value.toNumber() / 10 ** decimals;
}

async function convertValuesCurrent(curr) {
    const usdPool = await web3.eth.call({
        to: ADDRESSES[curr],
        data: '0x7137ef99',
    });
    const tokensSupply = await web3.eth.call({
        to: ADDRESSES[curr],
        data: '0x18160ddd',
    });
    return value => {
        return this.fromNativeCurrent(
            curr,
            BN(usdPool)
                .mul(BN(value))
                .div(BN(tokensSupply))
                .mul(BN(100))
        );
    };
}

async function checkExchangeRateBlocks(block, address, direction, type = 'deposit') {
    var default_account = (await web3.eth.getAccounts())[0];
    default_account = default_account.substr(2).toLowerCase();

    let fromBlock = '0x'+parseInt(block-100).toString(16)
    let toBlock = '0x'+parseInt(block).toString(16)
    fromBlock = '0x909964'
    if(direction == 1) {
        fromBlock = '0x'+parseInt(block).toString(16)
        toBlock = '0x'+parseInt(block+100).toString(16)
        toBlock = 'latest'
    }
    if(direction == 0) {
        fromBlock = '0x'+parseInt(block-1).toString(16)
        toBlock = '0x'+parseInt(block+1).toString(16)
    }
    let underlying_addresses = underlying_coins.map(c=>c._address)
    let index = underlying_addresses.indexOf(address);
    let yaddress = Object.values(ADDRESSES)[index];
    let mints;
    if(type == 'deposit') {
        mints = await web3.eth.getPastLogs({
            fromBlock: fromBlock,
            toBlock: toBlock,
            address: address,
            //web3.utils.sha3('Transfer(address,address,uint256)')
            topics: [
                '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                [],
                '0x000000000000000000000000' + yaddress.substr(2).toLowerCase()
            ],
        });
    }
    else {
        mints = await web3.eth.getPastLogs({
            fromBlock: fromBlock,
            toBlock: toBlock,
            address: yaddress,
            //web3.utils.sha3('Transfer(address,address,uint256)')
            topics: [
                '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                '0x0000000000000000000000000000000000000000000000000000000000000000'
            ],
        });
    }
    //log.data is yDAI, yUSDC, yUSDT, yBUSD

    if(mints.length) {
        let mint = mints[0]
        if(direction == -1) mint = mints[mints.length-1]
        console.log(mint)
        let tr = await web3.eth.getTransactionReceipt(mint.transactionHash)
        if(type=='deposit') {
            tr = tr.logs.filter(log=>log.address == yaddress)
        }
        else {
            tr = tr.logs.filter(log=>log.address == address)
        }
        if(!tr.length) return false;
        var sent = tr[0]

        console.log(mint, "MINTED", sent, "SENT")

        var exchangeRate = mint.data/sent.data
        if(type == 'withdrawal') exchangeRate = sent.data/mint.data;
        console.log(exchangeRate)
        return {blockNumber: mint.blockNumber, exchangeRate: exchangeRate};
    }
    return false;
}

async function getExchangeRate(blockNumber, address, value, type = 'deposit') {
    let exchangeRate = await checkExchangeRateBlocks(blockNumber, address, 0, type);
    let exchangeRatePast, exchangeRateFuture;
    if(exchangeRate === false) {
        let i = j = blockNumber;
        while((exchangeRatePast = await checkExchangeRateBlocks(i, address, -1, type)) === false) {
            i-=100;
        }
        while((exchangeRateFuture = await checkExchangeRateBlocks(j, address, 1, type)) === false) {
            j+=100;
        }

        exchangeRate = (exchangeRateFuture.blockNumber - exchangeRatePast.blockNumber) * (exchangeRateFuture.exchangeRate - exchangeRatePast.exchangeRate)
        exchangeRate = exchangeRate / (exchangeRateFuture.blockNumber - exchangeRatePast.blockNumber)
        exchangeRate = exchangeRate + (exchangeRatePast.exchangeRate)
    }
    else {
        exchangeRate = exchangeRate.exchangeRate;
    }

    return exchangeRate

    let tokens = BN(value);
    const tokenIndex = Object.values(ADDRESSES).indexOf(address);
    let curr = Object.keys(ADDRESSES)[tokenIndex]
    let currRate = await web3.eth.call({
        to: ADDRESSES[curr],
        data: '0xbd6d894d',
    });
    if(curr == 'yDAI' || curr == 'yTUSD' || 'yBUSD') tokens /= 1e18;
    if(curr == 'yUSDC' || curr == 'yUSDT') tokens /= 1e6
    const usd = exchangeRate * tokens
    return usd;
}

async function calculateAmount(blockNumber, yTokens, type) {
    let amount = 0;
    for(let i = 0; i < 4; i++) {
        let tokens = yTokens[i];
        if(tokens == 0) continue;
        let usd = await getExchangeRate(blockNumber, underlying_coins[i]._address, '', type)
        if(i == 0 || i == 3) tokens /= 1e18
        else tokens /= 1e6
        console.log(tokens, "TOKENS", usd, "EXCHANGE RATE", tokens * usd, "USD")
        amount += tokens * usd;
    }
    return amount;
}

async function getDeposits() {
    var default_account = (await web3.eth.getAccounts())[0];
    default_account = default_account.substr(2).toLowerCase();

    let depositUsdSum = 0;
    
    let fromBlock = '0x909964';

    let poolTokensReceivings = await web3.eth.getPastLogs({
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

    if(localStorage.getItem('dversion') == version && localStorage.getItem('lastDepositBlock') && localStorage.getItem('lastAddress') == default_account) {
        poolTokensReceivings = poolTokensReceivings.filter(r=>r.blockNumber > lastBlock);
        depositUsdSum += +localStorage.getItem('lastDeposits')
    }
    const txs = poolTokensReceivings.map(e => e.transactionHash);

    console.time('timer')
    for (const hash of txs) {
        const receipt = await web3.eth.getTransactionReceipt(hash);
        let timestamp = (await web3.eth.getBlock(receipt.blockNumber)).timestamp;
        console.log(timestamp)
        let [yDAI, yUSDC, yUSDT, yBUSD] = [0, 0, 0, 0]
        console.log(receipt.logs)
        let addliquidity = receipt.logs.filter(log=>log.topics[0] == '0x3f1915775e0c9a38a57a7bb7f1f9005f486fb904e1f84aa215364d567319a58d')
        if(addliquidity.length) {        
            let [yDAI, yUSDC, yUSDT, yBUSD] = (web3.eth.abi.decodeParameters(['uint256[4]','uint256[4]', 'uint256', 'uint256'], addliquidity[0].data))[0]
            let yTokens = [yDAI, yUSDC, yUSDT, yBUSD];
            depositUsdSum += await calculateAmount(receipt.blockNumber, yTokens, 'deposit');
        }
        else {
            let transfer = receipt.logs.filter(log=>log.topics[0] == TRANSFER_TOPIC && log.topics[2] == '0x000000000000000000000000' + default_account)
            let tokens = +transfer[0].data
            let exchangeRate = findClosest(timestamp)[1]
            console.log(tokens*exchangeRate/1e18, "TOKENS EXCHANGERATE TRANSFER")
            depositUsdSum += tokens*exchangeRate/1e18
        }
    }
    console.timeEnd('timer')
    localStorage.setItem('lastDepositBlock', lastBlock)
    localStorage.setItem('lastAddress', default_account)
    localStorage.setItem('lastDeposits', depositUsdSum)
    localStorage.setItem('dversion', version)
    return depositUsdSum;
}

async function getWithdrawals(address) {
    var default_account = (await web3.eth.getAccounts())[0];
    default_account = default_account.substr(2).toLowerCase();
    console.log(address)
    let withdrawals = 0;
    let fromBlock = '0x909964';

    let logs = await web3.eth.getPastLogs({
        fromBlock: fromBlock,
        toBlock: 'latest',
        address: token_address,
        topics: [
            TRANSFER_TOPIC,
            '0x000000000000000000000000' + default_account,
        ],
    });

    var lastBlock = logs.length && logs[logs.length-1].blockNumber || fromBlock

    if(localStorage.getItem('wversion') == version && localStorage.getItem('lastWithdrawalBlock') && localStorage.getItem('lastAddress') == default_account) {
        logs = logs.filter(l=>l.blockNumber > lastBlock);
        withdrawals += +localStorage.getItem('lastWithdrawals')
    }

    for(let log of logs) {
        const receipt = await web3.eth.getTransactionReceipt(log.transactionHash);
        let timestamp = (await web3.eth.getBlock(receipt.blockNumber)).timestamp;
        let removeliquidity = receipt.logs.filter(log=>log.topics[0] == '0xb964b72f73f5ef5bf0fdc559b2fab9a7b12a39e47817a547f1f0aee47febd602')
        if(removeliquidity.length) {
            let [yDAI, yUSDC, yUSDT, yBUSD] = (web3.eth.abi.decodeParameters(['uint256[4]','uint256[4]', 'uint256'], removeliquidity[0].data))[0]
            let yTokens = [yDAI, yUSDC, yUSDT, yBUSD];
            withdrawals += await calculateAmount(receipt.blockNumber, yTokens);
            continue;
        }
        removeliquidity = receipt.logs.filter(log=>log.topics[0] == '0x9878ca375e106f2a43c3b599fc624568131c4c9a4ba66a14563715763be9d59d')
        if(removeliquidity.length) {
            let [yDAI, yUSDC, yUSDT, yBUSD] = (web3.eth.abi.decodeParameters(['uint256[4]','uint256[4]', 'uint256'], removeliquidity[0].data))[0]
            let yTokens = [yDAI, yUSDC, yUSDT, yBUSD];
            withdrawals += await calculateAmount(receipt.blockNumber, yTokens, 'withdrawal');
        }
        else {
            let transfer = receipt.logs.filter(log=>log.topics[0] == TRANSFER_TOPIC && log.topics[1] == '0x000000000000000000000000' + default_account)
            let tokens = +transfer[0].data
            let exchangeRate = findClosest(timestamp)[1]
            console.log(tokens, exchangeRate, "TRANSFER WITHDRAWALS")
            withdrawals += tokens*exchangeRate/1e18
            return withdrawals
        }
    }
    localStorage.setItem('lastWithdrawalBlock', lastBlock)
    localStorage.setItem('lastAddress', default_account)
    localStorage.setItem('lastWithdrawals', withdrawals)
    localStorage.setItem('wversion', version)
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
    priceData = await $.getJSON('https://y.curve.fi/stats.json')

    for(let i = 0; i < N_COINS; i++) {
        let symbol = await coins[i].methods.symbol().call()
        ADDRESSES[symbol] = coins[i]._address;
    }

    try {
        let deposits = await getDeposits();
        $("#profit li:first span").removeClass('loading line');
        $("#profit li:first span").text(deposits.toFixed(2))
        let available = 0;

        let withdrawals = await getWithdrawals();
        $("#profit li:nth-child(2) span").removeClass('loading line');
        $("#profit li:nth-child(2) span").text(withdrawals.toFixed(2))

        let promises = [];
        for(let curr of Object.keys(ADDRESSES)) {
            promises.push(getAvailable(curr))
        }
        let prices = await Promise.all(promises);
        for(let i = 0; i < prices.length; i+=1) {
            let curr = Object.keys(ADDRESSES)[i]
            const exchangeRate = await web3.eth.call({
                to: ADDRESSES[curr],
                data: '0xbd6d894d',
            });
            const usdPool = await web3.eth.call({
                to: ADDRESSES[curr],
                data: '0x7137ef99',
            });
            const tokensSupply = await web3.eth.call({
                to: ADDRESSES[curr],
                data: '0x18160ddd',
            });
            available += fromNativeCurrent(curr,
                BN(usdPool)
                .mul(BN(prices[i]))
                .divRound(BN(tokensSupply))
            );
        }
        $("#profit li:nth-child(3) span").removeClass('loading line');
        $("#profit li:nth-child(3) span").text(available.toFixed(2))
        $("#profit li:nth-child(4) span").removeClass('loading line');
        $("#profit li:nth-child(4) span").text((available + withdrawals - deposits).toFixed(2))
    }
    catch(err) {
        localStorage.removeItem('lastDeposits')
        localStorage.removeItem('lastDepositBlock')
        localStorage.removeItem('lastWithdrawals')
        localStorage.removeItem('lastWithdrawalBlock')
        localStorage.removeItem('lastWithdrawals')
        localStorage.removeItem('dversion')
        localStorage.removeItem('pversion')
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