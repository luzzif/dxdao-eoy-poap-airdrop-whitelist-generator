import { BigNumber, ethers, providers } from "ethers";
import { GraphQLClient } from "graphql-request";
import fs from "fs";
import { outputJSONSync } from "fs-extra";
import { Client } from "jayson";
import url from "url";
import { getAddress } from "ethers/lib/utils";

export const UNISWAP_V2_MAINNET_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2"
);

export const UNISWAP_V3_MAINNET_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/nelsongaldeman/uniswap-v3"
);

export const HONEYSWAP_XDAI_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/1hive/honeyswap-xdai"
);

export const SUSHISWAP_MAINNET_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/sushiswap/exchange"
);

export const SUSHISWAP_XDAI_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/sushiswap/xdai-exchange"
);

export const BALANCER_MAINNET_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/balancer-labs/balancer"
);

export const LOOPRING_EXCHANGE_V2_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/loopring/loopring"
);

export const SWAPR_MAINNET_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/luzzif/swapr-mainnet-v2"
);

export const SWAPR_XDAI_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/luzzif/swapr-xdai-v2"
);

export const SWAPR_ARBITRUM_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/luzzif/swapr-arbitrum-one-v3"
);

export const SNAPSHOT_CLIENT = new GraphQLClient(
    "https://hub.snapshot.org/graphql"
);

export const POAP_XDAI_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/poap-xyz/poap-xdai"
);

export const POAP_MAINNET_SUBGRAPH_CLIENT = new GraphQLClient(
    "https://api.thegraph.com/subgraphs/name/poap-xyz/poap"
);

export const MAINNET_PROVIDER_URL =
    "https://eth-mainnet.alchemyapi.io/v2/b0J9XCEKwD1oWmA14bbtTfnZk9N8vCF-";
export const MAINNET_PROVIDER = new ethers.providers.JsonRpcProvider(
    MAINNET_PROVIDER_URL
);

export const XDAI_PROVIDER_URL = "https://xdai-archive.blockscout.com";
export const XDAI_PROVIDER = new ethers.providers.JsonRpcProvider(
    XDAI_PROVIDER_URL
);

export const ARBITRUM_PROVIDER_URL =
    "https://arb-mainnet.g.alchemy.com/v2/G8QqXGP5GI1ziCbnoMYr-wZNVqVm9c6a";
export const ARBITRUM_PROVIDER = new ethers.providers.JsonRpcProvider(
    XDAI_PROVIDER_URL
);

export const DEC_1ST_MAINNET_SNAPSHOT_BLOCK = 13717847;
export const DEC_1ST_XDAI_SNAPSHOT_BLOCK = 19344567;
export const DEC_1ST_ARBITRUM_SNAPSHOT_BLOCK = 3472416;

export const XMAS_MAINNET_SNAPSHOT_BLOCK = 13870990;
export const XMAS_XDAI_SNAPSHOT_BLOCK = 19753586;
export const XMAS_ARBITRUM_SNAPSHOT_BLOCK = 4070691;

export const NYE_MAINNET_SNAPSHOT_BLOCK = 13916166;
export const NYE_XDAI_SNAPSHOT_BLOCK = 19872632;
export const NYE_ARBITRUM_SNAPSHOT_BLOCK = 4221296;

export const DXD_MAINNET_ADDRESS = "0xa1d65E8fB6e87b60FECCBc582F7f97804B725521";
export const DXD_XDAI_ADDRESS = "0xb90D6bec20993Be5d72A5ab353343f7a0281f158";
export const DXD_ARBITRUM_ADDRESS =
    "0xc3ae0333f0f34aa734d5493276223d95b8f9cb37";

export const SWPR_MAINNET_ADDRESS =
    "0x6cAcDB97e3fC8136805a9E7c342d866ab77D0957";
export const SWPR_XDAI_ADDRESS = "0x532801ED6f82FFfD2DAB70A19fC2d7B2772C4f4b";
export const SWPR_ARBITRUM_ADDRESS =
    "0xdE903E2712288A1dA82942DDdF2c20529565aC30";

export const DXD_MAINNET_MESA_TOKEN_ID = 51;
export const DXD_XDAI_MESA_TOKEN_ID = 16;

export const DXD_VESTING_FACTORY_ADDRESS =
    "0x9A75944Ed8B1Fff381f1eBf9DD0a75ea72F75727";
export const MAINNET_BATCH_EXCHANGE_ADDRESS =
    "0x6F400810b62df8E13fded51bE75fF5393eaa841F";
export const XDAI_BATCH_EXCHANGE_ADDRESS =
    "0x25B06305CC4ec6AfCF3E7c0b673da1EF8ae26313";
export const DXD_LOOPRING_TOKEN_ID = "16";

export const saveCache = (addresses: string[], location: string) => {
    outputJSONSync(location, addresses, { spaces: 4 });
};

export const loadCache = (location: string): string[] => {
    if (!fs.existsSync(location)) return [];
    return JSON.parse(fs.readFileSync(location).toString());
};

export const logInPlace = (message: string) => {
    process.stdout.clearLine(-1);
    process.stdout.cursorTo(0);
    process.stdout.write(message);
};

export const getAllDataFromSubgraph = async <T>(
    subgraphClient: GraphQLClient,
    query: string,
    variables: object = {}
): Promise<Array<T>> => {
    let lastId = "";
    let allFound = false;
    const data = [];
    while (!allFound) {
        const result = await subgraphClient.request(query, {
            ...variables,
            lastId,
        });
        if (result.data.length === 0) {
            allFound = true;
            break;
        }
        lastId = result.data[result.data.length - 1].id;
        data.push(...result.data);
    }
    return data;
};

interface ResponseItem {
    result: string;
}

export const getEoaAddresses = async (
    addresses: string[],
    provider: providers.JsonRpcProvider
): Promise<{ eoas: string[]; smartContracts: string[] }> => {
    const eoas: string[] = [];
    const smartContracts: string[] = [];
    const chunkSize = 1000;
    const chunksAmount = Math.ceil(addresses.length / chunkSize);
    const { host, pathname } = new url.URL(provider.connection.url);
    const jsonRpcClient = Client.https({
        host,
        path: pathname,
    });
    for (let i = 0; i < chunksAmount; i++) {
        const sliceEnd = Math.min(i * chunkSize + chunkSize, addresses.length);
        const slice = addresses.slice(i * chunkSize, sliceEnd);
        const callsBatch = slice.map((address) =>
            jsonRpcClient.request("eth_getCode", [address])
        );
        const batchCallResponse: ResponseItem[] = await new Promise(
            (resolve, reject) => {
                jsonRpcClient.request(
                    callsBatch,
                    (error: Error, response: any) => {
                        if (error) reject(error);
                        else resolve(response);
                    }
                );
            }
        );
        batchCallResponse.forEach((responseItem, index) => {
            const address = slice[index];
            if (responseItem.result === "0x") eoas.push(address);
            else smartContracts.push(address);
        });
        logInPlace(
            `detecting smart contracts: ${(
                (sliceEnd / addresses.length) *
                100
            ).toFixed(2)}%`
        );
    }
    logInPlace("");
    return { eoas, smartContracts };
};

export const getDeduplicatedAddresses = (addresses: string[]) => {
    return Array.from(new Set(addresses.map(getAddress)));
};

export const saveBalanceMapCache = (
    balanceMap: { [address: string]: BigNumber },
    location: string
) => {
    outputJSONSync(
        location,
        Object.entries(balanceMap).reduce(
            (
                accumulator: { [address: string]: string },
                [address, balance]
            ) => {
                accumulator[address] = balance.toString();
                return accumulator;
            },
            {}
        ),
        { spaces: 4 }
    );
};

export const loadBalanceMapCache = (
    location: string
): { [address: string]: BigNumber } => {
    if (!fs.existsSync(location)) return {};
    return Object.entries(
        JSON.parse(fs.readFileSync(location).toString())
    ).reduce(
        (accumulator: { [address: string]: BigNumber }, [address, balance]) => {
            accumulator[address] = BigNumber.from(balance);
            return accumulator;
        },
        {}
    );
};

export const mergeBalanceMaps = (
    outputMap: { [address: string]: BigNumber },
    inputMap: { [address: string]: BigNumber }
) => {
    Object.entries(inputMap).forEach(([account, balance]) => {
        outputMap[account] = (outputMap[account] || BigNumber.from(0)).add(
            balance
        );
    });
};
