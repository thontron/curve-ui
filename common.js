var cBN = (val) => new BigNumber(val);

function formatNumber(number) {
    return number.replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1,");
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

async function totalBalances() {
    let total = cBN(0);
    let tokenContracts = {}
    let swapContracts = {}
    let promises = []
    let infuraProvider = new Web3(infura_url)
    for(let [key, contract] of Object.entries({compound, usdt, iearn, busd})) {
        tokenContracts[key] = new infuraProvider.eth.Contract(contract.ERC20_abi, contract.token_address);
        swapContracts[key] = new infuraProvider.eth.Contract(contract.swap_abi, contract.swap_address);
        let totalSupply = cBN(await tokenContracts[key].methods.totalSupply().call())
        let price = cBN(await swapContracts[key].methods.get_virtual_price().call())
        total = total.plus(totalSupply.multipliedBy(price).div(1e36))
    }
    return total;
}