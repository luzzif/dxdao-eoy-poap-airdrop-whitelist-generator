import { BigNumber, constants, Contract, providers } from "ethers";
import {
    MAINNET_PROVIDER,
    XDAI_PROVIDER,
    XMAS_MAINNET_SNAPSHOT_BLOCK,
    XMAS_XDAI_SNAPSHOT_BLOCK,
    XMAS_ARBITRUM_SNAPSHOT_BLOCK,
    logInPlace,
    getEoaAddresses,
    getDeduplicatedAddresses,
    saveBalanceMapCache,
    loadBalanceMapCache,
    mergeBalanceMaps,
    ARBITRUM_PROVIDER,
    SWPR_XDAI_ADDRESS,
    SWPR_ARBITRUM_ADDRESS,
    SWPR_MAINNET_ADDRESS,
} from "../commons";
import erc20Abi from "../abis/erc20.json";
import { getAddress, parseEther } from "ethers/lib/utils";
import { getSwaprSwprLiquidityProviders } from "./swapr";
import path from "path";

const EOA_CACHE_LOCATION = path.join(__dirname, "cache/eoas.json");
const MAINNET_SC_CACHE_LOCATION = path.join(__dirname, "mainnet-scs.json");
const XDAI_SC_CACHE_LOCATION = path.join(__dirname, "cache/xdai-scs.json");
const ARBITRUM_SC_CACHE_LOCATION = path.join(
    __dirname,
    "cache/arbitrum-scs.json"
);
const MAINNET_PURE_HOLDERS_CACHE_LOCATION = path.join(
    __dirname,
    "cache/mainnet-holders.json"
);
const XDAI_PURE_HOLDERS_CACHE_LOCATION = path.join(
    __dirname,
    "cache/xdai-holders.json"
);
const ARBITRUM_PURE_HOLDERS_CACHE_LOCATION = path.join(
    __dirname,
    "cache/arbitrum-holders.json"
);

// in order to be included in the airdrop, a minimum amount of SWPR has to be held
const MINIMUM_HOLDINGS = parseEther("1000");

const STATIC_AIRDROP_RECIPIENT_BLACKLIST = [].map(getAddress);

const getSwprTokenHoldersWithBalances = async (
    provider: providers.JsonRpcProvider,
    swaprAddress: string,
    startingBlock: number,
    endingBlock: number
) => {
    const holdersMap: {
        [address: string]: BigNumber;
    } = {};
    const erc20Contract = new Contract(swaprAddress, erc20Abi, provider);

    let lastAnalyzedBlock = startingBlock;
    const transferFilter = erc20Contract.filters.Transfer();
    const range = endingBlock - startingBlock;
    while (lastAnalyzedBlock < endingBlock) {
        const toBlock = lastAnalyzedBlock + 10000;
        const currentCheckpoint = lastAnalyzedBlock - startingBlock;
        const progress = ((currentCheckpoint / range) * 100).toFixed(2);
        logInPlace(`reconstructing swpr balance map: ${progress}%`);
        const events = await erc20Contract.queryFilter(
            transferFilter,
            lastAnalyzedBlock,
            toBlock
        );
        events.forEach((event) => {
            const [from, to, value] = event.args!;
            if ((value as BigNumber).isZero()) return;
            if (from === constants.AddressZero) {
                holdersMap[to] = (holdersMap[to] || BigNumber.from(0)).add(
                    value
                );
            } else if (to === constants.AddressZero) {
                holdersMap[from] = holdersMap[from].sub(value);
            } else {
                holdersMap[from] = holdersMap[from].sub(value);
                holdersMap[to] = (holdersMap[to] || BigNumber.from(0)).add(
                    value
                );
            }
        });
        lastAnalyzedBlock = toBlock;
    }
    logInPlace("");
    return Object.entries(holdersMap)
        .filter(([, balance]) => !balance.isZero())
        .reduce(
            (
                accumulator: { [address: string]: BigNumber },
                [address, balance]
            ) => {
                accumulator[getAddress(address)] = balance;
                return accumulator;
            },
            {}
        );
};

export const getXmasSwprHoldersBalanceMap = async (): Promise<{
    eoas: { [address: string]: BigNumber };
    mainnetSmartContracts: { [address: string]: BigNumber };
    xDaiSmartContracts: { [address: string]: BigNumber };
    arbitrumSmartContracts: { [address: string]: BigNumber };
}> => {
    let eoas = loadBalanceMapCache(EOA_CACHE_LOCATION);
    let mainnetSmartContracts = loadBalanceMapCache(MAINNET_SC_CACHE_LOCATION);
    let xDaiSmartContracts = loadBalanceMapCache(XDAI_SC_CACHE_LOCATION);
    let arbitrumSmartContracts = loadBalanceMapCache(
        ARBITRUM_SC_CACHE_LOCATION
    );
    // load data from cache if available
    if (
        Object.keys(eoas).length > 0 ||
        Object.keys(mainnetSmartContracts).length > 0 ||
        Object.keys(xDaiSmartContracts).length > 0 ||
        Object.keys(arbitrumSmartContracts).length > 0
    ) {
        console.log(
            `swpr holders: ${Object.keys(eoas).length} eoas, ${
                Object.keys(mainnetSmartContracts).length
            } mainnet scs, ${
                Object.keys(xDaiSmartContracts).length
            } xdai scs, ${
                Object.keys(arbitrumSmartContracts).length
            } arbitrum scs`
        );
        return {
            eoas,
            mainnetSmartContracts,
            xDaiSmartContracts,
            arbitrumSmartContracts,
        };
    }

    const {
        xDaiHolders: xDaiSwaprBalances,
        mainnetHolders: mainnetSwaprBalances,
        arbitrumHolders: arbitrumSwaprBalances,
    } = await getSwaprSwprLiquidityProviders();

    const blacklist = getDeduplicatedAddresses([
        ...STATIC_AIRDROP_RECIPIENT_BLACKLIST,
    ]);

    // fetch "pure" xDai holders. I.e. addresses that currently hold
    // SWPR (doesn't account for liquidity deposited in protocols etc)
    let pureXDaiHolders = loadBalanceMapCache(XDAI_PURE_HOLDERS_CACHE_LOCATION);
    if (!pureXDaiHolders || Object.keys(pureXDaiHolders).length === 0) {
        pureXDaiHolders = await getSwprTokenHoldersWithBalances(
            XDAI_PROVIDER,
            SWPR_XDAI_ADDRESS,
            18446680, // swpr token proxy deployment block
            XMAS_XDAI_SNAPSHOT_BLOCK
        );
        saveBalanceMapCache(pureXDaiHolders, XDAI_PURE_HOLDERS_CACHE_LOCATION);
    }

    // merge together data from pure holders and Swapr
    // protocol on xDai to get a better picture
    const allXDaiHolders: { [address: string]: BigNumber } = {};
    mergeBalanceMaps(allXDaiHolders, pureXDaiHolders);
    mergeBalanceMaps(allXDaiHolders, xDaiSwaprBalances);

    // get deduplicated addresses that are not on the blacklist
    const notOnBlacklistXDaiAddresses = getDeduplicatedAddresses(
        Object.entries(allXDaiHolders)
            .filter(([address]) => blacklist.indexOf(getAddress(address)) < 0)
            .map(([address]) => getAddress(address))
    );
    // separate eoas from smart contracts for non-blacklisted addresses
    const { smartContracts: rawXDaiSmartContracts, eoas: rawXDaiEoas } =
        await getEoaAddresses(notOnBlacklistXDaiAddresses, XDAI_PROVIDER);

    // fetch "pure" mainnet holders. I.e. addresses that currently hold
    // SWPR (doesn't account for liquidity deposited in protocols etc)
    let pureMainnetHolders = loadBalanceMapCache(
        MAINNET_PURE_HOLDERS_CACHE_LOCATION
    );
    if (!pureMainnetHolders || Object.keys(pureMainnetHolders).length === 0) {
        pureMainnetHolders = await getSwprTokenHoldersWithBalances(
            MAINNET_PROVIDER,
            SWPR_MAINNET_ADDRESS,
            13147411, // swapr token deployment block
            XMAS_MAINNET_SNAPSHOT_BLOCK
        );
        saveBalanceMapCache(
            pureMainnetHolders,
            MAINNET_PURE_HOLDERS_CACHE_LOCATION
        );
    }

    // merge together data from pure holders and Swapr protocol on mainnet to get a better picture
    const allMainnetHolders: { [address: string]: BigNumber } = {};
    mergeBalanceMaps(allMainnetHolders, pureMainnetHolders);
    mergeBalanceMaps(allMainnetHolders, mainnetSwaprBalances);

    // get deduplicated addresses that are not on the blacklist
    const notOnBlacklistMainnetAddresses = getDeduplicatedAddresses(
        Object.entries(allMainnetHolders)
            .filter(([address]) => blacklist.indexOf(getAddress(address)) < 0)
            .map(([address]) => getAddress(address))
    );

    // separate eoas from smart contracts for non-blacklisted addresses
    const { smartContracts: rawMainnetSmartContracts, eoas: rawMainnetEoas } =
        await getEoaAddresses(notOnBlacklistMainnetAddresses, MAINNET_PROVIDER);

    // fetch "pure" arbitrum holders. I.e. addresses that currently hold
    // SWPR (doesn't account for liquidity deposited in protocols etc)
    let pureArbitrumHolders = loadBalanceMapCache(
        MAINNET_PURE_HOLDERS_CACHE_LOCATION
    );
    if (!pureArbitrumHolders || Object.keys(pureArbitrumHolders).length === 0) {
        pureArbitrumHolders = await getSwprTokenHoldersWithBalances(
            ARBITRUM_PROVIDER,
            SWPR_ARBITRUM_ADDRESS,
            259610, // swpr token deployment block
            XMAS_ARBITRUM_SNAPSHOT_BLOCK
        );
        saveBalanceMapCache(
            pureArbitrumHolders,
            ARBITRUM_PURE_HOLDERS_CACHE_LOCATION
        );
    }

    // merge together data from pure holders and Swapr holders on Arbitrum to get a better picture
    const allArbitrumHolders: { [address: string]: BigNumber } = {};
    mergeBalanceMaps(allArbitrumHolders, pureArbitrumHolders);
    mergeBalanceMaps(allArbitrumHolders, arbitrumSwaprBalances);

    // get deduplicated addresses that are not on the blacklist
    const notOnBlacklistArbitrumAddresses = getDeduplicatedAddresses(
        Object.entries(allArbitrumHolders)
            .filter(([address]) => blacklist.indexOf(getAddress(address)) < 0)
            .map(([address]) => getAddress(address))
    );

    // separate eoas from smart contracts for non-blacklisted addresses
    const { smartContracts: rawArbitrumSmartContracts, eoas: rawArbitrumEoas } =
        await getEoaAddresses(
            notOnBlacklistArbitrumAddresses,
            ARBITRUM_PROVIDER
        );

    // get a cross-chain balances map
    const crossChainBalanceMap = allMainnetHolders;
    mergeBalanceMaps(crossChainBalanceMap, allXDaiHolders);
    mergeBalanceMaps(crossChainBalanceMap, allArbitrumHolders);

    // filter out accounts that hold less than the minimum threshold and/or are blacklisted
    const eligibleAddressesMap = Object.entries(crossChainBalanceMap).reduce(
        (accumulator: { [address: string]: BigNumber }, [address, balance]) => {
            if (
                blacklist.indexOf(getAddress(address)) < 0 &&
                balance.gt(MINIMUM_HOLDINGS)
            ) {
                accumulator[getAddress(address)] = balance;
            }
            return accumulator;
        },
        {}
    );
    const eligibleAddresses = Object.keys(eligibleAddressesMap);

    // cross-reference data from eligible addresses and eoas across chains to
    // determine which eoas are eligible for the airdrop
    eoas = getDeduplicatedAddresses(
        [...rawMainnetEoas, ...rawXDaiEoas, ...rawArbitrumEoas].filter(
            (address) => eligibleAddresses.indexOf(getAddress(address)) >= 0
        )
    ).reduce((accumulator: { [address: string]: BigNumber }, address) => {
        const checksummedAddress = getAddress(address);
        accumulator[checksummedAddress] =
            eligibleAddressesMap[checksummedAddress];
        return accumulator;
    }, {});

    // cross-reference data from eligible addresses and mainnet scs to
    // determine which mainnet scs are eligible for the airdrop
    mainnetSmartContracts = getDeduplicatedAddresses(
        rawMainnetSmartContracts.filter(
            (address) => eligibleAddresses.indexOf(getAddress(address)) >= 0
        )
    ).reduce((accumulator: { [address: string]: BigNumber }, address) => {
        const checksummedAddress = getAddress(address);
        accumulator[checksummedAddress] =
            eligibleAddressesMap[checksummedAddress];
        return accumulator;
    }, {});

    // cross-reference data from eligible addresses and xdai scs to
    // determine which xdai scs are eligible for the airdrop
    xDaiSmartContracts = getDeduplicatedAddresses(
        rawXDaiSmartContracts.filter(
            (address) => eligibleAddresses.indexOf(getAddress(address)) >= 0
        )
    ).reduce((accumulator: { [address: string]: BigNumber }, address) => {
        const checksummedAddress = getAddress(address);
        accumulator[checksummedAddress] =
            eligibleAddressesMap[checksummedAddress];
        return accumulator;
    }, {});

    // cross-reference data from eligible addresses and arbitrum scs to
    // determine which arbitrum scs are eligible for the airdrop
    arbitrumSmartContracts = getDeduplicatedAddresses(
        rawArbitrumSmartContracts.filter(
            (address) => eligibleAddresses.indexOf(getAddress(address)) >= 0
        )
    ).reduce((accumulator: { [address: string]: BigNumber }, address) => {
        const checksummedAddress = getAddress(address);
        accumulator[checksummedAddress] =
            eligibleAddressesMap[checksummedAddress];
        return accumulator;
    }, {});

    console.log(
        `swpr holders: ${Object.keys(eoas).length} eoas, ${
            Object.keys(mainnetSmartContracts).length
        } mainnet scs, ${Object.keys(xDaiSmartContracts).length} xdai scs, ${
            Object.keys(arbitrumSmartContracts).length
        } arbitrum scs`
    );

    saveBalanceMapCache(eoas, EOA_CACHE_LOCATION);
    saveBalanceMapCache(mainnetSmartContracts, MAINNET_SC_CACHE_LOCATION);
    saveBalanceMapCache(xDaiSmartContracts, XDAI_SC_CACHE_LOCATION);
    saveBalanceMapCache(arbitrumSmartContracts, ARBITRUM_SC_CACHE_LOCATION);

    return {
        eoas,
        mainnetSmartContracts,
        xDaiSmartContracts,
        arbitrumSmartContracts,
    };
};
