async function init() {
    init_menu();

    const WalletConnectProvider = window.WalletConnectProvider.default
    const providerOptions = {
        walletconnect: {
            package: WalletConnectProvider, // required
            options: {
              infuraId: "c334bb4b45a444979057f0fb8a0c9d1b" // required
            }
        },
        authereum: {
            package: Authereum, // required
            options: {}
        },
        burnerconnect: {
            package: BurnerProvider.default, // required
            options: {}
        },
        fortmatic: {
            package: Fortmatic, // required
            options: {
              key: "pk_live_190B10CE18F47DCD" // required
            }
        }
    };

    const web3Connect = new Web3Connect.default.Core({
      network: "mainnet", // optional
      cacheProvider: true, // optional
      providerOptions // required
    });

    const provider = await web3Connect.connect();

    provider.on("chainChanged", (chainId) => {
        console.log(chainId, "CHAIN")
        if(chainId != 1) {
            $('#error-window').text('Error: wrong network type. Please switch to mainnet');
            $('#error-window').show();
        }
    });

    provider.on("accountsChanged", (accounts) => {
        console.log(accounts)
        location.reload()
    })

    const web3 = new Web3(provider);

    window.web3 = web3


/*    if (window.ethereum)
    {
        window.web3 = new Web3(ethereum);
        await ethereum.enable();
    }
    else
        window.web3 = new Web3(infura_url);*/
    await init_contracts();

    await init_ui();
}
