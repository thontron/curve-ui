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
    //default_account = '0xeC6E6c0841a2bA474E92Bf42BaF76bFe80e8657C'
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
    let mints = await web3.eth.getPastLogs({
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
    //log.data is yDAI, yUSDC, yUSDT, yTUSD
    if(type != 'deposit') {
       mints = await web3.eth.getPastLogs({
            fromBlock: fromBlock,
            toBlock: toBlock,
            address: address,
            //web3.utils.sha3('Transfer(address,address,uint256)')
            topics: [
                '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                [],
                '0x0000000000000000000000000000000000000000000000000000000000000000'
            ],
        }); 
    }
    if(mints.length) {
        let mint = mints[0]
        if(direction == -1) mint = mints[mints.length-1]
        let tr = await web3.eth.getTransactionReceipt(mint.transactionHash)
        tr = tr.logs.filter(log=>log.address == yaddress)
        if(!tr.length) return false;
        var sent = tr[0]
        if(type != 'deposit') {
            sent = tr.logs.filter(log => {
                return log.topics[0] == TRANSFER_TOPIC 
                        && log.address.toLowerCase() == underlying_address.toLowerCase()
                        //&& log.topics[1] == '0x000000000000000000000000' + default_account
                        //  && log.topics[2] == '0x000000000000000000000000' + address.substr(2).toLowerCase()
            })
        }
        var exchangeRate = mint.data/sent.data
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
async function getDeposits() {
    var default_account = (await web3.eth.getAccounts())[0];
    //default_account = '0xeC6E6c0841a2bA474E92Bf42BaF76bFe80e8657C'
    default_account = default_account.substr(2).toLowerCase();

    let depositUsdSum = 0;
    
    let fromBlock = '0x909964';
    if(localStorage.getItem('lastDepositBlock') && localStorage.getItem('lastAddress') == default_account) {
        let block = +localStorage.getItem('lastDepositBlock')
        fromBlock = '0x'+parseInt(block+1).toString(16)
        depositUsdSum += +localStorage.getItem('lastDeposits')
    }
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

    /*if(localStorage.getItem('lastDepositBlock') && localStorage.getItem('lastAddress') == default_account) {
        poolTokensReceivings = poolTokensReceivings.filter(r=>r.blockNumber > lastBlock);
        depositUsdSum += +localStorage.getItem('lastDeposits')
    }*/
    const txs = poolTokensReceivings.map(e => e.transactionHash);

    console.time('timer')
    for (const hash of txs) {
        const receipt = await web3.eth.getTransactionReceipt(hash);
        let addliquidity = receipt.logs.filter(log=>log.topics[0] == '0x3f1915775e0c9a38a57a7bb7f1f9005f486fb904e1f84aa215364d567319a58d')
        let [yDAI, yUSDC, yUSDT, yTUSD] = (web3.eth.abi.decodeParameters(['uint256[4]','uint256[4]', 'uint256', 'uint256'], addliquidity[0].data))[0]
        let yTokens = [yDAI, yUSDC, yUSDT, yTUSD];
        for(let i = 0; i < 4; i++) {
            const tokenIndex = Object.values(ADDRESSES)[i]
            let tokens = yTokens[i];
            if(tokens == 0) continue;
            let usd = await getExchangeRate(receipt.blockNumber, underlying_coins[i]._address, '', 'deposit')
            if(i == 0 || i == 3) tokens /= 1e18
            else tokens /= 1e6
            depositUsdSum += tokens * usd;
        }
    }
    console.timeEnd('timer')
    localStorage.setItem('lastDepositBlock', lastBlock);
    localStorage.setItem('lastAddress', default_account)
    localStorage.setItem('lastDeposits', depositUsdSum);
    return depositUsdSum;
}

async function getWithdrawals(address) {
    var default_account = (await web3.eth.getAccounts())[0];
    //default_account = '0xeC6E6c0841a2bA474E92Bf42BaF76bFe80e8657C'
    default_account = default_account.substr(2).toLowerCase();
    console.log(address)
/*    let logs = await web3.eth.getPastLogs({
        fromBlock: '0x909964',
        toBlock: 'latest',
        address,
        topics: [
            TRANSFER_TOPIC,
            '0x000000000000000000000000' + CURVE.substr(2),
            '0x000000000000000000000000' + default_account,
        ],
    });*/
    let withdrawals = 0;
    let fromBlock = '0x909964';
    if(localStorage.getItem('lastWithdrawalBlock') && localStorage.getItem('lastAddress') == default_account) {
        let block = +localStorage.getItem('lastWithdrawalBlock')
        fromBlock = '0x'+parseInt(block+1).toString(16)
        withdrawals += +localStorage.getItem('lastWithdrawals')
    }
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

    //logs = logs.concat(zaps)
    for(let log of logs) {
        const receipt = await web3.eth.getTransactionReceipt(log.transactionHash);
        let removeliquidity = receipt.logs.filter(log=>log.topics[0] == '0xb964b72f73f5ef5bf0fdc559b2fab9a7b12a39e47817a547f1f0aee47febd602')
        if(!removeliquidity.length) {
            removeliquidity = receipt.logs.filter(log=>log.topics[0] == '0x9878ca375e106f2a43c3b599fc624568131c4c9a4ba66a14563715763be9d59d')
        }
        let [yDAI, yUSDC, yUSDT, yTUSD] = (web3.eth.abi.decodeParameters(['uint256[4]','uint256[4]', 'uint256'], removeliquidity[0].data))[0]
        let yTokens = [yDAI, yUSDC, yUSDT, yTUSD];
        for(let i = 0; i < 4; i++) {
            const tokenIndex = Object.values(ADDRESSES)[i]
            let tokens = yTokens[i];
            if(tokens == 0) continue;
            let usd = await getExchangeRate(receipt.blockNumber, underlying_coins[i]._address, '', 'deposit')
            if(i == 0 || i == 3) tokens /= 1e18
            else tokens /= 1e6
            withdrawals += tokens * usd;
        }
    }
    localStorage.setItem('lastWithdrawalBlock', lastBlock);
    //localStorage.setItem('lastAddress', default_account)
    localStorage.setItem('lastWithdrawals', withdrawals);
    return withdrawals;
}

async function getAvailable(curr) {
    var default_account = (await web3.eth.getAccounts())[0];
    //default_account = '0xeC6E6c0841a2bA474E92Bf42BaF76bFe80e8657C'
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