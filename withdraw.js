var token_balance;
var token_supply;

async function update_balances() {
    var default_account = (await web3.eth.getAccounts())[0];
    if (default_account) {
        for (let i = 0; i < N_COINS; i++)
            wallet_balances[i] = parseInt(await coins[i].methods.balanceOf(default_account).call());
        token_balance = parseInt(await swap_token.methods.balanceOf(default_account).call());
    }
    else {
        token_balance = 0;
    }
    for (let i = 0; i < N_COINS; i++)
        balances[i] = parseInt(await swap.methods.balances(i).call());
    token_supply = parseInt(await swap_token.methods.totalSupply().call());
}

function handle_change_amounts(i) {
    return async function() {
        var values = [...$("[id^=currency_]")].map((x,i) => $(x).val() / c_rates[i])
        values = values.map(v=>BigInt(Math.floor(v)).toString())

        try {
            var availableAmount = await swap.methods.calc_token_amount(values, false).call()
            availableAmount = availableAmount / (1 - fee * N_COINS / (4 * (N_COINS - 1)))
            var default_account = (await web3.eth.getAccounts())[0];
            var maxAvailableAmount = parseInt(await swap_token.methods.balanceOf(default_account).call());

            if(availableAmount > maxAvailableAmount) {
                $('[id^=currency_]').css('background-color', 'red');
            }
            else {
                $('[id^=currency_]').css('background-color', 'blue');
            }

            var share = $('#liquidity-share');
            share.val('---');
            share.css('background-color', '#707070');
            share.css('color', '#d0d0d0');
        }
        catch(err) {
            $('[id^=currency_]').css('background-color', 'red');
        }
    }
}

function handle_change_share() {
    var share = $('#liquidity-share');
    var val = share.val();

    share.css('background-color', 'blue');
    share.css('color', 'aqua');
    if (val == '---') {
        share.val('0.0');
        val = 0;
    }
    else if ((val > 100) | (val < 0))
        share.css('background-color', 'red');

    for (let i = 0; i < N_COINS; i++) {
        var cur = $('#currency_' + i);
        if ((val >=0) & (val <= 100)) {
            cur.val((val / 100 * balances[i] * c_rates[i] * token_balance / token_supply).toFixed(2))
        }
        else
            cur.val('0.00');
        cur.css('background-color', '#707070');
        cur.css('color', '#d0d0d0');
    }
}

async function handle_remove_liquidity() {
    var share = $('#liquidity-share');
    var share_val = share.val();
    var amounts = $("[id^=currency_]").toArray().map(x => $(x).val());
    for (let i = 0; i < N_COINS; i++)
        amounts[i] = Math.floor(amounts[i] / c_rates[i]); // -> c-tokens
    var min_amounts = amounts.map(x => BigInt(Math.floor(0.97 * x)).toString());
    amount = amounts.map(x => BigInt(x).toString());
    var txhash;
    var default_account = (await web3.eth.getAccounts())[0];
    if (share_val == '---') {
        var token_amount = await swap.methods.calc_token_amount(amounts, false).call();
        token_amount = BigInt(Math.floor(token_amount * 1.01)).toString()
        await swap.methods.remove_liquidity_imbalance(amounts, token_amount).send({'from': default_account});
    }
    else {
        var amount = BigInt(Math.floor(share_val / 100 * token_balance)).toString();
        if (share_val == 100)
            amount = await swap_token.methods.balanceOf(default_account).call();
        await swap.methods.remove_liquidity(amount, min_amounts).send({'from': default_account});
    }

    await update_balances();
    update_fee_info();
}

function init_ui() {
    for (let i = 0; i < N_COINS; i++) {
        $('#currency_' + i).focus(handle_change_amounts(i));
        $('#currency_' + i).on('input', handle_change_amounts(i));
    }
    $('#liquidity-share').focus(handle_change_share);
    $('#liquidity-share').on('input', handle_change_share);

    handle_change_share();
    update_fee_info();

    $("#remove-liquidity").click(handle_remove_liquidity);
}

window.addEventListener('DOMContentLoaded', async () => {
    try {
        await init();
        await update_rates();
        await update_balances();
        init_ui();
        $("#from_currency").attr('disabled', false)
    }
    catch(err) {
        const web3 = new Web3(infura_url);
        window.web3 = web3

        await init_contracts();
        await update_rates();
        await update_balances();
        init_ui();
        $("#from_currency").attr('disabled', false)
        
    }
});
