import { getJsonRoute } from "../../../lib/server/apiRoute";
import { getAnchorStatus } from "../../../lib/server/anchorService";

export const config = { maxDuration: 15 };

/** Whether Origina's provider wallet is configured, registered and funded — and, if not, why. Contains no secrets. */
export default getJsonRoute(getAnchorStatus);
