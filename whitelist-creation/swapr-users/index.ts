import Decimal from "decimal.js-light";
import { gql, GraphQLClient } from "graphql-request";
import {
    DEC_1ST_ARBITRUM_SNAPSHOT_BLOCK,
    DEC_1ST_MAINNET_SNAPSHOT_BLOCK,
    DEC_1ST_XDAI_SNAPSHOT_BLOCK,
    getAllDataFromSubgraph,
    getDeduplicatedAddresses,
    getEoaAddresses,
    loadCache,
    MAINNET_PROVIDER,
    ARBITRUM_PROVIDER,
    NYE_ARBITRUM_SNAPSHOT_BLOCK,
    NYE_MAINNET_SNAPSHOT_BLOCK,
    NYE_XDAI_SNAPSHOT_BLOCK,
    saveCache,
    SWAPR_ARBITRUM_SUBGRAPH_CLIENT,
    SWAPR_MAINNET_SUBGRAPH_CLIENT,
    SWAPR_XDAI_SUBGRAPH_CLIENT,
    XDAI_PROVIDER,
} from "../commons";

const EOA_CACHE_LOCATION = `${__dirname}/cache/eoas.json`;
const MAINNET_SC_CACHE_LOCATION = `${__dirname}/cache/mainnet-scs.json`;
const XDAI_SC_CACHE_LOCATION = `${__dirname}/cache/xdai-scs.json`;
const ARBITRUM_SC_CACHE_LOCATION = `${__dirname}/cache/arbitrum-scs.json`;

const SWAPS_QUERY = gql`
    query getSwaps($lastId: ID, $block: Int!) {
        data: swaps(
            first: 1000
            block: { number: $block }
            where: {
                id_gt: $lastId
                from_not_in: [
                    "0x65f29020d07a6cfa3b0bf63d749934d5a6e6ea18"
                    "0xc6130400c1e3cd7b352db75055db9dd554e00ef0"
                ]
            }
        ) {
            id
            from
        }
    }
`;

const LIQUIDITY_POSITIONS_QUERY = gql`
    query getLiquidityPositions($lastId: ID, $block: Int!) {
        data: liquidityPositions(
            first: 1000
            block: { number: $block }
            where: {
                user_not_in: ["0x0000000000000000000000000000000000000000"]
                id_gt: $lastId
            }
        ) {
            id
            liquidityTokenBalance
            user {
                address: id
            }
        }
    }
`;

const LIQUIDITY_MINING_POSITIONS_QUERY = gql`
    query getLiquidityMiningPositions($lastId: ID, $block: Int!) {
        data: liquidityMiningPositions(
            first: 1000
            block: { number: $block }
            where: {
                user_not_in: ["0x0000000000000000000000000000000000000000"]
                id_gt: $lastId
            }
        ) {
            id
            liquidityTokenBalance: stakedAmount
            user {
                address: id
            }
        }
    }
`;

interface Swap {
    id: string;
    from: string;
}

const getAllSwaps = async (
    subgraphClient: GraphQLClient,
    block: number
): Promise<Swap[]> => {
    return await getAllDataFromSubgraph<Swap>(subgraphClient, SWAPS_QUERY, {
        block,
    });
};

interface LiquidityPosition {
    id: string;
    liquidityTokenBalance: string;
    user: { address: string };
}

const getAllLiquidityPositions = async (
    subgraphClient: GraphQLClient,
    block: number
): Promise<LiquidityPosition[]> => {
    const pureLiquidityPositions =
        await getAllDataFromSubgraph<LiquidityPosition>(
            subgraphClient,
            LIQUIDITY_POSITIONS_QUERY,
            { block }
        );
    const stakedLiquidityPositions =
        await getAllDataFromSubgraph<LiquidityPosition>(
            subgraphClient,
            LIQUIDITY_MINING_POSITIONS_QUERY,
            { block }
        );
    return [...pureLiquidityPositions, ...stakedLiquidityPositions];
};

const liquidityPositionsToAddressIndexedMap = (
    positions: LiquidityPosition[]
) => {
    return positions.reduce(
        (accumulator: { [userId: string]: Decimal }, position) => {
            const user = position.user.address;
            accumulator[user] = (accumulator[user] || new Decimal(0)).plus(
                position.liquidityTokenBalance
            );
            return accumulator;
        },
        {}
    );
};

const getPositionDifferences = (
    positions1: { [userId: string]: Decimal },
    positions2: { [userId: string]: Decimal }
) => {
    return Object.entries(positions1).reduce(
        (accumulator: string[], [user, position]) => {
            const dec1stPosition = positions2[user];
            if (typeof dec1stPosition === "undefined") {
                console.warn(`inconsistency found for user ${user}`);
                return accumulator;
            }
            if (!dec1stPosition.equals(position)) accumulator.push(user);
            return accumulator;
        },
        []
    );
};

const swapsToAddressIndexedMap = (swaps: Swap[]) => {
    return swaps.reduce((accumulator: { [userId: string]: number }, swap) => {
        const user = swap.from;
        accumulator[user] = (accumulator[user] || 0) + 1;
        return accumulator;
    }, {});
};

const getSwapDifferences = (
    swaps1: { [userId: string]: number },
    swaps2: { [userId: string]: number }
) => {
    return Object.entries(swaps1).reduce(
        (accumulator: string[], [user, swaps]) => {
            const dec1stSwaps = swaps2[user];
            if (typeof dec1stSwaps === "undefined") {
                console.warn(`inconsistency found for user ${user}`);
                return accumulator;
            }
            if (dec1stSwaps !== swaps) accumulator.push(user);
            return accumulator;
        },
        []
    );
};

export const getDecemberSwaprUsers = async (): Promise<{
    eoas: string[];
    mainnetSmartContracts: string[];
    xDaiSmartContracts: string[];
    arbitrumSmartContracts: string[];
}> => {
    let eoas = loadCache(EOA_CACHE_LOCATION);
    let mainnetSmartContracts = loadCache(MAINNET_SC_CACHE_LOCATION);
    let xDaiSmartContracts = loadCache(XDAI_SC_CACHE_LOCATION);
    let arbitrumSmartContracts = loadCache(ARBITRUM_SC_CACHE_LOCATION);
    if (
        eoas.length > 0 ||
        mainnetSmartContracts.length > 0 ||
        xDaiSmartContracts.length > 0 ||
        arbitrumSmartContracts.length > 0
    ) {
        console.log(
            `swapr users: ${eoas.length} eoas, ${mainnetSmartContracts.length} mainnet scs, ${xDaiSmartContracts.length} xdai scs, ${arbitrumSmartContracts.length} arbitrum scs`
        );
        return {
            eoas,
            mainnetSmartContracts,
            xDaiSmartContracts,
            arbitrumSmartContracts,
        };
    }

    const dec1stMainnetLps = liquidityPositionsToAddressIndexedMap(
        await getAllLiquidityPositions(
            SWAPR_MAINNET_SUBGRAPH_CLIENT,
            DEC_1ST_MAINNET_SNAPSHOT_BLOCK
        )
    );
    const dec31stMainnetLps = liquidityPositionsToAddressIndexedMap(
        await getAllLiquidityPositions(
            SWAPR_MAINNET_SUBGRAPH_CLIENT,
            NYE_MAINNET_SNAPSHOT_BLOCK
        )
    );
    const mainnetLpsWithChanges = getPositionDifferences(
        dec1stMainnetLps,
        dec31stMainnetLps
    );
    const {
        eoas: eoaMainnetLpsWithChanges,
        smartContracts: scMainnetLpsWithChanges,
    } = await getEoaAddresses(mainnetLpsWithChanges, MAINNET_PROVIDER);

    // xdai lps position differences
    const dec1stXdaiLps = liquidityPositionsToAddressIndexedMap(
        await getAllLiquidityPositions(
            SWAPR_XDAI_SUBGRAPH_CLIENT,
            DEC_1ST_XDAI_SNAPSHOT_BLOCK
        )
    );
    const dec31stXdaiLps = liquidityPositionsToAddressIndexedMap(
        await getAllLiquidityPositions(
            SWAPR_XDAI_SUBGRAPH_CLIENT,
            NYE_XDAI_SNAPSHOT_BLOCK
        )
    );
    const xdaiLpsWithChanges = getPositionDifferences(
        dec1stXdaiLps,
        dec31stXdaiLps
    );
    const {
        eoas: eoaXdaiLpsWithChanges,
        smartContracts: scXdaiLpsWithChanges,
    } = await getEoaAddresses(xdaiLpsWithChanges, XDAI_PROVIDER);

    // arbitrum lps position differences
    const dec1stArbitrumLps = liquidityPositionsToAddressIndexedMap(
        await getAllLiquidityPositions(
            SWAPR_ARBITRUM_SUBGRAPH_CLIENT,
            DEC_1ST_ARBITRUM_SNAPSHOT_BLOCK
        )
    );
    const dec31stArbitrumLps = liquidityPositionsToAddressIndexedMap(
        await getAllLiquidityPositions(
            SWAPR_ARBITRUM_SUBGRAPH_CLIENT,
            NYE_ARBITRUM_SNAPSHOT_BLOCK
        )
    );
    const arbitrumLpsWithChanges = getPositionDifferences(
        dec1stArbitrumLps,
        dec31stArbitrumLps
    );
    const {
        eoas: eoaArbitrumLpsWithChanges,
        smartContracts: scArbitrumLpsWithChanges,
    } = await getEoaAddresses(arbitrumLpsWithChanges, ARBITRUM_PROVIDER);

    // mainnet swaps
    const dec1stMainnetSwaps = swapsToAddressIndexedMap(
        await getAllSwaps(
            SWAPR_MAINNET_SUBGRAPH_CLIENT,
            DEC_1ST_MAINNET_SNAPSHOT_BLOCK
        )
    );
    const dec31stMainnetSwaps = swapsToAddressIndexedMap(
        await getAllSwaps(
            SWAPR_MAINNET_SUBGRAPH_CLIENT,
            NYE_MAINNET_SNAPSHOT_BLOCK
        )
    );
    const mainnetTradersWithChanges = getSwapDifferences(
        dec1stMainnetSwaps,
        dec31stMainnetSwaps
    );
    const {
        eoas: eoaMainnetTradersWithChanges,
        smartContracts: scMainnetTradersWithChanges,
    } = await getEoaAddresses(mainnetTradersWithChanges, MAINNET_PROVIDER);

    // xdai lps position differences
    const dec1stXdaiTraders = swapsToAddressIndexedMap(
        await getAllSwaps(
            SWAPR_XDAI_SUBGRAPH_CLIENT,
            DEC_1ST_XDAI_SNAPSHOT_BLOCK
        )
    );
    const dec31stXdaiTraders = swapsToAddressIndexedMap(
        await getAllSwaps(SWAPR_XDAI_SUBGRAPH_CLIENT, NYE_XDAI_SNAPSHOT_BLOCK)
    );
    const xdaiTradersWithChanges = getSwapDifferences(
        dec1stXdaiTraders,
        dec31stXdaiTraders
    );
    const {
        eoas: eoaXdaiTradersWithChanges,
        smartContracts: scXdaiTradersWithChanges,
    } = await getEoaAddresses(xdaiTradersWithChanges, XDAI_PROVIDER);

    // arbitrum lps position differences
    const dec1stArbitrumTraders = swapsToAddressIndexedMap(
        await getAllSwaps(
            SWAPR_ARBITRUM_SUBGRAPH_CLIENT,
            DEC_1ST_ARBITRUM_SNAPSHOT_BLOCK
        )
    );
    const dec31stArbitrumTraders = swapsToAddressIndexedMap(
        await getAllSwaps(
            SWAPR_ARBITRUM_SUBGRAPH_CLIENT,
            NYE_ARBITRUM_SNAPSHOT_BLOCK
        )
    );
    const arbitrumTradersWithChanges = getSwapDifferences(
        dec1stArbitrumTraders,
        dec31stArbitrumTraders
    );
    const {
        eoas: eoaArbitrumTradersWithChanges,
        smartContracts: scArbitrumTradersWithChanges,
    } = await getEoaAddresses(arbitrumTradersWithChanges, ARBITRUM_PROVIDER);

    eoas = getDeduplicatedAddresses([
        ...eoaMainnetLpsWithChanges,
        ...eoaXdaiLpsWithChanges,
        ...eoaArbitrumLpsWithChanges,
        ...eoaMainnetTradersWithChanges,
        ...eoaXdaiTradersWithChanges,
        ...eoaArbitrumTradersWithChanges,
    ]);
    mainnetSmartContracts = getDeduplicatedAddresses([
        ...scMainnetLpsWithChanges,
        ...scMainnetTradersWithChanges,
    ]);
    xDaiSmartContracts = getDeduplicatedAddresses([
        ...scXdaiLpsWithChanges,
        ...scXdaiTradersWithChanges,
    ]);
    arbitrumSmartContracts = getDeduplicatedAddresses([
        ...scArbitrumLpsWithChanges,
        ...scArbitrumTradersWithChanges,
    ]);
    saveCache(eoas, EOA_CACHE_LOCATION);
    saveCache(mainnetSmartContracts, MAINNET_SC_CACHE_LOCATION);
    saveCache(xDaiSmartContracts, XDAI_SC_CACHE_LOCATION);

    console.log(
        `swapr users: ${eoas.length} eoas, ${mainnetSmartContracts.length} mainnet scs, ${xDaiSmartContracts.length} xdai scs, ${arbitrumSmartContracts.length} arbitrum scs`
    );

    return {
        eoas,
        mainnetSmartContracts,
        xDaiSmartContracts,
        arbitrumSmartContracts,
    };
};
