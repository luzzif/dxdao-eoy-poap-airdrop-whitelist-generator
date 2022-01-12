import { BigNumber, Contract, providers } from "ethers";
import {
    MAINNET_PROVIDER,
    XDAI_PROVIDER,
    DXD_MAINNET_ADDRESS,
    DXD_XDAI_ADDRESS,
    XMAS_MAINNET_SNAPSHOT_BLOCK,
    XMAS_XDAI_SNAPSHOT_BLOCK,
    MAINNET_BATCH_EXCHANGE_ADDRESS,
    XDAI_BATCH_EXCHANGE_ADDRESS,
    DXD_MAINNET_MESA_TOKEN_ID,
    DXD_XDAI_MESA_TOKEN_ID,
    logInPlace,
    loadBalanceMapCache,
    saveBalanceMapCache,
} from "../commons";
import batchExchangeAbi from "./abis/batch-exchange.json";
import { getAddress } from "ethers/lib/utils";

const MAINNET_CACHE_LOCATION = `${__dirname}/cache/mesa-mainnet.json`;
const XDAI_CACHE_LOCATION = `${__dirname}/cache/mesa-xdai.json`;

const getMesaBalances = async (
    provider: providers.JsonRpcProvider,
    batchExchangeAddress: string,
    dxdTokenId: number,
    dxdAddress: string,
    startingBlock: number,
    endingBlock: number
): Promise<{ [address: string]: BigNumber }> => {
    const balanceMap: {
        [address: string]: BigNumber;
    } = {};
    const batchExchangeContract = new Contract(
        batchExchangeAddress,
        batchExchangeAbi,
        provider
    );

    const depositDxdFilter = batchExchangeContract.filters.Deposit(
        null,
        dxdAddress,
        null
    );
    const withdrawDxdFilter = batchExchangeContract.filters.Withdraw(
        null,
        dxdAddress,
        null
    );
    const tradeFilter = batchExchangeContract.filters.Trade();
    const tradeReversionFilter = batchExchangeContract.filters.TradeReversion();
    const wantedEvents = [
        depositDxdFilter,
        withdrawDxdFilter,
        tradeFilter,
        tradeReversionFilter,
    ];

    let lastAnalyzedBlock = startingBlock;
    const range = endingBlock - startingBlock;
    while (lastAnalyzedBlock < endingBlock) {
        const toBlock = lastAnalyzedBlock + 10000;
        const currentCheckpoint = lastAnalyzedBlock - startingBlock;
        const progress = ((currentCheckpoint / range) * 100).toFixed(2);
        logInPlace(`reconstructing dxd balances on mesa: ${progress}%`);

        const events = [];
        for (const wantedEvent of wantedEvents) {
            events.push(
                ...(await batchExchangeContract.queryFilter(
                    wantedEvent,
                    lastAnalyzedBlock,
                    toBlock
                ))
            );
        }

        const sortedEvents = events.sort((a, b) => {
            return a.blockNumber === b.blockNumber
                ? b.logIndex - a.logIndex
                : b.blockNumber - a.blockNumber;
        });

        sortedEvents.forEach((event) => {
            const eventName = event.event;
            switch (eventName) {
                case "Deposit": {
                    const [userAddress, tokenAddress, amount] = event.args! as [
                        string,
                        string,
                        BigNumber
                    ];
                    if (tokenAddress !== dxdAddress) {
                        throw new Error("invalid token id");
                    }
                    if (amount.isZero()) return;
                    balanceMap[userAddress] = (
                        balanceMap[userAddress] || BigNumber.from(0)
                    ).add(amount);
                    break;
                }
                case "Withdraw": {
                    const [userAddress, tokenAddress, amount] = event.args! as [
                        string,
                        string,
                        BigNumber
                    ];
                    if (tokenAddress !== dxdAddress) {
                        throw new Error("invalid token id");
                    }
                    if (amount.isZero()) return;
                    balanceMap[userAddress] = (
                        balanceMap[userAddress] || BigNumber.from(0)
                    ).sub(amount);
                    break;
                }
                case "Trade": {
                    const [
                        userAddress,
                        _,
                        soldToken,
                        boughtToken,
                        soldAmount,
                        boughtAmount,
                    ] = event.args! as [
                        string,
                        any,
                        number,
                        number,
                        BigNumber,
                        BigNumber
                    ];
                    if (
                        soldToken !== dxdTokenId &&
                        boughtToken !== dxdTokenId
                    ) {
                        return;
                    }
                    if (
                        (boughtToken === dxdTokenId && boughtAmount.isZero()) ||
                        (soldToken === dxdTokenId && soldAmount.isZero())
                    ) {
                        return;
                    }
                    const buy = boughtToken === dxdTokenId;
                    const dxdAmount = buy ? boughtAmount : soldAmount;
                    if (!balanceMap[userAddress]) {
                        balanceMap[userAddress] = BigNumber.from(0);
                    }
                    balanceMap[userAddress] = buy
                        ? balanceMap[userAddress].add(dxdAmount)
                        : balanceMap[userAddress].sub(dxdAmount);
                    break;
                }
                case "TradeReversion": {
                    const [
                        userAddress,
                        _,
                        soldToken,
                        boughtToken,
                        soldAmount,
                        boughtAmount,
                    ] = event.args! as [
                        string,
                        any,
                        number,
                        number,
                        BigNumber,
                        BigNumber
                    ];
                    if (
                        soldToken !== dxdTokenId &&
                        boughtToken !== dxdTokenId
                    ) {
                        return;
                    }
                    if (
                        (boughtToken === dxdTokenId && boughtAmount.isZero()) ||
                        (soldToken === dxdTokenId && soldAmount.isZero())
                    ) {
                        return;
                    }
                    const buy = boughtToken === dxdTokenId;
                    const dxdAmount = buy ? boughtAmount : soldAmount;
                    if (!balanceMap[userAddress]) {
                        balanceMap[userAddress] = BigNumber.from(0);
                    }
                    balanceMap[userAddress] = buy
                        ? balanceMap[userAddress].sub(dxdAmount)
                        : balanceMap[userAddress].add(dxdAmount);
                    break;
                }
            }
        });
        lastAnalyzedBlock = toBlock;
    }
    logInPlace("");
    console.log();
    return Object.entries(balanceMap)
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

export const getMesaDxdHolders = async (): Promise<{
    xDaiHolders: { [address: string]: BigNumber };
    mainnetHolders: { [address: string]: BigNumber };
}> => {
    let mainnetHolders = loadBalanceMapCache(MAINNET_CACHE_LOCATION);
    if (Object.keys(mainnetHolders).length === 0) {
        mainnetHolders = await getMesaBalances(
            MAINNET_PROVIDER,
            MAINNET_BATCH_EXCHANGE_ADDRESS,
            DXD_MAINNET_MESA_TOKEN_ID,
            DXD_MAINNET_ADDRESS,
            9340147,
            XMAS_MAINNET_SNAPSHOT_BLOCK
        );
        saveBalanceMapCache(mainnetHolders, MAINNET_CACHE_LOCATION);
    }

    let xDaiHolders = loadBalanceMapCache(XDAI_CACHE_LOCATION);
    if (Object.keys(xDaiHolders).length === 0) {
        xDaiHolders = await getMesaBalances(
            XDAI_PROVIDER,
            XDAI_BATCH_EXCHANGE_ADDRESS,
            DXD_XDAI_MESA_TOKEN_ID,
            DXD_XDAI_ADDRESS,
            11948310,
            XMAS_XDAI_SNAPSHOT_BLOCK
        );
        saveBalanceMapCache(xDaiHolders, XDAI_CACHE_LOCATION);
    }

    return { xDaiHolders, mainnetHolders };
};
