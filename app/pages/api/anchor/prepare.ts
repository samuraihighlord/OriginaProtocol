import { postJsonRoute } from "../../../lib/server/apiRoute";
import { prepareAnchor } from "../../../lib/server/anchorService";

export const config = { maxDuration: 30 };

export default postJsonRoute(prepareAnchor);
