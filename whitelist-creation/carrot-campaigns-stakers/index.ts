import { gql } from "graphql-request";
import {
    getAllDataFromSubgraph,
    getDeduplicatedAddresses,
    getEoaAddresses,
    loadCache,
    saveCache,
    SWAPR_XDAI_SUBGRAPH_CLIENT,
    XDAI_PROVIDER,
} from "../commons";

const EOA_CACHE_LOCATION = `${__dirname}/cache/eoas.json`;
const SC_CACHE_LOCATION = `${__dirname}/cache/scs.json`;

const LIQUIDITY_MINING_POSITIONS_QUERY = gql`
    query getLiquidityMiningPositions($lastId: ID) {
        data: liquidityMiningPositions(
            where: {
                user_not_in: ["0x0000000000000000000000000000000000000000"]
                liquidityMiningCampaign_in: [
                    "0xeb2dc4133915bfe861ef1d21ec4c78f2c9f32154"
                    "0xc7092be0b0e99b695a8812d471ac75879729852c"
                ]
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

interface LiquidityPosition {
    id: string;
    liquidityTokenBalance: string;
    user: { address: string };
}

export const getCarrotCampaignsStakers = async (): Promise<{
    eoas: string[];
    scs: string[];
}> => {
    let eoas = loadCache(EOA_CACHE_LOCATION);
    let scs = loadCache(SC_CACHE_LOCATION);
    if (eoas.length > 0 || scs.length > 0) {
        console.log(
            `carrot campaigns stakers: ${eoas.length} eoas, ${scs.length} scs`
        );
        return { eoas, scs };
    }

    const stakers = (
        await getAllDataFromSubgraph<LiquidityPosition>(
            SWAPR_XDAI_SUBGRAPH_CLIENT,
            LIQUIDITY_MINING_POSITIONS_QUERY
        )
    ).map((position) => position.user.address);
    const { eoas: eoaStakers, smartContracts: scStakers } =
        await getEoaAddresses(stakers, XDAI_PROVIDER);

    eoas = getDeduplicatedAddresses([...eoaStakers]);
    scs = getDeduplicatedAddresses([...scStakers]);
    saveCache(eoas, EOA_CACHE_LOCATION);
    saveCache(scs, SC_CACHE_LOCATION);

    console.log(
        `carrot campaigns stakers: ${eoas.length} eoas, ${scs.length} scs`
    );

    return { eoas, scs };
};
