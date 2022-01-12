import { getCarrotCampaignsStakers } from "./carrot-campaigns-stakers";
import { getDeduplicatedAddresses, saveCache } from "./commons";
import { getXmasDxdHoldersBalanceMap } from "./dxd-holders";
import { getDecemberSwaprUsers } from "./swapr-users";
import { getXmasSwprHoldersBalanceMap } from "./swpr-holders";

const SWAPR_USERS_OR_SWPR_HOLDERS_CACHE_LOCATION = `${__dirname}/cache/swapr-users.json`;
const XMAS_DXD_HOLDERS_CACHE_LOCATION = `${__dirname}/cache/xmas-dxd-holders.json`;
const CARROT_CAMPAIGNS_STAKERS_CACHE_LOCATION = `${__dirname}/cache/carrot-campaigns-stakers.json`;

const createWhitelist = async () => {
    const { eoas: eoasDecemberSwaprUsers } = await getDecemberSwaprUsers();
    const { eoas: eoasXmasDxdHolders } = await getXmasDxdHoldersBalanceMap();
    const { eoas: eoasXmasSwprHolders } = await getXmasSwprHoldersBalanceMap();
    const { eoas: eoasCarrotCampaignsStakers } =
        await getCarrotCampaignsStakers();

    saveCache(
        getDeduplicatedAddresses([
            ...eoasDecemberSwaprUsers,
            ...Object.keys(eoasXmasSwprHolders),
        ]),
        SWAPR_USERS_OR_SWPR_HOLDERS_CACHE_LOCATION
    );
    saveCache(Object.keys(eoasXmasDxdHolders), XMAS_DXD_HOLDERS_CACHE_LOCATION);
    saveCache(
        eoasCarrotCampaignsStakers,
        CARROT_CAMPAIGNS_STAKERS_CACHE_LOCATION
    );
};

createWhitelist().catch((error) => {
    console.error("could not create whitelist", error);
});
