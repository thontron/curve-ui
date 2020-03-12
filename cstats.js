var contracts = {compound, usdt, iearn, busd, susd}
var web3contracts = {};
var all_coins = {};
var all_underlying_coins = {};
var all_c_rates = {};
var all_fees = {}

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
    for(let [key, contract] of Object.entries(contracts)) {
    	web3contracts[key] = {};
	    web3contracts[key].swap = new web3.eth.Contract(contract.swap_abi, contract.swap_address);
	    web3contracts[key].swap_token = new web3.eth.Contract(contract.ERC20_abi, contract.token_address);

        all_coins[key] = {}
        all_coins[key].coins = [];
        all_underlying_coins[key] = {}
        all_underlying_coins[key].underlying_coins = [];
	    for (let i = 0; i < contract.N_COINS; i++) {
	        var addr = await web3contracts[key].swap.methods.coins(i).call();

	        let cabi = ['iearn','busd', 'susd'].includes(key) ? contract.yERC20_abi : contract.cERC20_abi;
	        if(key == 'susd' && i == 1) {
	        	cabi = contracts.iearn.swap_abi;
	        	addr = contracts.iearn.swap_address
	        }
	        all_coins[key].coins[i] = new web3.eth.Contract(cabi, addr);
	        var underlying_addr = await web3contracts[key].swap.methods.underlying_coins(i).call();
	        all_underlying_coins[key].underlying_coins[i] = new web3.eth.Contract(contract.ERC20_abi, underlying_addr);
	    }
    }
}

async function update_rates() {
    for(let [key, contract] of Object.entries(contracts)) {
    	all_fees[key] = [];
     	all_c_rates[key] = {}
        all_c_rates[key].c_rates = [];

	    for (let i = 0; i < contract.N_COINS; i++) {
	        /*
	        rate: uint256 = cERC20(self.coins[i]).exchangeRateStored()
	        supply_rate: uint256 = cERC20(self.coins[i]).supplyRatePerBlock()
	        old_block: uint256 = cERC20(self.coins[i]).accrualBlockNumber()
	        rate += rate * supply_rate * (block.number - old_block) / 10 ** 18
	        */
         	if (contract.tethered && contract.tethered[i] && contract.use_lending && !contract.use_lending[i]) {
            	all_c_rates[key].c_rates[i] = 1 / contract.coin_precisions[i]
         	}
         	else {
         		if(key == 'iearn' || key == 'busd' || (key == 'susd' && i == 0)) {
		            var rate = parseInt(await all_coins[key].coins[i].methods.getPricePerFullShare().call()) / 1e18 / contract.coin_precisions[i];
            		all_c_rates[key].c_rates[i] = rate;
         		}
         		else if(key == 'susd' && i == 1) {
         			var rate = +(await all_coins[key].coins[i].methods.get_virtual_price().call()) / 1e36;
            		all_c_rates[key].c_rates[i] = rate;
         		}
         		else {     			
			        let values = await Promise.all([
			        	all_coins[key].coins[i].methods.exchangeRateStored().call(),
			        	all_coins[key].coins[i].methods.supplyRatePerBlock().call(),
			        	all_coins[key].coins[i].methods.accrualBlockNumber().call(),
			        	web3.eth.getBlockNumber(),
			        ])
			        let rate = +values[0] / 1e18 / contract.coin_precisions[i];
			        let [supply_rate, old_block]  = [values[1], values[2]]
			        let block = values[3]
			        all_c_rates[key].c_rates[i] = rate * (1 + supply_rate * (block - old_block) / 1e18);
			    	all_fees[i] = parseInt(await web3contracts[key].swap.methods.fee().call()) / 1e10;
         		}
		    }
	    }
	}
}

async function update_fee_info(version = 'new') {
	for(let [key, contract] of Object.entries(contracts)) {
		var balances = new Array(contract.N_COINS);

	    var swap_abi_stats = contract.swap_abi;
	    var swap_address_stats = contract.swap_address;
	    var swap_stats = web3contracts[key].swap;
	    var swap_token_stats = web3contracts[key].swap_token;

	    var bal_info = $(`.balances-info.${key} li span`);
	    var bal_info_fees = bal_info.add(`.fee-info.${key}, .admin-fee-info.${key}`)
	    bal_info_fees.map((i, el)=>$(el).addClass('loading line'))
	    try {
	    	await update_rates();	
	    }
	    catch(err) {
	    	console.error(err)
	    }
	    var total = 0;
	    var promises = [];
	    let infuraProvider = new Web3(infura_url)
	    swapInfura = new infuraProvider.eth.Contract(swap_abi_stats, swap_address_stats);
	    for (let i = 0; i < contract.N_COINS; i++) {
	        promises.push(swapInfura.methods.balances(i).call())
	/*        balances[i] = parseInt(await swap.methods.balances(i).call());
	        $(bal_info[i]).text((balances[i] * c_rates[i]).toFixed(2));
	        total += balances[i] * c_rates[i];*/
	    }
	    let resolves = await Promise.all(promises)
	    bal_info_fees.map((i, el)=>$(el).removeClass('loading line'))
	    resolves.forEach((balance, i) => {
	        balances[i] = +balance;
	        $(bal_info[i]).text((balances[i] * all_c_rates[key].c_rates[i]).toFixed(2));
	        total += balances[i] * all_c_rates[key].c_rates[i];
	    })
	    $(bal_info[contract.N_COINS]).text(total.toFixed(2));
	    fee = parseInt(await swap_stats.methods.fee().call()) / 1e10;
	    admin_fee = parseInt(await swap_stats.methods.admin_fee().call()) / 1e10;
	    $(`.fee-info.${key}`).text((fee * 100).toFixed(3));
	    $(`.admin-fee-info.${key}`).text((admin_fee * 100).toFixed(3));

	    var default_account = (await web3.eth.getAccounts())[0];
	    if (default_account) {
	        var token_balance = parseInt(await swap_token_stats.methods.balanceOf(default_account).call());
	        if (token_balance > 0) {
	            var token_supply = parseInt(await swap_token_stats.methods.totalSupply().call());
	            var l_info = $(`.lp-info.${key} li span`);
        	    l_info.map((i, el)=>$(el).removeClass('loading line'))
	            total = 0;
	            for (let i=0; i < contract.N_COINS; i++) {
	                var val = balances[i] * all_c_rates[key].c_rates[i] * token_balance / token_supply;
	                total += val;
	                $(l_info[i]).text(val.toFixed(2));
	            }
	            $(l_info[contract.N_COINS]).text(total.toFixed(2));
	            $(`.lp-info-container.${key}`).show();
	        }
	    }
	}
}


var chart_options = {
    chart: {
        height: 300,
        type: 'line',
        stacked: false,
        zoom: {
            type: 'x',
            enabled: true,
            autoScaleYaxis: true
        },
        toolbar: {autoSelected: 'zoom'}
    },
    markers: {size: 0},
    colors: ['#000050'],
    stroke: {width: 2},
    xaxis: {
        type: 'datetime'
    },
    yaxis: {
        title: {text: 'Profit [%]'},
        labels: {
            tooltip: {enabled: true},
            formatter: function (val) {
                return (Math.floor(val * 100) / 100).toFixed(2);
            }
        },
        max: function(max) {
            return max * 1.01
        }
    },
    tooltip: {
        shared: false,
        y: {
            formatter: function (val) {
                return Math.floor(val * 100000) / 100000 + '%';
            }
        }
    },

    series: [{
        name: 'Virtual growth of liquidity share',
        data: []
    }]
}


async function init_charts() {
    var options = chart_options;
    var urls = ['']
    let stats = await Promise.all(urls.map(url=>$.getJSON(url+'/stats.json')))
    $("p[id^='chart']").removeClass('loading dots')
    for(let i = 0; i < stats.length; i++) {
    	options.chart.id = `chart${i}` 
        let json = stats[i];
        var apr = json['apr'];
        var daily_apr = json['daily_apr'];
        var weekly_apr = json['weekly_apr'];
        var data = json['data']
        $(`.apr-profit[data-i='${i}']`).text((apr * 100).toFixed(2));
        $(`.daily-apr[data-i='${i}']`).text((daily_apr * 100).toFixed(2));
        $(`.weekly-apr[data-i='${i}']`).text((weekly_apr * 100).toFixed(2));

        var step_size = Math.max(Math.round(data.length / 500), 1);
        var start_profit = data[0][1]
        let chartData = []
        for (let i = 0; i < data.length; i++) {
            if ((i % step_size == 0) | (i == data.length - 1)) {
                var el = data[i];
                chartData.push({
                    x: new Date(el[0] * 1000),
                    y: (el[1] / start_profit - 1) * 100
                });
            }
        }

        var chart = new ApexCharts(
          document.querySelector(`#chart${i}`),
          options
        );

        chart.render();

        ApexCharts.exec(`chart${i}`, 'updateSeries', [{ data: chartData}])
    }
}



window.addEventListener('load', async () => {
  try {
      await init('stats');
      await init_charts();
      await init_contracts();
      await update_fee_info();
  }
  catch(err) {
    console.error(err)
    if(err.reason == 'cancelDialog') {
        const web3 = new Web3(infura_url);
        window.web3 = web3

        await init_charts();
        await init_contracts();
        update_fee_info();
    }
  }
});


