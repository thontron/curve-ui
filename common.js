var coins = new Array(N_COINS);
var underlying_coins = new Array(N_COINS);
var swap;
var swap_token;
var ERC20Contract;
var balances = new Array(N_COINS);
var wallet_balances = new Array(N_COINS);
var c_rates = new Array(N_COINS);
var fee;
var admin_fee;

var version = 3;
localStorage.setItem('version', version)

var cBN = (val) => new BigNumber(val);
const trade_timeout = 1800;
const max_allowance = cBN(2).pow(cBN(256)).minus(cBN(1));

function approve(contract, amount, account) {
    return new Promise(resolve => {
                contract.methods.approve(swap_address, cBN(amount).toFixed(0,1))
                .send({from: account, gas: 100000})
                .once('transactionHash', function(hash) {resolve(true);});
            });
}


function approve_to_migrate(amount, account) {
    return new Promise(resolve => {
                old_swap_token.methods.approve(migration_address, amount)
                .send({from: account, gas: 100000})
                .once('transactionHash', function(hash) {resolve(true);});
            });
}

async function ensure_allowance(amounts) {
    var default_account = (await web3.eth.getAccounts())[0];
    var allowances = new Array(N_COINS);
    for (let i=0; i < N_COINS; i++)
        allowances[i] = await coins[i].methods.allowance(default_account, swap_address).call();

    if (amounts) {
        // Non-infinite
        for (let i=0; i < N_COINS; i++) {
            if (cBN(allowances[i]).isLessThan(amounts[i])) {
                if (allowances[i] > 0)
                    await approve(coins[i], 0, default_account);
                await approve(coins[i], amounts[i], default_account);
            }
        }
    }
    else {
        // Infinite
        for (let i=0; i < N_COINS; i++) {
            if (cBN(allowances[i]).isLessThan(max_allowance.div(cBN(2)))) {
                if (allowances[i] > 0)
                    await approve(coins[i], 0, default_account);
                await approve(coins[i], max_allowance, default_account);
            }
        }
    }
}

async function ensure_underlying_allowance(i, _amount) {
    var default_account = (await web3.eth.getAccounts())[0];
    var amount = cBN(_amount);
    var current_allowance = cBN(await underlying_coins[i].methods.allowance(default_account, swap_address).call());

    if (current_allowance.isEqualTo(amount))
        return false;
    if ((cBN(_amount).isEqualTo(max_allowance)) & (current_allowance.isGreaterThan(max_allowance.div(cBN(2)))))
        return false;  // It does get spent slowly, but that's ok

    if ((current_allowance.isGreaterThan(cBN(0))) & (current_allowance.isLessThan(amount)))
        await approve(underlying_coins[i], 0, default_account);
    return await approve(underlying_coins[i], cBN(amount).toFixed(0,1), default_account);
}

// XXX not needed anymore
// Keeping for old withdraw, to be removed whenever the chance is
async function ensure_token_allowance() {
    var default_account = (await web3.eth.getAccounts())[0];
    if (parseInt(await swap_token.methods.allowance(default_account, swap_address).call()) == 0)
        return new Promise(resolve => {
            swap_token.methods.approve(swap_address, cBN(max_allowance).toFixed(0))
            .send({from: default_account})
            .once('transactionHash', function(hash) {resolve(true);});
        })
    else
        return false;
}


async function init_contracts() {
    try {
        let networkId = await web3.eth.net.getId();
        if(networkId != 1) {
            $('#error-window').text('Error: wrong network type. Please switch to mainnet');
            $('#error-window').show();
        }
    }
    catch(err) {
        console.error(err);
        $('#error-window').text('There was an error connecting. Please refresh page');
        $('#error-window').show();
    }

    old_swap = new web3.eth.Contract(old_swap_abi, old_swap_address);
    old_swap_token = new web3.eth.Contract(ERC20_abi, old_token_address);

    swap = new web3.eth.Contract(swap_abi, swap_address);
    swap_token = new web3.eth.Contract(ERC20_abi, token_address);

    for (let i = 0; i < N_COINS; i++) {
        var addr = await swap.methods.coins(i).call();
        coins[i] = new web3.eth.Contract(cERC20_abi, addr);
        var underlying_addr = await swap.methods.underlying_coins(i).call();
        underlying_coins[i] = new web3.eth.Contract(ERC20_abi, underlying_addr);
    }
}

function init_menu() {
    $("div.top-menu-bar a").toArray().forEach(function(el) {
        if (el.href == window.location.href)
            el.classList.add('selected')
    })
    $('#poolsdropdown .dropdown a').toArray().forEach(function(el) {
        if(el.href.slice(0,-1) == window.location.origin)
            el.classList.add('selected')
    })
}

async function update_rates(version = 'new') {
    for (let i = 0; i < N_COINS; i++) {
        /*
        rate: uint256 = cERC20(self.coins[i]).exchangeRateStored()
        supply_rate: uint256 = cERC20(self.coins[i]).supplyRatePerBlock()
        old_block: uint256 = cERC20(self.coins[i]).accrualBlockNumber()
        rate += rate * supply_rate * (block.number - old_block) / 10 ** 18
        */
        var rate = parseInt(await coins[i].methods.exchangeRateStored().call()) / 1e18 / coin_precisions[i];
        var supply_rate = parseInt(await coins[i].methods.supplyRatePerBlock().call());
        var old_block = parseInt(await coins[i].methods.accrualBlockNumber().call());
        var block = await web3.eth.getBlockNumber();
        c_rates[i] = rate * (1 + supply_rate * (block - old_block) / 1e18);
    }
    var swap_stats = swap;
    if(version == 'old') swap_stats = old_swap;
    fee = parseInt(await swap_stats.methods.fee().call()) / 1e10;
}

async function update_fee_info(version = 'new') {
    var swap_abi_stats = swap_abi;
    var swap_address_stats = swap_address;
    var swap_stats = swap;
    var swap_token_stats = swap_token;
    if(version == 'old') {
        swap_abi_stats = old_swap_abi;
        swap_address_stats = old_swap_address;
        swap_stats = old_swap;
        swap_token_stats = old_swap_token;
    }

    var bal_info = $('#balances-info li span');
    var bal_info_fees = bal_info.add('#fee-info, #admin-fee-info')
    bal_info_fees.map((i, el)=>$(el).addClass('loading line'))
    await update_rates();
    var total = 0;
    var promises = [];
    let infuraProvider = new Web3(infura_url)
    swapInfura = new infuraProvider.eth.Contract(swap_abi_stats, swap_address_stats);
    for (let i = 0; i < N_COINS; i++) {
        promises.push(swapInfura.methods.balances(i).call())
/*        balances[i] = parseInt(await swap.methods.balances(i).call());
        $(bal_info[i]).text((balances[i] * c_rates[i]).toFixed(2));
        total += balances[i] * c_rates[i];*/
    }
    let resolves = await Promise.all(promises)
    bal_info_fees.map((i, el)=>$(el).removeClass('loading line'))
    resolves.forEach((balance, i) => {
        balances[i] = +balance;
        $(bal_info[i]).text((balances[i] * c_rates[i]).toFixed(2));
        total += balances[i] * c_rates[i];
    })
    $(bal_info[N_COINS]).text(total.toFixed(2));
    fee = parseInt(await swap_stats.methods.fee().call()) / 1e10;
    admin_fee = parseInt(await swap_stats.methods.admin_fee().call()) / 1e10;
    $('#fee-info').text((fee * 100).toFixed(3));
    $('#admin-fee-info').text((admin_fee * 100).toFixed(3));

    var default_account = (await web3.eth.getAccounts())[0];
    if (default_account) {
        var token_balance = parseInt(await swap_token_stats.methods.balanceOf(default_account).call());
        if (token_balance > 0) {
            var token_supply = parseInt(await swap_token_stats.methods.totalSupply().call());
            var l_info = $('#lp-info li span');
            total = 0;
            for (let i=0; i < N_COINS; i++) {
                var val = balances[i] * c_rates[i] * token_balance / token_supply;
                total += val;
                $(l_info[i]).text(val.toFixed(2));
            }
            $(l_info[N_COINS]).text(total.toFixed(2));
            $('#lp-info-container').show();
        }
    }
}

async function handle_migrate_new(page) {
    var default_account = (await web3.eth.getAccounts())[0];
    let migration = new web3.eth.Contract(migration_abi, migration_address);
    let old_balance = await old_swap_token.methods.balanceOf(default_account).call();
    var allowance = parseInt(await old_swap_token.methods.allowance(default_account, migration_address).call());
    if(allowance < old_balance) {
        if (allowance > 0)
            await approve_to_migrate(0, default_account);
        await approve_to_migrate(old_balance, default_account);
    }
    await migration.methods.migrate().send({
        from: default_account,
        gas: 1500000
    });

    await update_balances();
    update_fee_info(page);
}

async function calc_slippage(deposit) {
    var real_values = [...$("[id^=currency_]")].map((x,i) => +($(x).val()));
    var Sr = real_values.reduce((a,b) => a+b, 0);

    var values = real_values.map((x,i) => cBN(Math.floor(x / c_rates[i]).toString()).toFixed(0,1));
    var token_amount = await swap.methods.calc_token_amount(values, deposit).call();
    var virtual_price = await swap.methods.get_virtual_price().call();
    var Sv = virtual_price * token_amount / 1e36;

    for(let i = 0; i < N_COINS; i++) {
        let coin_balance = parseInt(await swap.methods.balances(i).call()) * c_rates[i];
        if(!deposit) {
            if(coin_balance < real_values[i]) {
                $("#nobalance-warning").show();
                $("#nobalance-warning span").text($("label[for='currency_"+i+"']").text());
            }
            else
                $("#nobalance-warning").hide();
        }
    }
    if (deposit)
        slippage = Sv / Sr
    else
        slippage = Sr / Sv;
    slippage = slippage - 1;
    slippage = slippage || 0
    if(slippage < -0.005) {
        $("#bonus-window").hide();
        $("#highslippage-warning").removeClass('info-message').addClass('simple-error');
        $("#highslippage-warning .text").text("Warning! High slippage");
        $("#highslippage-warning .percent").text((-slippage * 100).toFixed(3));
        $("#highslippage-warning").show();
    }
    else if(slippage > 0) {
        $("#highslippage-warning").hide();
        $("#bonus-window").show();
        $("#bonus-window span").text((slippage * 100).toFixed(3));
    }
    else if(slippage <= 0) {
        $("#bonus-window").hide();
        $("#highslippage-warning").removeClass('simple-error').addClass('info-message');
        $("#highslippage-warning .text").text("Slippage");
        $("#highslippage-warning .percent").text((-slippage * 100).toFixed(3));
        $("#highslippage-warning").show();
    }
    else {
      $("#bonus-window").hide();
      $("#highslippage-warning").hide();
    }
}

function debounced(delay, fn) {
  let timerId;
  return function (...args) {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      fn(...args);
      timerId = null;
    }, delay);
  }
}

function makeCancelable(promise) {
    let rejectFn;

    const wrappedPromise = new Promise((resolve, reject) => {
        rejectFn = reject;

        Promise.resolve(promise)
            .then(resolve)
            .catch(reject);
    });

    wrappedPromise.cancel = (reason) => {
        rejectFn({ canceled: true, reason: reason });
    };

    return wrappedPromise;
};